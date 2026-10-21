import * as FileSystem from 'expo-file-system/legacy';

import { RawGpsPayload } from '../types/running';
import { calculateDistanceMeters } from '../utils/distance';

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

export const flushActiveRunJournal = async (): Promise<void> => writeChain;

const save = async (journal: ActiveRunJournal): Promise<void> => {
  if (JOURNAL_URI) await FileSystem.writeAsStringAsync(JOURNAL_URI, JSON.stringify(journal));
};

export const beginActiveRunJournal = async (runId: string, startedAt: string): Promise<void> => {
  writeChain = writeChain.then(() => save({ active: true, runId, startedAt, points: [] }));
  return writeChain;
};

export const appendActiveRunPoints = async (points: RawGpsPayload[]): Promise<void> => {
  writeChain = writeChain.then(async () => {
    const journal = await readActiveRunJournal();
    if (!journal?.active) return;
    const known = new Set(journal.points.map((point) => `${point.timestamp}|${point.latitude}|${point.longitude}`));
    const candidates = points.filter(validPoint).sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0));
    for (const point of candidates) {
      const key = `${point.timestamp}|${point.latitude}|${point.longitude}`;
      if (known.has(key)) continue;
      const previous = journal.points.at(-1);
      const distance = previous ? calculateDistanceMeters(previous, point) : 0;
      const elapsedSeconds = previous
        ? Math.max(0, (Number(point.timestamp ?? 0) - Number(previous.timestamp ?? 0)) / 1_000)
        : 0;
      const accuracy = point.accuracy ?? Number.POSITIVE_INFINITY;
      const hasMovement = !previous
        || (accuracy <= 15
          && elapsedSeconds >= 1
          && distance >= 2
          && distance < 50
          && ((point.speed ?? 0) >= 0.5 || distance >= 2));
      if (hasMovement) { journal.points.push(point); known.add(key); }
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
