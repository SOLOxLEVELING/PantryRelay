import type { PantryWorkflow } from '../hooks/usePantryWorkflow';

export function StatusBar({ workflow }: { workflow: PantryWorkflow }) {
  const ready = workflow.modelStatus === 'available';
  return <div className="status-bar" aria-label="Workspace readiness">
    <span className={`status-dot ${workflow.online ? 'is-ready' : ''}`}>Network <strong>{workflow.online ? 'Online' : 'Offline'}</strong></span>
    <span>App shell <strong>{workflow.shellCached ? 'Cached offline' : 'Not cached'}</strong></span>
    <span className="model-status">On-device model <strong title={workflow.modelStatus}>{ready ? 'Ready' : workflow.modelStatus}</strong>
      {!ready && <button className="text-button" disabled={workflow.preloading || workflow.busy} onClick={() => void workflow.preload()}>
        {workflow.preloading ? 'Preloading…' : 'Preload model'}</button>}</span>
    <span className="app-check">App Check <strong title={workflow.appCheck}>{workflow.appCheck.startsWith('Token acquired') ? 'Verified' : workflow.appCheck}</strong>
      <button className="text-button" disabled={!workflow.online || workflow.appCheck === 'Checking'} onClick={() => void workflow.refreshAppCheck()}>Check</button></span>
    <button className="reset-button" onClick={workflow.resetDemo}>Reset demo</button>
  </div>;
}
