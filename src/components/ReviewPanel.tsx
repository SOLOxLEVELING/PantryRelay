import type { PantryWorkflow } from '../hooks/usePantryWorkflow';
import type { ReviewMovementItem } from '../types/inventory';
import { canApproveMovement } from '../lib/reconcile';
import { SourceBadge } from './CapturePanel';

const kindLabels = { RECEIVED: 'Received (+)', DISTRIBUTED: 'Distributed (−)', QUARANTINED: 'Quarantined (−)', ADJUSTMENT: 'Adjustment (+)' };

function rowLabel(row: ReviewMovementItem) {
  if (row.state === 'APPROVED') return 'Human-approved';
  if (row.state === 'REJECTED') return 'Rejected';
  if (row.origin === 'HUMAN_EDITED') return 'Human-edited';
  if (row.origin === 'HUMAN_ADDED') return 'Human-added';
  return 'AI-suggested';
}

export function ReviewPanel({ workflow, noteText }: { workflow: PantryWorkflow; noteText: string }) {
  const pending = workflow.state.notes.flatMap(note => note.draft.movements).filter(row => row.state === 'DRAFT' || row.state === 'NEEDS_CLARIFICATION').length;
  return <section className="review-panel panel" aria-labelledby="review-heading">
    <div className="section-heading"><h2 id="review-heading"><span className="step">2</span> Review</h2><span className="badge">{pending} pending</span></div>
    <p className="section-intro">AI suggests. A volunteer approves each movement.</p>
    {workflow.state.notes.length === 0 && <div className="empty-state"><h3>Your note is ready for review</h3>
      <p>Extract changes to see suggested movements, shelf counts, and follow-ups. You can also start with a manual movement.</p></div>}
    {workflow.state.notes.map((note, noteIndex) => <div className="review-note" key={note.draft.noteId}>
      <div className="original-note"><div className="field-heading"><strong>Original note{workflow.state.notes.length > 1 ? ` ${noteIndex + 1}` : ''}</strong><SourceBadge note={note} /></div>
        <blockquote>{note.draft.noteText || 'Empty note · manual entry'}</blockquote></div>
      {note.draft.movements.length > 0 && <div className="table-scroll"><table className="movement-table">
        <caption className="sr-only">Editable inventory movements for note {noteIndex + 1}</caption>
        <thead><tr><th scope="col">Item / movement</th><th scope="col">Quantity / unit</th><th scope="col">Review decision</th></tr></thead>
        <tbody>{note.draft.movements.map((row, index) => {
          const check = canApproveMovement(row, workflow.state.catalog);
          const locked = row.state === 'APPROVED' || row.state === 'REJECTED';
          const disabled = locked || workflow.busy;
          const name = `Movement ${noteIndex + 1}.${index + 1}`;
          return <tr key={row.tempId} className={row.state === 'REJECTED' ? 'rejected-row' : ''}>
            <td><select aria-label={`${name} item`} value={row.canonicalItemId ?? ''} disabled={disabled}
              onChange={event => workflow.editMovement(row.tempId, { canonicalItemId: event.target.value || null })}>
              <option value="">Choose item{row.rawItemName ? ` (${row.rawItemName})` : ''}</option>
              {workflow.state.catalog.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <select aria-label={`${name} kind`} value={row.kind ?? ''} disabled={disabled} onChange={event => {
                const kind = event.target.value;
                if (kind === '' || kind === 'RECEIVED' || kind === 'DISTRIBUTED' || kind === 'QUARANTINED' || kind === 'ADJUSTMENT') workflow.editMovement(row.tempId, { kind: kind || null });
              }}><option value="">Choose movement</option>{Object.entries(kindLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select>
              <p className="evidence">“{row.evidenceText}”</p></td>
            <td><input aria-label={`${name} quantity`} type="number" min="0.01" step="any" value={row.quantity ?? ''} disabled={disabled}
              placeholder="Quantity" onChange={event => workflow.editMovement(row.tempId, { quantity: event.target.value === '' ? null : event.target.valueAsNumber })} />
              <input aria-label={`${name} unit`} value={row.unit ?? ''} disabled={disabled} placeholder="Unit, e.g. bags"
                onChange={event => workflow.editMovement(row.tempId, { unit: event.target.value || null })} /></td>
            <td><span className={`badge ${row.state === 'APPROVED' ? 'success-badge' : ''}`}>{rowLabel(row)}</span>
              {!check.ok && !locked && <p className="approval-reason" id={`${row.tempId}-reason`}><strong>Needs clarification.</strong> {check.reason}</p>}
              {row.ambiguity && <div className="ambiguity"><p>{row.ambiguity}</p>{!locked && <label><input type="checkbox" disabled={workflow.busy}
                onChange={() => workflow.editMovement(row.tempId, { ambiguity: null })} /> I resolved this clarification</label>}</div>}
              {!locked && <div className="row-actions"><button className="approve-button" disabled={workflow.busy || !check.ok}
                aria-describedby={!check.ok ? `${row.tempId}-reason` : undefined} onClick={() => workflow.approveMovement(row.tempId)}>Approve</button>
                <button className="text-button" disabled={workflow.busy} onClick={() => workflow.rejectMovement(row.tempId)}>Reject</button></div>}
              {locked && <p className="field-hint">{row.state === 'APPROVED' ? 'Included in confirmed stock' : 'Excluded from stock'}</p>}
            </td>
          </tr>;
        })}</tbody></table></div>}
      {note.draft.observations.length > 0 && <div className="observations"><h3>Shelf counts <span className="subtle">Observations, never stock movements</span></h3>
        {note.draft.observations.map(row => <div className="observation" key={row.tempId}><div><strong>{row.count ?? 'Unknown'} {row.unit ?? '(unit missing)'} {row.rawItemName}</strong>
          <span className="badge">{row.state === 'CONFIRMED' ? 'Human-confirmed' : row.state === 'DISMISSED' ? 'Dismissed' : 'Unverified count'}</span>
          <p className="evidence">“{row.evidenceText}”</p></div><div className="row-actions">
            {row.state !== 'CONFIRMED' && <button disabled={workflow.busy || row.count === null || row.unit === null || row.canonicalItemId === null}
              onClick={() => workflow.setObservation(row.tempId, 'CONFIRMED')}>Confirm count</button>}
            {row.state !== 'DISMISSED' && <button className="text-button" disabled={workflow.busy} onClick={() => workflow.setObservation(row.tempId, 'DISMISSED')}>Dismiss</button>}</div></div>)}</div>}
      {(note.quarantined.length > 0 || note.draft.unclassifiedText.length > 0) && <details className="blocked-content">
        <summary>Blocked / untrusted content ({note.quarantined.length}) · Other note text ({note.draft.unclassifiedText.length})</summary>
        <p>These items cannot be approved or change stock. Inventory in quarantine is tracked separately.</p>
        {note.quarantined.map((item, index) => <div key={index}><strong>{item.reason}</strong><pre>{JSON.stringify(item.item, null, 2)}</pre></div>)}
        {note.draft.unclassifiedText.map((text, index) => <p key={index}>{text}</p>)}</details>}
    </div>)}
    <button className="manual-button" disabled={workflow.busy} onClick={() => workflow.addMovement(noteText)}>+ Add manual movement</button>
    <p className="session-note">Demo session only. Keep this tab open; reloading clears this work.</p>
  </section>;
}
