
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { RawGpsPayload } from '../types/running';
import { appendActiveRunPoints } from './activeRunJournal';

export const BACKGROUND_LOCATION_TASK_NAME = 'zyrun-background-location-task';
export const BACKGROUND_LOCATION_SESSION_KEY = 'zyrun:background-location-session';

export interface BackgroundLocationSessionState {
  active: boolean;
  paused?: boolean;
  runId?: string | null;
  userId?: string | null;
  startedAt?: string | null;
  lastLocation?: RawGpsPayload | null;
  updatedAt?: number | null;
}

declare global {
  var __ZYRUN_BACKGROUND_LOCATION_LISTENER__: ((payload: RawGpsPayload) => void) | undefined;
}

const readSessionState = async (): Promise<BackgroundLocationSessionState | null> => {
  try {
    const value = await SecureStore.getItemAsync(BACKGROUND_LOCATION_SESSION_KEY);
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
  try {
    await SecureStore.setItemAsync(BACKGROUND_LOCATION_SESSION_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[BackgroundLocationTask] Unable to persist background session state', error);
  }
};

export const clearBackgroundLocationSession = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(BACKGROUND_LOCATION_SESSION_KEY);
  } catch (error) {
    console.warn('[BackgroundLocationTask] Unable to clear background session state', error);
  }
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
  if (!previous?.active || previous.paused) return;

  const nextState: BackgroundLocationSessionState = {
    active: true,
    paused: false,
    runId: previous?.runId ?? null,
    userId: previous?.userId ?? null,
    startedAt: previous?.startedAt ?? null,
    lastLocation: payload,
    updatedAt: Date.now(),
  };

  await persistBackgroundLocationSession(nextState);

  // Keep the screen-on watchPositionAsync pipeline completely untouched. The
  // task records only fixes received after Android backgrounds the app.
  if (AppState.currentState === 'active') return;
  await appendActiveRunPoints(payloads);
  if (typeof globalThis.__ZYRUN_BACKGROUND_LOCATION_LISTENER__ === 'function') {
    payloads.forEach(globalThis.__ZYRUN_BACKGROUND_LOCATION_LISTENER__);
  }

  console.log(
    `[BackgroundLocationTask] lat=${payload.latitude} lon=${payload.longitude} ` +
      `acc=${payload.accuracy ?? 0}m speed=${payload.speed ?? 0}m/s`
  );
});

export const startBackgroundLocationTracking = async (): Promise<void> => {
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME)) return;
  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1_000,
    distanceInterval: 0,
    foregroundService: {
      notificationTitle: 'Workout tracking is active',
      notificationBody: 'Zy-Run is recording your route.',
      notificationColor: '#20D000',
      killServiceOnDestroy: false,
    },
  });
  console.log('[BackgroundLocationTask] Android foreground service started');
};

export const stopBackgroundLocationTracking = async (): Promise<void> => {
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
  }
  console.log('[BackgroundLocationTask] Android foreground service stopped');
};
