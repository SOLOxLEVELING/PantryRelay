import 'fake-indexeddb/auto';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LedgerEvent } from '../types/inventory';
import { clearLocalWorkspace, enqueueOutboxEvents, listOutboxEntries } from './storage';
import { createFirestoreLedgerWriter, flushSyncOutbox, summarizeSyncState } from './syncOutbox';
import type { LedgerRemoteWriter } from './syncOutbox';

const firestoreCalls = vi.hoisted(() => ({ setDoc: vi.fn(), getDocFromServer: vi.fn() }));
vi.mock('firebase/firestore', async importOriginal => ({
  ...await importOriginal<typeof import('firebase/firestore')>(),
  ...firestoreCalls,
}));

const uid = 'volunteer-uid';
const sessionId = 'session-one';
const time = '2026-11-21T10:00:00.000Z';
const receipt: LedgerEvent = {
  id: 'receipt-id', itemId: 'rice', noteId: 'note', quantity: 36, unit: 'bags',
  kind: 'RECEIVED', occurredAt: time, approvedAt: time, approvedBy: 'volunteer',
  sourceNoteOrigin: 'ON_DEVICE',
};
const distribution: LedgerEvent = { ...receipt, id: 'distribution-id', kind: 'DISTRIBUTED', quantity: 8 };
const db = getFirestore(initializeApp({ projectId: 'demo-pantryrelay' }, 'outbox-test'));

beforeEach(async () => {
  await clearLocalWorkspace();
  vi.resetAllMocks();
});

describe('outbox flushing', () => {
  it('coalesces concurrent flushes, isolates sessions, and skips already acknowledged events', async () => {
    await enqueueOutboxEvents(sessionId, [receipt, distribution, receipt]);
    await enqueueOutboxEvents('other-session', [{ ...receipt, id: 'other' }]);
    const writeLedgerEvent = vi.fn<LedgerRemoteWriter['writeLedgerEvent']>().mockResolvedValue(undefined);
    const options = { uid, sessionId, writer: { writeLedgerEvent } };

    const [first, concurrent] = await Promise.all([flushSyncOutbox(options), flushSyncOutbox(options)]);
    expect(first).toEqual({ syncedIds: [distribution.id, receipt.id], failedIds: [], pendingCount: 0 });
    expect(concurrent).toEqual(first);
    await enqueueOutboxEvents(sessionId, [receipt]);
    expect(await flushSyncOutbox(options)).toEqual({ syncedIds: [], failedIds: [], pendingCount: 0 });
    expect(writeLedgerEvent.mock.calls).toEqual([[uid, sessionId, distribution], [uid, sessionId, receipt]]);
    expect(await listOutboxEntries('other-session')).toMatchObject([{ syncState: 'APPROVED_PENDING_SYNC' }]);
  });

  it('records a sanitized failed attempt, keeps retry pending until remote acknowledgment, and then marks it synced', async () => {
    await enqueueOutboxEvents(sessionId, [receipt]);
    const entered = Promise.withResolvers<void>();
    const acknowledgment = Promise.withResolvers<void>();
    const writeLedgerEvent = vi.fn<LedgerRemoteWriter['writeLedgerEvent']>()
      .mockRejectedValueOnce(Object.assign(new Error('Authorization: Bearer private-token'), { code: 'unavailable' }))
      .mockImplementationOnce(() => {
        entered.resolve();
        return acknowledgment.promise;
      });
    const options = { uid, sessionId, writer: { writeLedgerEvent } };
    expect(await flushSyncOutbox(options)).toEqual({ syncedIds: [], failedIds: [receipt.id], pendingCount: 1 });
    const failed = await listOutboxEntries(sessionId);
    expect(failed).toMatchObject([{ syncState: 'SYNC_ERROR', attempts: 1, syncedAt: null,
      lastError: expect.stringContaining('unavailable') }]);
    expect(failed[0]?.lastError).not.toContain('private-token');

    const retry = flushSyncOutbox(options);
    await Promise.race([entered.promise, retry.then(() => { throw new Error('Flush finished before retrying the writer'); })]);
    expect(await listOutboxEntries(sessionId)).toEqual(failed);
    acknowledgment.resolve();

    expect(await retry).toEqual({ syncedIds: [receipt.id], failedIds: [], pendingCount: 0 });
    expect(await listOutboxEntries(sessionId)).toMatchObject([{ syncState: 'SYNCED', attempts: 2,
      lastError: null, syncedAt: expect.any(String) }]);
  });

  it('reports aggregate counts and prioritizes errors while work remains', async () => {
    expect(summarizeSyncState([])).toEqual({ pending: 0, synced: 0, error: 0, status: 'IDLE' });
    await enqueueOutboxEvents(sessionId, [receipt]);
    expect(summarizeSyncState(await listOutboxEntries())).toEqual({ pending: 1, synced: 0, error: 0, status: 'PENDING' });
    const writeLedgerEvent = vi.fn<LedgerRemoteWriter['writeLedgerEvent']>()
      .mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline'));
    const options = { uid, sessionId, writer: { writeLedgerEvent } };
    await flushSyncOutbox(options);
    expect(summarizeSyncState(await listOutboxEntries())).toEqual({ pending: 0, synced: 1, error: 0, status: 'SYNCED' });
    await enqueueOutboxEvents(sessionId, [distribution]);
    await flushSyncOutbox(options);
    await enqueueOutboxEvents(sessionId, [{ ...receipt, id: 'new-event' }]);
    expect(summarizeSyncState(await listOutboxEntries())).toEqual({ pending: 1, synced: 1, error: 1, status: 'SYNC_ERROR' });
  });
});

describe('Firestore ledger writer', () => {
  const writer = createFirestoreLedgerWriter(db);
  const permissionDenied = Object.assign(new Error('Write denied'), { code: 'permission-denied' });

  it('sends the unchanged event to its stable document path', async () => {
    firestoreCalls.setDoc.mockResolvedValue(undefined);
    await writer.writeLedgerEvent(uid, sessionId, receipt);
    expect(firestoreCalls.setDoc).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ path: `workspaces/${uid}/sessions/${sessionId}/ledgerEvents/${receipt.id}` }), receipt,
    );
    expect(firestoreCalls.getDocFromServer).not.toHaveBeenCalled();
  });

  it('acknowledges an identical committed event after an interrupted local acknowledgment', async () => {
    firestoreCalls.setDoc.mockRejectedValue(permissionDenied);
    firestoreCalls.getDocFromServer.mockResolvedValue({ data: () => receipt, metadata: { hasPendingWrites: false } });
    await enqueueOutboxEvents(sessionId, [receipt]);

    expect(await flushSyncOutbox({ uid, sessionId, writer })).toEqual({
      syncedIds: [receipt.id], failedIds: [], pendingCount: 0,
    });
    expect(firestoreCalls.getDocFromServer).toHaveBeenCalledExactlyOnceWith(firestoreCalls.setDoc.mock.calls[0]?.[0]);
    expect(await listOutboxEntries(sessionId)).toMatchObject([{ syncState: 'SYNCED' }]);
  });

  it.each([
    { remote: { ...receipt, quantity: 99 }, pending: false },
    { remote: { ...receipt, extra: 'unexpected' }, pending: false },
    { remote: undefined, pending: false },
    { remote: receipt, pending: true },
  ])('does not acknowledge a different, missing, or locally pending document (%j)', async ({ remote, pending }) => {
    firestoreCalls.setDoc.mockRejectedValue(permissionDenied);
    firestoreCalls.getDocFromServer.mockResolvedValue({ data: () => remote, metadata: { hasPendingWrites: pending } });

    await expect(writer.writeLedgerEvent(uid, sessionId, receipt)).rejects.toBe(permissionDenied);
  });

  it('preserves the original write error if the server read is denied', async () => {
    firestoreCalls.setDoc.mockRejectedValue(permissionDenied);
    firestoreCalls.getDocFromServer.mockRejectedValue(new Error('Read denied'));

    await expect(writer.writeLedgerEvent(uid, sessionId, receipt)).rejects.toBe(permissionDenied);
  });
});
