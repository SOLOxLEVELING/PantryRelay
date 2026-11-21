import { describe, expect, it } from 'vitest';
import { initialWorkflowState, reconcileWorkflow, workflowReducer } from './workflowState';
import type { WorkflowState } from './workflowState';
import type { ExtractedNote, SpikeResult } from './spikeExtract';
import { sanitizeExtractedNote } from './sanitizeDraft';
import { syntheticNotes } from './syntheticNotes';

const noteText = syntheticNotes[0]?.text ?? '';
const golden: ExtractedNote = {
  movements: [
    { itemName: 'rice', quantity: 36, unit: 'bags', kind: 'RECEIVED', evidenceText: 'Received 36 bags of rice', ambiguity: null },
    { itemName: 'rice', quantity: 8, unit: 'bags', kind: 'DISTRIBUTED', evidenceText: 'gave out 8', ambiguity: null },
    { itemName: 'rice', quantity: 5, unit: 'bags', kind: 'QUARANTINED', evidenceText: 'Five damaged bags set aside.', ambiguity: null },
  ],
  observations: [{ itemName: 'rice', count: 25, unit: 'bags', evidenceText: 'The paper count says 25 left.' }],
  followUps: [{ text: 'Check the shelves', assigneeName: 'Sam', evidenceText: 'Sam needs to check the shelves.' }],
  unclassifiedText: [],
};
const now = '2026-11-18T10:00:00.000Z';

function result(draft: ExtractedNote = golden, text = noteText): SpikeResult {
  const guarded = sanitizeExtractedNote(text, draft);
  return { ok: true, inferenceSource: 'ON_DEVICE', rawInferenceSource: 'on-device', latencyMs: 1500,
    rawText: JSON.stringify(draft), rawParsed: draft, parsed: draft, sanitized: guarded.draft,
    quarantined: guarded.quarantined, failureKind: null, validationError: null, failureStage: null };
}
function extract(draft: ExtractedNote = golden, text = noteText, state = initialWorkflowState(), noteId = 'note') {
  return workflowReducer(workflowReducer(state, { type: 'EXTRACT_START', noteId, noteText: text }),
    { type: 'EXTRACT_FINISH', noteId, result: result(draft, text) });
}
function approve(state: WorkflowState, index: number) {
  return workflowReducer(state, { type: 'APPROVE', tempId: `note:movement:${index}`, id: `event-${index}`, now });
}
function summary(state: WorkflowState) { return reconcileWorkflow(state).find(item => item.item.id === 'rice')?.result; }

describe('pantry workflow', () => {
  it('retains the verbatim source, untrusted draft and SDK metadata without moving stock', () => {
    const text = `  ${noteText}\n`;
    const state = extract(golden, text);
    expect(state.notes[0]).toMatchObject({ draft: { noteText: text, followUps: [{ assigneeName: 'Sam', status: 'OPEN' }] },
      inferenceSource: 'ON_DEVICE', latencyMs: 1500 });
    expect(state.approvedEvents).toEqual([]);
    expect(summary(state)).toMatchObject({ confirmedUsable: 24, blockingDraftCount: 3, discrepancy: -1 });
  });

  it('approves golden rows exactly once and keeps 47 usable, 5 quarantined and a 22 bag discrepancy', () => {
    let state = extract();
    for (const index of [0, 1, 2]) state = approve(state, index);
    expect(summary(state)).toMatchObject({ confirmedUsable: 47, quarantinedBalance: 5, discrepancy: 22, blockingDraftCount: 0 });
    expect(state.approvedEvents).toHaveLength(3);
    expect(state.approvedEvents.every(Object.isFrozen)).toBe(true);
    expect(state.notes[0]?.draft.movements.every(row => row.state === 'APPROVED')).toBe(true);
    expect(approve(state, 0)).toBe(state);
    expect(workflowReducer(state, { type: 'EDIT', tempId: 'note:movement:0', changes: { quantity: 999 } }).approvedEvents).toEqual(state.approvedEvents);
    expect(summary(workflowReducer(state, { type: 'REJECT', tempId: 'note:movement:0' }))).toEqual(summary(state));
  });

  it('uses the edited distribution at approval and leaves prior ledger snapshots unchanged', () => {
    const extracted = extract();
    let state = workflowReducer(extracted, { type: 'EDIT', tempId: 'note:movement:1', changes: { quantity: 10 } });
    expect(state.notes[0]?.draft.movements[1]).toMatchObject({ origin: 'HUMAN_EDITED', quantity: 10 });
    expect(summary(state)?.confirmedUsable).toBe(24);
    for (const index of [0, 1, 2]) state = approve(state, index);
    expect(summary(state)).toMatchObject({ confirmedUsable: 45, discrepancy: 20 });
    expect(extracted.notes[0]?.draft.movements[1]?.quantity).toBe(8);
    expect(extracted.approvedEvents).toEqual([]);
  });

  it('rejects a movement permanently and excludes it from confirmed balance and pending blockers', () => {
    let state = workflowReducer(extract(), { type: 'REJECT', tempId: 'note:movement:1' });
    state = approve(approve(approve(state, 0), 1), 2);
    expect(state.approvedEvents).toHaveLength(2);
    expect(summary(state)).toMatchObject({ confirmedUsable: 55, discrepancy: 30, blockingDraftCount: 0 });
    expect(state.notes[0]?.draft.movements[1]?.state).toBe('REJECTED');
  });

  it('blocks damage overlap until a human resolves it, and keeps the second loss quarantined', () => {
    const text = syntheticNotes.find(note => note.id === 'damage-overlap')?.text ?? '';
    const draft: ExtractedNote = { ...golden, observations: [], followUps: [], movements: [
      { itemName: 'rice', quantity: 8, unit: 'bags', kind: 'DISTRIBUTED', ambiguity: null, evidenceText: 'Gave out eight bags of rice' },
      { itemName: 'rice', quantity: 5, unit: 'bags', kind: 'QUARANTINED', ambiguity: null, evidenceText: 'five damaged bags included in those eight' },
    ] };
    const state = extract(draft, text);
    expect(state.notes[0]?.quarantined).toHaveLength(1);
    expect(state.notes[0]?.draft.movements[0]?.state).toBe('NEEDS_CLARIFICATION');
    expect(approve(state, 0)).toBe(state);
    const resolved = workflowReducer(state, { type: 'EDIT', tempId: 'note:movement:0', changes: { ambiguity: null } });
    expect(approve(resolved, 0).approvedEvents).toHaveLength(1);
  });

  it.each([{ quantity: null }, { quantity: 0 }, { quantity: -1 }, { quantity: Infinity }, { unit: null }, { unit: 'kg' },
    { canonicalItemId: null }, { kind: null }, { ambiguity: 'Confirm the receipt' }])('blocks approval of incomplete edits %j', changes => {
    const state = workflowReducer(extract(), { type: 'EDIT', tempId: 'note:movement:0', changes });
    expect(approve(state, 0)).toBe(state);
  });

  it('supports offline manual entry with no extraction and UNKNOWN event provenance', () => {
    let state = workflowReducer(initialWorkflowState(), { type: 'ADD_MOVEMENT', noteId: 'manual', noteText: 'Original manual note', tempId: 'manual-row' });
    expect(state.notes[0]?.draft.movements[0]).toMatchObject({ origin: 'HUMAN_ADDED', canonicalItemId: null, quantity: null });
    state = workflowReducer(state, { type: 'EDIT', tempId: 'manual-row', changes: { canonicalItemId: 'rice', quantity: 3, unit: 'bags', kind: 'RECEIVED' } });
    state = workflowReducer(state, { type: 'APPROVE', tempId: 'manual-row', id: 'manual-event', now });
    expect(state.approvedEvents[0]).toMatchObject({ quantity: 3, sourceNoteOrigin: 'UNKNOWN' });
    expect(summary(state)?.confirmedUsable).toBe(27);
  });

  it('confirms or dismisses observations without changing stock and restores the previous active count', () => {
    let state = approve(approve(approve(extract(), 0), 1), 2);
    state = workflowReducer(state, { type: 'OBSERVATION', tempId: 'note:observation:0', state: 'CONFIRMED' });
    expect(summary(state)).toMatchObject({ confirmedUsable: 47, discrepancy: 22 });
    state = extract({ ...golden, movements: [], observations: [{ itemName: 'rice', count: 47, unit: 'bags', evidenceText: 'Counted 47 bags of rice.' }] }, 'Counted 47 bags of rice.', state, 'count2');
    expect(summary(state)?.status).toBe('BALANCED');
    state = workflowReducer(state, { type: 'OBSERVATION', tempId: 'count2:observation:0', state: 'DISMISSED' });
    expect(summary(state)).toMatchObject({ confirmedUsable: 47, discrepancy: 22 });
    state = workflowReducer(state, { type: 'OBSERVATION', tempId: 'note:observation:0', state: 'DISMISSED' });
    expect(summary(state)).toMatchObject({ status: 'NO_OBSERVATION', confirmedUsable: 47 });
  });

  it('preserves approvals across extractions, but ignores late extraction completion after reset', () => {
    const prior = approve(extract(), 0);
    const started = workflowReducer(prior, { type: 'EXTRACT_START', noteId: 'next', noteText: 'new note' });
    expect(started.approvedEvents).toEqual(prior.approvedEvents);
    const reset = workflowReducer(started, { type: 'RESET' });
    expect(workflowReducer(reset, { type: 'EXTRACT_FINISH', noteId: 'next', result: result() })).toBe(reset);
    expect(summary(reset)?.confirmedUsable).toBe(24);
    expect(reset.notes).toEqual([]);
  });

  it('retains source after failed extraction and allows manual recovery', () => {
    const started = workflowReducer(initialWorkflowState(), { type: 'EXTRACT_START', noteId: 'failed', noteText });
    let state = workflowReducer(started, { type: 'EXTRACT_FINISH', noteId: 'failed', result: {
      ...result(), ok: false, sanitized: null, inferenceSource: 'UNKNOWN', validationError: 'Model unavailable', failureStage: 'inference',
    } });
    expect(state.notes[0]).toMatchObject({ draft: { noteText, movements: [] }, error: 'Model unavailable', inferenceSource: 'UNKNOWN' });
    state = workflowReducer(state, { type: 'ADD_MOVEMENT', noteId: 'failed', noteText, tempId: 'recovery' });
    expect(state.notes[0]?.draft.movements).toHaveLength(1);
    expect(state.extractingNoteId).toBeNull();
  });

  it('keeps a discrepancy open, creates a confirmed recount task and toggles follow-ups', () => {
    let state = workflowReducer(extract(), { type: 'KEEP_OPEN', itemId: 'rice' });
    state = workflowReducer(state, { type: 'ADD_TASK', noteId: 'note', noteText, task: {
      id: 'recount', noteId: 'note', text: 'Recount rice', assigneeName: 'Sam', evidenceText: '', status: 'OPEN', createdAt: now,
    } });
    state = workflowReducer(state, { type: 'TASK_STATUS', id: 'recount', status: 'DONE' });
    expect(state.keptOpen).toEqual(['rice']);
    expect(state.notes[0]?.draft.followUps.find(task => task.id === 'recount')?.status).toBe('DONE');
    state = workflowReducer(state, { type: 'TASK_STATUS', id: 'recount', status: 'OPEN' });
    expect(state.notes[0]?.draft.followUps.find(task => task.id === 'recount')?.status).toBe('OPEN');
    expect(state.approvedEvents).toEqual([]);
  });

  it('creates an explicit adjustment as an unresolved manual draft without changing stock', () => {
    const state = workflowReducer(extract(), { type: 'ADD_MOVEMENT', noteId: 'note', noteText, tempId: 'adjustment', itemId: 'rice', adjustment: true });
    expect(state.notes[0]?.draft.movements.at(-1)).toMatchObject({ kind: 'ADJUSTMENT', quantity: null, origin: 'HUMAN_ADDED', state: 'NEEDS_CLARIFICATION' });
    expect(summary(state)?.confirmedUsable).toBe(24);
  });

  it('surfaces missing baseline for beans and unit mismatch for observed rice without fabricated balances', () => {
    const state = extract({ movements: [], observations: [
      { itemName: 'rice', count: 25, unit: 'kg', evidenceText: 'Counted 25 kg of rice.' },
      { itemName: 'beans', count: 3, unit: 'cans', evidenceText: 'Counted 3 cans of beans.' },
    ], followUps: [], unclassifiedText: [] }, 'Counted 25 kg of rice. Counted 3 cans of beans.');
    expect(reconcileWorkflow(state).map(({ result }) => ({ status: result.status, usable: result.confirmedUsable })))
      .toEqual([{ status: 'UNIT_MISMATCH', usable: null }, { status: 'MISSING_BASELINE', usable: null }]);
  });
});
