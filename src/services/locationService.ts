import * as Location from 'expo-location';
import { RawGpsPayload } from '../types/running';

export class LocationService {
  public static async requestForegroundPermissions(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
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
        accuracy: Location.Accuracy.Highest,
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
    console.log('[LocationManager] GPS watcher starting...');

    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Highest,
        timeInterval: 1000,
        distanceInterval: 2,
      },
      (location) => {
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
          `[LocationManager] currentLocation -> lat:${payload.latitude} lon:${payload.longitude} acc:${payload.accuracy} speed:${payload.speed}`
        );

        callback(payload);
      }
    );

    return subscription;
  }
}
