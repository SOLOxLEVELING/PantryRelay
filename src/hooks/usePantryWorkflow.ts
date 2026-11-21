import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { checkAppCheck, db, ensureSignedInUid } from '../lib/firebase';
import { errorText } from '../lib/diagnostics';
import { clearLocalWorkspace, listOutboxEntries, loadLocalWorkspace, markOutboxError, saveLocalWorkspace } from '../lib/storage';
import type { LocalWorkspaceSnapshot, OutboxEntry } from '../lib/storage';
import { createFirestoreLedgerWriter, flushSyncOutbox, summarizeSyncState } from '../lib/syncOutbox';
import { extractNoteHybrid, languageModelDiagnostic, preloadDeviceModel } from '../lib/spikeExtract';
import type { ExtractionMode } from '../lib/spikeExtract';
import { initialWorkflowState, reconcileWorkflow, workflowReducer } from '../lib/workflowState';
import type { MovementEdit, ObservationEdit, WorkflowState } from '../lib/workflowState';
import type { FollowUpTask } from '../types/inventory';
import { generateCloudShiftBriefing } from '../lib/shiftBriefing';

type BriefingState =
  | { status: 'IDLE' | 'LOADING'; text: ''; inferenceSource: 'UNKNOWN'; latencyMs: null; error: null }
  | { status: 'ERROR'; text: ''; inferenceSource: 'UNKNOWN'; latencyMs: null; error: string }
  | ({ status: 'READY'; error: null; notes: WorkflowState['notes'] } &
    Awaited<ReturnType<typeof generateCloudShiftBriefing>>);

const emptyBriefing = { text: '', inferenceSource: 'UNKNOWN', latencyMs: null } satisfies Pick<
  Extract<BriefingState, { status: 'ERROR' }>, 'text' | 'inferenceSource' | 'latencyMs'
>;
const idleBriefing: BriefingState = { ...emptyBriefing, status: 'IDLE', error: null };
const offlineBriefingMessage = 'Cloud briefing requires an internet connection. You can still copy the shift handoff offline.';

const ledgerWriter = createFirestoreLedgerWriter(db);

function signInError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  switch (code) {
    case 'auth/operation-not-allowed': return 'Anonymous sign-in is disabled (auth/operation-not-allowed).';
    case 'auth/admin-restricted-operation': return 'Anonymous sign-in is restricted (auth/admin-restricted-operation).';
    case 'auth/network-request-failed': return 'Sign-in could not reach Firebase. Retry when connected.';
    default: return 'Firebase sign-in failed. Retry sync.';
  }
}

export function usePantryWorkflow() {
  const [state, dispatch] = useReducer(workflowReducer, undefined, initialWorkflowState);
  const { sessionId, hydrated, notes, approvedEvents, keptOpen } = state;
  const [online, setOnline] = useState(navigator.onLine);
  const [modelStatus, setModelStatus] = useState('Checking');
  const [shellCached, setShellCached] = useState(false);
  const [appCheck, setAppCheck] = useState('Not checked');
  const [preloading, setPreloading] = useState(false);
  const [saved, setSaved] = useState<LocalWorkspaceSnapshot>();
  const [outboxEntries, setOutboxEntries] = useState<OutboxEntry[]>([]);
  const [storageError, setStorageError] = useState<string>();
  const [syncFailure, setSyncFailure] = useState<string>();
  const [syncing, setSyncing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [briefingState, setBriefing] = useState<BriefingState>(idleBriefing);
  const briefingLock = useRef<number | null>(null);
  const generation = useRef(0);
  const storageQueue = useRef(Promise.resolve());
  const syncLock = useRef<number | null>(null);
  const resetLock = useRef(false);
  const extracting = useRef(false);

  const queueStorage = useCallback((operation: () => Promise<void>) => {
    const result = storageQueue.current.then(operation);
    storageQueue.current = result.catch(() => undefined);
    return result;
  }, []);

  useEffect(() => {
    if (hydrated) return;
    let active = true;
    async function hydrate() {
      try {
        const snapshot = await loadLocalWorkspace();
        const entries = await listOutboxEntries(snapshot?.sessionId ?? sessionId);
        if (!active) return;
        setSaved(snapshot);
        setOutboxEntries(entries);
        dispatch({ type: 'HYDRATE', snapshot });
      } catch {
        if (active) setStorageError('Could not load the local workspace. Reload to try again.');
      }
    }
    void hydrate();
    return () => { active = false; };
  }, [sessionId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const token = generation.current;
    const snapshot = { sessionId, notes, approvedEvents, keptOpen, updatedAt: new Date().toISOString() };
    void queueStorage(async () => {
      if (token !== generation.current || resetLock.current) return;
      try {
        await saveLocalWorkspace(snapshot);
        const entries = await listOutboxEntries(sessionId);
        if (token !== generation.current) return;
        setSaved(snapshot);
        setOutboxEntries(entries);
        setStorageError(undefined);
      } catch {
        if (token === generation.current) setStorageError('Could not save changes to IndexedDB. Check browser storage and try another edit.');
      }
    });
  }, [sessionId, hydrated, notes, approvedEvents, keptOpen, queueStorage]);

  const syncNow = useCallback(async (onlyPending = false) => {
    if (!navigator.onLine || !hydrated || resetLock.current || syncLock.current !== null) return;
    const token = generation.current;
    const isCurrent = () => token === generation.current;
    const canWrite = () => isCurrent() && navigator.onLine;
    syncLock.current = token;
    try {
      await storageQueue.current;
      if (!canWrite()) return;
      const entries = await listOutboxEntries(sessionId);
      if (!canWrite()) return;
      const pending = entries.filter(entry => entry.syncState !== 'SYNCED');
      if (pending.length === 0 && onlyPending) return;
      setSyncing(true);
      setSyncFailure(undefined);
      if (pending.length > 0) {
        const signIn = await ensureSignedInUid().then<{ uid: string }, { message: string }>(
          uid => ({ uid }), (error: unknown) => ({ message: signInError(error) }),
        );
        if (!canWrite()) return;
        if ('uid' in signIn) {
          await flushSyncOutbox({ uid: signIn.uid, sessionId, writer: ledgerWriter, canWrite });
        } else {
          await Promise.all(pending.map(entry => markOutboxError(entry.event.id, signIn.message)));
        }
      }
      await queueStorage(async () => {
        if (!isCurrent()) return;
        const refreshed = await listOutboxEntries(sessionId);
        if (isCurrent()) setOutboxEntries(refreshed);
      });
    } catch {
      if (isCurrent()) setSyncFailure('Could not read or update the local sync queue. Retry sync.');
    } finally {
      if (isCurrent()) {
        syncLock.current = null;
        setSyncing(false);
      }
    }
  }, [hydrated, sessionId, queueStorage]);

  useEffect(() => {
    const reconnect = () => { void syncNow(true); };
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, [syncNow]);

  async function resetDemo() {
    if (!hydrated || resetLock.current) return;
    resetLock.current = true;
    setResetting(true);
    generation.current += 1;
    syncLock.current = null;
    setSyncing(false);
    briefingLock.current = null;
    setBriefing(idleBriefing);
    try {
      await queueStorage(clearLocalWorkspace);
      setSaved(undefined);
      setOutboxEntries([]);
      setStorageError(undefined);
      setSyncFailure(undefined);
      dispatch({ type: 'RESET' });
    } catch {
      setStorageError('Could not reset the local workspace. Try Reset demo again.');
    } finally {
      resetLock.current = false;
      setResetting(false);
    }
  }

  useEffect(() => {
    let active = true;
    const updateOnline = () => setOnline(navigator.onLine);
    const updateShell = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const keys = await caches.keys();
        const cached = await Promise.all(keys.filter(key => key.includes('precache')).map(async key =>
          (await caches.open(key)).match(new URL('/index.html', location.origin).href, { ignoreSearch: true })));
        if (active) setShellCached(Boolean(registration?.active && navigator.serviceWorker.controller && cached.some(Boolean)));
      } catch {
        if (active) setShellCached(false);
      }
    };
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    void languageModelDiagnostic().then(value => { if (active) setModelStatus(value); });
    if ('serviceWorker' in navigator && 'caches' in window) {
      navigator.serviceWorker.addEventListener('controllerchange', updateShell);
      void updateShell();
      void navigator.serviceWorker.ready.then(updateShell);
    }
    return () => {
      active = false;
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('controllerchange', updateShell);
    };
  }, []);

  async function extractNote(noteText: string, mode: ExtractionMode) {
    if (extracting.current) return;
    extracting.current = true;
    const token = generation.current;
    const noteId = crypto.randomUUID();
    dispatch({ type: 'EXTRACT_START', noteId, noteText });
    try {
      const result = await extractNoteHybrid(noteText, mode);
      if (token === generation.current) dispatch({ type: 'EXTRACT_FINISH', noteId, result });
    } finally {
      extracting.current = false;
    }
  }

  async function preload() {
    setPreloading(true);
    try {
      setModelStatus('Preparing model');
      await preloadDeviceModel(progress => setModelStatus(`Downloading ${Math.round(progress * 100)}%`));
      setModelStatus(await languageModelDiagnostic());
    } catch (error) {
      setModelStatus(errorText(error));
    } finally {
      setPreloading(false);
    }
  }

  async function refreshAppCheck() {
    setAppCheck('Checking');
    setAppCheck(await checkAppCheck());
  }

  function manualContext(noteText: string) {
    const latest = state.notes.at(-1)?.draft;
    return latest ? { noteId: latest.noteId, noteText: latest.noteText } : { noteId: crypto.randomUUID(), noteText };
  }

  function addMovement(noteText: string, itemId?: string, adjustment = false) {
    dispatch({ type: 'ADD_MOVEMENT', ...manualContext(noteText), tempId: crypto.randomUUID(), itemId, adjustment });
  }

  function addObservation(noteText: string) {
    const latest = notes.at(-1)?.draft;
    const noteId = latest?.noteText === noteText ? latest.noteId : crypto.randomUUID();
    dispatch({ type: 'ADD_OBSERVATION', noteId, noteText, tempId: crypto.randomUUID() });
  }

  function addRecount(itemId: string, noteText: string, assigneeName: string) {
    const context = manualContext(noteText);
    dispatch({ type: 'ADD_TASK', ...context, task: { id: crypto.randomUUID(), noteId: context.noteId,
      text: `Recount ${state.catalog.find(item => item.id === itemId)?.name ?? itemId} on the shelves`,
      assigneeName: assigneeName.trim() || null, evidenceText: 'Recount requested by volunteer from discrepancy review.',
      status: 'OPEN', createdAt: new Date().toISOString() } });
  }

  const reconciliations = reconcileWorkflow(state);
  const briefing = briefingState.status === 'READY' && briefingState.notes !== notes ? idleBriefing : briefingState;

  async function requestCloudBriefing() {
    if (!hydrated || resetLock.current || briefingLock.current !== null) return;
    if (!navigator.onLine) {
      setBriefing({ ...emptyBriefing, status: 'ERROR', error: offlineBriefingMessage });
      return;
    }

    const token = generation.current;
    briefingLock.current = token;
    setBriefing({ ...emptyBriefing, status: 'LOADING', error: null });
    try {
      const result = await generateCloudShiftBriefing({
        reconciliations, followUps: notes.flatMap(note => note.draft.followUps), approvedEvents,
      });
      if (token === generation.current) setBriefing({ status: 'READY', ...result, notes, error: null });
    } catch {
      if (token === generation.current) setBriefing({ ...emptyBriefing, status: 'ERROR',
        error: navigator.onLine ? 'Could not generate a cloud briefing. Try again or copy the shift handoff.' : offlineBriefingMessage });
    } finally {
      if (briefingLock.current === token) briefingLock.current = null;
    }
  }

  const locallySaved = saved?.sessionId === sessionId && saved.notes === notes &&
    saved.approvedEvents === approvedEvents && saved.keptOpen === keptOpen;
  const syncSummary = summarizeSyncState(outboxEntries);
  const syncError = syncFailure ?? outboxEntries.find(entry => entry.syncState === 'SYNC_ERROR')?.lastError;
  const outboxByEvent = new Map(outboxEntries.map(entry => [entry.event.id, entry]));
  return { state, reconciliations, briefing, requestCloudBriefing, offlineBriefingMessage, online, modelStatus, shellCached, appCheck, preloading,
    locallySaved, storageError, outboxByEvent, syncSummary, syncError, syncing, resetting, syncNow, resetDemo,
    busy: state.extractingNoteId !== null, extractNote, preload, refreshAppCheck,
    editMovement: (tempId: string, changes: MovementEdit) => dispatch({ type: 'EDIT', tempId, changes }),
    addMovement,
    approveMovement: (tempId: string) => dispatch({ type: 'APPROVE', tempId, id: crypto.randomUUID(), now: new Date().toISOString() }),
    rejectMovement: (tempId: string) => dispatch({ type: 'REJECT', tempId }),
    addObservation,
    editObservation: (tempId: string, changes: ObservationEdit) => dispatch({ type: 'EDIT_OBSERVATION', tempId, changes }),
    setObservation: (tempId: string, status: 'CONFIRMED' | 'DISMISSED') => dispatch({ type: 'OBSERVATION', tempId, state: status }),
    setTaskStatus: (id: string, status: FollowUpTask['status']) => dispatch({ type: 'TASK_STATUS', id, status }),
    addRecount,
    keepOpen: (itemId: string) => dispatch({ type: 'KEEP_OPEN', itemId }),
  };
}

export type PantryWorkflow = ReturnType<typeof usePantryWorkflow>;
