import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase, IDBPObjectStore } from 'idb';
import type { LedgerEvent, SyncState } from '../types/inventory';
import type { WorkflowState } from './workflowState';

export interface LocalWorkspaceSnapshot extends Pick<WorkflowState, 'notes' | 'approvedEvents' | 'keptOpen'> {
  sessionId: string;
  updatedAt: string;
  revision?: number;
}

export type SaveWorkspaceResult = { ok: true; revision: number } | { ok: false; reason: 'STALE_TAB' };

export interface OutboxEntry {
  event: LedgerEvent;
  sessionId: string;
  syncState: Exclude<SyncState, 'LOCAL_DRAFT'>;
  attempts: number;
  lastError: string | null;
  syncedAt: string | null;
}

interface PantryRelayDatabase extends DBSchema {
  workspace: { key: 'active'; value: LocalWorkspaceSnapshot };
  outbox: {
    key: string;
    value: OutboxEntry;
    indexes: { bySession: string };
  };
}

type OutboxInsertStore = Pick<
  IDBPObjectStore<PantryRelayDatabase, ['outbox'], 'outbox', 'readwrite'>,
  'get' | 'add'
>;

async function withDatabase<T>(operation: (db: IDBPDatabase<PantryRelayDatabase>) => Promise<T>): Promise<T> {
  const db = await openDB<PantryRelayDatabase>('pantryrelay-local', 1, {
    upgrade(database) {
      database.createObjectStore('workspace');
      database.createObjectStore('outbox', { keyPath: 'event.id' }).createIndex('bySession', 'sessionId');
    },
  });
  try {
    return await operation(db);
  } finally {
    db.close();
  }
}

async function commitWrite<T>(transaction: { done: Promise<void>; abort(): void }, write: () => Promise<T>): Promise<T> {
  try {
    const [result] = await Promise.all([write(), transaction.done]);
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
    }
    await transaction.done.catch(() => undefined);
    throw error;
  }
}

async function insertNewEvents(store: OutboxInsertStore, sessionId: string, events: readonly LedgerEvent[]) {
  for (const event of events) {
    if (await store.get(event.id)) continue;
    await store.add({ event, sessionId, syncState: 'APPROVED_PENDING_SYNC',
      attempts: 0, lastError: null, syncedAt: null });
  }
}

export function loadLocalWorkspace(): Promise<LocalWorkspaceSnapshot | undefined> {
  return withDatabase(async db => {
    const snapshot = await db.get('workspace', 'active');
    if (!snapshot) return undefined;
    return { ...snapshot, approvedEvents: snapshot.approvedEvents.map(event => Object.freeze(event)) };
  });
}

export function saveLocalWorkspace(
  snapshot: LocalWorkspaceSnapshot,
  { expectedRevision }: { expectedRevision?: number } = {},
): Promise<SaveWorkspaceResult> {
  return withDatabase(async db => {
    const transaction = db.transaction(['workspace', 'outbox'], 'readwrite');
    return commitWrite(transaction, async (): Promise<SaveWorkspaceResult> => {
      const workspaceStore = transaction.objectStore('workspace');
      const existing = await workspaceStore.get('active');
      const currentRevision = existing?.revision ?? 0;
      if (expectedRevision !== undefined && (existing
        ? existing.sessionId !== snapshot.sessionId || currentRevision !== expectedRevision
        : expectedRevision > 0)) {
        return { ok: false, reason: 'STALE_TAB' };
      }

      const revision = currentRevision + 1;
      await insertNewEvents(transaction.objectStore('outbox'), snapshot.sessionId, snapshot.approvedEvents);
      await workspaceStore.put({ ...snapshot, revision }, 'active');
      return { ok: true, revision };
    });
  });
}

export function enqueueOutboxEvents(sessionId: string, events: readonly LedgerEvent[]): Promise<void> {
  return withDatabase(async db => {
    const transaction = db.transaction('outbox', 'readwrite');
    await commitWrite(transaction, () => insertNewEvents(transaction.store, sessionId, events));
  });
}

export function listOutboxEntries(sessionId?: string): Promise<OutboxEntry[]> {
  return withDatabase(async db => {
    const entries = sessionId === undefined
      ? await db.getAll('outbox')
      : await db.getAllFromIndex('outbox', 'bySession', sessionId);
    return entries.map(entry => ({ ...entry, event: Object.freeze(entry.event) }));
  });
}

type SyncOutcome =
  | { syncState: 'SYNCED'; syncedAt: string; lastError: null }
  | { syncState: 'SYNC_ERROR'; syncedAt: null; lastError: string };

function recordSyncOutcome(eventId: string, outcome: SyncOutcome): Promise<void> {
  return withDatabase(async db => {
    const transaction = db.transaction('outbox', 'readwrite');
    await commitWrite(transaction, async () => {
      const entry = await transaction.store.get(eventId);
      if (!entry || entry.syncState === 'SYNCED') return;
      await transaction.store.put({ ...entry, ...outcome, attempts: entry.attempts + 1 });
    });
  });
}

export function markOutboxSynced(eventId: string, syncedAt: string): Promise<void> {
  return recordSyncOutcome(eventId, { syncState: 'SYNCED', syncedAt, lastError: null });
}

export function markOutboxError(eventId: string, errorMessage: string): Promise<void> {
  return recordSyncOutcome(eventId, { syncState: 'SYNC_ERROR', syncedAt: null, lastError: errorMessage });
}

export function clearLocalWorkspace(): Promise<void> {
  return withDatabase(async db => {
    const transaction = db.transaction(['workspace', 'outbox'], 'readwrite');
    await commitWrite(transaction, async () => {
      await Promise.all([transaction.objectStore('workspace').clear(), transaction.objectStore('outbox').clear()]);
    });
  });
}
