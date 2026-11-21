import { doc, getDocFromServer, setDoc } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { LedgerEvent } from '../types/inventory';
import { listOutboxEntries, markOutboxError, markOutboxSynced } from './storage';
import type { OutboxEntry } from './storage';

export interface LedgerRemoteWriter {
  writeLedgerEvent(uid: string, sessionId: string, event: LedgerEvent): Promise<void>;
}

export interface FlushOptions {
  uid: string;
  sessionId: string;
  writer: LedgerRemoteWriter;
}

export interface FlushResult {
  syncedIds: string[];
  failedIds: string[];
  pendingCount: number;
}

export interface SyncSummary {
  pending: number;
  synced: number;
  error: number;
  status: 'IDLE' | 'PENDING' | 'SYNCED' | 'SYNC_ERROR';
}

function errorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

function safeWriteError(error: unknown): string {
  switch (errorCode(error)) {
    case 'unavailable': return 'Firestore is unavailable. Retry when connected.';
    case 'deadline-exceeded': return 'The Firestore write timed out. Retry sync.';
    case 'permission-denied': return 'Firestore denied the ledger write. Check workspace access.';
    case 'unauthenticated': return 'Firestore requires sign-in before syncing.';
    case 'resource-exhausted': return 'Firestore quota was exceeded. Retry later.';
    default: return 'The ledger write failed. Retry sync.';
  }
}

export function createFirestoreLedgerWriter(db: Firestore): LedgerRemoteWriter {
  return {
    async writeLedgerEvent(uid, sessionId, event) {
      const reference = doc(db, 'workspaces', uid, 'sessions', sessionId, 'ledgerEvents', event.id);
      try {
        await setDoc(reference, event);
      } catch (error) {
        if (errorCode(error) !== 'permission-denied') throw error;
        const snapshot = await getDocFromServer(reference).catch(() => undefined);
        const remote: Record<string, unknown> | undefined = snapshot?.data();
        const expectedFields = Object.entries(event);
        if (!snapshot || snapshot.metadata.hasPendingWrites || !remote ||
          Object.keys(remote).length !== expectedFields.length ||
          !expectedFields.every(([key, value]) => Object.hasOwn(remote, key) && remote[key] === value)) {
          throw error;
        }
      }
    },
  };
}

async function flushSession({ uid, sessionId, writer }: FlushOptions): Promise<FlushResult> {
  const entries = await listOutboxEntries(sessionId);
  const syncedIds: string[] = [];
  const failedIds: string[] = [];

  for (const entry of entries) {
    if (entry.syncState === 'SYNCED') continue;
    const { event } = entry;
    try {
      await writer.writeLedgerEvent(uid, sessionId, event);
    } catch (error) {
      await markOutboxError(event.id, safeWriteError(error));
      failedIds.push(event.id);
      continue;
    }
    await markOutboxSynced(event.id, new Date().toISOString());
    syncedIds.push(event.id);
  }

  const remaining = await listOutboxEntries(sessionId);
  const pendingCount = remaining.filter(entry => entry.syncState !== 'SYNCED').length;
  return { syncedIds, failedIds, pendingCount };
}

const inFlightBySession = new Map<string, { uid: string; result: Promise<FlushResult> }>();

export function flushSyncOutbox(options: FlushOptions): Promise<FlushResult> {
  const { uid, sessionId } = options;
  const inFlight = inFlightBySession.get(sessionId);
  if (inFlight) {
    if (inFlight.uid !== uid) return Promise.reject(new Error('This session is already syncing under a different user.'));
    return inFlight.result;
  }

  const result = flushSession(options).finally(() => inFlightBySession.delete(sessionId));
  inFlightBySession.set(sessionId, { uid, result });
  return result;
}

export function summarizeSyncState(entries: readonly OutboxEntry[]): SyncSummary {
  let pending = 0;
  let synced = 0;
  let error = 0;
  for (const entry of entries) {
    switch (entry.syncState) {
      case 'APPROVED_PENDING_SYNC': pending += 1; break;
      case 'SYNCED': synced += 1; break;
      case 'SYNC_ERROR': error += 1; break;
    }
  }
  const status = error > 0 ? 'SYNC_ERROR' : pending > 0 ? 'PENDING' : synced > 0 ? 'SYNCED' : 'IDLE';
  return { pending, synced, error, status };
}
