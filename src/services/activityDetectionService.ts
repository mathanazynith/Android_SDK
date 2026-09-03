import { Platform } from 'react-native';
import * as Location from 'expo-location';

export type DetectedActivity =
  | 'running'
  | 'walking'
  | 'cycling'
  | 'automotive'
  | 'stationary'
  | 'unknown';

/**
 * Mirrors the iOS LocationManager's CMMotionActivity gate. Android activity
 * recognition is only active while the app is in the foreground, which is the
 * same limitation exposed by Expo's motion-activity watcher.
 */
export class ActivityDetectionService {
  private subscription: Location.LocationSubscription | null = null;
  private currentActivity: DetectedActivity = 'unknown';
  private recordingStartedAt: number | null = null;
  private available = false;

  public async start(recordingStartedAt = Date.now()): Promise<void> {
    this.stop();
    this.recordingStartedAt = recordingStartedAt;

    if (Platform.OS === 'web') {
      console.warn('[LocationManager] Activity monitoring is not available on web; GPS recording allowed');
      return;
    }

    try {
      const permission = await Location.requestMotionActivityPermissionsAsync();
      if (permission.status !== 'granted') {
        console.warn('[LocationManager] Activity recognition permission was not granted; GPS recording allowed');
        return;
      }

      this.available = true;
      this.subscription = await Location.watchMotionActivityAsync(
        (snapshot) => this.handleActivity(snapshot),
        (reason) => {
          this.available = false;
          console.warn(`[LocationManager] Activity monitoring error: ${reason}; GPS recording allowed`);
        }
      );
      console.log('[LocationManager] Activity monitoring started');
    } catch (error) {
      this.available = false;
      console.warn('[LocationManager] Activity monitoring is unavailable; GPS recording allowed', error);
    }
  }

  public stop(): void {
    this.subscription?.remove();
    this.subscription = null;
    this.available = false;
    this.currentActivity = 'unknown';
    this.recordingStartedAt = null;
  }

  public getCurrentActivity(): DetectedActivity {
    return this.currentActivity;
  }

  /** True only after Android has granted permission and the watcher is live. */
  public isAvailable(): boolean {
    return this.available;
  }

  private handleActivity(snapshot: Location.MotionActivityObject): void {
    const activities = snapshot.activities;
    const nextActivity: DetectedActivity = activities.running.detected
      ? 'running'
      : activities.walking.detected
        ? 'walking'
        : activities.cycling.detected
          ? 'cycling'
          : activities.automotive.detected
            ? 'automotive'
            : activities.stationary.detected
              ? 'stationary'
              : 'unknown';

    this.currentActivity = nextActivity;

    const label: Record<DetectedActivity, string> = {
      running: 'Running',
      walking: 'Walking',
      cycling: 'Cycling',
      automotive: 'Driving',
      stationary: 'Stationary',
      unknown: 'Unknown',
    };
    const isGracePeriod = this.recordingStartedAt !== null
      && Date.now() - this.recordingStartedAt < 5_000;
    const status = isGracePeriod
      ? 'CLASSIFIED (grace period; raw GPS retained)'
      : 'CLASSIFIED (raw GPS retained; filters apply on save)';

    console.log(`[LocationManager] Activity: ${label[nextActivity]} - ${status}`);
  }
}
