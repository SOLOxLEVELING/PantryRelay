import { describe, expect, it } from 'vitest';
import { benchmarkNotes } from '../data/benchmarkNotes';
import { scoreReconciliation } from '../data/benchmarkReconciliation';
import type { ExtractedNote } from './spikeExtract';
import { scoreBenchmark, scoreLatency, scoreMovements } from './benchmarkScore';
import type { BenchmarkAttempt } from './benchmarkScore';

const movement: ExtractedNote['movements'][number] = {
  itemName: 'rice', quantity: 4, unit: 'bags', kind: 'RECEIVED', ambiguity: null, evidenceText: '4 bags of rice',
};
const draft: ExtractedNote = { movements: [movement], observations: [], followUps: [], unclassifiedText: [] };

describe('benchmark scoring', () => {
  it('pairs identical movement tuples once and separates unsupported item/quantity from other mismatches', () => {
    expect(scoreMovements([movement, movement], [
      movement, movement, movement, { ...movement, unit: 'sacks' }, { ...movement, kind: 'DISTRIBUTED' },
      { ...movement, quantity: 99 }, { ...movement, itemName: 'beans' },
    ])).toEqual({ matches: 2, proposed: 7, expected: 2, falsePositives: 5, invented: 2 });
    expect(scoreMovements([movement], [{ ...movement, itemName: 'Rice' }]).matches).toBe(0);
  });

  it('keeps JSON, Zod, network/source, guarded ambiguity and partial coverage independent', () => {
    const notes = [
      { id: 'A', text: 'received 4 bags of rice', expected: { ...draft, shouldFlagAmbiguity: true, category: 'uncertain' } },
      { id: 'B', text: 'received 4 bags of rice', expected: { ...draft, shouldFlagAmbiguity: true, category: 'uncertain' } },
      { id: 'C', text: 'received 4 bags of rice', expected: { ...draft, shouldFlagAmbiguity: true, category: 'uncertain' } },
    ];
    const attempt: BenchmarkAttempt = {
      noteId: 'A', startedAt: '2026-01-01T00:00:00.000Z', onlineAtStart: false, onlineAtEnd: false,
      inferenceSource: 'ON_DEVICE', rawInferenceSource: 'on_device', latencyMs: 125, rawText: JSON.stringify(draft),
      rawParsed: draft, sanitized: { ...draft, movements: [{ ...movement, ambiguity: 'Check tally' }] },
      quarantined: [], failureStage: null, failureKind: null, validationError: null,
    };
    const score = scoreBenchmark(notes, [attempt, { ...attempt, noteId: 'B', rawParsed: null, sanitized: null,
      failureStage: 'zod', validationError: 'wrong shape', latencyMs: 250 }], 'ONLY_ON_DEVICE');
    expect(score).toMatchObject({
      completion: { numerator: 2, denominator: 3 }, jsonPass: { numerator: 2, denominator: 2 },
      schemaPass: { numerator: 1, denominator: 2 }, successfulInference: { numerator: 1, denominator: 2 },
      raw: { recall: { numerator: 1, denominator: 2 }, falselyResolved: { numerator: 1, denominator: 2 },
        missingAmbiguityResponse: 1 },
      guarded: { correctlyFlagged: { numerator: 1, denominator: 2 } },
      allAttemptLatency: { n: 2, medianMs: 187.5, p95Ms: 250 }, successfulLatency: { n: 1, medianMs: 125, p95Ms: 125 },
    });
    expect(scoreBenchmark(notes, [{ ...attempt, onlineAtEnd: true }], 'ONLY_ON_DEVICE')
      .successfulInference).toEqual({ numerator: 0, denominator: 1 });
    expect(() => scoreBenchmark(notes, [attempt, attempt], 'ONLY_ON_DEVICE')).toThrow('Unexpected or repeated attempt');
  });

  it('uses nearest-rank p95 and reports empty samples without a numeric result', () => {
    expect(scoreLatency(Array.from({ length: 20 }, (_, index) => 20 - index))).toEqual({ n: 20, medianMs: 10.5, p95Ms: 19 });
    expect(scoreLatency([])).toEqual({ n: 0, medianMs: null, p95Ms: null });
    expect(scoreBenchmark(benchmarkNotes, [], 'ONLY_IN_CLOUD').raw.precision).toEqual({ numerator: 0, denominator: 0 });
  });

  it('keeps 30 unique nonempty notes with literal human evidence', () => {
    expect(benchmarkNotes).toHaveLength(30);
    expect(new Set(benchmarkNotes.map(note => note.id)).size).toBe(30);
    expect(new Set(benchmarkNotes.map(note => note.text)).size).toBe(30);
    for (const { text, expected } of benchmarkNotes) {
      expect(text.trim()).not.toBe('');
      for (const row of [...expected.movements, ...expected.observations, ...expected.followUps]) {
        expect(text).toContain(row.evidenceText);
      }
    }
  });

  it('evaluates the independent human-approved deterministic fixtures', () => {
    const score = scoreReconciliation();
    expect(score.results.filter(row => !row.passed)).toEqual([]);
    expect(score.pass).toEqual({ numerator: 10, denominator: 10 });
    expect(score.discrepancyPrecision).toEqual({ numerator: 4, denominator: 4 });
    expect(score.discrepancyRecall).toEqual({ numerator: 4, denominator: 4 });
  });
});
