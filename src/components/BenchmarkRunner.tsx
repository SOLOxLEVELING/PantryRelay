import { useState } from 'react';
import { benchmarkNotes } from '../data/benchmarkNotes';
import { scoreReconciliation } from '../data/benchmarkReconciliation';
import { scoreBenchmark } from '../lib/benchmarkScore';
import type { BenchmarkAttempt } from '../lib/benchmarkScore';
import { errorText } from '../lib/diagnostics';
import { defaultCloudModel, extractNoteHybrid, languageModelDiagnostic, preloadDeviceModel } from '../lib/spikeExtract';
import type { ExtractionMode } from '../lib/spikeExtract';

type Mode = Exclude<ExtractionMode, 'PREFER_ON_DEVICE'>;
type Run = { attempts: BenchmarkAttempt[]; batches: { first: number; last: number; stopReason: string | null }[] };
const emptyRun: Run = { attempts: [], batches: [] };

export default function BenchmarkRunner() {
  const [mode, setMode] = useState<Mode>('ONLY_ON_DEVICE');
  const [runs, setRuns] = useState<Record<Mode, Run>>({ ONLY_ON_DEVICE: emptyRun, ONLY_IN_CLOUD: emptyRun });
  const [batchSize, setBatchSize] = useState(30);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Check readiness before starting.');
  const run = runs[mode];
  const completed = run.attempts.length;
  const score = scoreBenchmark(benchmarkNotes, run.attempts, mode);

  async function checkReadiness(preload: boolean) {
    setBusy(true);
    try {
      if (preload) await preloadDeviceModel(progress => setStatus(`Preloading model (${Math.round(progress * 100)}%)…`));
      setStatus(`Model: ${await languageModelDiagnostic()}. Network: ${navigator.onLine ? 'online' : 'offline'}. Service worker: ${navigator.serviceWorker.controller ? 'controlling' : 'waiting'}.`);
    } catch (error) {
      setStatus(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function runBatch() {
    const expectedOnline = mode === 'ONLY_IN_CLOUD';
    const condition = expectedOnline ? 'online' : 'offline with a controlling service worker';
    function ready() {
      return navigator.onLine === expectedOnline && (expectedOnline || navigator.serviceWorker.controller !== null);
    }
    if (!ready()) {
      setStatus(`Set Chrome ${condition} before running.`);
      return;
    }

    setBusy(true);
    const attempts = [...run.attempts];
    let stopReason: string | null = null;
    try {
      for (const note of benchmarkNotes.slice(completed, completed + batchSize)) {
        if (!ready()) {
          stopReason = `Network or service-worker condition changed. Expected ${condition}.`;
          break;
        }
        setStatus(`Running note ${note.id} of ${benchmarkNotes.length}…`);
        const startedAt = new Date().toISOString();
        const onlineAtStart = navigator.onLine;
        const { rawInferenceSource, inferenceSource, rawText, rawParsed, sanitized, latencyMs,
          quarantined, failureStage, failureKind, validationError } = await extractNoteHybrid(note.text, mode);
        attempts.push({ noteId: note.id, startedAt, onlineAtStart, onlineAtEnd: navigator.onLine,
          rawInferenceSource, inferenceSource, rawText, rawParsed, sanitized, latencyMs,
          quarantined, failureStage, failureKind, validationError });
        setRuns(previous => ({ ...previous, [mode]: { ...run, attempts: [...attempts] } }));
        if (!ready()) {
          stopReason = `Network or service-worker condition changed during note ${note.id}.`;
          break;
        }
        if (!expectedOnline && failureStage === 'inference') {
          stopReason = `Device inference stopped at note ${note.id}. ${failureKind ?? 'SDK error'}: ${validationError ?? 'No diagnostic'}`;
          break;
        }
      }
    } catch (error) {
      stopReason = errorText(error);
    } finally {
      setRuns(previous => ({ ...previous, [mode]: {
        attempts, batches: [...run.batches, { first: completed + 1, last: attempts.length, stopReason }],
      } }));
      setStatus(stopReason ?? `Recorded ${attempts.length}/${benchmarkNotes.length} attempts.`);
      setBusy(false);
    }
  }

  function download() {
    const evidence = {
      version: 1, mode, cloudModel: mode === 'ONLY_IN_CLOUD' ? defaultCloudModel : null,
      exportedAt: new Date().toISOString(), browser: navigator.userAgent,
      shellControlledAtExport: Boolean(navigator.serviceWorker.controller),
      batches: run.batches, attempts: run.attempts, score, reconciliation: scoreReconciliation(),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = mode === 'ONLY_ON_DEVICE' ? 'g51-device.json' : 'g51-cloud.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  return <main className="workspace">
    <section className="panel" aria-labelledby="benchmark-heading">
      <h1 id="benchmark-heading">Extraction benchmark</h1>
      <p>Run the 30 synthetic notes in desktop Chrome. For the device batch, preload online, choose Offline in DevTools, then reload from the service worker.</p>
      <p><a href="/">Volunteer workspace</a></p>
      <div className="row-actions">
        <button disabled={busy} onClick={() => void checkReadiness(true)}>Preload model</button>
        <button disabled={busy} onClick={() => void checkReadiness(false)}>Check readiness</button>
      </div>
      <fieldset disabled={busy}>
        <legend>Batch settings</legend>
        <label>Inference mode <select value={mode} onChange={event =>
          setMode(event.target.value === 'ONLY_IN_CLOUD' ? 'ONLY_IN_CLOUD' : 'ONLY_ON_DEVICE')}>
          <option value="ONLY_ON_DEVICE">ONLY_ON_DEVICE</option>
          <option value="ONLY_IN_CLOUD">ONLY_IN_CLOUD ({defaultCloudModel})</option>
        </select></label>
        <label> Notes per batch <select value={batchSize} onChange={event => setBatchSize(Number(event.target.value))}>
          <option value="30">30</option><option value="10">10</option><option value="5">5</option>
        </select></label>
        <div className="row-actions">
          <button disabled={completed === benchmarkNotes.length} onClick={() => void runBatch()}>Run next batch</button>
          <button disabled={completed === 0} onClick={download}>Download JSON evidence</button>
        </div>
      </fieldset>
      <p role="status">{status}</p>
      <p>Selected mode attempts: {completed}/{benchmarkNotes.length}</p>
      <details><summary>Scores</summary><pre>{JSON.stringify(score, null, 2)}</pre></details>
    </section>
  </main>;
}
