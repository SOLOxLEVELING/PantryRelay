import { describe, expect, it, vi } from 'vitest';
import recordedRuns from '../../docs/evidence/offline-ten-notes.json';

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
