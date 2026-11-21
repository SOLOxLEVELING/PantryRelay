import { useState } from 'react';
import type { PantryWorkflow } from '../hooks/usePantryWorkflow';
import { MovementSyncLabel } from './MovementSyncLabel';

const movementLabels = { RECEIVED: 'Received', DISTRIBUTED: 'Distributed', QUARANTINED: 'Quarantined', ADJUSTMENT: 'Adjusted' };

export function ReconcilePanel({ workflow, noteText }: { workflow: PantryWorkflow; noteText: string }) {
  const [recountFor, setRecountFor] = useState<string | null>(null);
  const [assignee, setAssignee] = useState('Sam');
  const tasks = workflow.state.notes.flatMap(note => note.draft.followUps);
  return <section className="reconcile-panel panel" aria-labelledby="reconcile-heading">
    <div className="section-heading"><h2 id="reconcile-heading"><span className="step">3</span> Reconcile</h2><span className="badge">Approved stock</span></div>
    <p className="section-intro">Confirmed records meet the shelf count.</p>
    {workflow.reconciliations.map(({ item, openingBalance, latestObservation, result }) => <div className="item-reconciliation" key={item.id}>
      <div className="item-heading"><h3>{item.name}</h3><span className="subtle">{openingBalance?.unit ?? item.allowedUnits.join(', ')}</span></div>
      {openingBalance?.isDemoSeed && <p className="demo-baseline"><span className="badge">Sample opening stock</span> {openingBalance.usableQuantity} {openingBalance.unit} · confirmed demo baseline</p>}
      {result.confirmedUsable !== null && <><dl className="balance-math">
        <div><dt>Opening usable</dt><dd>{openingBalance?.usableQuantity}</dd></div>
        <div><dt>Received</dt><dd>+ {result.approvedReceived}</dd></div>
        <div><dt>Distributed</dt><dd>− {result.approvedDistributed}</dd></div>
        <div><dt>Set aside in quarantine</dt><dd>− {result.approvedQuarantined}</dd></div>
        {result.approvedAdjustments !== 0 && <div><dt>Explicit adjustments</dt><dd>+ {result.approvedAdjustments}</dd></div>}
        <div className="usable-total"><dt>Confirmed usable</dt><dd>{result.confirmedUsable} <small>{openingBalance?.unit}</small></dd></div>
      </dl><p className="equation">{openingBalance?.usableQuantity} + {result.approvedReceived} − {result.approvedDistributed} − {result.approvedQuarantined}
        {result.approvedAdjustments !== 0 ? ` + ${result.approvedAdjustments}` : ''} = {result.confirmedUsable} usable</p>
      <div className="stock-comparison"><span><strong>{result.quarantinedBalance}</strong> quarantined</span>
        <span><strong>{latestObservation?.count ?? '—'}</strong> {latestObservation?.unit ?? openingBalance?.unit} observed</span></div></>}
      {result.status === 'MISSING_BASELINE' && <div className="warning-box" role="status"><strong>MISSING_BASELINE</strong><p>Confirm an opening usable balance for {item.name} before reconciling. No balance or discrepancy can be calculated yet.</p></div>}
      {result.status === 'UNIT_MISMATCH' && <div className="warning-box" role="status"><strong>UNIT_MISMATCH</strong><p>The shelf count and ledger use different units. Dismiss the count and capture a corrected count in {openingBalance?.unit}. No automatic conversion.</p></div>}
      {result.blockingDraftCount > 0 && <div className="pending-notice"><strong>{result.blockingDraftCount} pending {result.blockingDraftCount === 1 ? 'movement' : 'movements'}</strong>
        <p>Review or reject these rows. Pending drafts are excluded from the confirmed balance.</p>
        <details><summary>Show approval blockers</summary><ul>{result.pendingIssues.map(issue => <li key={issue.tempId}>{issue.reason}</li>)}</ul></details></div>}
      {result.status === 'DISCREPANCY' && <div className="discrepancy" role="status"><div className="discrepancy-title"><span aria-hidden="true">!</span><h3>{Math.abs(result.discrepancy)} {openingBalance?.unit === 'bags' ? 'bag' : openingBalance?.unit} discrepancy</h3></div>
        <p>Expected <strong>{result.confirmedUsable}</strong> vs observed <strong>{latestObservation?.count}</strong>.</p>
        <p>{latestObservation?.state === 'UNVERIFIED' ? 'Shelf count is unverified. ' : ''}The ledger stays unchanged until a volunteer records an explicit correction.</p>
        <div className="discrepancy-actions"><button onClick={() => workflow.keepOpen(item.id)}>{workflow.state.keptOpen.includes(item.id) ? 'Discrepancy kept open' : 'Keep discrepancy open'}</button>
          <button onClick={() => setRecountFor(item.id)}>Add recount task</button>
          <button disabled={workflow.busy} onClick={() => workflow.addMovement(noteText, item.id, true)}>Record explicit adjustment</button></div>
        {recountFor === item.id && <form className="recount-form" onSubmit={event => { event.preventDefault(); workflow.addRecount(item.id, noteText, assignee); setRecountFor(null); }}>
          <label>Assign recount to<input value={assignee} onChange={event => setAssignee(event.target.value)} /></label>
          <button type="submit">Confirm recount task</button><button type="button" className="text-button" onClick={() => setRecountFor(null)}>Cancel</button></form>}
      </div>}
      {result.status === 'NO_OBSERVATION' && <p className="neutral-notice">No active shelf count. Capture a counted quantity to compare with approved stock.</p>}
      {result.status === 'BALANCED' && <p className="balanced-notice">Balanced · Expected {result.confirmedUsable} matches observed {latestObservation?.count}.</p>}
      {workflow.state.approvedEvents.some(event => event.itemId === item.id) && <div className="approved-movements">
        <h3>Approved movements</h3>
        <ul>{workflow.state.approvedEvents.filter(event => event.itemId === item.id).map(event => <li key={event.id}>
          <span>{movementLabels[event.kind]} {event.quantity} {event.unit}</span>
          <MovementSyncLabel entry={workflow.outboxByEvent.get(event.id)} />
        </li>)}</ul>
      </div>}
    </div>)}
    <div className="follow-ups"><div className="field-heading"><h3>Follow-up tasks</h3><span className="badge">{tasks.filter(task => task.status === 'OPEN').length} open</span></div>
      {tasks.length === 0 ? <p className="subtle">Checks and recounts will appear here.</p> : tasks.map(task => <label className="task" key={task.id}>
        <input type="checkbox" checked={task.status === 'DONE'} onChange={event => workflow.setTaskStatus(task.id, event.target.checked ? 'DONE' : 'OPEN')} />
        <span><strong>{task.assigneeName ?? 'Unassigned'}</strong><span className={task.status === 'DONE' ? 'completed-task' : ''}>{task.text}</span><small>{task.status === 'DONE' ? 'Done' : 'Open'}{task.evidenceText ? ` · “${task.evidenceText}”` : ''}</small></span></label>)}
    </div>
  </section>;
}
