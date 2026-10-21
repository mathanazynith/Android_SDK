import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { storage } from '../../service/storage';
import { RawGpsPayload } from '../types/running';

export class LocationService {
  public static async requestForegroundPermissions(): Promise<boolean> {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;

    const requested = await Location.requestForegroundPermissionsAsync();
    return requested.granted;
  }

  /** Ask Android to enable its high-accuracy provider (GPS + Wi-Fi + mobile). */
  public static async enableHighAccuracyProvider(): Promise<void> {
    if (Platform.OS !== 'android') return;

    try {
      await Location.enableNetworkProviderAsync();
    } catch {
      console.warn('[LocationManager] High-accuracy location was not enabled; location updates may be less frequent indoors');
    }
  }

  public static async requestBackgroundPermissions(): Promise<boolean> {
    try {
      const current = await Location.getBackgroundPermissionsAsync();
      if (current.granted) return true;
      if (!current.canAskAgain) return false;

      const alreadyRequested = await storage.getItem(
        storage.KEYS.BACKGROUND_LOCATION_PERMISSION_REQUESTED,
      );
      if (alreadyRequested === 'true') return false;

      const requested = await Location.requestBackgroundPermissionsAsync();
      await storage.setItem(storage.KEYS.BACKGROUND_LOCATION_PERMISSION_REQUESTED, 'true');
      return requested.granted;
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
    let lastEmittedTimestamp = 0;
    let isActive = true;
    const emitLocation = (location: Location.LocationObject) => {
      if (!isActive) return;
      if (location.timestamp <= lastEmittedTimestamp) {
        return;
      }
      lastEmittedTimestamp = location.timestamp;
      const payload = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? 0,
        altitude: location.coords.altitude ?? 0,
        speed: location.coords.speed ?? 0,
        heading: location.coords.heading ?? 0,
        timestamp: location.timestamp,
      };

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
        emitLocation(location);
      },
      (reason) => {
        console.warn(`[LocationManager] GPS watcher error: ${reason}`);
      }
    );

    return {
      remove: () => {
        isActive = false;
        subscription.remove();
      },
    };
  }
}
