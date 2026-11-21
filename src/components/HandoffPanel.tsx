import { useState } from 'react';
import type { PantryWorkflow } from '../hooks/usePantryWorkflow';
import { buildDeterministicHandoffText, buildHandoffSummary } from '../lib/shiftBriefing';

export function HandoffPanel({ workflow }: { workflow: PantryWorkflow }) {
  const { state, reconciliations, outboxByEvent, briefing, online } = workflow;
  const { stock, discrepancies, followUps, movements } = buildHandoffSummary(state, reconciliations, outboxByEvent);
  const [copyState, setCopyState] = useState<{ status: 'IDLE' | 'ERROR' } | { status: 'COPIED'; text: string }>({ status: 'IDLE' });
  const handoffText = buildDeterministicHandoffText(state, reconciliations, outboxByEvent);
  const copied = copyState.status === 'COPIED' && copyState.text === handoffText;

  async function copyHandoff() {
    try {
      await navigator.clipboard.writeText(handoffText);
      setCopyState({ status: 'COPIED', text: handoffText });
    } catch {
      setCopyState({ status: 'ERROR' });
    }
  }

  const loading = briefing.status === 'LOADING';
  return <section className="handoff-panel panel" aria-labelledby="handoff-heading">
    <div className="section-heading">
      <h2 id="handoff-heading"><span className="step">4</span> Handoff</h2>
      <button onClick={() => void copyHandoff()}>Copy shift handoff</button>
    </div>
    <span className="handoff-copy-status" role="status">{copied && 'Copied'}</span>
    {copyState.status === 'ERROR' && <div className="handoff-copy-error">
      <p role="alert">Clipboard access is unavailable. Select and copy the handoff below.</p>
      <textarea aria-label="Shift handoff text" readOnly value={handoffText} />
    </div>}
    <div className="handoff-layout">
      <div className="handoff-record">
        <h3>Confirmed stock</h3>
        <dl className="handoff-stock">{stock.map(item => <div key={item.id}>
          <dt>{item.name}</dt><dd><strong>{item.balance}</strong>{item.demoSeed && <small>{item.demoSeed}</small>}</dd>
        </div>)}</dl>
        <div className="handoff-checks">
          <div>
            <h3>Unresolved discrepancies</h3>
            {discrepancies.length === 0 ? <p className="subtle">None recorded.</p> :
              <ul className="handoff-list">{discrepancies.map(item => <li key={item.id} className="handoff-exception">
                <strong>{item.name}: {item.label}</strong><small>{item.detail}</small>
              </li>)}</ul>}
          </div>
          <div>
            <h3>Follow-up tasks</h3>
            {followUps.length === 0 ? <p className="subtle">No follow-up tasks.</p> :
              <ul className="handoff-list">{followUps.map(task => <li key={task.id} className="handoff-task">
                <span className={task.status === 'DONE' ? 'completed-task' : undefined}><strong>{task.assigneeName ?? 'Unassigned'}</strong> {task.text}</span>
                <span className={`badge ${task.status === 'DONE' ? 'success-badge' : ''}`}>{task.status === 'DONE' ? 'Done' : 'Open'}</span>
              </li>)}</ul>}
          </div>
        </div>
      </div>
      <section className="cloud-briefing" aria-labelledby="cloud-briefing-heading">
        <h3 id="cloud-briefing-heading">Cloud Shift Briefing</h3>
        <p id="cloud-disclosure" className="subtle">Sends confirmed balances, discrepancies, and open tasks—not raw notes—to Firebase AI Logic in the cloud. Approved movement summaries are also included.</p>
        <button className="primary" aria-describedby={online ? 'cloud-disclosure' : 'cloud-disclosure cloud-offline'}
          disabled={!online || loading} onClick={() => void workflow.requestCloudBriefing()}>
          {loading ? 'Generating briefing…' : 'Generate cloud briefing'}
        </button>
        {!online && <p id="cloud-offline" className="subtle">{workflow.offlineBriefingMessage}</p>}
        <div role="status" aria-busy={loading}>
          {briefing.status === 'READY' && <div className="cloud-briefing-result">
            <span className="badge source-badge">Source: {briefing.inferenceSource === 'IN_CLOUD' ? 'Cloud' : 'Unknown'}</span>
            <p>{briefing.text}</p>
          </div>}
        </div>
        {briefing.error && (online || briefing.error !== workflow.offlineBriefingMessage) &&
          <p role="alert" className="error-message">{briefing.error}</p>}
      </section>
    </div>
    <div className="handoff-ledger">
      <h3>Approved movements</h3>
      {movements.length === 0 ? <p className="subtle">No approved movements.</p> :
        <ul className="handoff-list">{movements.map(movement => <li key={movement.id}>
          <span>{movement.label}</span>
          <span className="badge">{movement.provenance}</span>
          <span className={`badge ${movement.syncState === 'SYNCED' ? 'success-badge' : ''} ${movement.syncState === 'SYNC_ERROR' ? 'error-text' : ''}`}>{movement.syncLabel}</span>
        </li>)}</ul>}
    </div>
  </section>;
}
