import { useState } from 'react';
import { useSpikeRunner } from './hooks/useSpikeRunner';
import { cloudModelSchema, defaultCloudModel, extractionModeSchema } from './lib/spikeExtract';
import type { CloudModel, ExtractionMode } from './lib/spikeExtract';
import { syntheticNotes } from './lib/syntheticNotes';

export default function App() {
  const runner = useSpikeRunner();
  const [noteId, setNoteId] = useState('golden-rice');
  const [text, setText] = useState(syntheticNotes[0]?.text ?? '');
  const [mode, setMode] = useState<ExtractionMode>('ONLY_IN_CLOUD');
  const [cloudModel, setCloudModel] = useState<CloudModel>(defaultCloudModel);
  const latest = runner.runs.at(-1);

  return <main>
    <h1>PantryRelay G1.2 feasibility spike</h1>
    <p>Synthetic notes only. Cloud modes send note contents to Firebase AI Logic. Output is an unapproved draft.</p>
    <dl aria-live="polite">
      <dt>navigator.onLine</dt><dd>{String(runner.online)}</dd>
      <dt>LanguageModel.availability()</dt><dd>{runner.availability}</dd>
      <dt>Firebase App Check</dt><dd>{runner.appCheck}</dd>
      <dt>Offline app shell</dt><dd>{runner.shell}</dd>
      <dt>Activity</dt><dd>{runner.activity}</dd>
    </dl>
    <button disabled={runner.busy} onClick={() => void runner.refreshDiagnostics()}>Refresh diagnostics / App Check</button>{' '}
    <button disabled={runner.busy} onClick={() => void runner.preload()}>Preload device model via Firebase</button>
    <p><label>Synthetic note <select value={noteId} disabled={runner.busy} onChange={event => {
      const note = syntheticNotes.find(candidate => candidate.id === event.target.value);
      if (note) { setNoteId(note.id); setText(note.text); }
    }}>{syntheticNotes.map(note => <option key={note.id} value={note.id}>{note.label}</option>)}</select></label></p>
    <p><label>Note text<br /><textarea aria-label="Note text" rows={5} cols={95} value={text}
      disabled={runner.busy} onChange={event => setText(event.target.value)} /></label></p>
    <p><label>Inference mode <select disabled={runner.busy} value={mode}
      onChange={event => setMode(extractionModeSchema.parse(event.target.value))}>
      {extractionModeSchema.options.map(value => <option key={value}>{value}</option>)}
    </select></label>{' '}
    <button disabled={runner.busy} onClick={() => void runner.runOne(noteId, text, mode, cloudModel)}>
      {runner.busy ? 'Running…' : 'Run Extraction'}</button>{' '}
    <button disabled={runner.busy} onClick={() => void runner.runAll(mode, cloudModel)}>Run all 10 synthetic notes</button></p>
    <p><label>Cloud comparison model <select value={cloudModel} disabled={runner.busy}
      onChange={event => setCloudModel(cloudModelSchema.parse(event.target.value))}>
      {cloudModelSchema.options.map(value => <option key={value}>{value}</option>)}
    </select></label>{' '}
    <button disabled={runner.busy} onClick={() => void runner.runCloudCheck(cloudModel)}>Cloud check: golden x3 + overlap + injection</button></p>
    {latest && <section aria-live="polite">
      <h2>Latest result</h2>
      <p>Raw SDK inferenceSource: <strong>{latest.result.rawInferenceSource}</strong> | Contract source: {latest.result.inferenceSource}
        {' | '}Latency: {latest.result.latencyMs} ms | Zod: {latest.result.rawInferenceSource === 'SKIPPED_EMPTY' ? 'SKIPPED' : latest.result.ok ? 'PASS' : latest.result.failureStage === 'zod' ? 'FAIL' : 'NOT REACHED'}
        {' | '}Quarantined: {latest.result.quarantined.length}</p>
      <p>{latest.result.validationError}</p>
      <details><summary>Raw JSON output</summary><pre>{latest.result.rawText}</pre></details>
      <details><summary>Raw SDK parsed</summary><pre>{JSON.stringify(latest.result.rawParsed, null, 2)}</pre></details>
      <details><summary>Sanitized draft</summary><pre>{JSON.stringify(latest.result.sanitized, null, 2)}</pre></details>
      <details><summary>Quarantined items ({latest.result.quarantined.length})</summary><pre>{JSON.stringify(latest.result.quarantined, null, 2)}</pre></details>
    </section>}
    <h2>Recorded attempts ({runner.runs.length})</h2>
    <table><thead><tr><th>Note</th><th>Mode</th><th>Cloud model</th><th>Online</th><th>Raw source</th><th>ms</th><th>Zod</th><th>Quarantined</th><th>Draft records</th><th>Error</th></tr></thead>
      <tbody>{runner.runs.map((run, index) => <tr key={index}><td>{run.noteId}</td><td>{run.mode}</td>
        <td>{run.cloudModel}</td>
        <td>{String(run.online)}</td><td>{run.result.rawInferenceSource}</td><td>{run.result.latencyMs}</td>
        <td>{run.result.rawInferenceSource === 'SKIPPED_EMPTY' ? 'SKIPPED' : run.result.ok ? 'PASS' : run.result.failureStage === 'zod' ? 'FAIL' : 'NOT REACHED'}</td>
        <td>{run.result.quarantined.length}</td><td>{run.result.sanitized ? `${run.result.sanitized.movements.length} movements / ${run.result.sanitized.observations.length} observations / ${run.result.sanitized.followUps.length} follow-ups` : 'Unavailable'}</td>
        <td>{run.result.validationError}</td></tr>)}</tbody></table>
    <details><summary>Full attempt evidence JSON</summary><pre>{JSON.stringify(runner.runs, null, 2)}</pre></details>
    <a download="spike-evidence.json" href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(runner.runs, null, 2))}`}>Download attempt evidence</a>
  </main>;
}
