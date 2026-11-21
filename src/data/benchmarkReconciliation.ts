import { fraction } from '../lib/benchmarkScore';
import { reconcileItem } from '../lib/reconcile';
import type { ReconcileInput, ReconciliationResult } from '../lib/reconcile';
import type { LedgerEvent, OpeningBalance, ReviewMovementItem, ReviewObservationItem } from '../types/inventory';

const time = '2026-01-01T12:00:00.000Z';
const item = { id: 'rice', name: 'Rice', allowedUnits: ['bags'], aliases: [] };
const openingBalance: OpeningBalance = { itemId: 'rice', unit: 'bags', usableQuantity: 24,
  quarantinedQuantity: 0, confirmedAt: time, isDemoSeed: false };
const observed: ReviewObservationItem = { tempId: 'count', rawItemName: 'rice', canonicalItemId: 'rice',
  count: 25, unit: 'bags', evidenceText: 'Counted 25 bags of rice.', state: 'CONFIRMED' };
const pending: ReviewMovementItem = { tempId: 'blocker', canonicalItemId: 'rice', rawItemName: 'rice',
  quantity: null, unit: 'bags', kind: 'RECEIVED', ambiguity: 'No tally', evidenceText: 'Some rice came in.',
  state: 'NEEDS_CLARIFICATION', origin: 'HUMAN_ADDED' };

function event(kind: LedgerEvent['kind'], quantity: number): LedgerEvent {
  return { id: kind, noteId: 'human-fixture', kind, quantity, itemId: 'rice', unit: 'bags',
    occurredAt: time, approvedAt: time, approvedBy: 'Fixture reviewer', sourceNoteOrigin: 'UNKNOWN' };
}

const received = event('RECEIVED', 36);
const quarantine = event('QUARANTINED', 5);
const edited = [received, event('DISTRIBUTED', 10), quarantine];
const base: ReconcileInput = { item, openingBalance, approvedEvents: edited,
  latestObservation: observed, pendingDrafts: [] };

type Expected = Pick<ReconciliationResult, 'status' | 'confirmedUsable' | 'quarantinedBalance' |
  'discrepancy' | 'blockingDraftCount'>;

const fixtures: readonly { id: string; input: ReconcileInput; expected: Expected }[] = [
  { id: 'original-distribution', input: { ...base, approvedEvents: [received, event('DISTRIBUTED', 8), quarantine] },
    expected: { status: 'DISCREPANCY', confirmedUsable: 47, quarantinedBalance: 5, discrepancy: 22, blockingDraftCount: 0 } },
  { id: 'edited-distribution', input: base,
    expected: { status: 'DISCREPANCY', confirmedUsable: 45, quarantinedBalance: 5, discrepancy: 20, blockingDraftCount: 0 } },
  { id: 'blocked-draft', input: { ...base, pendingDrafts: [pending] },
    expected: { status: 'DISCREPANCY', confirmedUsable: 45, quarantinedBalance: 5, discrepancy: 20, blockingDraftCount: 1 } },
  { id: 'missing-baseline', input: { ...base, openingBalance: null },
    expected: { status: 'MISSING_BASELINE', confirmedUsable: null, quarantinedBalance: null, discrepancy: null, blockingDraftCount: 0 } },
  { id: 'mismatched-observation-unit', input: { ...base, latestObservation: { ...observed, unit: 'kg' } },
    expected: { status: 'UNIT_MISMATCH', confirmedUsable: null, quarantinedBalance: null, discrepancy: null, blockingDraftCount: 0 } },
  { id: 'mismatched-movement-unit', input: { ...base, approvedEvents: [{ ...received, unit: 'cases' }] },
    expected: { status: 'UNIT_MISMATCH', confirmedUsable: null, quarantinedBalance: null, discrepancy: null, blockingDraftCount: 0 } },
  { id: 'dismissed-observation', input: { ...base, latestObservation: { ...observed, state: 'DISMISSED' } },
    expected: { status: 'NO_OBSERVATION', confirmedUsable: 45, quarantinedBalance: 5, discrepancy: null, blockingDraftCount: 0 } },
  { id: 'balanced-observation', input: { ...base, latestObservation: { ...observed, count: 45 } },
    expected: { status: 'BALANCED', confirmedUsable: 45, quarantinedBalance: 5, discrepancy: 0, blockingDraftCount: 0 } },
  { id: 'more-counted-than-expected', input: { ...base, latestObservation: { ...observed, count: 48 } },
    expected: { status: 'DISCREPANCY', confirmedUsable: 45, quarantinedBalance: 5, discrepancy: -3, blockingDraftCount: 0 } },
  { id: 'explicit-adjustment', input: { ...base, approvedEvents: [...edited, event('ADJUSTMENT', 2)],
      latestObservation: { ...observed, count: 47 } },
    expected: { status: 'BALANCED', confirmedUsable: 47, quarantinedBalance: 5, discrepancy: 0, blockingDraftCount: 0 } },
];

export function scoreReconciliation() {
  const results = fixtures.map(({ id, input, expected }) => {
    const { status, confirmedUsable, quarantinedBalance, discrepancy, blockingDraftCount } = reconcileItem(input);
    const actual = { status, confirmedUsable, quarantinedBalance, discrepancy, blockingDraftCount };
    const passed = Object.entries(expected).every(([key, value]) => Object.entries(actual)
      .some(([actualKey, actualValue]) => actualKey === key && actualValue === value));
    return { id, input, expected, actual, passed };
  });
  const expected = results.filter(row => row.expected.status === 'DISCREPANCY').length;
  const detected = results.filter(row => row.actual.status === 'DISCREPANCY').length;
  const matched = results.filter(row => row.expected.status === 'DISCREPANCY' && row.actual.status === 'DISCREPANCY').length;
  return { pass: fraction(results.filter(row => row.passed).length, results.length),
    discrepancyPrecision: fraction(matched, detected), discrepancyRecall: fraction(matched, expected), results };
}
