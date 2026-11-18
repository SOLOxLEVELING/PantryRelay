import { describe, expect, it, vi } from 'vitest';

vi.mock('./firebase', () => ({ ai: null }));

import { extractNoteHybrid, extractionModeSchema } from './spikeExtract';

describe('empty note inference pre-guard', () => {
  for (const mode of extractionModeSchema.options) {
    it.each(['', '  \n\t '])(`skips an empty note in ${mode} before the unconfigured SDK can be used`, async text => {
      const result = await extractNoteHybrid(text, mode);
      expect(result).toMatchObject({
        ok: true, inferenceSource: 'UNKNOWN', rawInferenceSource: 'SKIPPED_EMPTY', latencyMs: 0,
        rawText: '', parsed: null, rawParsed: null, quarantined: [],
        sanitized: { movements: [], observations: [], followUps: [], unclassifiedText: [] },
      });
    });
  }
});
