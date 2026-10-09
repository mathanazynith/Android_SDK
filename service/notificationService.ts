import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';
import { API_BASE_URL, notificationsAPI, type NotificationDeviceRegistration } from './api';
import { storage } from './storage';

export interface AppNotification {
  id: number | string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: AppNotification[];
}

export const getNotificationDestination = (
  type: string,
  data: Record<string, unknown> = {},
): string | null => {
  switch (type) {
    case 'PLAN_ENDING':
    case 'PLAN_UPDATED_BY_ADMIN':
      return '/(app)/running-plan';
    case 'WORKOUT_TODAY':
    case 'WORKOUT_TOMORROW':
    case 'BENCHMARK_WORKOUT_TODAY':
    case 'BENCHMARK_WORKOUT_TOMORROW':
      return '/(app)/calendar';
    case 'NEW_DEVICE_LOGIN':
    case 'PASSWORD_CHANGED':
      return '/(app)/dashboard';
    case 'RUN_SAVED_OTHER_DEVICE': {
      const activityId = data.activity_id;
      if (typeof activityId === 'number' && Number.isSafeInteger(activityId) && activityId > 0) {
        return `/(app)/activity/${activityId}`;
      }
      if (
        typeof activityId === 'string' &&
        /^\d+$/.test(activityId) &&
        Number.isSafeInteger(Number(activityId)) &&
        Number(activityId) > 0
      ) {
        return `/(app)/activity/${activityId}`;
      }
      return '/(app)/activity';
    }
    case 'GENERAL':
      return '/(app)/screens/notifications';
    default:
      return null;
  }
};

let deviceIdRequest: Promise<string> | null = null;
let registeredDeviceKey: string | null = null;
const pendingRegistrations = new Map<string, Promise<void>>();

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseNotification = (value: unknown): AppNotification => {
  if (!isObject(value)) throw new Error('Invalid notification item received.');

  const { id, type, title, message, data, is_read, read_at, created_at } = value;
  if (
    (typeof id !== 'number' && typeof id !== 'string') ||
    typeof type !== 'string' ||
    typeof title !== 'string' ||
    typeof message !== 'string' ||
    typeof is_read !== 'boolean' ||
    typeof created_at !== 'string'
  ) {
    throw new Error('Notification response does not match the documented item fields.');
  }

  return {
    id,
    type,
    title,
    message,
    data: isObject(data) ? data : {},
    is_read,
    read_at: typeof read_at === 'string' ? read_at : null,
    created_at,
  };
};

const validateNextPageUrl = (url: string): string => {
  const apiBase = new URL(`${API_BASE_URL}/`);
  const nextUrl = new URL(url, apiBase);
  if (
    nextUrl.origin !== apiBase.origin ||
    !nextUrl.pathname.startsWith(`${apiBase.pathname.replace(/\/$/, '')}/notifications/`)
  ) {
    throw new Error('The notification page link is not a trusted API URL.');
  }
  return nextUrl.toString();
};

export const getNotificationPage = async (nextUrl?: string | null): Promise<NotificationPage> => {
  const response = await notificationsAPI.list(nextUrl ? validateNextPageUrl(nextUrl) : undefined);
  const payload = response.data;
  if (!isObject(payload) || !Array.isArray(payload.results) || typeof payload.count !== 'number') {
    throw new Error('Notification list response does not match the documented paginated format.');
  }

  return {
    count: payload.count,
    next: typeof payload.next === 'string' ? payload.next : null,
    previous: typeof payload.previous === 'string' ? payload.previous : null,
    results: payload.results.map(parseNotification),
  };
};

export const getNotificationUnreadCount = async (): Promise<number> => {
  const response = await notificationsAPI.unreadCount();
  const payload = response.data;
  const count = typeof payload === 'number'
    ? payload
    : isObject(payload) && typeof payload.unread_count === 'number'
      ? payload.unread_count
      : isObject(payload) && typeof payload.count === 'number'
        ? payload.count
        : null;

  if (count === null || !Number.isInteger(count) || count < 0) {
    throw new Error('Unread count response must be a non-negative integer.');
  }
  return count;
};

export const markNotificationRead = (id: number | string): Promise<unknown> =>
  notificationsAPI.markRead(id).then((response) => response.data);

export const markAllNotificationsRead = (): Promise<unknown> =>
  notificationsAPI.markAllRead().then((response) => response.data);

const notificationDismissalKey = (userId: number): string =>
  `notification_dismissed_ids_${userId}`;

const pendingDismissalWrites = new Map<number, Promise<void>>();

export const getLocallyDismissedNotificationIds = async (userId: number): Promise<Set<string>> => {
  const storedIds = await storage.getItem(notificationDismissalKey(userId));
  if (storedIds === null) return new Set();

  let parsedIds: unknown;
  try {
    parsedIds = JSON.parse(storedIds);
  } catch (error) {
    throw new Error('Saved notification dismissals are corrupted and could not be read.', { cause: error });
  }
  if (!Array.isArray(parsedIds) || !parsedIds.every((id) => typeof id === 'string')) {
    throw new Error('Saved notification dismissals have an invalid format.');
  }
  return new Set(parsedIds);
};

export const saveLocallyDismissedNotification = async (
  userId: number,
  notificationId: number | string,
): Promise<void> => {
  const previousWrite = pendingDismissalWrites.get(userId);
  const write = (previousWrite ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const dismissedIds = await getLocallyDismissedNotificationIds(userId);
    dismissedIds.add(String(notificationId));
    await storage.setItem(notificationDismissalKey(userId), JSON.stringify([...dismissedIds]));
  });
  pendingDismissalWrites.set(userId, write);
  try {
    await write;
  } finally {
    if (pendingDismissalWrites.get(userId) === write) pendingDismissalWrites.delete(userId);
  }
};

const getDeviceId = async (): Promise<string> => {
  if (!deviceIdRequest) {
    deviceIdRequest = (async () => {
      const storedId = await storage.getItem(storage.KEYS.NOTIFICATION_DEVICE_ID);
      if (storedId) return storedId;

      const deviceId = randomUUID();
      await storage.setItem(storage.KEYS.NOTIFICATION_DEVICE_ID, deviceId);
      return deviceId;
    })().catch((error) => {
      deviceIdRequest = null;
      throw error;
    });
  }
  return deviceIdRequest;
};

export const getNotificationDevicePayload = async (
  fcmToken: string | null,
): Promise<NotificationDeviceRegistration> => {
  if (typeof fcmToken !== 'string' || !fcmToken.trim()) {
    throw new Error('A Firebase notification token is required to sign in on Android. Enable notifications and try again.');
  }

  const appVersion = Constants.expoConfig?.version;
  if (!appVersion) {
    throw new Error('App version is unavailable for notification device registration.');
  }

  return {
    device_id: await getDeviceId(),
    platform: 'ANDROID',
    fcm_token: fcmToken,
    app_version: appVersion,
  };
};

export const registerNotificationDevice = async (userId: number, fcmToken: string): Promise<void> => {
  if (Platform.OS !== 'android' || !fcmToken) return;

  const payload = await getNotificationDevicePayload(fcmToken);
  const registrationKey = `${userId}:${payload.device_id}:${fcmToken}`;
  if (registeredDeviceKey === registrationKey) return;

  const pendingRegistration = pendingRegistrations.get(registrationKey);
  if (pendingRegistration) return pendingRegistration;

  const request = notificationsAPI.registerDevice(payload).then(() => {
    registeredDeviceKey = registrationKey;
  }).finally(() => {
    pendingRegistrations.delete(registrationKey);
  });

  pendingRegistrations.set(registrationKey, request);
  return request;
};

export const deactivateNotificationDevice = async (userId: number): Promise<void> => {
  if (Platform.OS !== 'android') return;

  const deviceId = await storage.getItem(storage.KEYS.NOTIFICATION_DEVICE_ID);
  if (!deviceId) return;

  try {
    await notificationsAPI.deactivateDevice(deviceId);
  } finally {
    if (registeredDeviceKey?.startsWith(`${userId}:${deviceId}:`)) {
      registeredDeviceKey = null;
    }
  }
};