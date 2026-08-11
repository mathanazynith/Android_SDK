import * as Location from 'expo-location';
import { RawGpsPayload } from '../types/running';

export class LocationService {
  public static async requestForegroundPermissions(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  }

  public static async getCurrentLocation(): Promise<RawGpsPayload> {
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
    });

    return {
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
      accuracy: current.coords.accuracy ?? 0,
      altitude: current.coords.altitude ?? 0,
      speed: current.coords.speed ?? 0,
      heading: current.coords.heading ?? 0,
      timestamp: current.timestamp,
    };
  }

  public static async watchLocation(
    callback: (payload: RawGpsPayload) => void
  ): Promise<Location.LocationSubscription> {
    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Highest,
        timeInterval: 1000,
        distanceInterval: 2,
      },
      (location) => {
        callback({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy ?? 0,
          altitude: location.coords.altitude ?? 0,
          speed: location.coords.speed ?? 0,
          heading: location.coords.heading ?? 0,
          timestamp: location.timestamp,
        });
      }
    );

    return subscription;
  }
}
