import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

interface NativeRunNotification {
  runId: string | null;
  distanceKm: number;
  elapsedSeconds: number;
  paceMinutesPerKm: number;
  status: 'running' | 'paused';
  startedAtMs: number;
}

interface NativeLiveUpdateModule {
  updateNotification: (data: NativeRunNotification) => boolean;
}

let nativeModule: NativeLiveUpdateModule | null | undefined;
let warnedUnavailable = false;

const getNativeModule = (): NativeLiveUpdateModule | null => {
  if (Platform.OS !== 'android') return null;
  if (nativeModule) return nativeModule;

  // Resolve lazily so importing the background location task never depends on
  // the island module being present in the current JS runtime (for example, in
  // a headless task or a build without the custom native module).
  try {
    nativeModule = requireNativeModule<NativeLiveUpdateModule>('ZYRunLiveUpdate');
    return nativeModule;
  } catch (error) {
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      console.warn('[LiveUpdate] Native notification module unavailable; using the Expo notification fallback', error);
    }
    return null;
  }
};

export const updateNativeRunNotification = (data: NativeRunNotification): boolean => {
  try {
    return getNativeModule()?.updateNotification(data) ?? false;
  } catch (error) {
    console.warn('[LiveUpdate] Native notification update failed', error);
    return false;
  }
};
