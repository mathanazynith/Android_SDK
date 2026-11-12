import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { dismissNativeRunNotification, updateNativeRunNotification } from '../../modules/zyrun-live-update';
import { storage } from '../../service/storage';
import { getDistanceUnitCode } from '../../utils/distanceUnit';

/** Reserved ID for the one native Android workout foreground notification. */
export const WORKOUT_FOREGROUND_NOTIFICATION_ID = 1001;
// Bump the channel ID when changing importance: Android keeps a channel's
// original importance and ignores attempts to raise it in place.
export const LIVE_TRACKING_CHANNEL_ID = 'zyrun-live-tracking-v3';
export const LIVE_TRACKING_ROUTE = '/(app)/screens/map';
export const LIVE_TRACKING_STOP_ACTION = 'zyrun-stop';
export const LIVE_TRACKING_PAUSE_ACTION = 'zyrun-pause';
export const LIVE_TRACKING_RESUME_ACTION = 'zyrun-resume';

export type LiveTrackingMetrics = {
  runId?: string | null;
  distanceKm: number;
  elapsedSeconds?: number;
  paceMinutesPerKm: number;
  status: 'running' | 'paused';
  startedAt?: string | number | null;
  distanceUnit?: 'km' | 'mile';
};

let configured = false;
let liveTrackingActive = false;
let authExitSuppressed = false;
let updateQueue: Promise<void> = Promise.resolve();
let generation = 0;
let lastPublishedDistanceKm: number | null = null;
let lastPublishedAt = 0;
let lastPublishedStatus: LiveTrackingMetrics['status'] | null = null;
let processingMessage: { title: string; body: string } | null = null;
const MIN_NOTIFICATION_DISTANCE_DELTA_KM = 0.01;
const MAX_NOTIFICATION_UPDATE_INTERVAL_MS = 5_000;

const formatPace = (paceMinutesPerKm: number): string => {
  if (!Number.isFinite(paceMinutesPerKm) || paceMinutesPerKm <= 0) return '--:--';
  const minutes = Math.floor(paceMinutesPerKm);
  const seconds = Math.round((paceMinutesPerKm - minutes) * 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const formatTime = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

const getDistanceUnit = async (metrics: LiveTrackingMetrics): Promise<'km' | 'mile'> => {
  if (metrics.distanceUnit) return metrics.distanceUnit;
  try {
    const rawUser = await storage.getItem(storage.KEYS.USER);
    const user = rawUser ? JSON.parse(rawUser) as { profile?: { distance_unit?: string | null } } : null;
    return getDistanceUnitCode(user?.profile?.distance_unit);
  } catch {
    return 'km';
  }
};

const notificationBody = (metrics: LiveTrackingMetrics, distanceUnit: 'km' | 'mile'): string => {
  const isMiles = distanceUnit === 'mile';
  const distance = isMiles ? metrics.distanceKm / 1.609344 : metrics.distanceKm;
  const paceMinutes = isMiles ? metrics.paceMinutesPerKm * 1.609344 : metrics.paceMinutesPerKm;
  return [
    `Distance: ${distance.toFixed(2)} ${isMiles ? 'mi' : 'km'}`,
    `Pace: ${formatPace(paceMinutes)} /${isMiles ? 'mi' : 'km'}`,
  ].join('  |  ');
};

const getStartTimestamp = (metrics: LiveTrackingMetrics): number => {
  if (typeof metrics.startedAt === 'number' && Number.isFinite(metrics.startedAt)) return metrics.startedAt;
  if (typeof metrics.startedAt === 'string') {
    const parsed = Date.parse(metrics.startedAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now() - Math.max(0, (metrics.elapsedSeconds ?? 0) * 1_000);
};

export async function configureLiveTrackingNotifications(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (configured) return true;

  await Notifications.setNotificationChannelAsync(LIVE_TRACKING_CHANNEL_ID, {
    name: 'Live workout metrics',
    description: 'Time, distance, and pace while a workout is active.',
    // Keep metric refreshes in the notification shade without creating
    // heads-up interruptions when a run starts or its metrics update.
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: null,
    enableVibrate: false,
  });

  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.granted) {
    configured = true;
    return true;
  }
  const requested = await Notifications.requestPermissionsAsync();
  configured = requested.granted;
  return configured;
}

const publish = async (metrics: LiveTrackingMetrics, currentGeneration: number): Promise<void> => {
  if (!liveTrackingActive || currentGeneration !== generation || !(await configureLiveTrackingNotifications())) return;
  const distanceUnit = await getDistanceUnit(metrics);
  if (Platform.OS === 'android') {
    const updatedNativeNotification = updateNativeRunNotification({
      runId: metrics.runId ?? null,
      distanceKm: metrics.distanceKm,
      elapsedSeconds: metrics.elapsedSeconds ?? 0,
      paceMinutesPerKm: metrics.paceMinutesPerKm,
      distanceUnit,
      status: metrics.status,
      startedAtMs: getStartTimestamp(metrics),
    });
    if (updatedNativeNotification) {
      await Notifications.dismissNotificationAsync(String(WORKOUT_FOREGROUND_NOTIFICATION_ID)).catch(() => undefined);
      console.info('[NotificationLifecycle] NOTIFICATION_UPDATED', {
        runId: metrics.runId ?? null,
        status: metrics.status,
        notificationId: WORKOUT_FOREGROUND_NOTIFICATION_ID,
      });
      return;
    }
  }

  const content = ({
    title: 'Zy-Run  |  Live workout',
    body: notificationBody(metrics, distanceUnit),
    data: { screen: LIVE_TRACKING_ROUTE, trackingActive: true },
    channelId: LIVE_TRACKING_CHANNEL_ID,
    when: getStartTimestamp(metrics),
    showWhen: true,
    usesChronometer: metrics.status === 'running',
    chronometerCountDown: false,
    ongoing: true,
    sticky: true,
    autoDismiss: false,
    onlyAlertOnce: true,
    priority: Notifications.AndroidNotificationPriority.HIGH,
  } as unknown) as Notifications.NotificationContentInput & { channelId: string };

  await Notifications.scheduleNotificationAsync({
    identifier: String(WORKOUT_FOREGROUND_NOTIFICATION_ID),
    content,
    trigger: null,
  });
  console.info('[NotificationLifecycle] LIVE_NOTIFICATION_CREATED', {
    runId: metrics.runId ?? null,
    status: metrics.status,
    notificationId: WORKOUT_FOREGROUND_NOTIFICATION_ID,
  });
  console.info('[NotificationLifecycle] NOTIFICATION_CREATED', {
    runId: metrics.runId ?? null,
    status: metrics.status,
    notificationId: WORKOUT_FOREGROUND_NOTIFICATION_ID,
  });
};

export async function publishWorkoutSummaryNotification(
  metrics: LiveTrackingMetrics,
  outcome: 'saved' | 'queued' = 'saved',
): Promise<void> {
  generation += 1;
  const currentGeneration = generation;
  processingMessage = null;
  updateQueue = updateQueue.then(async () => {
    if (authExitSuppressed || currentGeneration !== generation || !(await configureLiveTrackingNotifications())) return;
    if (authExitSuppressed || currentGeneration !== generation) return;
    const distanceUnit = await getDistanceUnit(metrics);
    const isMiles = distanceUnit === 'mile';
    const distance = isMiles ? metrics.distanceKm / 1.609344 : metrics.distanceKm;
    const paceMinutes = isMiles ? metrics.paceMinutesPerKm * 1.609344 : metrics.paceMinutesPerKm;
    const content = ({
      title: outcome === 'queued' ? 'Workout Saved Offline' : '🎉 Workout Saved!',
      body: [
        `Distance: ${distance.toFixed(2)} ${isMiles ? 'mi' : 'km'}`,
        `Pace: ${formatPace(paceMinutes)} /${isMiles ? 'mi' : 'km'}`,
        `Time: ${formatTime(metrics.elapsedSeconds ?? 0)}`,
        ...(outcome === 'queued' ? ['Will sync when connected.'] : []),
      ].join('  •  '),
      data: { screen: LIVE_TRACKING_ROUTE, trackingActive: false, workoutSummary: true },
      channelId: LIVE_TRACKING_CHANNEL_ID,
      when: Date.now(),
      showWhen: false,
      usesChronometer: false,
      chronometerCountDown: false,
      ongoing: false,
      sticky: false,
      autoDismiss: true,
      onlyAlertOnce: true,
      priority: Notifications.AndroidNotificationPriority.DEFAULT,
    } as unknown) as Notifications.NotificationContentInput & { channelId: string };

    await Notifications.scheduleNotificationAsync({
      identifier: String(WORKOUT_FOREGROUND_NOTIFICATION_ID),
      content,
      trigger: null,
    });
    console.info('[NotificationLifecycle] NOTIFICATION_CREATED', {
      runId: metrics.runId ?? null,
      status: 'summary',
      notificationId: WORKOUT_FOREGROUND_NOTIFICATION_ID,
    });
    lastPublishedDistanceKm = null;
    lastPublishedAt = 0;
    lastPublishedStatus = null;
  });
  await updateQueue;
}

export async function publishWorkoutDiscardedNotification(): Promise<void> {
  generation += 1;
  const currentGeneration = generation;
  processingMessage = null;
  updateQueue = updateQueue.then(async () => {
    if (authExitSuppressed || currentGeneration !== generation || !(await configureLiveTrackingNotifications())) return;
    if (authExitSuppressed || currentGeneration !== generation) return;
    const content = ({
      title: 'Workout Discarded',
      body: 'This workout was discarded and was not saved.',
      data: { screen: LIVE_TRACKING_ROUTE, trackingActive: false, workoutDiscarded: true },
      channelId: LIVE_TRACKING_CHANNEL_ID,
      showWhen: false,
      ongoing: false,
      sticky: false,
      autoDismiss: true,
      onlyAlertOnce: true,
      priority: Notifications.AndroidNotificationPriority.DEFAULT,
    } as unknown) as Notifications.NotificationContentInput & { channelId: string };

    await Notifications.scheduleNotificationAsync({
      identifier: String(WORKOUT_FOREGROUND_NOTIFICATION_ID),
      content,
      trigger: null,
    });
    lastPublishedDistanceKm = null;
    lastPublishedAt = 0;
    lastPublishedStatus = null;
    console.info('[NotificationLifecycle] NOTIFICATION_CREATED', {
      status: 'discarded',
      notificationId: WORKOUT_FOREGROUND_NOTIFICATION_ID,
    });
  });
  await updateQueue;
}

export async function startLiveTrackingNotification(metrics: LiveTrackingMetrics): Promise<void> {
  generation += 1;
  authExitSuppressed = false;
  liveTrackingActive = true;
  processingMessage = null;
  console.info('[NotificationLifecycle] LIVE_NOTIFICATION_CREATE_REQUESTED', {
    runId: metrics.runId ?? null,
    status: metrics.status,
  });
  lastPublishedDistanceKm = metrics.distanceKm;
  lastPublishedAt = Date.now();
  lastPublishedStatus = metrics.status;
  console.info('[NotificationLifecycle] LIVE_NOTIFICATION_CREATED', {
    runId: metrics.runId ?? null,
    status: metrics.status,
    notificationId: WORKOUT_FOREGROUND_NOTIFICATION_ID,
  });
  console.info('[NotificationLifecycle] NOTIFICATION_CREATED', {
    runId: metrics.runId ?? null,
    status: metrics.status,
    notificationId: WORKOUT_FOREGROUND_NOTIFICATION_ID,
  });
  await publish(metrics, generation);
}

export function updateLiveTrackingNotification(metrics: LiveTrackingMetrics): void {
  if (!liveTrackingActive || processingMessage) return;
  const now = Date.now();
  const distanceChanged = lastPublishedDistanceKm === null
    || Math.abs(metrics.distanceKm - lastPublishedDistanceKm) >= MIN_NOTIFICATION_DISTANCE_DELTA_KM;
  const statusChanged = metrics.status !== lastPublishedStatus;
  if (!distanceChanged && !statusChanged && now - lastPublishedAt < MAX_NOTIFICATION_UPDATE_INTERVAL_MS) return;

  lastPublishedDistanceKm = metrics.distanceKm;
  lastPublishedAt = now;
  lastPublishedStatus = metrics.status;
  const currentGeneration = generation;
  updateQueue = updateQueue
    .then(() => publish(metrics, currentGeneration))
    .catch((error) => console.warn('[LiveTrackingNotification] Update failed', error));
}

export function updateLiveTrackingNotificationMessage(
  message: { title: string; body: string },
  metrics: LiveTrackingMetrics,
): void {
  if (!liveTrackingActive) return;
  generation += 1;
  processingMessage = message;
  lastPublishedDistanceKm = metrics.distanceKm;
  lastPublishedAt = Date.now();
  lastPublishedStatus = metrics.status;
  const currentGeneration = generation;
  updateQueue = updateQueue
    .then(async () => {
      if (currentGeneration !== generation || !(await configureLiveTrackingNotifications())) return;
      if (Platform.OS === 'android') {
        const distanceUnit = await getDistanceUnit(metrics);
        const updatedNativeNotification = updateNativeRunNotification({
          runId: metrics.runId ?? null,
          distanceKm: metrics.distanceKm,
          elapsedSeconds: metrics.elapsedSeconds ?? 0,
          paceMinutesPerKm: metrics.paceMinutesPerKm,
          distanceUnit,
          status: metrics.status,
          startedAtMs: getStartTimestamp(metrics),
          messageTitle: message.title,
          messageBody: message.body,
        });
        if (updatedNativeNotification) {
          await Notifications.dismissNotificationAsync(String(WORKOUT_FOREGROUND_NOTIFICATION_ID)).catch(() => undefined);
          return;
        }
      }

      const content = ({
        title: message.title,
        body: message.body,
        data: { screen: LIVE_TRACKING_ROUTE, trackingActive: true, processing: true },
        channelId: LIVE_TRACKING_CHANNEL_ID,
        when: Date.now(),
        showWhen: false,
        usesChronometer: false,
        ongoing: true,
        sticky: true,
        autoDismiss: false,
        onlyAlertOnce: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      } as unknown) as Notifications.NotificationContentInput & { channelId: string };
      await Notifications.scheduleNotificationAsync({
        identifier: String(WORKOUT_FOREGROUND_NOTIFICATION_ID),
        content,
        trigger: null,
      });
    })
    .catch((error) => console.warn('[LiveTrackingNotification] Processing update failed', error));
}

export async function stopLiveTrackingNotification(): Promise<void> {
  generation += 1;
  liveTrackingActive = false;
  processingMessage = null;
  lastPublishedDistanceKm = null;
  lastPublishedAt = 0;
  lastPublishedStatus = null;
  updateQueue = updateQueue
    .catch((error) => console.warn('[LiveTrackingNotification] Pending update failed before dismissal', error))
    .then(async () => {
      dismissNativeRunNotification();
      console.info('[NotificationLifecycle] LIVE_NOTIFICATION_CANCELLED', {
        notificationId: WORKOUT_FOREGROUND_NOTIFICATION_ID,
      });
      console.info('[NotificationLifecycle] NOTIFICATION_CANCELLED', {
        notificationId: WORKOUT_FOREGROUND_NOTIFICATION_ID,
      });
      try {
        await Notifications.dismissNotificationAsync(String(WORKOUT_FOREGROUND_NOTIFICATION_ID));
      } catch (error) {
        console.warn('[LiveTrackingNotification] Could not dismiss scheduled notification', error);
      }
    });
  await updateQueue;
}

export async function clearLiveTrackingNotificationForAuthExit(): Promise<void> {
  authExitSuppressed = true;
  await stopLiveTrackingNotification();
}
