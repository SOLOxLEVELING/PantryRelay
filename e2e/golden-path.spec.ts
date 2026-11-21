import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { LocalWorkspaceSnapshot } from '../src/lib/storage';

const noteText = 'Received 36 bags of rice, distributed 8 bags, quarantined 5 bags and counted 25 bags on the shelf.';
const snapshot: LocalWorkspaceSnapshot = {
  sessionId: 'golden-path',
  updatedAt: '2026-01-01T00:00:00.000Z',
  approvedEvents: [],
  keptOpen: [],
  notes: [{ inferenceSource: 'UNKNOWN', latencyMs: null, quarantined: [], error: null, draft: {
    noteId: 'golden-note', noteText, movements: [], followUps: [], unclassifiedText: [],
    observations: [{ tempId: 'shelf-count', canonicalItemId: 'rice', rawItemName: 'rice', count: 25,
      unit: 'bags', evidenceText: 'counted 25 bags on the shelf', state: 'UNVERIFIED' }],
  } }],
};

async function seedShelfCount(page: Page) {
  await page.goto('/sw.js');
  await page.evaluate(seed => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('pantryrelay-local', 1);
    open.onerror = () => reject(open.error);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('workspace');
      open.result.createObjectStore('outbox', { keyPath: 'event.id' }).createIndex('bySession', 'sessionId');
    };
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('workspace', 'readwrite');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
      tx.objectStore('workspace').put(seed, 'active');
    };
  }), snapshot);
}

function movementRow(page: Page, index: number) {
  return page.getByRole('row').filter({ has: page.getByLabel(`Movement 1.${index} item`, { exact: true }) });
}

async function enterMovement(page: Page, index: number, kind: string, quantity: string) {
  await page.getByRole('button', { name: 'Add manual movement' }).click();
  await page.getByLabel(`Movement 1.${index} item`).selectOption('rice');
  await page.getByLabel(`Movement 1.${index} kind`).selectOption(kind);
  await page.getByLabel(`Movement 1.${index} quantity`).fill(quantity);
  await page.getByLabel(`Movement 1.${index} unit`).fill('bags');
}

for (const { distributed, usable, difference } of [
  { distributed: 8, usable: 47, difference: 22 },
  { distributed: 10, usable: 45, difference: 20 },
]) {
  test(`manual approvals reconcile to ${usable} usable and a ${difference}-bag discrepancy`, async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await context.route(url => url.hostname !== 'localhost', route => route.abort());
    await seedShelfCount(page);
    await page.goto('/');
    const readiness = page.getByLabel('Workspace readiness');
    await expect(readiness.getByText('Cached offline', { exact: true })).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByText('Offline', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm count' }).click();

    await enterMovement(page, 1, 'RECEIVED', '36');
    await enterMovement(page, 2, 'DISTRIBUTED', '8');
    const distributionQuantity = page.getByLabel('Movement 1.2 quantity');
    await expect(distributionQuantity).toHaveValue('8');
    if (distributed === 10) await distributionQuantity.fill('10');
    await expect(distributionQuantity).toHaveValue(String(distributed));
    await enterMovement(page, 3, 'QUARANTINED', '5');
    await page.getByRole('button', { name: 'Add manual movement' }).click();
    const blocker = movementRow(page, 4).getByRole('button', { name: 'Approve' });
    await expect(blocker).toBeDisabled();
    await expect(blocker).toHaveAccessibleDescription(/Needs clarification.*Choose a known canonical item/);

    for (const index of [1, 2, 3]) await movementRow(page, index).getByRole('button', { name: 'Approve' }).click();
    const reconcile = page.getByRole('region', { name: '3 Reconcile' });
    const discrepancy = reconcile.getByRole('status').filter({ hasText: `${difference} bag discrepancy` });
    await expect(reconcile.getByText(`24 + 36 − ${distributed} − 5 = ${usable} usable`)).toBeVisible();
    await expect(discrepancy).toContainText(`Expected ${usable} vs observed 25`);
    await discrepancy.getByRole('button', { name: 'Record explicit adjustment' }).click();
    await page.getByLabel('Movement 1.5 quantity').fill('2');
    await page.getByLabel('Movement 1.5 unit').fill('bags');
    const ambiguous = movementRow(page, 5);
    await expect(ambiguous.getByRole('button', { name: 'Approve' })).toBeDisabled();
    await expect(ambiguous.getByRole('button', { name: 'Approve' }))
      .toHaveAccessibleDescription(/Resolve the movement ambiguity/);
    await ambiguous.getByRole('button', { name: 'Reject' }).click();
    await expect(reconcile.getByText('1 pending movement')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Pending sync (3)' })).toBeVisible();

    const handoff = page.getByRole('region', { name: '4 Handoff' });
    await handoff.getByRole('button', { name: 'Copy shift handoff' }).click();
    await expect(handoff.getByRole('status').filter({ hasText: /^Copied$/ })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain(`${usable} usable bags`);
    expect(copied).toContain(`${difference} bag discrepancy`);

    await expect(page.getByRole('status').filter({ hasText: 'Locally saved' })).toBeVisible();
    const reloaded = await page.reload();
    expect(reloaded?.fromServiceWorker()).toBe(true);
    await expect(page.getByRole('textbox', { name: 'Volunteer note' })).toHaveValue(noteText);
    await expect(distributionQuantity).toHaveValue(String(distributed));
    await expect(blocker).toBeDisabled();
    await expect(discrepancy).toContainText(`Expected ${usable} vs observed 25`);
    await expect(page.getByRole('status').filter({ hasText: 'Pending sync (3)' })).toBeVisible();

    await page.getByRole('button', { name: 'Reset demo' }).click();
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(reconcile.getByText('24 + 0 − 0 − 0 = 24 usable')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Idle' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Locally saved' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Add manual movement' })).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
  });
}

test('volunteer route exposes named sections, headings, live status and keyboard navigation', async ({ page, context }) => {
  await context.route(url => url.hostname !== 'localhost', route => route.abort());
  const benchmarkRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/assets/BenchmarkRunner-')) benchmarkRequests.push(request.url());
  });
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: 'PantryRelay' })).toBeVisible();
  for (const name of ['1 Capture', '2 Review', '3 Reconcile', '4 Handoff']) {
    await expect(main.getByRole('region', { name }).getByRole('heading', { name, level: 2 })).toBeVisible();
  }
  await expect(main.getByRole('status').filter({ hasText: 'Locally saved' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Extraction benchmark' })).toHaveCount(0);
  expect(benchmarkRequests).toEqual([]);
  const sample = main.getByRole('combobox', { name: 'Sample note' });
  await sample.focus();
  await page.keyboard.press('Tab');
  await expect(main.getByRole('textbox', { name: 'Volunteer note' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(main.getByRole('combobox', { name: 'Extraction mode' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(main.getByRole('button', { name: 'Extract changes' })).toBeFocused();
  await page.goto('/?benchmark=1');
  await expect(page.getByRole('heading', { name: 'Extraction benchmark' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add manual movement' })).toHaveCount(0);
});
