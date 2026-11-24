import { describe, expect, it, vi } from 'vitest';
import recordedRuns from '../../docs/evidence/offline-ten-notes.json';
import deviceRun from '../../docs/evidence/g51/device.json';
import cloudRun from '../../docs/evidence/g51/cloud.json';
import unpacedCloudRun from '../../docs/evidence/g51/cloud-unpaced.json';
import { benchmarkNotes } from '../data/benchmarkNotes';

vi.mock('./firebase', () => ({ ai: null }));

import { extractedNoteSchema } from './spikeExtract';
import { sanitizeExtractedNote } from './sanitizeDraft';

function recordedCase(noteId: string) {
  const run = recordedRuns.find(candidate => candidate.noteId === noteId);
  if (!run) throw new Error(`Missing recorded G1.1 case: ${noteId}`);
  return { noteText: run.noteText, raw: extractedNoteSchema.parse(run.result.parsed) };
}

describe('recorded G1.1 safety regressions', () => {
  it('removes the injected rice movement and all injected tasks from the real device response', () => {
    const { noteText, raw } = recordedCase('injection');
    const original = structuredClone(raw);
    const result = sanitizeExtractedNote(noteText, raw);
    expect(result.draft.movements.map(item => item.itemName)).toEqual(['beans']);
    expect(result.draft.followUps).toEqual([]);
    expect(result.quarantined.length).toBeGreaterThan(0);
    expect(raw).toEqual(original);
    expect(extractedNoteSchema.safeParse(result.draft).success).toBe(true);
  });

  it('quarantines every record fabricated for the real empty-note response', () => {
    const { noteText, raw } = recordedCase('empty');
    const result = sanitizeExtractedNote(noteText, raw);
    expect(result.draft).toEqual({ movements: [], observations: [], followUps: [], unclassifiedText: [] });
    expect(result.quarantined).toHaveLength(5);
  });

  it('reduces the real repeated-delivery response to one receipt', () => {
    const { noteText, raw } = recordedCase('duplicate');
    const result = sanitizeExtractedNote(noteText, raw);
    expect(result.draft.movements).toHaveLength(1);
    expect(result.draft.movements[0]?.quantity).toBe(10);
    expect(result.quarantined).toHaveLength(1);
  });
});

describe('G5.1 movement quantities', () => {
  it.each([1e-15, 1])('quarantines a positive juice claim of %s backed only by zeros', quantity => {
    const note = benchmarkNotes.find(candidate => candidate.id === '12');
    const raw = extractedNoteSchema.parse(deviceRun.attempts.find(attempt => attempt.noteId === '12')?.rawParsed);
    const [movement] = raw.movements;
    if (!note || !movement) throw new Error('Missing recorded juice case');
    expect(movement.quantity).toBe(1e-15);
    const claim = { ...movement, quantity };
    const result = sanitizeExtractedNote(note.text, { ...raw, movements: [claim] });
    expect(result.draft.movements).toEqual([]);
    expect(result.quarantined).toContainEqual(expect.objectContaining({ item: claim }));
  });

  it('quarantines grounded sub-0.01 claims even when the evidence supports the number', () => {
    const noteText = 'Received 0.009 kg of rice. Received 0.01 kg of rice.';
    const raw = extractedNoteSchema.parse({ movements: [0.009, 0.01].map(quantity => ({
      itemName: 'rice', quantity, unit: 'kg', kind: 'RECEIVED', ambiguity: null, evidenceText: `Received ${quantity} kg of rice.`,
    })), observations: [], followUps: [], unclassifiedText: [] });
    const result = sanitizeExtractedNote(noteText, raw);
    expect(result.draft.movements.map(movement => movement.quantity)).toEqual([0.01]);
    expect(result.quarantined).toHaveLength(1);
  });

  it.each([
    ['device', deviceRun], ['cloud', cloudRun], ['unpaced cloud', unpacedCloudRun],
  ])('preserves previously accepted valid movements in the %s run', (_label, run) => {
    for (const attempt of run.attempts) {
      if (!attempt.rawParsed) continue;
      const note = benchmarkNotes.find(candidate => candidate.id === attempt.noteId);
      if (!note) throw new Error(`Missing benchmark note ${attempt.noteId}`);
      const raw = extractedNoteSchema.parse(attempt.rawParsed);
      const movements = attempt.sanitized?.movements.filter(movement =>
        !(attempt.noteId === '12' && movement.quantity === 1e-15)) ?? [];
      expect(sanitizeExtractedNote(note.text, raw).draft.movements, `note ${note.id}`).toEqual(movements);
    }
  });

  it('preserves every expected positive corpus movement including 0.75 kg', () => {
    for (const { id, text, expected } of benchmarkNotes) {
      const raw = { ...expected, unclassifiedText: [] };
      const result = sanitizeExtractedNote(text, raw);
      for (const movement of expected.movements.filter(candidate => candidate.quantity !== null)) {
        expect(result.draft.movements, `note ${id}`).toContainEqual(expect.objectContaining({
          itemName: movement.itemName, quantity: movement.quantity, unit: movement.unit, kind: movement.kind,
        }));
      }
    }
  });
});
