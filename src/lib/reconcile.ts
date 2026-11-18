import type {
  CanonicalItem, LedgerEvent, MovementKind, OpeningBalance,
  ReviewMovementItem, ReviewObservationItem, SourceMode,
} from '../types/inventory';
import { DEMO_CATALOG } from './seedData';

export type ApprovalCheck = { ok: true } | { ok: false; reason: string };

type ValidatedMovement = {
  [Key in 'canonicalItemId' | 'quantity' | 'unit' | 'kind']: NonNullable<ReviewMovementItem[Key]>;
};

type MovementValidation = { ok: true; movement: ValidatedMovement } | { ok: false; reason: string };

function validateMovement(row: ReviewMovementItem, catalog: readonly CanonicalItem[]): MovementValidation {
  const { canonicalItemId, quantity, unit, kind, ambiguity } = row;
  const item = catalog.find(candidate => candidate.id === canonicalItemId);
  if (canonicalItemId === null || !item) {
    return { ok: false, reason: 'Choose a known canonical item before approving' };
  }
  if (quantity === null || !Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, reason: 'Enter a finite quantity greater than zero before approving' };
  }
  if (unit === null || unit.trim() === '' || !item.allowedUnits.includes(unit)) {
    return { ok: false, reason: 'Choose an allowed unit for this item; automatic conversion is disabled' };
  }
  if (kind === null) {
    return { ok: false, reason: 'Choose a movement kind before approving' };
  }
  if (ambiguity !== null && ambiguity.trim() !== '') {
    return { ok: false, reason: 'Resolve the movement ambiguity before approving' };
  }
  return { ok: true, movement: { canonicalItemId, quantity, unit, kind } };
}

export function canApproveMovement(row: ReviewMovementItem, catalog: readonly CanonicalItem[]): ApprovalCheck {
  const result = validateMovement(row, catalog);
  return result.ok ? { ok: true } : result;
}

export interface ApprovalContext {
  noteId: string;
  approvedBy: string;
  now: string;
  id: string;
  catalog?: readonly CanonicalItem[];
  sourceNoteOrigin?: SourceMode;
}

export function createLedgerEvent(row: ReviewMovementItem, {
  noteId, approvedBy, now, id, catalog = DEMO_CATALOG, sourceNoteOrigin = 'UNKNOWN',
}: ApprovalContext): LedgerEvent {
  const result = validateMovement(row, catalog);
  if (!result.ok) throw new Error(result.reason);
  const { canonicalItemId, quantity, unit, kind } = result.movement;
  return Object.freeze({
    id, noteId, itemId: canonicalItemId, quantity, unit, kind,
    occurredAt: now, approvedAt: now, approvedBy, sourceNoteOrigin,
  });
}

export interface ReconcileInput {
  item: CanonicalItem;
  openingBalance: OpeningBalance | null | undefined;
  approvedEvents: readonly LedgerEvent[];
  latestObservation: ReviewObservationItem | null | undefined;
  pendingDrafts: readonly ReviewMovementItem[];
}

export interface PendingIssue {
  tempId: string;
  reason: string;
}

type NextAction = 'Confirm an opening usable balance before reconciling'
  | 'Resolve unit mismatch; automatic conversion is disabled'
  | 'KEEP_OPEN' | 'REQUEST_RECOUNT' | 'RECORD_EXPLICIT_ADJUSTMENT';

interface ReconciliationSummary {
  approvedReceived: number;
  approvedDistributed: number;
  approvedQuarantined: number;
  approvedAdjustments: number;
  blockingDraftCount: number;
  pendingIssues: PendingIssue[];
  nextActions: NextAction[];
}

export type ReconciliationResult = ReconciliationSummary & (
  | { status: 'MISSING_BASELINE' | 'UNIT_MISMATCH'; confirmedUsable: null;
    quarantinedBalance: null; discrepancy: null }
  | { status: 'NO_OBSERVATION'; confirmedUsable: number;
    quarantinedBalance: number; discrepancy: null }
  | { status: 'DISCREPANCY' | 'BALANCED'; confirmedUsable: number;
    quarantinedBalance: number; discrepancy: number }
);

export function reconcileItem({
  item, openingBalance, approvedEvents, latestObservation, pendingDrafts,
}: ReconcileInput): ReconciliationResult {
  const events = approvedEvents.filter(event => event.itemId === item.id);
  const totals: Record<MovementKind, number> = { RECEIVED: 0, DISTRIBUTED: 0, QUARANTINED: 0, ADJUSTMENT: 0 };
  for (const event of events) totals[event.kind] += event.quantity;

  const pendingIssues = pendingDrafts
    .filter(row => (row.canonicalItemId === item.id || row.canonicalItemId === null) &&
      (row.state === 'DRAFT' || row.state === 'NEEDS_CLARIFICATION'))
    .map(row => {
      const eligibility = canApproveMovement(row, [item]);
      return { tempId: row.tempId, reason: eligibility.ok
        ? 'Review and approve or reject this movement' : eligibility.reason };
    });
  const summary = {
    approvedReceived: totals.RECEIVED,
    approvedDistributed: totals.DISTRIBUTED,
    approvedQuarantined: totals.QUARANTINED,
    approvedAdjustments: totals.ADJUSTMENT,
    blockingDraftCount: pendingIssues.length,
    pendingIssues,
  };

  if (!openingBalance || openingBalance.itemId !== item.id) {
    return { ...summary, status: 'MISSING_BASELINE', confirmedUsable: null,
      quarantinedBalance: null, discrepancy: null,
      nextActions: ['Confirm an opening usable balance before reconciling'] };
  }

  const observation = latestObservation?.canonicalItemId === item.id && latestObservation.state !== 'DISMISSED'
    ? latestObservation : null;
  if (events.some(event => event.unit !== openingBalance.unit) ||
    (observation !== null && observation.unit !== openingBalance.unit)) {
    return { ...summary, status: 'UNIT_MISMATCH', confirmedUsable: null,
      quarantinedBalance: null, discrepancy: null,
      nextActions: ['Resolve unit mismatch; automatic conversion is disabled'] };
  }

  const confirmedUsable = openingBalance.usableQuantity + totals.RECEIVED - totals.DISTRIBUTED
    - totals.QUARANTINED + totals.ADJUSTMENT;
  const quarantinedBalance = openingBalance.quarantinedQuantity + totals.QUARANTINED;
  if (observation === null || observation.count === null) {
    return { ...summary, status: 'NO_OBSERVATION', confirmedUsable,
      quarantinedBalance, discrepancy: null, nextActions: [] };
  }

  const discrepancy = confirmedUsable - observation.count;
  return { ...summary, status: discrepancy === 0 ? 'BALANCED' : 'DISCREPANCY',
    confirmedUsable, quarantinedBalance, discrepancy,
    nextActions: discrepancy === 0 ? [] : ['KEEP_OPEN', 'REQUEST_RECOUNT', 'RECORD_EXPLICIT_ADJUSTMENT'] };
}
