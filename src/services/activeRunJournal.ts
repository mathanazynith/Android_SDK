import * as FileSystem from 'expo-file-system/legacy';

import { RawGpsPayload } from '../types/running';

/** Durable hand-off between the headless task and the map's existing GPS pipeline. */
export interface ActiveRunJournal {
  active: boolean;
  runId: string;
  startedAt: string;
  points: RawGpsPayload[];
}

const JOURNAL_URI = `${FileSystem.documentDirectory ?? ''}zyrun-active-route.json`;
let writeChain: Promise<void> = Promise.resolve();

const validPoint = (point: RawGpsPayload) => Number.isFinite(point.latitude)
  && Number.isFinite(point.longitude)
  && point.latitude >= -90 && point.latitude <= 90
  && point.longitude >= -180 && point.longitude <= 180;

export const readActiveRunJournal = async (): Promise<ActiveRunJournal | null> => {
  if (!JOURNAL_URI) return null;
  try {
    const info = await FileSystem.getInfoAsync(JOURNAL_URI);
    if (!info.exists) return null;
    const value = JSON.parse(await FileSystem.readAsStringAsync(JOURNAL_URI)) as ActiveRunJournal;
    return value?.active && Array.isArray(value.points) ? value : null;
  } catch (error) {
    console.warn('[ActiveRunJournal] Unable to read active route journal', error);
    return null;
  }
};

const save = async (journal: ActiveRunJournal): Promise<void> => {
  if (JOURNAL_URI) await FileSystem.writeAsStringAsync(JOURNAL_URI, JSON.stringify(journal));
};

export const beginActiveRunJournal = async (runId: string, startedAt: string): Promise<void> => {
  writeChain = writeChain.then(() => save({ active: true, runId, startedAt, points: [] }));
  return writeChain;
};

export const appendActiveRunPoints = async (points: RawGpsPayload[]): Promise<void> => {
  const candidates = points.filter(validPoint);
  if (!candidates.length) return;
  writeChain = writeChain.then(async () => {
    const journal = await readActiveRunJournal();
    if (!journal?.active) return;
    const known = new Set(journal.points.map((point) => `${point.timestamp}|${point.latitude}|${point.longitude}`));
    for (const point of candidates) {
      const key = `${point.timestamp}|${point.latitude}|${point.longitude}`;
      if (!known.has(key)) { journal.points.push(point); known.add(key); }
    }
    await save(journal);
  });
  return writeChain;
};

export const clearActiveRunJournal = async (): Promise<void> => {
  writeChain = writeChain.then(async () => {
    if (!JOURNAL_URI) return;
    const info = await FileSystem.getInfoAsync(JOURNAL_URI);
    if (info.exists) await FileSystem.deleteAsync(JOURNAL_URI, { idempotent: true });
  });
  return writeChain;
};
