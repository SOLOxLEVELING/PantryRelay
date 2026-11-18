import { useEffect, useState } from 'react';
import { checkAppCheck } from '../lib/firebase';
import { errorText } from '../lib/diagnostics';
import { defaultCloudModel, extractNoteHybrid, languageModelDiagnostic, preloadDeviceModel } from '../lib/spikeExtract';
import type { CloudModel, ExtractionMode, SpikeResult } from '../lib/spikeExtract';
import { syntheticNotes } from '../lib/syntheticNotes';

export interface SpikeRun {
  noteId: string;
  noteText: string;
  mode: ExtractionMode;
  cloudModel: CloudModel;
  online: boolean;
  timestamp: string;
  result: SpikeResult;
}

export function useSpikeRunner() {
  const [online, setOnline] = useState(navigator.onLine);
  const [availability, setAvailability] = useState('Checking');
  const [appCheck, setAppCheck] = useState('Not checked');
  const [shell, setShell] = useState('Checking');
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState('Idle');
  const [runs, setRuns] = useState<SpikeRun[]>([]);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    void languageModelDiagnostic().then(setAvailability);
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.ready.then(() => setShell(
        navigator.serviceWorker.controller ? 'Controlled by service worker' : 'Installed; reload to control'));
    } else setShell('Service workers unavailable');
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  async function refreshDiagnostics() {
    setAvailability(await languageModelDiagnostic());
    setAppCheck('Checking token');
    setAppCheck(await checkAppCheck());
  }

  async function preload() {
    setBusy(true);
    setActivity('Preloading through firebase/ai');
    try {
      await preloadDeviceModel(progress => setActivity(`Model download ${Math.round(progress * 100)}%`));
      setActivity('Device model initialized through firebase/ai');
    } catch (error) {
      setActivity(errorText(error));
    } finally {
      setAvailability(await languageModelDiagnostic());
      setBusy(false);
    }
  }

  async function runNotes(notes: Array<{ id: string; text: string }>, mode: ExtractionMode, cloudModel: CloudModel) {
    setBusy(true);
    let consecutiveTimeouts = 0;
    try {
      for (const [index, note] of notes.entries()) {
        setActivity(`Running ${index + 1}/${notes.length}: ${note.id}`);
        const onlineAtStart = navigator.onLine;
        const result = await extractNoteHybrid(note.text, mode, cloudModel);
        setRuns(previous => [...previous, { noteId: note.id, noteText: note.text, mode, cloudModel,
          online: onlineAtStart, timestamp: new Date().toISOString(), result }]);
        consecutiveTimeouts = result.failureKind === 'timeout' ? consecutiveTimeouts + 1 : 0;
        if (mode !== 'ONLY_IN_CLOUD' && (result.failureKind === 'initial-prompts' || result.failureKind === 'device-crash' || consecutiveTimeouts >= 2)) {
          setActivity(`STOP CONDITION: ${result.failureKind}; ${result.validationError}`);
          return;
        }
        if (result.failureStage === 'inference' && /schema|responseConstraint|not supported|unsupported/i.test(result.validationError ?? '')) {
          setActivity(`Stopped: ${result.validationError}`);
          return;
        }
      }
      setActivity('Run completed');
    } finally {
      setBusy(false);
      setAvailability(await languageModelDiagnostic());
    }
  }

  return { online, availability, appCheck, shell, busy, activity, runs, refreshDiagnostics, preload,
    runOne: (id: string, text: string, mode: ExtractionMode, cloudModel: CloudModel = defaultCloudModel) => runNotes([{ id, text }], mode, cloudModel),
    runAll: (mode: ExtractionMode, cloudModel: CloudModel = defaultCloudModel) => runNotes(syntheticNotes, mode, cloudModel),
    runCloudCheck: (cloudModel: CloudModel) => {
      const golden = syntheticNotes.find(note => note.id === 'golden-rice');
      const safetyNotes = syntheticNotes.filter(note => ['injection', 'damage-overlap'].includes(note.id));
      return runNotes(golden ? [golden, golden, golden, ...safetyNotes] : safetyNotes, 'ONLY_IN_CLOUD', cloudModel);
    } };
}
