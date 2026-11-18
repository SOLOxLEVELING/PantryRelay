import { describe, expect, it } from 'vitest';
import type {
  CanonicalItem, ExtractedNote, LedgerEvent, OpeningBalance,
  ReviewMovementItem, ReviewObservationItem,
} from '../types/inventory';
import { buildReviewDraftFromNote, DEMO_CATALOG, DEMO_OPENING_BALANCES } from './seedData';
import { canApproveMovement, createLedgerEvent, reconcileItem } from './reconcile';

const rice: CanonicalItem = { id: 'rice', name: 'Rice', allowedUnits: ['bags'], aliases: ['rcie'] };
const openingBalance: OpeningBalance = {
  itemId: 'rice', unit: 'bags', usableQuantity: 24, quarantinedQuantity: 0,
  confirmedAt: '2026-11-18T00:00:00.000Z', isDemoSeed: true,
};
const now = '2026-11-18T10:00:00.000Z';
const eventId = '00000000-0000-4000-8000-000000000001';

function movement(changes: Partial<ReviewMovementItem> = {}): ReviewMovementItem {
  return {
    tempId: 'movement-1', rawItemName: 'rice', canonicalItemId: 'rice', quantity: 36,
    unit: 'bags', kind: 'RECEIVED', evidenceText: 'Received 36 bags of rice.',
    ambiguity: null, state: 'DRAFT', origin: 'AI_SUGGESTED', ...changes,
  };
}

function approve(row: ReviewMovementItem, id = eventId): LedgerEvent {
  return createLedgerEvent(row, { noteId: 'note-1', approvedBy: 'volunteer-1', now, id,
    catalog: [rice], sourceNoteOrigin: 'ON_DEVICE' });
}

function goldenEvents(distributed = 8): LedgerEvent[] {
  const received: LedgerEvent = {
    id: eventId, noteId: 'note-1', itemId: 'rice', quantity: 36, unit: 'bags',
    kind: 'RECEIVED', occurredAt: now, approvedAt: now, approvedBy: 'volunteer-1',
    sourceNoteOrigin: 'ON_DEVICE',
  };
  return [
    received,
    { ...received, id: 'distribution', kind: 'DISTRIBUTED', quantity: distributed },
    { ...received, id: 'quarantine', kind: 'QUARANTINED', quantity: 5 },
  ];
}

function observation(changes: Partial<ReviewObservationItem> = {}): ReviewObservationItem {
  return { tempId: 'observation-1', rawItemName: 'rice', canonicalItemId: 'rice', count: 25,
    unit: 'bags', evidenceText: 'The paper count says 25 left.', state: 'UNVERIFIED', ...changes };
}

function reconcile(changes: Partial<Parameters<typeof reconcileItem>[0]> = {}) {
  return reconcileItem({ item: rice, openingBalance, approvedEvents: goldenEvents(),
    latestObservation: observation(), pendingDrafts: [], ...changes });
}

describe('movement approval gate', () => {
  it.each([
    { quantity: null }, { quantity: 0 }, { quantity: -1 }, { quantity: NaN },
    { quantity: Infinity }, { quantity: -Infinity }, { unit: null }, { unit: '' },
    { unit: '   ' }, { unit: 'kg' }, { canonicalItemId: null }, { canonicalItemId: 'unknown' },
    { kind: null }, { ambiguity: 'Five damaged bags included in those eight distributed.' },
  ] satisfies Partial<ReviewMovementItem>[])('blocks invalid movement %j at both boundaries', changes => {
    const row = movement(changes);
    const result = canApproveMovement(row, [rice]);
    expect(result).toMatchObject({ ok: false, reason: expect.any(String) });
    if (!result.ok) expect(result.reason.trim().length).toBeGreaterThan(0);
    expect(() => approve(row)).toThrow();
  });

  it.each([null, '', '   '])('allows a complete movement with no substantive ambiguity (%j)', ambiguity => {
    expect(canApproveMovement(movement({ ambiguity }), [rice])).toEqual({ ok: true });
  });

  it('validates against the supplied catalog rather than accepting any named item', () => {
    const oats: CanonicalItem = { id: 'oats', name: 'Oats', allowedUnits: ['crates'], aliases: [] };
    const row = movement({ canonicalItemId: 'oats', unit: 'crates' });
    expect(canApproveMovement(row, [rice])).toMatchObject({ ok: false });
    expect(createLedgerEvent(row, { noteId: 'custom', approvedBy: 'reviewer', now, id: eventId,
      catalog: [oats], sourceNoteOrigin: 'IN_CLOUD' })).toMatchObject({ itemId: 'oats', unit: 'crates' });
  });

  it('creates an immutable event with stable identity and approval provenance without mutating its inputs', () => {
    const row = movement({ state: 'APPROVED' });
    const before = structuredClone({ row, openingBalance });
    const event = approve(row);
    expect(event).toEqual({ id: eventId, noteId: 'note-1', itemId: 'rice', quantity: 36,
      unit: 'bags', kind: 'RECEIVED', occurredAt: now, approvedAt: now,
      approvedBy: 'volunteer-1', sourceNoteOrigin: 'ON_DEVICE' });
    expect(approve(row)).toEqual(event);
    expect(Object.isFrozen(event)).toBe(true);
    row.quantity = 99;
    expect(event.quantity).toBe(36);
    expect(openingBalance).toEqual(before.openingBalance);
  });

  it('supports the minimal approval context using demo catalog and UNKNOWN source provenance', () => {
    expect(createLedgerEvent(movement(), { noteId: 'note-1', approvedBy: 'reviewer', now, id: eventId }))
      .toMatchObject({ id: eventId, itemId: 'rice', sourceNoteOrigin: 'UNKNOWN' });
  });
});

describe('deterministic item reconciliation', () => {
  it('keeps the golden ledger at 47 usable and 5 quarantined while flagging the observed discrepancy of 22', () => {
    expect(reconcile()).toMatchObject({ status: 'DISCREPANCY', approvedReceived: 36,
      approvedDistributed: 8, approvedQuarantined: 5, approvedAdjustments: 0,
      confirmedUsable: 47, quarantinedBalance: 5, discrepancy: 22, blockingDraftCount: 0,
      pendingIssues: [], nextActions: ['KEEP_OPEN', 'REQUEST_RECOUNT', 'RECORD_EXPLICIT_ADJUSTMENT'] });
  });

  it('uses the human-edited quantity at approval time', () => {
    const edited = movement({ quantity: 8, kind: 'DISTRIBUTED' });
    edited.quantity = 10;
    edited.origin = 'HUMAN_EDITED';
    edited.state = 'APPROVED';
    const approvedEvents = goldenEvents().map(event => event.kind === 'DISTRIBUTED'
      ? approve(edited, event.id) : event);
    expect(reconcile({ approvedEvents })).toMatchObject({ confirmedUsable: 45, discrepancy: 20 });
  });

  it('excludes rejected and unapproved rows and reports unresolved drafts', () => {
    const pendingDrafts = [
      movement({ tempId: 'draft', quantity: 100 }),
      movement({ tempId: 'unclear', quantity: null, state: 'NEEDS_CLARIFICATION' }),
      movement({ tempId: 'rejected', state: 'REJECTED', quantity: 100 }),
      movement({ tempId: 'already-approved', state: 'APPROVED' }),
    ];
    const result = reconcile({ approvedEvents: [], pendingDrafts });
    expect(result).toMatchObject({ confirmedUsable: 24, discrepancy: -1, blockingDraftCount: 2 });
    expect(result.pendingIssues).toEqual([
      { tempId: 'draft', reason: expect.any(String) }, { tempId: 'unclear', reason: expect.any(String) },
    ]);
  });

  it('keeps unknown-item drafts visible but scopes other items out of balances and blockers', () => {
    expect(reconcile({ approvedEvents: [...goldenEvents(), { ...approve(movement()), itemId: 'beans', unit: 'cans' }],
      pendingDrafts: [movement({ canonicalItemId: 'beans' }), movement({ canonicalItemId: null })],
      latestObservation: observation({ canonicalItemId: 'beans', unit: 'cans' }),
    })).toMatchObject({ status: 'NO_OBSERVATION', confirmedUsable: 47, discrepancy: null, blockingDraftCount: 1 });
  });

  it('requires a confirmed opening balance before computing balances or discrepancy', () => {
    expect(reconcile({ openingBalance: null })).toMatchObject({ status: 'MISSING_BASELINE',
      confirmedUsable: null, quarantinedBalance: null, discrepancy: null,
      nextActions: ['Confirm an opening usable balance before reconciling'] });
  });

  it('does not use another item opening balance', () => {
    expect(reconcile({ openingBalance: { ...openingBalance, itemId: 'beans' } }))
      .toMatchObject({ status: 'MISSING_BASELINE', confirmedUsable: null, discrepancy: null });
  });

  it.each(['event', 'observation'])('refuses %s unit mismatch without automatic conversion', source => {
    const result = reconcile(source === 'event'
      ? { approvedEvents: [{ ...approve(movement()), unit: 'kg' }] }
      : { latestObservation: observation({ unit: 'kg' }) });
    expect(result).toMatchObject({ status: 'UNIT_MISMATCH', confirmedUsable: null, discrepancy: null,
      nextActions: ['Resolve unit mismatch; automatic conversion is disabled'] });
  });

  it('does not treat zero observation as missing', () => {
    expect(reconcile({ latestObservation: observation({ count: 0 }) }))
      .toMatchObject({ status: 'DISCREPANCY', confirmedUsable: 47, discrepancy: 47 });
  });

  it('reports a matching observation as balanced', () => {
    expect(reconcile({ latestObservation: observation({ count: 47 }) }))
      .toMatchObject({ status: 'BALANCED', confirmedUsable: 47, discrepancy: 0 });
  });

  it.each([null, observation({ count: null }), observation({ canonicalItemId: null }),
    observation({ state: 'DISMISSED' })])('reports no usable observation for %j', latestObservation => {
    expect(reconcile({ latestObservation }))
      .toMatchObject({ status: 'NO_OBSERVATION', confirmedUsable: 47, discrepancy: null });
  });

  it('adds positive explicit adjustments and preserves the opening quarantine balance', () => {
    expect(reconcile({ openingBalance: { ...openingBalance, quarantinedQuantity: 2 },
      approvedEvents: [...goldenEvents(), approve(movement({ kind: 'ADJUSTMENT', quantity: 3 }))],
    })).toMatchObject({ approvedAdjustments: 3, confirmedUsable: 50, quarantinedBalance: 7, discrepancy: 25 });
  });

  it('is repeatable and never changes the observation, events, drafts, or opening balance', () => {
    const input = { item: rice, openingBalance, approvedEvents: goldenEvents(),
      latestObservation: observation(), pendingDrafts: [movement()] };
    const before = structuredClone(input);
    const first = reconcileItem(input);
    expect(reconcileItem(input)).toEqual(first);
    expect(input).toEqual(before);
    expect(first.confirmedUsable).toBe(47);
    expect(input.latestObservation.count).toBe(25);
  });
});

describe('demo catalog and review draft construction', () => {
  const extracted: ExtractedNote = {
    movements: [{ itemName: ' Rcie ', quantity: 36, unit: 'bags', kind: 'RECEIVED',
      evidenceText: 'Received 36 bags of rcie.', ambiguity: null }],
    observations: [{ itemName: 'Rice', count: 25, unit: 'bags', evidenceText: '25 bags remain.' }],
    followUps: [{ text: 'Check shelves', assigneeName: 'Sam', evidenceText: 'Sam should check shelves.' }],
    unclassifiedText: ['Shift finished.'],
  };

  it('labels the seeded 24-bag rice opening balance as demo data', () => {
    expect(DEMO_CATALOG).toEqual([rice,
      { id: 'beans', name: 'Beans', allowedUnits: ['cans'], aliases: [] }]);
    expect(DEMO_OPENING_BALANCES).toEqual([{ ...openingBalance, confirmedAt: expect.any(String) }]);
    expect(Number.isFinite(Date.parse(DEMO_OPENING_BALANCES[0]?.confirmedAt ?? ''))).toBe(true);
  });

  it('preserves source text, observations and tasks, resolving aliases without approving anything', () => {
    const before = structuredClone(extracted);
    const draft = buildReviewDraftFromNote('note-1', 'Original note', extracted);
    expect(draft).toMatchObject({ noteId: 'note-1', noteText: 'Original note', unclassifiedText: ['Shift finished.'],
      movements: [{ rawItemName: ' Rcie ', canonicalItemId: 'rice', quantity: 36, unit: 'bags',
        kind: 'RECEIVED', evidenceText: 'Received 36 bags of rcie.', ambiguity: null,
        state: 'DRAFT', origin: 'AI_SUGGESTED', tempId: expect.any(String) }],
      observations: [{ canonicalItemId: 'rice', count: 25, state: 'UNVERIFIED' }],
      followUps: [{ id: expect.any(String), noteId: 'note-1', text: 'Check shelves',
        assigneeName: 'Sam', evidenceText: 'Sam should check shelves.', status: 'OPEN', createdAt: expect.any(String) }],
    });
    expect(extracted).toEqual(before);
  });

  it.each([
    { quantity: null }, { unit: null }, { kind: null }, { ambiguity: 'Overlap' },
    { ambiguity: '' }, { itemName: 'unknown food' },
  ] satisfies Partial<ExtractedNote['movements'][number]>[])('marks incomplete movement %j as needing clarification', changes => {
    const original = extracted.movements[0];
    if (!original) throw new Error('Missing extraction fixture');
    expect(buildReviewDraftFromNote('note-1', '', { ...extracted, movements: [{ ...original, ...changes }] })
      .movements[0]?.state).toBe('NEEDS_CLARIFICATION');
  });

  it('gives separate rows stable note-scoped IDs without sharing extraction arrays', () => {
    const source = { ...extracted, movements: [...extracted.movements, ...extracted.movements] };
    const first = buildReviewDraftFromNote('note-1', '', source);
    const second = buildReviewDraftFromNote('note-1', '', source);
    expect(first.movements.map(row => row.tempId)).toEqual(second.movements.map(row => row.tempId));
    const ids = [...first.movements.map(row => row.tempId), ...first.observations.map(row => row.tempId),
      ...first.followUps.map(task => task.id)];
    expect(new Set(ids).size).toBe(ids.length);
    first.unclassifiedText.push('Human note');
    expect(extracted.unclassifiedText).toEqual(['Shift finished.']);
  });
});
