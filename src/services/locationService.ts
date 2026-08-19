import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { RawGpsPayload } from '../types/running';

export class LocationService {
  private static liveUpdateCount = 0;
  public static async requestForegroundPermissions(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  }

  /** Ask Android to enable its high-accuracy provider (GPS + Wi-Fi + mobile). */
  public static async enableHighAccuracyProvider(): Promise<void> {
    if (Platform.OS !== 'android') return;

    try {
      await Location.enableNetworkProviderAsync();
      console.log('[LocationManager] Android high-accuracy location provider enabled');
    } catch {
      console.warn('[LocationManager] High-accuracy location was not enabled; location updates may be less frequent indoors');
    }
  }

  public static async requestBackgroundPermissions(): Promise<boolean> {
    try {
      const { status } = await Location.requestBackgroundPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.warn(
        '[LocationManager] requestBackgroundPermissionsAsync rejected. Ensure the Android native manifest includes ACCESS_BACKGROUND_LOCATION and reinstall the app.'
      );
      console.warn(error);
      return false;
    }
  }

  public static async getCurrentLocation(): Promise<RawGpsPayload> {
    try {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      const payload = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        accuracy: current.coords.accuracy ?? 0,
        altitude: current.coords.altitude ?? 0,
        speed: current.coords.speed ?? 0,
        heading: current.coords.heading ?? 0,
        timestamp: current.timestamp,
      };

      console.log(
        `[LocationManager] currentLocation -> lat:${payload.latitude} lon:${payload.longitude} acc:${payload.accuracy}`
      );

      return payload;
    } catch (error) {
      console.warn(
        '[LocationManager] getCurrentPositionAsync failed; trying last known position'
      );

      try {
        const lastKnown = await Location.getLastKnownPositionAsync();

        if (!lastKnown) {
          throw new Error(
            'Current location is unavailable. Make sure that location services are enabled'
          );
        }

        const payload = {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
          accuracy: lastKnown.coords.accuracy ?? 0,
          altitude: lastKnown.coords.altitude ?? 0,
          speed: lastKnown.coords.speed ?? 0,
          heading: lastKnown.coords.heading ?? 0,
          timestamp: lastKnown.timestamp,
        };

        console.log(
          `[LocationManager] fallback lastKnown -> lat:${payload.latitude} lon:${payload.longitude} acc:${payload.accuracy}`
        );

        return payload;
      } catch (fallbackError) {
        console.error(
          '[LocationManager] Current location is unavailable. Make sure that location services are enabled'
        );
        throw new Error(
          'Current location is unavailable. Make sure that location services are enabled'
        );
      }
    }
  }

  public static async watchLocation(
    callback: (payload: RawGpsPayload) => void
  ): Promise<Location.LocationSubscription> {
    this.liveUpdateCount = 0;
    console.log('[LocationManager] GPS watcher starting: live raw points will be logged as they arrive');
    try {
      const status = await Location.getProviderStatusAsync();
      console.log(
        `[LocationManager] GPS provider status -> enabled:${status.locationServicesEnabled} gps:${status.gpsAvailable ?? 'unknown'} network:${status.networkAvailable ?? 'unknown'}`
      );
    } catch (error) {
      console.warn('[LocationManager] Unable to read GPS provider status', error);
    }

    let lastEmittedTimestamp = 0;
    let isActive = true;
    const emitLocation = (location: Location.LocationObject, source: 'watcher' | 'last-known') => {
      if (!isActive) return;
      if (location.timestamp <= lastEmittedTimestamp) {
        console.log(`[LocationManager] GPS ${source} update ignored: no fresh location fix yet`);
        return;
      }
      lastEmittedTimestamp = location.timestamp;
      this.liveUpdateCount += 1;
      const payload = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? 0,
        altitude: location.coords.altitude ?? 0,
        speed: location.coords.speed ?? 0,
        heading: location.coords.heading ?? 0,
        timestamp: location.timestamp,
      };

      console.log(
        `[LocationManager] GPS update #${this.liveUpdateCount} (${source}) -> lat:${payload.latitude} lon:${payload.longitude} acc:${payload.accuracy}m speed:${payload.speed}m/s heading:${payload.heading}`
      );
      const precision = payload.accuracy <= 10
        ? 'high'
        : payload.accuracy <= 25
          ? 'moderate (normal indoors)'
          : 'low';
      console.log(`[LocationManager] GPS precision: ${precision}; raw point is retained and save-time filtering decides the final payload`);
      callback(payload);
    };

    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        // Match the iOS live-map behaviour: request fresh callbacks while the
        // user is walking, including indoors. PathProcessor keeps these visual
        // points separate from the stricter save-time route.
        timeInterval: 1_000,
        distanceInterval: 0,
        mayShowUserSettingsDialog: true,
      },
      (location) => {
        emitLocation(location, 'watcher');
      },
      (reason) => {
        console.warn(`[LocationManager] GPS watcher error: ${reason}`);
      }
    );
    console.log('[LocationManager] GPS watcher active; requesting live updates at 1 second / 0 metres');

    return {
      remove: () => {
        isActive = false;
        subscription.remove();
        console.log('[LocationManager] GPS watcher stopped');
      },
    };
  }
}
