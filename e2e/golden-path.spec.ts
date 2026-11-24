import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const noteText = 'Received 36 bags of rice, distributed 8 bags, quarantined 5 bags and counted 25 bags on the shelf.';
const staleTabMessage = 'This workspace was updated or reset in another browser tab. Reload this tab to use the latest record.';

function locallySaved(page: Page) {
  return page.getByRole('status').filter({ hasText: /^Locally saved$/ });
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
    await page.goto('/');
    const readiness = page.getByLabel('Workspace readiness');
    await expect(readiness.getByText('Cached offline', { exact: true })).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByText('Offline', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Volunteer note' }).fill(noteText);
    await page.getByRole('button', { name: 'Add shelf count' }).click();
    const confirmCount = page.getByRole('button', { name: 'Confirm count' });
    await expect(confirmCount).toBeDisabled();
    const item = page.getByLabel('Shelf count 1.1 item');
    await item.selectOption('beans');
    await item.selectOption('rice');
    const count = page.getByLabel('Shelf count 1.1 count');
    await count.fill('24');
    await count.fill('25');
    await page.getByLabel('Shelf count 1.1 unit').fill('kg');
    await expect(confirmCount).toBeDisabled();
    await expect(confirmCount).toHaveAccessibleDescription('Use bags for Rice.');
    await page.getByLabel('Shelf count 1.1 unit').fill('bags');
    await confirmCount.click();
    await expect(page.getByText('25 bags Rice', { exact: true })).toBeVisible();
    await expect(count).toHaveCount(0);

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
    const discrepancy = reconcile.getByRole('status').filter({ hasText: `Provisional count difference (${difference} bags) — review pending` });
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
    await expect(handoff.getByText('(provisional — review pending)')).toBeVisible();
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
    await expect(page.getByText('25 bags Rice', { exact: true })).toBeVisible();
    await expect(blocker).toBeDisabled();
    await expect(discrepancy).toContainText(`Expected ${usable} vs observed 25`);
    await expect(page.getByRole('status').filter({ hasText: 'Pending sync (3)' })).toBeVisible();
    await movementRow(page, 4).getByRole('button', { name: 'Reject' }).click();
    await expect(discrepancy).toHaveCount(0);
    await expect(reconcile.getByRole('heading', { name: `${difference} bag discrepancy` })).toBeVisible();
    await expect(handoff.getByText('(provisional — review pending)')).toHaveCount(0);

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

test('Capture warns before re-extracting, cancels a stalled draft, and clears stale feedback', async ({ page, context }) => {
  await context.route(url => url.hostname !== 'localhost', route => route.abort());
  const text = 'Received 2 bags of rice. Gave out 1 bag of rice.';
  const response = JSON.stringify({ movements: [
    { itemName: 'rice', quantity: 2, unit: 'bags', kind: 'RECEIVED', evidenceText: 'Received 2 bags of rice.', ambiguity: null },
    { itemName: 'rice', quantity: 1, unit: 'bags', kind: 'DISTRIBUTED', evidenceText: 'Gave out 1 bag of rice.', ambiguity: null },
  ], observations: [], followUps: [], unclassifiedText: [] });
  await page.addInitScript(responseText => {
    let attempts = 0;
    let available = true;
    document.addEventListener('test-disable-model', () => { available = false; });
    Object.defineProperty(globalThis, 'LanguageModel', { configurable: true, value: {
      availability: async () => available ? 'available' : 'unavailable',
      create: async (options: { signal?: AbortSignal }) => ({
        prompt: async () => {
          attempts += 1;
          document.documentElement.dataset.testInference = String(attempts);
          if (attempts === 1) return responseText;
          options.signal?.addEventListener('abort', () => { document.documentElement.dataset.testAborted = 'true'; }, { once: true });
          return new Promise(resolve => {
            document.addEventListener('test-finish-model', () => resolve(responseText), { once: true });
          });
        },
      }),
    } });
  }, response);
  await page.goto('/');
  const capture = page.getByRole('region', { name: '1 Capture' });
  const editor = capture.getByRole('textbox', { name: 'Volunteer note' });
  const source = capture.getByText('Source: On-device', { exact: false });
  const extract = capture.getByRole('button', { name: 'Extract changes', exact: true });
  const confirm = capture.getByRole('button', { name: 'Extract again anyway' });
  await editor.fill(text);
  await capture.getByLabel('Extraction mode').selectOption('ONLY_ON_DEVICE');
  await extract.click();
  await expect(source).toBeVisible();
  await movementRow(page, 1).getByRole('button', { name: 'Approve' }).click();
  await editor.fill(`${text} Edited.`);
  await expect(source).toHaveCount(0);
  await editor.fill(text);
  await expect(source).toBeVisible();
  await capture.getByLabel('Sample note').selectOption('damage-overlap');
  await expect(source).toHaveCount(0);
  await editor.fill(` ${text} `);
  await extract.click();
  await expect(capture.getByText('This exact note was already extracted in this session.')).toBeVisible();
  await expect(capture.getByRole('status')).toContainText('1 approved and 1 pending');
  await capture.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-test-inference', '1');
  await extract.click();
  await confirm.click();
  await expect(html).toHaveAttribute('data-test-inference', '2');
  await expect(editor).toBeDisabled();
  await capture.getByRole('button', { name: 'Cancel & enter manually' }).click();
  await expect(editor).toBeEnabled();
  await expect(html).toHaveAttribute('data-test-aborted', 'true');
  const manualQuantity = page.getByLabel('Movement 2.1 quantity');
  await manualQuantity.fill('7');
  await page.evaluate(() => document.dispatchEvent(new Event('test-finish-model')));
  await expect(manualQuantity).toHaveValue('7');
  await expect(page.getByLabel('Movement 2.2 quantity')).toHaveCount(0);
  await expect(capture.getByRole('alert')).toHaveCount(0);

  await page.evaluate(() => document.dispatchEvent(new Event('test-disable-model')));
  await editor.fill('Received a new delivery.');
  await extract.click();
  await expect(capture.getByRole('alert')).toContainText('This browser’s on-device model isn’t ready.');
  await expect(capture.locator('details')).not.toHaveAttribute('open');
  await expect(capture.getByText('Technical details', { exact: true })).toBeVisible();
  await capture.getByLabel('Sample note').selectOption('golden-rice');
  await expect(capture.getByRole('alert')).toHaveCount(0);
});

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

for (const broadcastAvailable of [true, false]) {
  test(`a stale tab cannot undo approved stock (${broadcastAvailable ? 'cross-tab notification' : 'IndexedDB fallback'})`, async ({ context }) => {
    await context.route(url => url.hostname !== 'localhost', route => route.abort());
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    if (!broadcastAvailable) {
      await tabB.addInitScript(() => Object.defineProperty(window, 'BroadcastChannel', { value: undefined }));
    }

    await tabA.goto('/');
    await enterMovement(tabA, 1, 'RECEIVED', '1');
    await expect(locallySaved(tabA)).toBeVisible();
    await tabB.goto('/');
    await expect(movementRow(tabB, 1).getByRole('button', { name: 'Approve' })).toBeEnabled();
    await expect(locallySaved(tabB)).toBeVisible();

    const confirmed = (page: Page) => page.getByText('24 + 1 − 0 − 0 = 25 usable', { exact: true });
    const pending = (page: Page) => page.getByRole('status').filter({ hasText: /^Pending sync \(1\)$/ });
    await movementRow(tabA, 1).getByRole('button', { name: 'Approve' }).click();
    await expect(confirmed(tabA)).toBeVisible();
    await expect(pending(tabA)).toBeVisible();
    await expect(locallySaved(tabA)).toBeVisible();

    const addFromTabB = tabB.getByRole('button', { name: 'Add manual movement' });
    const warning = tabB.getByRole('alert').filter({ hasText: staleTabMessage });
    if (broadcastAvailable) {
      await expect(warning).toBeVisible();
      await expect(addFromTabB).toBeDisabled();
      await addFromTabB.click({ force: true });
      await expect(tabB.getByLabel('Movement 1.2 item')).toHaveCount(0);
    } else {
      await addFromTabB.click();
      await expect(warning).toBeVisible();
      await expect(addFromTabB).toBeDisabled();
    }
    await expect(tabB.getByRole('button', { name: 'Reset demo' })).toBeDisabled();

    await tabA.reload();
    await expect(confirmed(tabA)).toBeVisible();
    await expect(pending(tabA)).toBeVisible();
    await expect(tabA.getByRole('button', { name: 'Add manual movement' })).toBeEnabled();
    await expect(tabA.getByLabel('Movement 1.2 item')).toHaveCount(0);
    if (broadcastAvailable) {
      await tabA.setViewportSize({ width: 1280, height: 900 });
      await tabA.evaluate(() => window.scrollTo(0, 0));
      await tabA.screenshot({ path: 'docs/evidence/g53/two-tab-preserved.png' });
    }

    await tabB.getByRole('button', { name: 'Reload tab' }).click();
    await expect(confirmed(tabB)).toBeVisible();
    await expect(pending(tabB)).toBeVisible();
    await expect(addFromTabB).toBeEnabled();
    if (broadcastAvailable) {
      await tabA.getByRole('button', { name: 'Reset demo' }).click();
      await expect(warning).toBeVisible();
      await expect(addFromTabB).toBeDisabled();
      await expect(locallySaved(tabA)).toBeVisible();
      await expect(tabA.getByText('24 + 0 − 0 − 0 = 24 usable', { exact: true })).toBeVisible();
    }
  });
}

test('adding a manual movement uses the newly typed note', async ({ page, context }) => {
  await context.route(url => url.hostname !== 'localhost', route => route.abort());
  await page.goto('/');
  const note = page.getByRole('textbox', { name: 'Volunteer note' });
  const addMovement = page.getByRole('button', { name: 'Add manual movement' });
  await note.fill('Audit note A');
  await addMovement.click();
  await note.fill('Audit note B');
  await addMovement.click();

  const original = page.locator('.review-note').filter({ hasText: 'Audit note A' });
  const newNote = page.locator('.review-note').filter({ hasText: 'Audit note B' });
  await expect(original.getByRole('row').filter({ has: page.getByLabel('Movement 1.1 item') })).toBeVisible();
  await expect(original.getByLabel('Movement 1.2 item')).toHaveCount(0);
  await expect(newNote.getByRole('row').filter({ has: page.getByLabel('Movement 2.1 item') })).toBeVisible();
  await expect(locallySaved(page)).toBeVisible();
  await page.reload();
  await expect(newNote.getByLabel('Movement 2.1 item')).toBeVisible();
});

for (const width of [360, 390]) {
  test(`Review fits a ${width}×844 viewport after a movement is added`, async ({ page, context }) => {
    await context.route(url => url.hostname !== 'localhost', route => route.abort());
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await enterMovement(page, 1, 'RECEIVED', '1');
    const review = page.getByRole('region', { name: '2 Review' });
    await expect(review.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => window.innerWidth),
    );
    expect(await review.locator('.table-scroll').evaluate(table => table.scrollWidth <= table.clientWidth)).toBe(true);
    if (width === 390) {
      await review.scrollIntoViewIfNeeded();
      await page.screenshot({ path: 'docs/evidence/g53/mobile-review-390.png' });
    }
  });
}
