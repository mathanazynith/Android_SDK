import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/** Reserved ID for the one native Android workout foreground notification. */
export const WORKOUT_FOREGROUND_NOTIFICATION_ID = 1001;
export const LIVE_TRACKING_CHANNEL_ID = 'zyrun-live-tracking';
export const LIVE_TRACKING_ROUTE = '/(app)/screens/map';
export const LIVE_TRACKING_STOP_ACTION = 'zyrun-stop';

type LiveTrackingMetrics = {
  distanceKm: number;
  elapsedSeconds?: number;
  paceMinutesPerKm: number;
  status: 'running' | 'paused';
  startedAt?: string | number | null;
};

let configured = false;
let updateQueue: Promise<void> = Promise.resolve();
let generation = 0;
let lastPublishedDistanceKm: number | null = null;
let lastPublishedAt = 0;
let lastPublishedStatus: LiveTrackingMetrics['status'] | null = null;
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

const notificationBody = (metrics: LiveTrackingMetrics): string => [
  `Distance: ${metrics.distanceKm.toFixed(2)} km`,
  `Pace: ${formatPace(metrics.paceMinutesPerKm)} /km`,
].join('  |  ');

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
    importance: Notifications.AndroidImportance.LOW,
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
  if (currentGeneration !== generation || !(await configureLiveTrackingNotifications())) return;
  const content = ({
    title: 'Zy-Run  |  Live workout',
    body: notificationBody(metrics),
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
    priority: Notifications.AndroidNotificationPriority.DEFAULT,
  } as unknown) as Notifications.NotificationContentInput & { channelId: string };

  await Notifications.scheduleNotificationAsync({
    identifier: String(WORKOUT_FOREGROUND_NOTIFICATION_ID),
    content,
    trigger: null,
  });
};

export async function publishWorkoutSummaryNotification(metrics: LiveTrackingMetrics): Promise<void> {
  generation += 1;
  updateQueue = updateQueue.then(async () => {
    if (!(await configureLiveTrackingNotifications())) return;
    const content = ({
      title: '🎉 Workout Saved!',
      body: `Distance: ${metrics.distanceKm.toFixed(2)} km  •  Pace: ${formatPace(metrics.paceMinutesPerKm)} /km  •  Time: ${formatTime(metrics.elapsedSeconds ?? 0)}`,
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
    lastPublishedDistanceKm = null;
    lastPublishedAt = 0;
    lastPublishedStatus = null;
  });
  await updateQueue;
}

export async function startLiveTrackingNotification(metrics: LiveTrackingMetrics): Promise<void> {
  generation += 1;
  lastPublishedDistanceKm = metrics.distanceKm;
  lastPublishedAt = Date.now();
  lastPublishedStatus = metrics.status;
  await publish(metrics, generation);
}

export function updateLiveTrackingNotification(metrics: LiveTrackingMetrics): void {
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

export async function stopLiveTrackingNotification(): Promise<void> {
  generation += 1;
  updateQueue = Promise.resolve();
  lastPublishedDistanceKm = null;
  lastPublishedAt = 0;
  lastPublishedStatus = null;
}
