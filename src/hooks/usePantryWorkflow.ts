import { useEffect, useReducer, useRef, useState } from 'react';
import { checkAppCheck } from '../lib/firebase';
import { errorText } from '../lib/diagnostics';
import { extractNoteHybrid, languageModelDiagnostic, preloadDeviceModel } from '../lib/spikeExtract';
import type { ExtractionMode } from '../lib/spikeExtract';
import { initialWorkflowState, reconcileWorkflow, workflowReducer } from '../lib/workflowState';
import type { MovementEdit } from '../lib/workflowState';
import type { FollowUpTask } from '../types/inventory';

export function usePantryWorkflow() {
  const [state, dispatch] = useReducer(workflowReducer, undefined, initialWorkflowState);
  const [online, setOnline] = useState(navigator.onLine);
  const [modelStatus, setModelStatus] = useState('Checking');
  const [shellCached, setShellCached] = useState(false);
  const [appCheck, setAppCheck] = useState('Not checked');
  const [preloading, setPreloading] = useState(false);
  const generation = useRef(0);
  const extracting = useRef(false);

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

  function addRecount(itemId: string, noteText: string, assigneeName: string) {
    const context = manualContext(noteText);
    dispatch({ type: 'ADD_TASK', ...context, task: { id: crypto.randomUUID(), noteId: context.noteId,
      text: `Recount ${state.catalog.find(item => item.id === itemId)?.name ?? itemId} on the shelves`,
      assigneeName: assigneeName.trim() || null, evidenceText: 'Recount requested by volunteer from discrepancy review.',
      status: 'OPEN', createdAt: new Date().toISOString() } });
  }

  return { state, reconciliations: reconcileWorkflow(state), online, modelStatus, shellCached, appCheck, preloading,
    busy: state.extractingNoteId !== null, extractNote, preload, refreshAppCheck,
    resetDemo: () => { generation.current += 1; dispatch({ type: 'RESET' }); },
    editMovement: (tempId: string, changes: MovementEdit) => dispatch({ type: 'EDIT', tempId, changes }),
    addMovement,
    approveMovement: (tempId: string) => dispatch({ type: 'APPROVE', tempId, id: crypto.randomUUID(), now: new Date().toISOString() }),
    rejectMovement: (tempId: string) => dispatch({ type: 'REJECT', tempId }),
    setObservation: (tempId: string, status: 'CONFIRMED' | 'DISMISSED') => dispatch({ type: 'OBSERVATION', tempId, state: status }),
    setTaskStatus: (id: string, status: FollowUpTask['status']) => dispatch({ type: 'TASK_STATUS', id, status }),
    addRecount,
    keepOpen: (itemId: string) => dispatch({ type: 'KEEP_OPEN', itemId }),
  };
}

export type PantryWorkflow = ReturnType<typeof usePantryWorkflow>;
