
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { ActivityPauseEventPayload, RawGpsPayload } from '../types/running';
import { calculateDistanceMeters } from '../utils/distance';
import { appendActiveRunPoints, isPlausibleJournalMovement, readActiveRunJournal } from './activeRunJournal';
import { updateLiveTrackingNotification, WORKOUT_FOREGROUND_NOTIFICATION_ID } from './liveTrackingNotification';
import { tagLocationBatch } from './locationPointTagging';

export const BACKGROUND_LOCATION_TASK_NAME = 'zyrun-background-location-task';
export const BACKGROUND_LOCATION_SESSION_KEY = 'zyrun:background-location-session';
const BACKGROUND_LOCATION_SESSION_URI = `${FileSystem.documentDirectory ?? ''}zyrun-background-location-session.json`;
const secureStoreKey = (rawKey: string): string => rawKey.replace(/[^a-zA-Z0-9._-]/g, '_');
const SAFE_BACKGROUND_LOCATION_SESSION_KEY = secureStoreKey(BACKGROUND_LOCATION_SESSION_KEY);
let sessionWriteChain: Promise<void> = Promise.resolve();

export interface BackgroundLocationSessionState {
  active: boolean;
  paused?: boolean;
  traceType?: 'active' | 'pause' | 'extra';
  confirmationPromptVisible?: boolean;
  runId?: string | null;
  userId?: string | null;
  startedAt?: string | null;
  lastLocation?: RawGpsPayload | null;
  updatedAt?: number | null;
  distanceKm?: number;
  extraDistanceKm?: number;
  elapsedSeconds?: number;
  paceMinutesPerKm?: number;
  movementConfirmed?: boolean;
  pauseEvents?: Omit<ActivityPauseEventPayload, 'sequence' | 'paused_points'>[];
}

declare global {
  var __ZYRUN_BACKGROUND_LOCATION_LISTENER__: ((payload: RawGpsPayload) => void) | undefined;
}

const readSessionState = async (): Promise<BackgroundLocationSessionState | null> => {
  try {
    await sessionWriteChain;
    return await readStoredSessionState();
  } catch (error) {
    console.warn('[BackgroundLocationTask] Unable to read background session state', error);
    return null;
  }
};

const readStoredSessionState = async (): Promise<BackgroundLocationSessionState | null> => {
  try {
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
      const existing = await readStoredSessionState();
      const nextState = {
        ...((existing?.active && existing.runId === state.runId) ? existing : {}),
        ...state,
        pauseEvents: state.pauseEvents?.length
          ? state.pauseEvents
          : existing?.active && existing.runId === state.runId && existing.pauseEvents?.length
            ? existing.pauseEvents
            : state.pauseEvents ?? existing?.pauseEvents,
      };
      if (BACKGROUND_LOCATION_SESSION_URI) {
        await FileSystem.writeAsStringAsync(BACKGROUND_LOCATION_SESSION_URI, JSON.stringify(nextState));
        return;
      }
      await SecureStore.setItemAsync(SAFE_BACKGROUND_LOCATION_SESSION_KEY, JSON.stringify(nextState));
    } catch (error) {
      console.warn('[BackgroundLocationTask] Unable to persist background session state', error);
    }
  });
  return sessionWriteChain;
};

/** Update task metrics without replacing the latest UI-owned pause state. */
export const persistBackgroundLocationProgress = async (
  updates: Pick<BackgroundLocationSessionState, 'lastLocation' | 'updatedAt' | 'distanceKm' | 'extraDistanceKm' | 'elapsedSeconds' | 'paceMinutesPerKm'>,
): Promise<BackgroundLocationSessionState | null> => {
  let saved: BackgroundLocationSessionState | null = null;
  sessionWriteChain = sessionWriteChain.then(async () => {
    try {
      const latest = await readStoredSessionState();
      if (!latest?.active) return;
      saved = { ...latest, ...updates, paused: latest.paused, pauseEvents: latest.pauseEvents };
      if (BACKGROUND_LOCATION_SESSION_URI) {
        await FileSystem.writeAsStringAsync(BACKGROUND_LOCATION_SESSION_URI, JSON.stringify(saved));
      } else {
        await SecureStore.setItemAsync(SAFE_BACKGROUND_LOCATION_SESSION_KEY, JSON.stringify(saved));
      }
    } catch (error) {
      console.warn('[BackgroundLocationTask] Unable to persist background progress', error);
    }
  });
  await sessionWriteChain;
  return saved;
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
  listener?: (payload: RawGpsPayload) => void
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
  const taggedPayloads = tagLocationBatch(payloads, previous);

  // Keep the screen-on watchPositionAsync pipeline completely untouched. The
  // journal remains the durable hand-off when Android delivers a batch during
  // the active/background transition; duplicate points are ignored by the journal.
  const journaledPayloads = await appendActiveRunPoints(
    taggedPayloads,
    previous.paused ? 'pause' : previous.traceType ?? 'active',
  );

  // The foreground watchPositionAsync pipeline owns live handling while the
  // app is visible. The journal lets the AppState listener reconcile this batch.
  if (AppState.currentState === 'active') return;

  if (typeof globalThis.__ZYRUN_BACKGROUND_LOCATION_LISTENER__ === 'function') {
    journaledPayloads.forEach(globalThis.__ZYRUN_BACKGROUND_LOCATION_LISTENER__);
  }

  const journal = await readActiveRunJournal();
  const metricsSession = await readSessionState();
  if (!metricsSession?.active) return;
  const measuredDistances = journal?.points.slice(1).reduce((totals, point, index) => {
    const prior = journal.points[index];
    const priorType = prior.traceType ?? 'active';
    const pointType = point.traceType ?? 'active';
    if (priorType !== pointType) return totals;
    const segmentDistance = calculateDistanceMeters(prior, point);
    if (!isPlausibleJournalMovement(prior, point, segmentDistance)) return totals;
    if (pointType === 'extra') totals.extra += segmentDistance;
    else if (pointType !== 'pause') totals.active += segmentDistance;
    return totals;
  }, { active: 0, extra: 0 }) ?? { active: 0, extra: 0 };
  const distanceKm = measuredDistances.active / 1000;
  const extraDistanceKm = measuredDistances.extra / 1000;
  const now = Date.now();
  const startedAt = metricsSession.startedAt ? Date.parse(metricsSession.startedAt) : now;
  const pausedDurationMs = (metricsSession.pauseEvents ?? []).reduce((total, event) => {
    const pausedAt = Date.parse(event.paused_at);
    const resumedAt = event.resumed_at ? Date.parse(event.resumed_at) : now;
    if (!Number.isFinite(pausedAt)) return total;
    return total + Math.max(0, Math.min(now, resumedAt) - pausedAt);
  }, 0);
  const elapsedSeconds = Number.isFinite(startedAt)
    ? Math.max(0, (now - startedAt - pausedDurationMs) / 1000)
    : metricsSession.elapsedSeconds ?? 0;
  const paceDistanceKm = distanceKm + extraDistanceKm;
  const paceMinutesPerKm = paceDistanceKm > 0 ? elapsedSeconds / 60 / paceDistanceKm : 0;
  const updatedSession = await persistBackgroundLocationProgress({
    lastLocation: taggedPayloads.at(-1) ?? payload,
    updatedAt: now,
    distanceKm,
    extraDistanceKm,
    elapsedSeconds,
    paceMinutesPerKm,
  });
  if (!updatedSession) return;
  updateLiveTrackingNotification({
    runId: updatedSession.runId,
    distanceKm: paceDistanceKm,
    elapsedSeconds,
    paceMinutesPerKm,
    status: updatedSession.paused ? 'paused' : 'running',
    startedAt: updatedSession.startedAt,
  });

});

export const startBackgroundLocationTracking = async (): Promise<boolean> => {
  const permission = await Location.getBackgroundPermissionsAsync();
  if (!permission.granted) return false;
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME)) return true;

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
  return true;
};

export const stopBackgroundLocationTracking = async (): Promise<void> => {
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
  }
};
