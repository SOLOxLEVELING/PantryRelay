import { InferenceMode, InferenceSource } from 'firebase/ai';
import { describe, expect, it, vi } from 'vitest';
import { buildHandoffSummary, buildDeterministicHandoffText, generateCloudShiftBriefing } from './shiftBriefing';
import { buildReviewDraftFromNote } from './seedData';
import type { OutboxEntry } from './storage';
import { initialWorkflowState, reconcileWorkflow, workflowReducer } from './workflowState';
import type { WorkflowState } from './workflowState';

const { getModel, generateContent } = vi.hoisted(() => ({ getModel: vi.fn(), generateContent: vi.fn() }));
vi.mock('./firebase', () => ({ ai: {} }));
vi.mock('firebase/ai', async importOriginal => ({
  ...await importOriginal<typeof import('firebase/ai')>(),
  getGenerativeModel: getModel,
}));

const now = '2026-11-21T08:00:00.000Z';
const rawNote = 'Raw note with private context and an unsupported quantity of 999.';
const noteId = 'shift';
const outbox = (event: OutboxEntry['event'], syncState: OutboxEntry['syncState']): OutboxEntry => ({
  event, sessionId: 'test-session', syncState, attempts: 0, lastError: null, syncedAt: null,
});

function goldenShift() {
  const original = initialWorkflowState();
  let state: WorkflowState = {
    ...original,
    notes: [{
      draft: buildReviewDraftFromNote(noteId, rawNote, {
        movements: [
          { itemName: 'rice', quantity: 36, unit: 'bags', kind: 'RECEIVED', ambiguity: null, evidenceText: rawNote },
          { itemName: 'rice', quantity: 7, unit: 'bags', kind: 'DISTRIBUTED', ambiguity: null, evidenceText: rawNote },
          { itemName: 'rice', quantity: 999, unit: 'bags', kind: 'RECEIVED', ambiguity: null, evidenceText: rawNote },
        ],
        observations: [{ itemName: 'rice', count: 25, unit: 'bags', evidenceText: rawNote }],
        followUps: [
          { assigneeName: 'Sam', text: 'Check the shelves', evidenceText: rawNote },
          { assigneeName: null, text: 'Check delivery receipt', evidenceText: rawNote },
        ],
        unclassifiedText: [rawNote],
      }),
      inferenceSource: 'ON_DEVICE', latencyMs: 100, quarantined: [], error: null,
    }],
  };
  state = workflowReducer(state, { type: 'EDIT', tempId: 'shift:movement:1', changes: { quantity: 8 } });
  state = workflowReducer(state, { type: 'ADD_MOVEMENT', noteId, noteText: rawNote, tempId: 'manual', itemId: 'rice' });
  state = workflowReducer(state, { type: 'EDIT', tempId: 'manual', changes: { quantity: 5, unit: 'bags', kind: 'QUARANTINED' } });
  state = workflowReducer(state, { type: 'TASK_STATUS', id: 'shift:follow-up:1', status: 'DONE' });
  const approvals = [
    ['shift:movement:0', 'receipt'], ['shift:movement:1', 'distribution'], ['manual', 'quarantine'],
  ] satisfies [string, string][];
  for (const [tempId, id] of approvals) {
    state = workflowReducer(state, { type: 'APPROVE', tempId, id, now });
  }
  const outboxByEvent = new Map(state.approvedEvents.map(event => [event.id, outbox(event,
    event.id === 'receipt' ? 'SYNCED' : event.id === 'distribution' ? 'APPROVED_PENDING_SYNC' : 'SYNC_ERROR')]));
  return { state, reconciliations: reconcileWorkflow(state), outboxByEvent };
}

describe('deterministic shift handoff', () => {
  it('uses only approved stock and preserves task, discrepancy, provenance, and sync details', () => {
    const { state, reconciliations, outboxByEvent } = goldenShift();
    expect(buildDeterministicHandoffText(state, reconciliations, outboxByEvent)).toBe([
      'PantryRelay shift handoff',
      '',
      'Confirmed stock',
      '- Rice: 47 usable bags · 5 quarantined',
      '- Demo seed: opening stock used 24 usable bags and 0 quarantined.',
      '',
      'Unresolved discrepancies',
      '- Rice: 22 bag discrepancy. Expected 47, observed 25 (unverified count).',
      '',
      'Open follow-ups',
      '- Sam: Check the shelves',
      '',
      'Done follow-ups',
      '- Unassigned: Check delivery receipt',
      '',
      'Approved ledger movements',
      '- Rice: Received 36 bags · AI-suggested · Synced',
      '- Rice: Distributed 8 bags · Human-edited · Pending sync',
      '- Rice: Quarantined 5 bags · Human-added · Sync error',
    ].join('\n'));
  });

  it('reports a missing opening balance without inventing stock, discrepancy, or sync state', () => {
    const golden = goldenShift().state;
    const state = { ...golden, openingBalances: [] };
    const text = buildDeterministicHandoffText(state, reconcileWorkflow(state), new Map());
    expect(text).toContain('Rice: Opening balance missing');
    expect(text).toContain('Unresolved discrepancies\nNone recorded.');
    expect(text).toContain('Awaiting local save');
    expect(text).not.toMatch(/usable bags|Demo seed|999|\d+ bag discrepancy/);
  });
});

describe('cloud shift briefing', () => {
  it('sends only structured handoff facts in cloud-only mode and reports the SDK source', async () => {
    const { state, reconciliations, outboxByEvent } = goldenShift();
    const { followUps } = buildHandoffSummary(state, reconciliations, outboxByEvent);
    getModel.mockReturnValue({ generateContent });
    generateContent.mockResolvedValue({ response: { inferenceSource: InferenceSource.IN_CLOUD, text: () => '  Shift briefing.  ' } });

    const result = await generateCloudShiftBriefing({ reconciliations, followUps, approvedEvents: state.approvedEvents });
    expect(result).toEqual({ text: 'Shift briefing.', inferenceSource: 'IN_CLOUD', latencyMs: expect.any(Number) });
    expect(getModel).toHaveBeenLastCalledWith({}, expect.objectContaining({
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: expect.objectContaining({ model: 'gemini-3.5-flash-lite' }),
    }), { timeout: 30_000 });
    expect(generateContent).toHaveBeenLastCalledWith(JSON.stringify({
      stock: [{ item: 'Rice', unit: 'bags', isDemoSeed: true, openingUsable: 24, confirmedUsable: 47, quarantined: 5,
        reconciliationStatus: 'DISCREPANCY', discrepancy: 22, observed: 25, observationStatus: 'UNVERIFIED' }],
      openTasks: [{ task: 'Check the shelves', assignee: 'Sam' }],
      approvedMovements: [
        { itemId: 'rice', quantity: 36, unit: 'bags', kind: 'RECEIVED' },
        { itemId: 'rice', quantity: 8, unit: 'bags', kind: 'DISTRIBUTED' },
        { itemId: 'rice', quantity: 5, unit: 'bags', kind: 'QUARANTINED' },
      ],
    }));
  });

  it('rejects blank output and keeps an unknown SDK source unknown', async () => {
    const input = { reconciliations: [], followUps: [], approvedEvents: [] };
    getModel.mockReturnValue({ generateContent });
    generateContent.mockResolvedValueOnce({ response: { inferenceSource: undefined, text: () => '  ' } });
    await expect(generateCloudShiftBriefing(input)).rejects.toThrow('empty briefing');
    generateContent.mockResolvedValueOnce({ response: { inferenceSource: undefined, text: () => 'Briefing' } });
    await expect(generateCloudShiftBriefing(input)).resolves.toMatchObject({ inferenceSource: 'UNKNOWN' });
  });
});
