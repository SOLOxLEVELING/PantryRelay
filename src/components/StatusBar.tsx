import type { PantryWorkflow } from '../hooks/usePantryWorkflow';

export function StatusBar({ workflow }: { workflow: PantryWorkflow }) {
  const ready = workflow.modelStatus === 'available';
  const sync = workflow.syncSummary;
  const syncLabels = { IDLE: 'Idle', PENDING: `Pending sync (${sync.pending})`, SYNCED: `Synced (${sync.synced})`, SYNC_ERROR: 'Sync error' };
  const hasSyncError = sync.status === 'SYNC_ERROR' || Boolean(workflow.syncError);
  const syncLabel = workflow.syncing ? 'Syncing…' : hasSyncError ? 'Sync error' : syncLabels[sync.status];
  const storageLabel = workflow.resetting ? 'Resetting…' : workflow.storageError ? 'Local storage error' :
    !workflow.state.hydrated ? 'Loading local workspace…' : workflow.locallySaved ? 'Locally saved' : 'Saving locally…';
  return <><div className="status-bar" aria-label="Workspace readiness">
    <span className={`status-dot ${workflow.online ? 'is-ready' : ''}`}>Network <strong>{workflow.online ? 'Online' : 'Offline'}</strong></span>
    <span>App shell <strong>{workflow.shellCached ? 'Cached offline' : 'Not cached'}</strong></span>
    <span className="model-status">On-device model <strong title={workflow.modelStatus}>{ready ? 'Ready' : workflow.modelStatus}</strong>
      {!ready && <button className="text-button" disabled={workflow.preloading || workflow.busy} onClick={() => void workflow.preload()}>
        {workflow.preloading ? 'Preloading…' : 'Preload model'}</button>}</span>
    <span className="app-check">App Check <strong title={workflow.appCheck}>{workflow.appCheck.startsWith('Token acquired') ? 'Verified' : workflow.appCheck}</strong>
      <button className="text-button" disabled={!workflow.online || workflow.appCheck === 'Checking'} onClick={() => void workflow.refreshAppCheck()}>Check</button></span>
    <span>IndexedDB <strong role="status">{storageLabel}</strong></span>
    <span>Sync <strong role="status" className={`badge ${hasSyncError && !workflow.syncing ? 'error-badge' : ''}`}>{syncLabel}</strong>
      <button className="text-button" disabled={!workflow.online || !workflow.state.hydrated || !workflow.locallySaved || workflow.syncing || workflow.resetting}
        onClick={() => void workflow.syncNow()}>{hasSyncError ? 'Retry sync' : 'Sync now'}</button></span>
    <button className="reset-button" disabled={!workflow.state.hydrated || workflow.resetting} onClick={() => void workflow.resetDemo()}>Reset demo</button>
  </div>
    {workflow.storageError && <p role="alert" className="error-message">{workflow.storageError}</p>}
    {workflow.syncError && !workflow.syncing && <p role="alert" className="error-message">{workflow.syncError}</p>}
  </>;
}
