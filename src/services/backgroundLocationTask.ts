
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import { RawGpsPayload } from '../types/running';
import { appendActiveRunPoints } from './activeRunJournal';

export const BACKGROUND_LOCATION_TASK_NAME = 'zyrun-background-location-task';
export const BACKGROUND_LOCATION_SESSION_KEY = 'zyrun:background-location-session';

export interface BackgroundLocationSessionState {
  active: boolean;
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

  const payloads = locations.map(hydrateLocationPayload);
  const payload = payloads[payloads.length - 1];
  const previous = await readSessionState();

  const nextState: BackgroundLocationSessionState = {
    active: true,
    runId: previous?.runId ?? null,
    userId: previous?.userId ?? null,
    startedAt: previous?.startedAt ?? null,
    lastLocation: payload,
    updatedAt: Date.now(),
  };

  await persistBackgroundLocationSession(nextState);
  await appendActiveRunPoints(payloads);

  if (typeof globalThis.__ZYRUN_BACKGROUND_LOCATION_LISTENER__ === 'function') {
    for (const location of payloads) globalThis.__ZYRUN_BACKGROUND_LOCATION_LISTENER__(location);
  }

  console.log(
    `[BackgroundLocationTask] lat=${payload.latitude} lon=${payload.longitude} ` +
      `acc=${payload.accuracy ?? 0}m speed=${payload.speed ?? 0}m/s`
  );
});
