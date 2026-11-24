import { describe, expect, it, vi } from 'vitest';

const { getModel, generateContent } = vi.hoisted(() => ({ getModel: vi.fn(), generateContent: vi.fn() }));
vi.mock('./firebase', () => ({ ai: null }));
vi.mock('firebase/ai', async importOriginal => ({
  ...await importOriginal<typeof import('firebase/ai')>(), getGenerativeModel: getModel,
}));

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

describe('extraction cancellation', () => {
  const note = 'Received 2 bags of rice.';

  it('skips inference when the caller signal is already aborted', async () => {
    getModel.mockClear();
    const controller = new AbortController();
    controller.abort();
    const result = await extractNoteHybrid(note, 'ONLY_ON_DEVICE', controller.signal);
    expect(result).toMatchObject({ ok: false, failureStage: 'inference', failureKind: null });
    expect(getModel).not.toHaveBeenCalled();
  });

  it('aborts both SDK signal paths and returns promptly when the SDK stalls', async () => {
    getModel.mockReturnValue({ generateContent });
    const sdk = Promise.withResolvers<unknown>();
    generateContent.mockReturnValueOnce(sdk.promise);
    const controller = new AbortController();
    const extraction = extractNoteHybrid(note, 'ONLY_ON_DEVICE', controller.signal);
    const options: unknown = generateContent.mock.lastCall?.[1];
    if (typeof options !== 'object' || options === null || !('signal' in options) || !(options.signal instanceof AbortSignal)) {
      throw new Error('SDK options did not include an abort signal');
    }
    expect(getModel).toHaveBeenLastCalledWith(null, expect.objectContaining({
      onDeviceParams: expect.objectContaining({ createOptions: expect.objectContaining({ signal: options.signal }) }),
    }));
    expect(options.signal.aborted).toBe(false);
    controller.abort();
    expect(options.signal.aborted).toBe(true);
    expect(await extraction).toMatchObject({ ok: false, validationError: expect.stringContaining('AbortError') });
    sdk.resolve({ response: { text: () => { throw new Error('Cancelled response was read'); } } });
  });

  it('still times out if the caller does not cancel', async () => {
    const deadline = new AbortController();
    const timer = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    try {
      getModel.mockReturnValue({ generateContent });
      generateContent.mockReturnValueOnce(new Promise(() => {}));
      const extraction = extractNoteHybrid(note, 'ONLY_IN_CLOUD', new AbortController().signal);
      expect(timer).toHaveBeenCalledWith(60_000);
      deadline.abort(new DOMException('The operation timed out', 'TimeoutError'));
      expect(await extraction).toMatchObject({ ok: false, failureKind: 'timeout' });
    } finally {
      timer.mockRestore();
    }
  });
});
