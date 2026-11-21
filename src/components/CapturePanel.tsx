import { extractionModeSchema } from '../lib/spikeExtract';
import type { ExtractionMode } from '../lib/spikeExtract';
import { syntheticNotes } from '../lib/syntheticNotes';
import type { WorkflowNote } from '../lib/workflowState';

const samples = [
  { id: 'golden-rice', label: 'Golden rice' }, { id: 'damage-overlap', label: 'Damage overlap' },
  { id: 'missing-unit', label: 'Missing unit' }, { id: 'injection', label: 'Prompt injection' },
  { id: 'empty', label: 'Empty / Manual' },
];

export function SourceBadge({ note }: { note: WorkflowNote | undefined }) {
  if (!note || note.latencyMs === null) return null;
  return <span className="badge source-badge">Source: {note.inferenceSource === 'ON_DEVICE' ? 'On-device' :
    note.inferenceSource === 'IN_CLOUD' ? 'Cloud' : 'Unknown'}{note.latencyMs > 0 && ` · ${(note.latencyMs / 1000).toFixed(1)}s`}</span>;
}

interface CaptureProps {
  noteText: string;
  setNoteText: (text: string) => void;
  sampleId: string;
  setSampleId: (id: string) => void;
  mode: ExtractionMode;
  setMode: (mode: ExtractionMode) => void;
  busy: boolean;
  latest: WorkflowNote | undefined;
  onExtract: () => void;
}

export function CapturePanel(props: CaptureProps) {
  return <section className="capture-panel" aria-labelledby="capture-heading">
    <div className="section-heading"><h2 id="capture-heading"><span className="step">1</span> Capture</h2>
      <span className="subtle">A shift note becomes a draft. You decide what counts.</span></div>
    <div className="capture-layout">
      <div className="note-editor">
        <div className="field-heading"><label htmlFor="note-text">Volunteer note</label>
          <label className="sample-picker">Sample <select aria-label="Sample note" value={props.sampleId} disabled={props.busy}
            onChange={event => {
              props.setSampleId(event.target.value);
              props.setNoteText(syntheticNotes.find(note => note.id === event.target.value)?.text ?? '');
            }}><option value="custom" disabled>Custom note</option>{samples.map(sample => <option key={sample.id} value={sample.id}>{sample.label}</option>)}</select></label></div>
        <textarea id="note-text" rows={3} value={props.noteText} disabled={props.busy}
          placeholder="Write what arrived, went out, or needs checking. Or add a movement manually below."
          onChange={event => { props.setNoteText(event.target.value); props.setSampleId('custom'); }} />
        <p className="field-hint">Original wording stays attached to the review. Stock changes only after your approval.</p>
      </div>
      <div className="extraction-controls">
        <label htmlFor="extraction-mode">Extraction mode</label>
        <select id="extraction-mode" disabled={props.busy} value={props.mode}
          onChange={event => props.setMode(extractionModeSchema.parse(event.target.value))}>
          <option value="PREFER_ON_DEVICE">PREFER_ON_DEVICE · Hybrid</option>
          <option value="ONLY_ON_DEVICE">ONLY_ON_DEVICE · Private</option>
          <option value="ONLY_IN_CLOUD">ONLY_IN_CLOUD · Cloud</option>
        </select>
        <p className="privacy-note">{props.mode === 'ONLY_ON_DEVICE' ? 'Note stays on this device. Requires a downloaded browser model; manual entry is always available.' :
          props.mode === 'ONLY_IN_CLOUD' ? 'Cloud disclosure: this note is sent to Firebase AI Logic for extraction. Use synthetic notes for this demo.' :
            'Tries the browser model first. If unavailable, this note may be sent to Firebase AI Logic in the cloud.'}</p>
        <div className="extract-action"><button className="primary" disabled={props.busy} onClick={props.onExtract}>
          {props.busy ? 'Extracting changes…' : 'Extract changes'}</button><SourceBadge note={props.latest} /></div>
      </div>
    </div>
    {props.busy && <p role="status" className="activity">Reading the note through Firebase AI Logic. Nothing has been approved.</p>}
    {props.latest?.error && <p role="alert" className="error-message">Extraction unavailable: {props.latest.error} Add a manual movement below, or choose another mode.</p>}
  </section>;
}
