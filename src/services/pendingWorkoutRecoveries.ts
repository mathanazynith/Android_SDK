import * as FileSystem from 'expo-file-system/legacy';

import type { ActiveRunJournal } from './activeRunJournal';
import type { BackgroundLocationSessionState } from './backgroundLocationTask';

export interface PendingWorkoutRecovery {
  id: string;
  createdAt: number;
  session: BackgroundLocationSessionState;
  journal: ActiveRunJournal;
}

const RECOVERIES_URI = `${FileSystem.documentDirectory ?? ''}zyrun-pending-workout-recoveries.json`;
let writeChain: Promise<void> = Promise.resolve();

const readAll = async (): Promise<PendingWorkoutRecovery[]> => {
  if (!RECOVERIES_URI) return [];
  try {
    const info = await FileSystem.getInfoAsync(RECOVERIES_URI);
    if (!info.exists) return [];
    const value = JSON.parse(await FileSystem.readAsStringAsync(RECOVERIES_URI)) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is PendingWorkoutRecovery => (
      typeof item === 'object'
      && item !== null
      && typeof (item as PendingWorkoutRecovery).id === 'string'
      && typeof (item as PendingWorkoutRecovery).session?.runId === 'string'
      && Array.isArray((item as PendingWorkoutRecovery).journal?.points)
    ));
  } catch (error) {
    console.warn('[PendingWorkoutRecoveries] Unable to read pending workout recoveries', error);
    return [];
  }
};

const writeAll = async (recoveries: PendingWorkoutRecovery[]): Promise<void> => {
  if (RECOVERIES_URI) {
    await FileSystem.writeAsStringAsync(RECOVERIES_URI, JSON.stringify(recoveries));
  }
};

export const listPendingWorkoutRecoveries = async (): Promise<PendingWorkoutRecovery[]> => {
  await writeChain;
  return (await readAll()).sort((left, right) => left.createdAt - right.createdAt);
};

export const getPendingWorkoutRecovery = async (id: string): Promise<PendingWorkoutRecovery | null> => {
  const recoveries = await listPendingWorkoutRecoveries();
  return recoveries.find((recovery) => recovery.id === id) ?? null;
};

export const savePendingWorkoutRecovery = async (
  session: BackgroundLocationSessionState,
  journal: ActiveRunJournal,
): Promise<PendingWorkoutRecovery> => {
  const recovery: PendingWorkoutRecovery = {
    id: session.runId ?? journal.runId,
    createdAt: Date.now(),
    session: { ...session, recoveryReviewRequired: true },
    journal: { ...journal, points: [...journal.points], pausePoints: [...(journal.pausePoints ?? [])] },
  };
  writeChain = writeChain.then(async () => {
    const recoveries = await readAll();
    const existingIndex = recoveries.findIndex((item) => item.id === recovery.id);
    if (existingIndex >= 0) recoveries[existingIndex] = { ...recoveries[existingIndex], ...recovery };
    else recoveries.push(recovery);
    await writeAll(recoveries);
  });
  await writeChain;
  return recovery;
};

export const removePendingWorkoutRecovery = async (id: string): Promise<void> => {
  writeChain = writeChain.then(async () => {
    const recoveries = await readAll();
    await writeAll(recoveries.filter((recovery) => recovery.id !== id));
  });
  await writeChain;
};
