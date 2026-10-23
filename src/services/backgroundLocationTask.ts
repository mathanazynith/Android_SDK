
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { ActivityPauseEventPayload, RawGpsPayload } from '../types/running';
import { calculateDistanceMeters } from '../utils/distance';
import { appendActiveRunPoints, appendPausedRunPoints, readActiveRunJournal } from './activeRunJournal';
import { updateLiveTrackingNotification, WORKOUT_FOREGROUND_NOTIFICATION_ID } from './liveTrackingNotification';

export const BACKGROUND_LOCATION_TASK_NAME = 'zyrun-background-location-task';
export const BACKGROUND_LOCATION_SESSION_KEY = 'zyrun:background-location-session';
const BACKGROUND_LOCATION_SESSION_URI = `${FileSystem.documentDirectory ?? ''}zyrun-background-location-session.json`;
const secureStoreKey = (rawKey: string): string => rawKey.replace(/[^a-zA-Z0-9._-]/g, '_');
const SAFE_BACKGROUND_LOCATION_SESSION_KEY = secureStoreKey(BACKGROUND_LOCATION_SESSION_KEY);
let sessionWriteChain: Promise<void> = Promise.resolve();

export interface BackgroundLocationSessionState {
  active: boolean;
  paused?: boolean;
  confirmationPromptVisible?: boolean;
  runId?: string | null;
  userId?: string | null;
  startedAt?: string | null;
  lastLocation?: RawGpsPayload | null;
  updatedAt?: number | null;
  distanceKm?: number;
  elapsedSeconds?: number;
  paceMinutesPerKm?: number;
  movementConfirmed?: boolean;
  pauseEvents?: Omit<ActivityPauseEventPayload, 'sequence' | 'paused_points'>[];
}

declare global {
  var __ZYRUN_BACKGROUND_LOCATION_LISTENER__: ((payload: RawGpsPayload, paused?: boolean) => void) | undefined;
}

const readSessionState = async (): Promise<BackgroundLocationSessionState | null> => {
  try {
    await sessionWriteChain;
    const fileInfo = BACKGROUND_LOCATION_SESSION_URI
      ? await FileSystem.getInfoAsync(BACKGROUND_LOCATION_SESSION_URI)
      : null;
    const value = fileInfo?.exists
      ? await FileSystem.readAsStringAsync(BACKGROUND_LOCATION_SESSION_URI)
      : await SecureStore.getItemAsync(SAFE_BACKGROUND_LOCATION_SESSION_KEY);
    if (!value) return null;
    return JSON.parse(value) as BackgroundLocationSessionState;
  } catch (error) {
    console.warn('[BackgroundLocationTask] Unable to read background session state', error);
    return null;
  }
};

export const getBackgroundLocationSession = async (): Promise<BackgroundLocationSessionState | null> => {
  return readSessionState();
};

export const persistBackgroundLocationSession = async (
  state: BackgroundLocationSessionState
): Promise<void> => {
  sessionWriteChain = sessionWriteChain.then(async () => {
    try {
      if (BACKGROUND_LOCATION_SESSION_URI) {
        await FileSystem.writeAsStringAsync(BACKGROUND_LOCATION_SESSION_URI, JSON.stringify(state));
        return;
      }
      await SecureStore.setItemAsync(SAFE_BACKGROUND_LOCATION_SESSION_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('[BackgroundLocationTask] Unable to persist background session state', error);
    }
  });
  return sessionWriteChain;
};

export const clearBackgroundLocationSession = async (): Promise<void> => {
  sessionWriteChain = sessionWriteChain.then(async () => {
    try {
      if (BACKGROUND_LOCATION_SESSION_URI) {
        await FileSystem.deleteAsync(BACKGROUND_LOCATION_SESSION_URI, { idempotent: true });
      }
      await SecureStore.deleteItemAsync(SAFE_BACKGROUND_LOCATION_SESSION_KEY).catch(() => undefined);
    } catch (error) {
      console.warn('[BackgroundLocationTask] Unable to clear background session state', error);
    }
  });
  return sessionWriteChain;
};

export const setBackgroundLocationListener = (
  listener?: (payload: RawGpsPayload, paused?: boolean) => void
): void => {
  globalThis.__ZYRUN_BACKGROUND_LOCATION_LISTENER__ = listener;
};

const hydrateLocationPayload = (location: Location.LocationObject): RawGpsPayload => ({
  latitude: location.coords.latitude,
  longitude: location.coords.longitude,
  accuracy: location.coords.accuracy ?? 0,
  altitude: location.coords.altitude ?? 0,
  speed: location.coords.speed ?? 0,
  heading: location.coords.heading ?? 0,
  timestamp: location.timestamp,
});

TaskManager.defineTask(BACKGROUND_LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn('[BackgroundLocationTask] Task error', error.message);
    return;
  }

  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
  if (!locations.length) return;

  const payloads = locations
    .map(hydrateLocationPayload)
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const payload = payloads[payloads.length - 1];
  const previous = await readSessionState();
  if (!previous?.active) return;
  const paused = Boolean(previous.paused);

  const nextState: BackgroundLocationSessionState = {
    ...previous,
    active: true,
    lastLocation: payload,
    updatedAt: Date.now(),
  };

  await persistBackgroundLocationSession(nextState);

  if (paused) {
    await appendPausedRunPoints(payloads, Math.max(1, previous.pauseEvents?.length ?? 1));
  } else {
    await appendActiveRunPoints(payloads);
  }

  if (AppState.currentState === 'active') return;

  if (paused) {
    if (typeof globalThis.__ZYRUN_BACKGROUND_LOCATION_LISTENER__ === 'function') {
      payloads.forEach((point) => globalThis.__ZYRUN_BACKGROUND_LOCATION_LISTENER__?.(point, true));
    }
    return;
  }

  const journal = await readActiveRunJournal();
  const journalDistanceKm = (journal?.points.slice(1).reduce((total, point, index) => (
    total + calculateDistanceMeters(journal.points[index], point)
  ), 0) ?? 0) / 1000;
  const distanceKm = journal?.points.length && journal.points.length > 1
    ? journalDistanceKm
    : (previous.distanceKm ?? 0);
  const elapsedSeconds = previous.elapsedSeconds ?? (previous.startedAt
    ? Math.max(0, (Date.now() - new Date(previous.startedAt).getTime()) / 1000)
    : 0);
  updateLiveTrackingNotification({
    runId: previous.runId,
    distanceKm,
    elapsedSeconds,
    paceMinutesPerKm: previous.paceMinutesPerKm ?? (distanceKm > 0 ? elapsedSeconds / 60 / distanceKm : 0),
    status: 'running',
    startedAt: previous.startedAt,
  });
  nextState.distanceKm = distanceKm;
  nextState.elapsedSeconds = elapsedSeconds;
  nextState.paceMinutesPerKm = previous.paceMinutesPerKm ?? (distanceKm > 0 ? elapsedSeconds / 60 / distanceKm : 0);
  await persistBackgroundLocationSession(nextState);

  if (typeof globalThis.__ZYRUN_BACKGROUND_LOCATION_LISTENER__ === 'function') {
    payloads.forEach((point) => globalThis.__ZYRUN_BACKGROUND_LOCATION_LISTENER__?.(point));
  }

});

export const startBackgroundLocationTracking = async (): Promise<void> => {
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME)) return;
  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1_000,
    distanceInterval: 0,
    foregroundService: {
      notificationTitle: 'Zy-Run - Tracking Live',
      notificationBody: `Tap to return to your active run (${WORKOUT_FOREGROUND_NOTIFICATION_ID}).`,
      notificationColor: '#20D000',
      killServiceOnDestroy: false,
    },
  });
};

export const stopBackgroundLocationTracking = async (): Promise<void> => {
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
  }
};
