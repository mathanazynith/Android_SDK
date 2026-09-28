import { getMessaging, getToken } from '@react-native-firebase/messaging';
import { PermissionsAndroid, Platform } from 'react-native';

export async function requestFcmPermission() {
  if (Platform.OS !== 'android') {
    return false;
  }

  if (Platform.Version >= 33) {
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

    console.log('[FCM] FCM TOKEN:', token);

    return token;
  } catch (error) {
    console.error('[FCM] Failed to get FCM token:', error);
    return null;
  }
}