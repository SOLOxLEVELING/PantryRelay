import type { ExtractedNote, MovementKind, SourceMode } from '../lib/spikeExtract';

export type { ExtractedNote, MovementKind, SourceMode };

export type ReviewState = 'DRAFT' | 'APPROVED' | 'REJECTED' | 'NEEDS_CLARIFICATION';
export type SyncState = 'LOCAL_DRAFT' | 'APPROVED_PENDING_SYNC' | 'SYNCED' | 'SYNC_ERROR';

export interface CanonicalItem {
  id: string;
  name: string;
  allowedUnits: string[];
  aliases: string[];
}

export interface OpeningBalance {
  itemId: string;
  unit: string;
  usableQuantity: number;
  quarantinedQuantity: number;
  confirmedAt: string;
  isDemoSeed: boolean;
}

export interface ReviewMovementItem {
  tempId: string;
  ledgerEventId?: string;
  rawItemName: string;
  canonicalItemId: string | null;
  quantity: number | null;
  unit: string | null;
  kind: MovementKind | null;
  evidenceText: string;
  ambiguity: string | null;
  state: ReviewState;
  origin: 'AI_SUGGESTED' | 'HUMAN_EDITED' | 'HUMAN_ADDED';
}

export interface ReviewObservationItem {
  tempId: string;
  rawItemName: string;
  canonicalItemId: string | null;
  count: number | null;
  unit: string | null;
  evidenceText: string;
  state: 'UNVERIFIED' | 'CONFIRMED' | 'DISMISSED';
}

export interface FollowUpTask {
  id: string;
  noteId: string;
  text: string;
  assigneeName: string | null;
  evidenceText: string;
  status: 'OPEN' | 'DONE';
  createdAt: string;
}

export type LedgerEvent = Readonly<{
  id: string;
  noteId: string;
  itemId: string;
  quantity: number;
  unit: string;
  kind: MovementKind;
  occurredAt: string;
  approvedAt: string;
  approvedBy: string;
  sourceNoteOrigin: SourceMode;
}>;

export interface ReviewDraft {
  noteId: string;
  noteText: string;
  movements: ReviewMovementItem[];
  observations: ReviewObservationItem[];
  followUps: FollowUpTask[];
  unclassifiedText: string[];
}
