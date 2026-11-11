
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { acknowledgeBootRestore, isBootRestorePending } from '../../modules/zyrun-live-update';
import { ActivityPauseEventPayload, RawGpsPayload } from '../types/running';
import { calculateActiveRunElapsedSeconds, calculateMovingPaceMinutesPerKm } from '../utils/activeRunMetrics';
import { isReliableRoutePoint } from '../utils/activityRouteGroups';
import { calculateAcceptedRouteDistance } from '../utils/routeDistance';
import {
  appendActiveRunPoints,
  appendPausedRunPoints,
  clearActiveRunJournal,
  flushActiveRunJournal,
  readActiveRunJournal,
} from './activeRunJournal';
import { getGpsOptimizationConfig } from './gpsOptimizationConfig';
import {
  stopLiveTrackingNotification,
  updateLiveTrackingNotification,
  WORKOUT_FOREGROUND_NOTIFICATION_ID,
} from './liveTrackingNotification';
import { savePendingWorkoutRecovery } from './pendingWorkoutRecoveries';

export const BACKGROUND_LOCATION_TASK_NAME = 'zyrun-background-location-task';
export const BACKGROUND_LOCATION_SESSION_KEY = 'zyrun:background-location-session';
const BACKGROUND_LOCATION_SESSION_URI = `${FileSystem.documentDirectory ?? ''}zyrun-background-location-session.json`;
const secureStoreKey = (rawKey: string): string => rawKey.replace(/[^a-zA-Z0-9._-]/g, '_');
const SAFE_BACKGROUND_LOCATION_SESSION_KEY = secureStoreKey(BACKGROUND_LOCATION_SESSION_KEY);
let sessionWriteChain: Promise<void> = Promise.resolve();
let backgroundTaskChain: Promise<void> = Promise.resolve();
let bootRestoreCheck: Promise<boolean> | null = null;
const backgroundLocationSessionListeners = new Set<
  (session: BackgroundLocationSessionState | null) => void
>();

export interface BackgroundLocationSessionState {
  active: boolean;
  status?: 'active' | 'paused' | 'finalizing' | 'completed' | 'cancelled' | 'pending_sync' | 'save_failed';
  paused?: boolean;
  autoPaused?: boolean;
  confirmationPromptVisible?: boolean;
  recoveryReviewRequired?: boolean;
  activityType?: 'RUN' | 'WALK';
  runId?: string | null;
  userId?: string | null;
  startedAt?: string | null;
  lastLocation?: RawGpsPayload | null;
  /** Timestamp of the latest GPS fix, separate from session-state updates. */
  lastLocationAt?: number | null;
  updatedAt?: number | null;
  distanceKm?: number;
  elapsedSeconds?: number;
  paceMinutesPerKm?: number;
  movementConfirmed?: boolean;
  pauseEvents?: Omit<ActivityPauseEventPayload, 'sequence' | 'paused_points'>[];
}

declare global {
  var __ZYRUN_BACKGROUND_LOCATION_LISTENER__: (
    (payload: RawGpsPayload, paused?: boolean, fromDurableJournal?: boolean) => void
  ) | undefined;
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
  await rejectPreBootSession();
  return readSessionState();
};

const rejectPreBootSession = async (): Promise<boolean> => {
  if (!bootRestoreCheck) {
    bootRestoreCheck = (async () => {
      if (!isBootRestorePending()) return false;

      const storedSession = await readSessionState();
      await flushActiveRunJournal();
      const journal = await readActiveRunJournal();
      const storedStatus = storedSession?.status ?? (storedSession?.active ? 'active' : 'missing');
      const terminalStatus = new Set(['finalizing', 'completed', 'cancelled', 'pending_sync', 'save_failed']);
      const isTerminalSession = Boolean(storedSession && terminalStatus.has(storedSession.status ?? ''));
      console.info('[BootRestore] BOOT_SESSION_CHECK_STARTED', {
        runId: storedSession?.runId ?? null,
        status: storedStatus,
      });
      console.info('[BootRestore] STORED_SESSION_FOUND', {
        runId: storedSession?.runId ?? null,
        found: Boolean(storedSession),
      });
      console.info('[BootRestore] STORED_SESSION_STATUS', {
        runId: storedSession?.runId ?? null,
        status: storedStatus,
      });
      const eligibleForReview = Boolean(
        storedSession?.active
        && storedSession.runId
        && !terminalStatus.has(storedSession.status ?? '')
        && journal?.active
        && journal.runId === storedSession.runId
      );
      console.info('[BootRestore] SESSION_ELIGIBLE_FOR_RESTORE', {
        runId: storedSession?.runId ?? null,
        status: storedStatus,
        eligible: eligibleForReview,
        reason: eligibleForReview
          ? 'Session checkpoint will be shown for recovery review after device reboot'
          : 'No active workout checkpoint is available for recovery review',
      });

      if (storedSession && (storedSession.status === 'completed' || storedSession.status === 'cancelled' || storedSession.status === 'pending_sync' || storedSession.status === 'save_failed')) {
        console.info('[BootRestore] COMPLETED_SESSION_DETECTED', {
          runId: storedSession.runId ?? null,
          status: storedSession.status,
        });
      }
      if (eligibleForReview && storedSession && journal) {
        await savePendingWorkoutRecovery(storedSession, journal);
      } else if (storedSession?.active && storedSession.runId) {
        const isAlreadyTerminal = terminalStatus.has(storedSession.status ?? '');
        await persistBackgroundLocationSession({
          ...storedSession,
          active: false,
          status: isAlreadyTerminal ? storedSession.status : 'cancelled',
          updatedAt: Date.now(),
        });
      }
      console.info('[BootRestore] SESSION_RESTORE_REJECTED', {
        runId: storedSession?.runId ?? null,
        status: storedStatus,
        reason: eligibleForReview
          ? 'Automatic tracking restore is paused until the workout recovery choice is made'
          : isTerminalSession
            ? 'The stored workout is already terminal'
            : 'No recoverable active workout checkpoint was found',
      });
      console.info('[NotificationLifecycle] LIVE_NOTIFICATION_RECREATION_BLOCKED', {
        runId: storedSession?.runId ?? null,
        status: storedStatus,
        reason: 'Device reboot invalidates the previous live run',
      });

      const serviceStopped = await stopBackgroundLocationTracking();
      await stopLiveTrackingNotification();
      await clearActiveRunJournal();
      if (eligibleForReview) await clearBackgroundLocationSession();
      console.info('[BootRestore] STALE_NOTIFICATION_CANCELLED', {
        runId: storedSession?.runId ?? null,
        status: storedStatus,
      });
      console.info('[BootRestore] FOREGROUND_SERVICE_RESTORE_SKIPPED', {
        runId: storedSession?.runId ?? null,
        status: storedStatus,
        serviceStopped,
      });
      console.info('[BootRestore] BACKGROUND_TRACKING_RESTORE_SKIPPED', {
        runId: storedSession?.runId ?? null,
        status: storedStatus,
        serviceStopped,
      });
      acknowledgeBootRestore();
      console.info('[BootRestore] SESSION_RESTORE_COMPLETED', {
        runId: storedSession?.runId ?? null,
        status: eligibleForReview
          ? 'recovery_review_required'
          : storedSession?.active
            ? (terminalStatus.has(storedSession.status ?? '') ? storedSession.status : 'cancelled')
            : storedStatus,
      });
      bootRestoreCheck = null;
      return true;
    })().catch((error) => {
      bootRestoreCheck = null;
      console.warn('[BootRestore] Boot session cleanup failed', error);
      return false;
    });
  }
  return bootRestoreCheck;
};

export const isBackgroundLocationTrackingStarted = async (): Promise<boolean> => {
  try {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
  } catch (error) {
    console.warn('[BackgroundLocationTask] Could not inspect the location task state', error);
    return false;
  }
};

export const subscribeToBackgroundLocationSession = (
  listener: (session: BackgroundLocationSessionState | null) => void
): (() => void) => {
  backgroundLocationSessionListeners.add(listener);
  return () => backgroundLocationSessionListeners.delete(listener);
};

const notifyBackgroundLocationSessionListeners = (
  session: BackgroundLocationSessionState | null
): void => {
  backgroundLocationSessionListeners.forEach((listener) => listener(session));
};

export const persistBackgroundLocationSession = async (
  state: BackgroundLocationSessionState,
  options: { notifyListeners?: boolean } = {}
): Promise<void> => {
  sessionWriteChain = sessionWriteChain.then(async () => {
    try {
      if (BACKGROUND_LOCATION_SESSION_URI) {
        await FileSystem.writeAsStringAsync(BACKGROUND_LOCATION_SESSION_URI, JSON.stringify(state));
      } else {
        await SecureStore.setItemAsync(SAFE_BACKGROUND_LOCATION_SESSION_KEY, JSON.stringify(state));
      }
      if (options.notifyListeners !== false) notifyBackgroundLocationSessionListeners(state);
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
      notifyBackgroundLocationSessionListeners(null);
    } catch (error) {
      console.warn('[BackgroundLocationTask] Unable to clear background session state', error);
    }
  });
  return sessionWriteChain;
};

export const setBackgroundLocationListener = (
  listener?: (payload: RawGpsPayload, paused?: boolean, fromDurableJournal?: boolean) => void
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

export const flushBackgroundLocationTask = (): Promise<void> => backgroundTaskChain;

TaskManager.defineTask(BACKGROUND_LOCATION_TASK_NAME, ({ data, error }) => {
  backgroundTaskChain = backgroundTaskChain
    .catch((previousError) => {
      console.warn('[BackgroundLocationTask] Previous task batch failed', previousError);
    })
    .then(async () => {
      if (await rejectPreBootSession()) return;
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
      if (
        !previous?.active
        || previous.status === 'finalizing'
        || previous.status === 'completed'
        || previous.status === 'cancelled'
        || previous.status === 'pending_sync'
        || previous.recoveryReviewRequired
      ) return;
      const paused = Boolean(previous.paused);
      const taskUpdatedAt = Date.now();

      const nextState: BackgroundLocationSessionState = {
        ...previous,
        active: true,
        status: paused ? 'paused' : 'active',
        lastLocation: payload,
        lastLocationAt: taskUpdatedAt,
        updatedAt: taskUpdatedAt,
      };
      nextState.elapsedSeconds = Math.floor(calculateActiveRunElapsedSeconds(previous, taskUpdatedAt));

      await persistBackgroundLocationSession(nextState, { notifyListeners: false });

      if (paused) {
        await appendPausedRunPoints(payloads, Math.max(1, previous.pauseEvents?.length ?? 1));
      } else {
        await appendActiveRunPoints(payloads);
      }

      const journal = await readActiveRunJournal();
      if (!paused && (journal?.points.length ?? 0) >= 2) {
        nextState.movementConfirmed = true;
      }
      const journalDistanceKm = calculateAcceptedRouteDistance(
        (journal?.points ?? [])
          .filter(isReliableRoutePoint)
          .map((point, index) => ({
            latitude: point.latitude,
            longitude: point.longitude,
            timestamp: Number(point.timestamp ?? index),
          })),
      ) / 1000;
      if (!paused && journal?.points.length && journal.points.length > 1) {
        nextState.distanceKm = Math.max(previous.distanceKm ?? 0, journalDistanceKm);
      }

      if (AppState.currentState === 'active') {
        await persistBackgroundLocationSession(nextState);
        return;
      }

      if (paused) {
        if (typeof globalThis.__ZYRUN_BACKGROUND_LOCATION_LISTENER__ === 'function') {
          payloads.forEach((point) => globalThis.__ZYRUN_BACKGROUND_LOCATION_LISTENER__?.(point, true, true));
        }
        return;
      }

      const distanceKm = nextState.distanceKm ?? previous.distanceKm ?? 0;
      const elapsedSeconds = nextState.elapsedSeconds ?? 0;
      const paceMinutesPerKm = calculateMovingPaceMinutesPerKm(elapsedSeconds, distanceKm);
      const currentSession = await readSessionState();
      if (!currentSession?.active || currentSession.runId !== previous.runId) return;
      updateLiveTrackingNotification({
        runId: previous.runId,
        distanceKm,
        elapsedSeconds,
        paceMinutesPerKm,
        status: 'running',
        startedAt: previous.startedAt,
      });
      nextState.distanceKm = distanceKm;
      nextState.elapsedSeconds = elapsedSeconds;
      nextState.paceMinutesPerKm = paceMinutesPerKm;
      await persistBackgroundLocationSession(nextState);

      if (typeof globalThis.__ZYRUN_BACKGROUND_LOCATION_LISTENER__ === 'function') {
        payloads.forEach((point) => globalThis.__ZYRUN_BACKGROUND_LOCATION_LISTENER__?.(point, false, true));
      }
    });

  return backgroundTaskChain;
});

export const startBackgroundLocationTracking = async (): Promise<void> => {
  console.info('[ServiceLifecycle] FOREGROUND_SERVICE_START_REQUESTED', {
    taskName: BACKGROUND_LOCATION_TASK_NAME,
  });
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME)) {
    console.info('[ServiceLifecycle] BACKGROUND_TASK_ALREADY_STARTED', {
      taskName: BACKGROUND_LOCATION_TASK_NAME,
    });
    return;
  }
  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1_000,
    distanceInterval: getGpsOptimizationConfig().locationUpdateDistanceMeters,
    foregroundService: {
      notificationTitle: 'Zy-Run - Tracking Live',
      notificationBody: `Tap to return to your active run (${WORKOUT_FOREGROUND_NOTIFICATION_ID}).`,
      notificationColor: '#20D000',
      killServiceOnDestroy: false,
    },
  });
  console.info('[ServiceLifecycle] BACKGROUND_TASK_STARTED', {
    taskName: BACKGROUND_LOCATION_TASK_NAME,
  });
  console.info('[ServiceLifecycle] FOREGROUND_SERVICE_STARTED', {
    taskName: BACKGROUND_LOCATION_TASK_NAME,
  });
};

export const stopBackgroundLocationTracking = async (): Promise<boolean> => {
  try {
    const wasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
    if (wasStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
    }
    const stopped = !(await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME));
    if (stopped && wasStarted) {
      console.info('[ServiceLifecycle] BACKGROUND_TASK_STOPPED', {
        taskName: BACKGROUND_LOCATION_TASK_NAME,
      });
      console.info('[ServiceLifecycle] FOREGROUND_SERVICE_STOPPED', {
        taskName: BACKGROUND_LOCATION_TASK_NAME,
      });
    }
    if (!stopped) {
      console.warn('[ServiceLifecycle] LOCATION_TASK_STILL_REGISTERED', {
        taskName: BACKGROUND_LOCATION_TASK_NAME,
      });
    }
    return stopped;
  } catch (error) {
    console.warn('[BackgroundLocationTask] Unable to stop background tracking cleanly', error);
    return false;
  }
};
