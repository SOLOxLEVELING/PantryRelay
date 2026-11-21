import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LedgerEvent } from '../types/inventory';
import { clearLocalWorkspace, enqueueOutboxEvents, listOutboxEntries, loadLocalWorkspace,
  markOutboxError, markOutboxSynced, saveLocalWorkspace } from './storage';
import type { LocalWorkspaceSnapshot } from './storage';

const updatedAt = '2026-11-21T10:00:00.000Z';
const sessionId = 'shift-a';
const receipt: LedgerEvent = {
  id: '4dae973d-8ab4-4d9c-b03a-6a8f2fbc2fce', noteId: 'note-a', itemId: 'rice', quantity: 36,
  unit: 'bags', kind: 'RECEIVED', occurredAt: updatedAt, approvedAt: updatedAt,
  approvedBy: 'volunteer', sourceNoteOrigin: 'ON_DEVICE',
};
const snapshot: LocalWorkspaceSnapshot = {
  sessionId, updatedAt, approvedEvents: [receipt], keptOpen: ['rice'],
  notes: [{
    inferenceSource: 'ON_DEVICE', latencyMs: 7421, error: null,
    quarantined: [{ item: { quantity: 999 }, reason: 'Untrusted claim' }],
    draft: {
      noteId: receipt.noteId, noteText: '  Received 36 bags of rice.\nGave out 8. Sam to recount.  ',
      movements: [
        { tempId: 'receipt', canonicalItemId: 'rice', rawItemName: 'rice', quantity: 36,
          unit: 'bags', kind: 'RECEIVED', evidenceText: 'Received 36 bags of rice.',
          ambiguity: null, origin: 'AI_SUGGESTED', state: 'APPROVED' },
        { tempId: 'distribution', canonicalItemId: 'rice', rawItemName: 'rice', quantity: 10,
          unit: 'bags', kind: 'DISTRIBUTED', evidenceText: 'Gave out 8.',
          ambiguity: null, origin: 'HUMAN_EDITED', state: 'DRAFT' },
      ],
      observations: [{ tempId: 'count', rawItemName: 'rice', canonicalItemId: 'rice', count: 25,
        unit: 'bags', evidenceText: 'Counted 25 bags', state: 'CONFIRMED' }],
      followUps: [{ id: 'recount', noteId: receipt.noteId, text: 'Recount', assigneeName: 'Sam',
        evidenceText: 'Sam to recount.', status: 'OPEN', createdAt: updatedAt }],
      unclassifiedText: [],
    },
  }],
};

beforeEach(clearLocalWorkspace);

describe('local workspace storage', () => {
  it('restores the exact snapshot and pending approval on a fresh IndexedDB connection', async () => {
    await saveLocalWorkspace(snapshot);

    const freshConnection = await openDB('pantryrelay-local', 1);
    try {
      expect(await freshConnection.getAll('workspace')).toEqual([snapshot]);
      expect(await freshConnection.get('outbox', receipt.id)).toMatchObject({
        event: receipt, sessionId, syncState: 'APPROVED_PENDING_SYNC', attempts: 0,
      });
    } finally {
      freshConnection.close();
    }

    const restored = await loadLocalWorkspace();
    expect(restored).toEqual(snapshot);
    expect(Object.isFrozen(restored?.approvedEvents[0])).toBe(true);
  });

  it('rolls back an outbox insertion when the workspace snapshot cannot be cloned', async () => {
    await saveLocalWorkspace(snapshot);
    const note = snapshot.notes.at(0);
    if (!note) throw new Error('Expected a saved note fixture');
    const nextSnapshot = {
      ...snapshot,
      updatedAt: '2026-11-21T10:05:00.000Z',
      notes: [{ ...note, quarantined: [{ item: () => undefined, reason: 'Uncloneable data' }] }],
      approvedEvents: [receipt, { ...receipt, id: 'new-event' }],
    };
    await expect(saveLocalWorkspace(nextSnapshot)).rejects.toThrow();

    expect(await loadLocalWorkspace()).toEqual(snapshot);
    expect(await listOutboxEntries()).toMatchObject([{ event: receipt }]);
  });

  it('deduplicates concurrent enqueues, never replaces an event and keeps acknowledged and errored state', async () => {
    const other = { ...receipt, id: 'second-event' };
    await Promise.all([
      enqueueOutboxEvents(sessionId, [receipt, receipt, other]),
      enqueueOutboxEvents(sessionId, [receipt, other]),
    ]);
    expect(await listOutboxEntries()).toHaveLength(2);

    await markOutboxSynced(receipt.id, updatedAt);
    await markOutboxError(other.id, 'Temporarily unavailable');
    await enqueueOutboxEvents('another-session', [{ ...receipt, quantity: 99 }, other]);
    await saveLocalWorkspace(snapshot);
    await markOutboxError(receipt.id, 'Stale failure');

    expect(await listOutboxEntries('another-session')).toEqual([]);
    expect(await listOutboxEntries(sessionId)).toEqual([
      { event: receipt, sessionId, syncState: 'SYNCED', syncedAt: updatedAt, attempts: 1, lastError: null },
      { event: other, sessionId, syncState: 'SYNC_ERROR', syncedAt: null, attempts: 1, lastError: 'Temporarily unavailable' },
    ]);
  });

  it('clears the workspace and outbox together for reset', async () => {
    await saveLocalWorkspace(snapshot);
    expect(await loadLocalWorkspace()).toEqual(snapshot);
    expect(await listOutboxEntries()).toHaveLength(1);
    await clearLocalWorkspace();
    await markOutboxSynced(receipt.id, updatedAt);

    expect(await loadLocalWorkspace()).toBeUndefined();
    expect(await listOutboxEntries()).toEqual([]);
  });
});
