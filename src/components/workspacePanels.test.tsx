import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { usePantryWorkflow } from '../hooks/usePantryWorkflow';
import { buildReviewDraftFromNote } from '../lib/seedData';
import { duplicateExtractionSummary, initialWorkflowState, reconcileWorkflow, workflowReducer } from '../lib/workflowState';
import type { WorkflowNote, WorkflowState } from '../lib/workflowState';
import { CapturePanel } from './CapturePanel';
import { HandoffPanel } from './HandoffPanel';
import { ReconcilePanel } from './ReconcilePanel';

vi.mock('../lib/firebase', () => ({ ai: null, db: null }));

const noteText = 'Received 2 bags of rice. Counted 21 bags.';
const note: WorkflowNote = {
  draft: buildReviewDraftFromNote('note', noteText, {
    movements: [{ itemName: 'rice', quantity: 2, unit: 'bags', kind: 'RECEIVED', evidenceText: 'Received 2 bags of rice.', ambiguity: null }],
    observations: [{ itemName: 'rice', count: 21, unit: 'bags', evidenceText: 'Counted 21 bags.' }],
    followUps: [], unclassifiedText: [],
  }),
  inferenceSource: 'ON_DEVICE', latencyMs: 1500, quarantined: [], error: null,
};

const noop = () => {};
const captureOptions = {
  sampleId: 'custom', setSampleId: noop, mode: 'ONLY_ON_DEVICE', setMode: noop,
  setNoteText: noop, onExtract: noop, busy: false, online: true,
  onCancel: noop, onConfirmDuplicate: noop, onDismissDuplicate: noop, duplicateWarning: undefined,
} satisfies Omit<Parameters<typeof CapturePanel>[0], 'latest' | 'noteText'>;

function DiscrepancyPanels({ state }: { state: WorkflowState }) {
  const workflow = { ...usePantryWorkflow(), state, reconciliations: reconcileWorkflow(state) };
  return <><ReconcilePanel workflow={workflow} noteText={noteText} /><HandoffPanel workflow={workflow} /></>;
}

describe('Capture feedback', () => {
  it('gives a duplicate warning with row counts and both confirmation choices', () => {
    const duplicateWarning = duplicateExtractionSummary([note], ` ${noteText} `);
    const markup = renderToStaticMarkup(<CapturePanel {...captureOptions} latest={note} noteText={noteText} duplicateWarning={duplicateWarning} />);
    expect(markup).toContain('This exact note was already extracted in this session.');
    expect(markup).toContain('0 approved and 1 pending');
    expect(markup).toContain('>Extract again anyway</button>');
    expect(markup).toContain('>Dismiss</button>');
  });

  it('shows extraction metadata only when the current note matches after trimming', () => {
    const latest = { ...note, error: 'AI/fetch-error' };
    const matching = renderToStaticMarkup(<CapturePanel {...captureOptions} latest={latest} noteText={` ${noteText}\n`} />);
    expect(matching).toContain('Source: On-device');
    expect(matching).toContain('role="alert"');
    const edited = renderToStaticMarkup(<CapturePanel {...captureOptions} latest={latest} noteText={`${noteText} Updated.`} />);
    expect(edited).not.toContain('Source:');
    expect(edited).not.toContain('role="alert"');
  });

  it.each([
    ['[500] The model is experiencing high demand.', 'The extraction service is busy right now.'],
    ['AI: Local LanguageModel API not available.', 'This browser’s on-device model isn’t ready.'],
    ['AI/fetch-error', 'The browser couldn’t reach the extraction service.'],
    ['FirebaseError: AppCheck (appCheck/recaptcha-error).', 'The cloud service couldn’t verify this browser.'],
    ['Request failed with 401.', 'The cloud service couldn’t verify this browser.'],
    ['Request failed with 403.', 'The cloud service couldn’t verify this browser.'],
    ['Network offline.', 'You’re offline.'],
  ])('renders plain-language guidance for %s and keeps diagnostics collapsed', (error, guidance) => {
    const markup = renderToStaticMarkup(<CapturePanel {...captureOptions} latest={{ ...note, error }} noteText={noteText} />);
    expect(markup).toContain(guidance);
    expect(markup).toContain('<summary>Technical details</summary>');
    expect(markup).not.toMatch(/<details[^>]*\bopen(?:\s|=|>)/);
  });

  it('keeps blank diagnostics hidden and removes keys and tokens from technical details', () => {
    const error = 'AI/fetch-error https://example.test/?key=fixture-secret-key&other=1 Authorization: Bearer fixture-secret-token';
    const markup = renderToStaticMarkup(<CapturePanel {...captureOptions} latest={{ ...note, error }} noteText={noteText} />);
    expect(markup).toContain('[REDACTED]');
    expect(markup).not.toContain('fixture-secret-');
    const blank = renderToStaticMarkup(<CapturePanel {...captureOptions} latest={{ ...note, error: '  ' }} noteText={noteText} />);
    expect(blank).toContain('role="alert"');
    expect(blank).not.toContain('<details');
  });
});

describe('discrepancy presentation', () => {
  it.each([
    { pending: true, unverified: true }, { pending: true, unverified: false },
    { pending: false, unverified: true }, { pending: false, unverified: false },
  ])('updates both panels with pending=$pending and unverified=$unverified', ({ pending, unverified }) => {
    let state = { ...initialWorkflowState(), notes: [note] };
    if (!pending) state = workflowReducer(state, { type: 'REJECT', tempId: 'note:movement:0' });
    if (!unverified) state = workflowReducer(state, { type: 'OBSERVATION', tempId: 'note:observation:0', state: 'CONFIRMED' });
    expect(reconcileWorkflow(state)[0]?.result.status).toBe('DISCREPANCY');
    const markup = renderToStaticMarkup(<DiscrepancyPanels state={state} />);
    if (pending || unverified) {
      expect(markup).toContain('class="discrepancy is-provisional"');
      expect(markup).toContain('Provisional count difference (3 bags)');
      expect(markup).toContain('class="handoff-exception is-provisional"');
      expect(markup).toContain('(provisional — review pending)');
    } else {
      expect(markup).toContain('<h3>3 bag discrepancy</h3>');
      expect(markup).not.toContain('is-provisional');
    }
  });
});
