import type { BenchmarkNote } from '../data/benchmarkNotes';
import type { ExtractedNote, ExtractionMode, SpikeResult } from './spikeExtract';

export interface BenchmarkAttempt extends Pick<SpikeResult,
  'rawInferenceSource' | 'inferenceSource' | 'latencyMs' | 'rawText' | 'rawParsed' | 'sanitized' |
  'quarantined' | 'failureStage' | 'failureKind' | 'validationError'> {
  noteId: string;
  onlineAtStart: boolean;
  onlineAtEnd: boolean;
  startedAt: string;
}

export interface Fraction {
  numerator: number;
  denominator: number;
}

export function fraction(numerator: number, denominator: number): Fraction {
  return { numerator, denominator };
}

type Movement = ExtractedNote['movements'][number];

function matches(left: Movement, right: Movement): boolean {
  return left.itemName === right.itemName && left.quantity === right.quantity &&
    left.unit === right.unit && left.kind === right.kind;
}

export function scoreMovements(expected: readonly Movement[], proposed: readonly Movement[]) {
  const remaining = [...expected];
  let matchesFound = 0;
  let invented = 0;
  for (const movement of proposed) {
    const index = remaining.findIndex(candidate => matches(candidate, movement));
    if (index === -1) {
      if (!expected.some(candidate => candidate.itemName === movement.itemName && candidate.quantity === movement.quantity)) {
        invented++;
      }
    } else {
      matchesFound++;
      remaining.splice(index, 1);
    }
  }
  return { matches: matchesFound, proposed: proposed.length, expected: expected.length,
    falsePositives: proposed.length - matchesFound, invented };
}

export function scoreLatency(latencies: readonly number[]) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const n = sorted.length;
  const left = sorted[Math.floor((n - 1) / 2)];
  const right = sorted[Math.floor(n / 2)];
  return { n, medianMs: left === undefined || right === undefined ? null : (left + right) / 2,
    p95Ms: sorted[Math.ceil(n * 0.95) - 1] ?? null };
}

function scoreDrafts(rows: readonly { expected: BenchmarkNote['expected']; draft: ExtractedNote | null }[]) {
  let exact = 0;
  let expectedCount = 0;
  let proposedCount = 0;
  let invented = 0;
  let flagged = 0;
  let expectedFlags = 0;
  let correctFlags = 0;
  let falselyResolved = 0;
  let missingAmbiguityResponse = 0;
  for (const { expected, draft } of rows) {
    const movements = draft?.movements ?? [];
    const scores = scoreMovements(expected.movements, movements);
    exact += scores.matches;
    expectedCount += scores.expected;
    proposedCount += scores.proposed;
    invented += scores.invented;
    const hasFlag = movements.some(movement => Boolean(movement.ambiguity?.trim()));
    if (hasFlag) flagged++;
    if (expected.shouldFlagAmbiguity) {
      expectedFlags++;
      if (hasFlag) correctFlags++;
      else if (draft) falselyResolved++;
      else missingAmbiguityResponse++;
    }
  }
  return {
    precision: fraction(exact, proposedCount), recall: fraction(exact, expectedCount),
    falsePositiveMovements: proposedCount - exact, inventedItemOrQuantity: invented,
    ambiguityFlagged: fraction(flagged, rows.length), correctlyFlagged: fraction(correctFlags, expectedFlags),
    falseAmbiguityFlags: flagged - correctFlags,
    falselyResolved: fraction(falselyResolved, expectedFlags),
    missingAmbiguityResponse,
  };
}

export function scoreBenchmark(notes: readonly BenchmarkNote[], attempts: readonly BenchmarkAttempt[],
  mode: Exclude<ExtractionMode, 'PREFER_ON_DEVICE'>) {
  const fixtures = new Map(notes.map(note => [note.id, note.expected]));
  const seen = new Set<string>();
  const rows = attempts.map(attempt => {
    const expected = fixtures.get(attempt.noteId);
    if (!expected || seen.has(attempt.noteId)) throw new Error(`Unexpected or repeated attempt: ${attempt.noteId}`);
    seen.add(attempt.noteId);
    return { expected, attempt };
  });
  const matchesMode = (attempt: BenchmarkAttempt) => mode === 'ONLY_ON_DEVICE'
    ? attempt.inferenceSource === 'ON_DEVICE' && !attempt.onlineAtStart && !attempt.onlineAtEnd
    : attempt.inferenceSource === 'IN_CLOUD' && attempt.onlineAtStart && attempt.onlineAtEnd;
  const successful = attempts.filter(attempt => attempt.rawParsed !== null && matchesMode(attempt));
  return {
    completion: fraction(rows.length, notes.length),
    jsonPass: fraction(attempts.filter(attempt => attempt.rawParsed !== null || attempt.failureStage === 'zod').length, rows.length),
    schemaPass: fraction(attempts.filter(attempt => attempt.rawParsed !== null).length, rows.length),
    sourceAndNetworkMatch: fraction(attempts.filter(matchesMode).length, rows.length),
    successfulInference: fraction(successful.length, rows.length),
    raw: scoreDrafts(rows.map(({ expected, attempt }) => ({ expected, draft: attempt.rawParsed }))),
    guarded: scoreDrafts(rows.map(({ expected, attempt }) => ({ expected, draft: attempt.sanitized }))),
    allAttemptLatency: scoreLatency(attempts.map(attempt => attempt.latencyMs)),
    successfulLatency: scoreLatency(successful.map(attempt => attempt.latencyMs)),
  };
}
