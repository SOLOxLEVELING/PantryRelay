import { useState } from 'react';
import { CapturePanel } from './components/CapturePanel';
import { ReviewPanel } from './components/ReviewPanel';
import { ReconcilePanel } from './components/ReconcilePanel';
import { StatusBar } from './components/StatusBar';
import { usePantryWorkflow } from './hooks/usePantryWorkflow';
import { syntheticNotes } from './lib/syntheticNotes';
import type { ExtractionMode } from './lib/spikeExtract';

export default function App() {
  const workflow = usePantryWorkflow();
  const [noteText, setNoteText] = useState(syntheticNotes[0]?.text ?? '');
  const [sampleId, setSampleId] = useState('golden-rice');
  const [mode, setMode] = useState<ExtractionMode>('PREFER_ON_DEVICE');
  return <main className="workspace">
    <header className="workspace-header"><div className="brand"><svg aria-hidden="true" viewBox="0 0 32 32" width="34" height="34"><path d="M5 8h22v6H5zm0 10h22v6H5z" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M10 4v24M22 4v24" stroke="currentColor" strokeWidth="2" /></svg>
      <div><h1>PantryRelay</h1><p>A clear record for the next shift.</p></div></div>
      <div className="workspace-context"><strong>Volunteer workspace</strong><span>Demo session · In memory</span></div></header>
    <StatusBar workflow={workflow} />
    <CapturePanel noteText={noteText} setNoteText={setNoteText} sampleId={sampleId} setSampleId={setSampleId}
      mode={mode} setMode={setMode} busy={workflow.busy} latest={workflow.state.notes.at(-1)} onExtract={() => void workflow.extractNote(noteText, mode)} />
    <div className="review-workspace"><ReviewPanel workflow={workflow} noteText={noteText} />
      <ReconcilePanel workflow={workflow} noteText={noteText} /></div>
    <footer>Human decisions. Traceable movements. No silent stock changes.</footer>
  </main>;
}
