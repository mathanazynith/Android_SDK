import { Platform } from 'react-native';

let firebaseInitialized = false;

export function initFirebase(): boolean {
  if (firebaseInitialized) return true;
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getApps, initializeApp } = require('@react-native-firebase/app');
    const apps = getApps();
    if (apps && apps.length > 0) {
      firebaseInitialized = true;
      return true;
    }

    initializeApp({
      appId: '1:726240980883:android:d77495f94b3aad37d08266',
      apiKey: 'AIzaSyDPA4liTxpSLtJZOp_WY496jkRDRMeBg24',
      projectId: 'zyapp-6dafb',
      messagingSenderId: '726240980883',
      storageBucket: 'zyapp-6dafb.firebasestorage.app',
    });
    firebaseInitialized = true;
    return true;
  } catch (error) {
    console.warn(
      '[Firebase] Firebase native initialization unavailable (running in Expo Go or missing native modules):',
      error
    );
    return false;
  }
}

export function getSafeMessaging() {
  if (Platform.OS !== 'android') return null;

  try {
    if (!initFirebase()) return null;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getMessaging } = require('@react-native-firebase/messaging');
    return getMessaging();
  } catch (error) {
    console.warn('[Firebase] Firebase messaging is not available:', error);
    return null;
  }
}

