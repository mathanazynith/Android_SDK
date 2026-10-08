import { getMessaging, getToken, onTokenRefresh } from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import { PermissionsAndroid, Platform } from 'react-native';

export async function requestFcmPermission() {
  if (Platform.OS !== 'android') {
    return false;
  }

  await Notifications.setNotificationChannelAsync('zyrun-business-notifications', {
    name: 'ZYRun notifications',
    description: 'Updates from Zy-Run',
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  if (Platform.Version >= 33) {
    const isGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
    if (isGranted) return true;

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );

    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  return true;
}

export async function getFcmToken() {
  try {
    const permissionGranted = await requestFcmPermission();

    if (!permissionGranted) {
      console.log('[FCM] Notification permission not granted');
      return null;
    }

    const token = await getToken(getMessaging());
    if (__DEV__) {
      console.info('[FCM] Device token acquired');
    }
    return token;
  } catch (error) {
    console.error('[FCM] Failed to get FCM token:', error);
    return null;
  }
}

export function subscribeToFcmTokenRefresh(listener) {
  if (Platform.OS !== 'android') {
    return () => {};
  }

  return onTokenRefresh(getMessaging(), listener);
}