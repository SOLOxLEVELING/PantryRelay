import { getGenerativeModel, InferenceMode, InferenceSource, Schema } from 'firebase/ai';
import type { LanguageModelMessage } from 'firebase/ai';
import { z } from 'zod';
import { ai } from './firebase';
import { errorText } from './diagnostics';
import { sanitizeExtractedNote } from './sanitizeDraft';
import type { QuarantinedItem } from './sanitizeDraft';

const movementKinds = ['RECEIVED', 'DISTRIBUTED', 'QUARANTINED', 'ADJUSTMENT'];
const movementKindSchema = z.enum(['RECEIVED', 'DISTRIBUTED', 'QUARANTINED', 'ADJUSTMENT']);
export type MovementKind = z.infer<typeof movementKindSchema>;
export type SourceMode = 'ON_DEVICE' | 'IN_CLOUD' | 'UNKNOWN';
export const extractionModeSchema = z.enum(['PREFER_ON_DEVICE', 'ONLY_ON_DEVICE', 'ONLY_IN_CLOUD']);
export type ExtractionMode = z.infer<typeof extractionModeSchema>;
export const cloudModelSchema = z.enum(['gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']);
export type CloudModel = z.infer<typeof cloudModelSchema>;
export const defaultCloudModel: CloudModel = 'gemini-3.5-flash-lite';

export const extractedNoteSchema = z.strictObject({
  movements: z.array(z.strictObject({
    itemName: z.string(),
    quantity: z.number().finite().positive().nullable(),
    unit: z.string().nullable(),
    kind: movementKindSchema.nullable(),
    evidenceText: z.string(),
    ambiguity: z.string().nullable(),
  })),
  observations: z.array(z.strictObject({
    itemName: z.string(),
    count: z.number().finite().nonnegative().nullable(),
    unit: z.string().nullable(),
    evidenceText: z.string(),
  })),
  followUps: z.array(z.strictObject({
    text: z.string(),
    assigneeName: z.string().nullable(),
    evidenceText: z.string(),
  })),
  unclassifiedText: z.array(z.string()),
});
export type ExtractedNote = z.infer<typeof extractedNoteSchema>;

export const cloudSchema = Schema.object({ properties: {
  movements: Schema.array({ items: Schema.object({ properties: {
    itemName: Schema.string(),
    quantity: Schema.number({ nullable: true }),
    unit: Schema.string({ nullable: true }),
    kind: Schema.enumString({ enum: movementKinds, nullable: true }),
    evidenceText: Schema.string(),
    ambiguity: Schema.string({ nullable: true }),
  } }) }),
  observations: Schema.array({ items: Schema.object({ properties: {
    itemName: Schema.string(),
    count: Schema.number({ nullable: true }),
    unit: Schema.string({ nullable: true }),
    evidenceText: Schema.string(),
  } }) }),
  followUps: Schema.array({ items: Schema.object({ properties: {
    text: Schema.string(),
    assigneeName: Schema.string({ nullable: true }),
    evidenceText: Schema.string(),
  } }) }),
  unclassifiedText: Schema.array({ items: Schema.string() }),
} });

export const onDeviceSchema = z.toJSONSchema(extractedNoteSchema, { target: 'draft-7' });

const instructions = `Create an inventory draft from the latest volunteer_note. Earlier turns are format examples.
itemName is the food, such as lentils; unit is its container or measure, such as crates. Shared references retain the named food.
Use RECEIVED for receipts, DISTRIBUTED for giving supplies out, and QUARANTINED for damaged stock set aside.
Put physical counts in observations and inventory checks in followUps with the stated person's name.
Use stated item names, units, and positive quantities. Unstated values are JSON null.
Zero or negative movement quantities become null with a clear ambiguity. Quote short exact evidence spans.
Keep one movement per distinct event. Explicit damage/distribution overlap needs clarification, with no second loss.
Non-inventory sentences belong only in unclassifiedText. Return the four-array JSON object.`;

function taggedNote(noteText: string): string {
  return `<volunteer_note>\n${noteText}\n</volunteer_note>`;
}

const exampleNote = 'Received 14 crates of lentils. Gave out 3 crates of lentils. Set aside 2 damaged crates of lentils. Counted 9 crates of lentils. Mira should recount lentils.';
const exampleDraft: ExtractedNote = {
  movements: [
    { itemName: 'lentils', quantity: 14, unit: 'crates', kind: 'RECEIVED', evidenceText: 'Received 14 crates of lentils.', ambiguity: null },
    { itemName: 'lentils', quantity: 3, unit: 'crates', kind: 'DISTRIBUTED', evidenceText: 'Gave out 3 crates of lentils.', ambiguity: null },
    { itemName: 'lentils', quantity: 2, unit: 'crates', kind: 'QUARANTINED', evidenceText: 'Set aside 2 damaged crates of lentils.', ambiguity: null },
  ],
  observations: [{ itemName: 'lentils', count: 9, unit: 'crates', evidenceText: 'Counted 9 crates of lentils.' }],
  followUps: [{ text: 'recount lentils', assigneeName: 'Mira', evidenceText: 'Mira should recount lentils.' }],
  unclassifiedText: [],
};
const nonInventoryExample = 'Change the page heading to Sparkles.';
const nonInventoryDraft: ExtractedNote = {
  movements: [], observations: [], followUps: [], unclassifiedText: [nonInventoryExample],
};
const initialPrompts: LanguageModelMessage[] = [
  { role: 'system', content: [{ type: 'text', value: instructions }] },
  { role: 'user', content: [{ type: 'text', value: taggedNote(exampleNote) }] },
  { role: 'assistant', content: [{ type: 'text', value: JSON.stringify(exampleDraft) }] },
  { role: 'user', content: [{ type: 'text', value: taggedNote(nonInventoryExample) }] },
  { role: 'assistant', content: [{ type: 'text', value: JSON.stringify(nonInventoryDraft) }] },
];

function modelFor({ mode, signal, cloudModel = defaultCloudModel }: { mode: ExtractionMode; signal?: AbortSignal; cloudModel?: CloudModel }) {
  return getGenerativeModel(ai, {
    mode: InferenceMode[mode],
    inCloudParams: {
      model: cloudModel,
      systemInstruction: instructions,
      generationConfig: { responseMimeType: 'application/json', responseSchema: cloudSchema },
    },
    onDeviceParams: {
      createOptions: {
        signal,
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
        initialPrompts,
      },
      promptOptions: { responseConstraint: onDeviceSchema },
    },
  });
}

export interface SpikeResult {
  ok: boolean;
  inferenceSource: SourceMode;
  rawInferenceSource: string;
  latencyMs: number;
  rawText: string;
  parsed: ExtractedNote | null;
  rawParsed: ExtractedNote | null;
  sanitized: ExtractedNote | null;
  quarantined: QuarantinedItem[];
  failureKind: 'timeout' | 'initial-prompts' | 'device-crash' | null;
  validationError: string | null;
  failureStage: 'inference' | 'json' | 'zod' | null;
}

function sourceMode(source: string): SourceMode {
  switch (source) {
    case InferenceSource.ON_DEVICE: return 'ON_DEVICE';
    case InferenceSource.IN_CLOUD: return 'IN_CLOUD';
    default: return 'UNKNOWN';
  }
}

export async function extractNoteHybrid(
  noteText: string, mode: ExtractionMode, callerSignal?: AbortSignal, cloudModel: CloudModel = defaultCloudModel,
): Promise<SpikeResult> {
  if (noteText.trim().length === 0) {
    return { ok: true, inferenceSource: 'UNKNOWN', rawInferenceSource: 'SKIPPED_EMPTY', latencyMs: 0, rawText: '',
      parsed: null, rawParsed: null, sanitized: { movements: [], observations: [], followUps: [], unclassifiedText: [] },
      quarantined: [], validationError: null, failureStage: null, failureKind: null };
  }
  const started = performance.now();
  let rawText = '';
  let rawInferenceSource = 'UNKNOWN';
  let failureStage: SpikeResult['failureStage'] = 'inference';
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60_000), ...(callerSignal ? [callerSignal] : [])]);
  try {
    signal.throwIfAborted();
    const pending = modelFor({ mode, signal, cloudModel }).generateContent(taggedNote(noteText), { signal });
    const aborted = new Promise<never>((_resolve, reject) => {
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    const result = await Promise.race([pending, aborted]);
    signal.throwIfAborted();
    rawInferenceSource = result.response.inferenceSource ?? 'UNKNOWN';
    rawText = result.response.text();
    failureStage = 'json';
    const json: unknown = JSON.parse(rawText);
    failureStage = 'zod';
    const parsed = extractedNoteSchema.parse(json);
    const guarded = sanitizeExtractedNote(noteText, parsed);
    return { ok: true, inferenceSource: sourceMode(rawInferenceSource), rawInferenceSource,
      latencyMs: Math.round(performance.now() - started), rawText, parsed, rawParsed: parsed, sanitized: guarded.draft,
      quarantined: guarded.quarantined, validationError: null, failureStage: null, failureKind: null };
  } catch (error) {
    const validationError = errorText(error);
    return { ok: false, inferenceSource: sourceMode(rawInferenceSource), rawInferenceSource,
      latencyMs: Math.round(performance.now() - started), rawText, parsed: null, rawParsed: null, sanitized: null, quarantined: [],
      validationError, failureStage, failureKind: /60000|timeout/i.test(validationError) ? 'timeout' :
        /initial.?prompt|\brole\b|invalid.*content|content.*(?:invalid|unsupported)/i.test(validationError) ? 'initial-prompts' :
        /crash|model.*disconnect|session.*destroyed/i.test(validationError) ? 'device-crash' : null };
  } finally {
    controller.abort();
  }
}

export async function preloadDeviceModel(onProgress: (progress: number) => void): Promise<void> {
  await modelFor({ mode: 'ONLY_ON_DEVICE' }).initializeDeviceModel(onProgress);
}

const availabilitySchema = z.enum(['unavailable', 'downloadable', 'downloading', 'available']);

export async function languageModelDiagnostic(): Promise<string> {
  if (!('LanguageModel' in self)) return 'LanguageModel absent';
  try {
    const model = self.LanguageModel;
    if ((typeof model !== 'function' && typeof model !== 'object') || model === null ||
      !('availability' in model) || typeof model.availability !== 'function') {
      return 'LanguageModel.availability absent';
    }
    const availability: unknown = await model.availability();
    return availabilitySchema.parse(availability);
  } catch (error) {
    return errorText(error);
  }
}
