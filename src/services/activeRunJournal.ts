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

const enqueueJournalWrite = <T>(operation: () => Promise<T>): Promise<T> => {
  const operationPromise = writeChain
    .catch((error) => {
      console.warn('[ActiveRunJournal] Recovering after a failed write', error);
    })
    .then(operation);
  writeChain = operationPromise.then(() => undefined, (error) => {
    console.warn('[ActiveRunJournal] Journal write failed', error);
  });
  return operationPromise;
};

const validPoint = (point: RawGpsPayload) => Number.isFinite(point.latitude)
  && Number.isFinite(point.longitude)
  && point.latitude >= -90 && point.latitude <= 90
  && point.longitude >= -180 && point.longitude <= 180;

const timestampMillis = (value: RawGpsPayload['timestamp']): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : Date.parse(value);
  }
  return Number.NaN;
};

/** Reject implausible jumps while allowing larger distances across sparse GPS gaps. */
export const isPlausibleJournalMovement = (
  previous: RawGpsPayload,
  current: RawGpsPayload,
  distance = calculateDistanceMeters(previous, current),
): boolean => {
  const elapsedSeconds = (timestampMillis(current.timestamp) - timestampMillis(previous.timestamp)) / 1_000;
  if (!Number.isFinite(distance) || distance <= 0 || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 1) return false;
  const maximumDistance = Math.max(50, elapsedSeconds * 12);
  return distance <= maximumDistance;
};

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
  await enqueueJournalWrite(() => save({ active: true, runId, startedAt, points: [] }));
};

export const appendActiveRunPoints = async (
  points: RawGpsPayload[],
  traceType: 'active' | 'pause' | 'extra' = 'active',
): Promise<RawGpsPayload[]> => {
  return enqueueJournalWrite(async () => {
    const appended: RawGpsPayload[] = [];
    const journal = await readActiveRunJournal();
    if (!journal?.active) return appended;
    const known = new Set(journal.points.map((point) => `${point.timestamp}|${point.latitude}|${point.longitude}`));
    const candidates = points.filter(validPoint)
      .map((point) => ({ ...point, traceType: point.traceType ?? traceType }))
      .sort((a, b) => timestampMillis(a.timestamp) - timestampMillis(b.timestamp));
    for (const point of candidates) {
      const key = `${point.timestamp}|${point.latitude}|${point.longitude}`;
      if (known.has(key)) continue;
      const previous = journal.points.at(-1);
      const distance = previous ? calculateDistanceMeters(previous, point) : 0;
      const elapsedSeconds = previous
        ? Math.max(0, (timestampMillis(point.timestamp) - timestampMillis(previous.timestamp)) / 1_000)
        : 0;
      const accuracy = point.accuracy ?? Number.POSITIVE_INFINITY;
      const hasMovement = !previous
        || (accuracy <= 15
          && elapsedSeconds >= 1
          && distance >= 2
          && isPlausibleJournalMovement(previous, point, distance)
          && ((point.speed ?? 0) >= 0.5 || distance >= 2));
      if (hasMovement) {
        journal.points.push(point);
        known.add(key);
        appended.push(point);
      }
    }
    if (appended.length > 0) await save(journal);
    return appended;
  });
};

export const clearActiveRunJournal = async (): Promise<void> => {
  await enqueueJournalWrite(async () => {
    if (!JOURNAL_URI) return;
    const info = await FileSystem.getInfoAsync(JOURNAL_URI);
    if (info.exists) await FileSystem.deleteAsync(JOURNAL_URI, { idempotent: true });
  });
};
