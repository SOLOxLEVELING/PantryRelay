import type { FollowUpTask, LedgerEvent, ReviewDraft, ReviewMovementItem, ReviewObservationItem, SourceMode } from '../types/inventory';
import type { SpikeResult } from './spikeExtract';
import type { LocalWorkspaceSnapshot } from './storage';
import { buildReviewDraftFromNote, DEMO_CATALOG, DEMO_OPENING_BALANCES } from './seedData';
import { canApproveMovement, createLedgerEvent, reconcileItem } from './reconcile';

export interface WorkflowNote {
  draft: ReviewDraft;
  inferenceSource: SourceMode;
  latencyMs: number | null;
  quarantined: SpikeResult['quarantined'];
  error: string | null;
}

export interface WorkflowState {
  sessionId: string;
  hydrated: boolean;
  catalog: typeof DEMO_CATALOG;
  openingBalances: typeof DEMO_OPENING_BALANCES;
  notes: WorkflowNote[];
  approvedEvents: readonly LedgerEvent[];
  extractingNoteId: string | null;
  keptOpen: string[];
}

export type MovementEdit = Partial<Pick<ReviewMovementItem,
  'canonicalItemId' | 'quantity' | 'unit' | 'kind' | 'ambiguity'>>;
export type ObservationEdit = Partial<Pick<ReviewObservationItem, 'canonicalItemId' | 'count' | 'unit'>>;

export type WorkflowAction =
  | { type: 'HYDRATE'; snapshot: LocalWorkspaceSnapshot | undefined }
  | { type: 'RESET' }
  | { type: 'EXTRACT_START'; noteId: string; noteText: string }
  | { type: 'EXTRACT_FINISH'; noteId: string; result: SpikeResult }
  | { type: 'EDIT'; tempId: string; changes: MovementEdit }
  | { type: 'ADD_MOVEMENT'; noteId: string; noteText: string; tempId: string; itemId?: string; adjustment?: boolean }
  | { type: 'APPROVE'; tempId: string; id: string; now: string }
  | { type: 'REJECT'; tempId: string }
  | { type: 'ADD_OBSERVATION'; noteId: string; noteText: string; tempId: string }
  | { type: 'EDIT_OBSERVATION'; tempId: string; changes: ObservationEdit }
  | { type: 'OBSERVATION'; tempId: string; state: 'CONFIRMED' | 'DISMISSED' }
  | { type: 'TASK_STATUS'; id: string; status: FollowUpTask['status'] }
  | { type: 'ADD_TASK'; noteId: string; noteText: string; task: FollowUpTask }
  | { type: 'KEEP_OPEN'; itemId: string };

export function initialWorkflowState(): WorkflowState {
  return { sessionId: crypto.randomUUID(), hydrated: false,
    catalog: structuredClone(DEMO_CATALOG), openingBalances: structuredClone(DEMO_OPENING_BALANCES),
    notes: [], approvedEvents: [], extractingNoteId: null, keptOpen: [] };
}

function emptyNote(noteId: string, noteText: string): WorkflowNote {
  return { draft: { noteId, noteText, movements: [], observations: [], followUps: [], unclassifiedText: [] },
    inferenceSource: 'UNKNOWN', latencyMs: null, quarantined: [], error: null };
}

function withNote(state: WorkflowState, noteId: string, noteText: string): WorkflowState {
  return state.notes.some(note => note.draft.noteId === noteId) ? state :
    { ...state, notes: [...state.notes, emptyNote(noteId, noteText)] };
}

function isShelfCount(count: number): boolean {
  return Number.isFinite(count) && count >= 0;
}

export function observationConfirmationIssue(row: ReviewObservationItem, catalog: WorkflowState['catalog']): string | null {
  const item = catalog.find(candidate => candidate.id === row.canonicalItemId);
  if (!item) return 'Choose an item.';
  if (row.count === null || !isShelfCount(row.count)) return 'Enter a finite count of zero or more.';
  if (row.unit === null || !item.allowedUnits.includes(row.unit)) return `Use ${item.allowedUnits.join(' or ')} for ${item.name}.`;
  return null;
}

export function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case 'HYDRATE': {
      if (!action.snapshot) return { ...state, hydrated: true };
      const { sessionId, notes, approvedEvents, keptOpen } = action.snapshot;
      return { ...state, hydrated: true, sessionId, notes, approvedEvents, keptOpen, extractingNoteId: null };
    }
    case 'RESET': return { ...initialWorkflowState(), hydrated: true };
    case 'EXTRACT_START': return { ...withNote(state, action.noteId, action.noteText), extractingNoteId: action.noteId };
    case 'EXTRACT_FINISH': {
      if (state.extractingNoteId !== action.noteId) return state;
      return { ...state, extractingNoteId: null, notes: state.notes.map(note => note.draft.noteId !== action.noteId ? note : {
        draft: action.result.ok && action.result.sanitized
          ? buildReviewDraftFromNote(action.noteId, note.draft.noteText, action.result.sanitized) : note.draft,
        inferenceSource: action.result.inferenceSource, latencyMs: action.result.latencyMs,
        quarantined: action.result.quarantined, error: action.result.validationError,
      }) };
    }
    case 'ADD_MOVEMENT': {
      const next = withNote(state, action.noteId, action.noteText);
      return { ...next, notes: next.notes.map(note => note.draft.noteId !== action.noteId ? note : {
        ...note, draft: { ...note.draft, movements: [...note.draft.movements, {
          tempId: action.tempId, rawItemName: '', canonicalItemId: action.itemId ?? null,
          quantity: null, unit: null, kind: action.adjustment ? 'ADJUSTMENT' : null,
          evidenceText: action.adjustment ? 'Explicit adjustment requested by volunteer.' : 'Entered manually by volunteer.',
          ambiguity: action.adjustment ? 'Explain the verified correction before approving. Adjustments add stock; use distribution for a verified reduction.' : null,
          state: 'NEEDS_CLARIFICATION', origin: 'HUMAN_ADDED',
        }] },
      }) };
    }
    case 'APPROVE': {
      const note = state.notes.find(candidate => candidate.draft.movements.some(row => row.tempId === action.tempId));
      const row = note?.draft.movements.find(candidate => candidate.tempId === action.tempId);
      if (!note || !row || row.state === 'APPROVED' || row.state === 'REJECTED' ||
        !canApproveMovement(row, state.catalog).ok || state.approvedEvents.some(event => event.id === action.id)) return state;
      const event = createLedgerEvent(row, { noteId: note.draft.noteId, approvedBy: 'volunteer',
        now: action.now, id: action.id, catalog: state.catalog,
        sourceNoteOrigin: row.origin === 'HUMAN_ADDED' ? 'UNKNOWN' : note.inferenceSource });
      return { ...state, approvedEvents: [...state.approvedEvents, event], notes: state.notes.map(candidate => ({
        ...candidate, draft: { ...candidate.draft, movements: candidate.draft.movements.map(movement =>
          movement.tempId === action.tempId ? { ...movement, state: 'APPROVED', ledgerEventId: event.id } : movement) },
      })) };
    }
    case 'EDIT':
    case 'REJECT': return { ...state, notes: state.notes.map(note => ({ ...note, draft: { ...note.draft,
      movements: note.draft.movements.map(row => {
        if (row.tempId !== action.tempId || row.state === 'APPROVED' || row.state === 'REJECTED') return row;
        if (action.type === 'REJECT') return { ...row, state: 'REJECTED' };
        const edited: ReviewMovementItem = { ...row, ...action.changes, origin: row.origin === 'HUMAN_ADDED' ? row.origin : 'HUMAN_EDITED' };
        return { ...edited, state: canApproveMovement(edited, state.catalog).ok ? 'DRAFT' : 'NEEDS_CLARIFICATION' };
      }),
    } })) };
    case 'ADD_OBSERVATION': {
      const next = withNote(state, action.noteId, action.noteText);
      return { ...next, notes: next.notes.map(note => note.draft.noteId !== action.noteId ? note : {
        ...note, draft: { ...note.draft, observations: [...note.draft.observations, {
          tempId: action.tempId, rawItemName: '', canonicalItemId: null, count: null, unit: null,
          evidenceText: 'Entered manually by volunteer.', state: 'UNVERIFIED', origin: 'HUMAN_ADDED',
        }] },
      }) };
    }
    case 'EDIT_OBSERVATION':
    case 'OBSERVATION': {
      const changes = action.type === 'EDIT_OBSERVATION' ? action.changes : null;
      if (changes?.count != null && !isShelfCount(changes.count)) return state;
      return { ...state, notes: state.notes.map(note => ({ ...note, draft: { ...note.draft,
        observations: note.draft.observations.map(row => {
          if (row.tempId !== action.tempId || row.state === 'DISMISSED') return row;
          if (action.type === 'OBSERVATION') {
            if (action.state === 'CONFIRMED' && observationConfirmationIssue(row, state.catalog)) return row;
            return { ...row, state: action.state };
          }
          if (row.state !== 'UNVERIFIED') return row;
          const { canonicalItemId = row.canonicalItemId, count = row.count, unit = row.unit } = action.changes;
          return { ...row, canonicalItemId, count, unit, origin: row.origin ?? 'HUMAN_EDITED' };
        }),
      } })) };
    }
    case 'TASK_STATUS': return { ...state, notes: state.notes.map(note => ({ ...note, draft: { ...note.draft,
      followUps: note.draft.followUps.map(task => task.id !== action.id ? task : { ...task, status: action.status }),
    } })) };
    case 'ADD_TASK': {
      const next = withNote(state, action.noteId, action.noteText);
      if (next.notes.some(note => note.draft.followUps.some(task => task.id === action.task.id))) return state;
      return { ...next, notes: next.notes.map(note => note.draft.noteId !== action.noteId ? note : {
        ...note, draft: { ...note.draft, followUps: [...note.draft.followUps, action.task] },
      }) };
    }
    case 'KEEP_OPEN': return { ...state, keptOpen: [...new Set([...state.keptOpen, action.itemId])] };
  }
}

export function reconcileWorkflow(state: WorkflowState) {
  const movements = state.notes.flatMap(note => note.draft.movements);
  const observations = state.notes.flatMap(note => note.draft.observations);
  return state.catalog.filter(item => item.id === 'rice' || state.approvedEvents.some(event => event.itemId === item.id) ||
    observations.some(row => row.canonicalItemId === item.id && row.state !== 'DISMISSED') ||
    movements.some(row => row.canonicalItemId === item.id)).map(item => {
    const openingBalance = state.openingBalances.find(balance => balance.itemId === item.id);
    const latestObservation = observations.findLast(row => row.canonicalItemId === item.id &&
      (row.state === 'CONFIRMED' || (row.state === 'UNVERIFIED' && row.origin === undefined)));
    return { item, openingBalance, latestObservation, result: reconcileItem({ item, openingBalance,
      latestObservation, approvedEvents: state.approvedEvents, pendingDrafts: movements }) };
  });
}
