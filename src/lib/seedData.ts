import type {
  CanonicalItem, ExtractedNote, OpeningBalance, ReviewDraft,
} from '../types/inventory';

export const DEMO_CATALOG: CanonicalItem[] = [
  { id: 'rice', name: 'Rice', allowedUnits: ['bags'], aliases: ['rcie'] },
  { id: 'beans', name: 'Beans', allowedUnits: ['cans'], aliases: [] },
];

export const DEMO_OPENING_BALANCES: OpeningBalance[] = [{
  itemId: 'rice', unit: 'bags', usableQuantity: 24, quarantinedQuantity: 0,
  confirmedAt: '2026-11-18T00:00:00.000Z', isDemoSeed: true,
}];

function canonicalItemId(rawName: string): string | null {
  const normalized = rawName.normalize('NFKC').trim().toLocaleLowerCase('en');
  return DEMO_CATALOG.find(item => [item.id, item.name, ...item.aliases]
    .some(name => name.normalize('NFKC').trim().toLocaleLowerCase('en') === normalized))?.id ?? null;
}

export function buildReviewDraftFromNote(
  noteId: string, noteText: string, sanitizedDraft: ExtractedNote,
): ReviewDraft {
  const createdAt = new Date().toISOString();
  return {
    noteId,
    noteText,
    movements: sanitizedDraft.movements.map((movement, index) => {
      const itemId = canonicalItemId(movement.itemName);
      const needsClarification = movement.quantity === null || movement.unit === null ||
        movement.kind === null || movement.ambiguity !== null || itemId === null;
      return {
        tempId: `${noteId}:movement:${index}`,
        rawItemName: movement.itemName,
        canonicalItemId: itemId,
        quantity: movement.quantity,
        unit: movement.unit,
        kind: movement.kind,
        evidenceText: movement.evidenceText,
        ambiguity: movement.ambiguity,
        state: needsClarification ? 'NEEDS_CLARIFICATION' : 'DRAFT',
        origin: 'AI_SUGGESTED',
      };
    }),
    observations: sanitizedDraft.observations.map((observation, index) => ({
      tempId: `${noteId}:observation:${index}`,
      rawItemName: observation.itemName,
      canonicalItemId: canonicalItemId(observation.itemName),
      count: observation.count,
      unit: observation.unit,
      evidenceText: observation.evidenceText,
      state: 'UNVERIFIED',
    })),
    followUps: sanitizedDraft.followUps.map((task, index) => ({
      ...task, id: `${noteId}:follow-up:${index}`, noteId, status: 'OPEN', createdAt,
    })),
    unclassifiedText: [...sanitizedDraft.unclassifiedText],
  };
}
