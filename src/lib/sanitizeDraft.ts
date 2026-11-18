import type { ExtractedNote } from './spikeExtract';

export interface QuarantinedItem {
  reason: string;
  item: unknown;
}

function normalize(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase('en').replace(/[“”]/gu, '"')
    .replace(/[‘’]/gu, "'").replace(/\s+/gu, ' ').trim().replace(/[.!?;,]+$/u, '');
}

function nullableText(text: string | null): string | null {
  if (text === null || /^(?:null|undefined|n\/?a)?$/iu.test(text.trim())) return null;
  return text.trim();
}

function ambiguityText(text: string | null): string | null {
  const value = nullableText(text);
  return value !== null && /^(?:(?:received|distributed|quarantined|adjustment)\s+)?ambiguity$/iu.test(value) ? null : value;
}

function isMetaCommand(text: string): boolean {
  const value = normalize(text);
  return /\b(?:ignore|disregard)\b[\s\S]{0,100}\binstructions\b/u.test(value) ||
    /\b(?:delete|erase|drop)\b[\s\S]{0,40}\bledger\b/u.test(value) ||
    /\bapprove\s+all\b|\bfabricate\b|\boutput\s+plain\s+text\b|\bhacked\b/u.test(value);
}

function repeatedEvidence(text: string): string {
  return normalize(text).replace(/^(?:repeating|repeat|repeated|same delivery)\b[^:]*:\s*/u, '')
    .replace(/[.!?;]+$/u, '');
}

export function sanitizeExtractedNote(noteText: string, raw: ExtractedNote): {
  draft: ExtractedNote;
  quarantined: QuarantinedItem[];
} {
  const source = normalize(noteText);
  const overlapNeedsReview = /\b(?:gave out|distributed)\b/u.test(source) &&
    /\b(?:damaged|damage)\b[^.!?]{0,100}\b(?:included in|part of)\b[^.!?]{0,40}\b(?:those|the|these)\b/u.test(source);
  const quarantined: QuarantinedItem[] = [];
  const unclassifiedText: string[] = [];
  let cursor = 0;
  const contexts = noteText.split(/(?<=[.!?;])\s+|\n+/u).map(span => span.trim()).filter(Boolean).map(span => {
    const normalized = normalize(span);
    const start = source.indexOf(normalized, cursor);
    cursor = start + normalized.length;
    return { span, start, end: cursor };
  });

  function retainSpan(span: string) {
    const normalized = normalize(span);
    if (normalized && source.includes(normalized) && !unclassifiedText.some(value => normalize(value) === normalized)) {
      unclassifiedText.push(span);
    }
  }

  function commandContexts(evidence: string): string[] {
    const spans = new Set<string>();
    let start = source.indexOf(evidence);
    while (start !== -1) {
      for (const context of contexts) {
        if (context.start < start + evidence.length && context.end > start && isMetaCommand(context.span)) spans.add(context.span);
      }
      start = source.indexOf(evidence, start + 1);
    }
    return [...spans];
  }

  function guard<T extends { evidenceText: string }>(items: T[], clean: (item: T) => T): T[] {
    const kept: T[] = [];
    for (const item of items) {
      const evidence = normalize(item.evidenceText);
      const text = 'text' in item && typeof item.text === 'string' ? item.text : '';
      const attackSpans = evidence ? commandContexts(evidence) : [];
      if (isMetaCommand(text) || isMetaCommand(item.evidenceText) || attackSpans.length > 0) {
        quarantined.push({ reason: 'Meta-command or attack context', item });
        attackSpans.forEach(retainSpan);
        if (isMetaCommand(item.evidenceText)) retainSpan(item.evidenceText);
        if (isMetaCommand(text)) retainSpan(text);
      } else if (!evidence || !source.includes(evidence)) {
        quarantined.push({ reason: 'Evidence is not grounded in the source note', item });
      } else if (overlapNeedsReview && 'kind' in item && item.kind === 'QUARANTINED') {
        quarantined.push({ reason: 'Possible additional loss from damage/distribution overlap', item });
        retainSpan(item.evidenceText);
      } else {
        const claimed = 'quantity' in item ? item.quantity : 'count' in item ? item.count : null;
        const literalNumbers = item.evidenceText.match(/[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?/giu) ?? [];
        const literal = literalNumbers[0];
        if (typeof claimed === 'number' && literalNumbers.length === 1 && literal !== undefined && Number(literal) !== claimed) {
          quarantined.push({ reason: 'Numeric claim contradicts its evidence', item });
        } else kept.push(clean(item));
      }
    }
    return kept;
  }

  for (const span of raw.unclassifiedText) {
    if (normalize(span) && source.includes(normalize(span))) retainSpan(span);
    else quarantined.push({ reason: 'Unclassified text is not grounded in the source note', item: span });
  }

  const movements = guard(raw.movements, item => ({ ...item, unit: nullableText(item.unit),
    ambiguity: ambiguityText(item.ambiguity) ?? (overlapNeedsReview && item.kind === 'DISTRIBUTED' ?
      'Source links damaged stock to distribution; human clarification required.' : null) }));
  const seen = new Map<string, Set<string>>();
  const uniqueMovements = movements.filter(item => {
    const key = JSON.stringify([normalize(item.itemName), item.quantity, item.unit === null ? null : normalize(item.unit), item.kind]);
    const evidence = repeatedEvidence(item.evidenceText);
    const prior = seen.get(key);
    if (prior?.has(evidence)) {
      const original = raw.movements.find(candidate => candidate.evidenceText === item.evidenceText) ?? item;
      quarantined.push({ reason: 'Duplicate movement supported by repeated evidence', item: original });
      return false;
    }
    if (prior) prior.add(evidence);
    else seen.set(key, new Set([evidence]));
    return true;
  });

  return { draft: {
    movements: uniqueMovements,
    observations: guard(raw.observations, item => ({ ...item, unit: nullableText(item.unit) })),
    followUps: guard(raw.followUps, item => ({ ...item, assigneeName: nullableText(item.assigneeName) })),
    unclassifiedText,
  }, quarantined };
}
