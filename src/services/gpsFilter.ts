import { RawGpsPayload, RunningGpsPoint } from '../types/running';
import { calculateDistanceMeters } from '../utils/distance';

export interface GpsFilterConfig {
  maxAccuracyMeters: number;
  minMovementDistanceMeters: number;
  maxReasonableRunningSpeedMetersPerSecond: number;
  maxJumpDistanceMeters: number;
}

export const DEFAULT_GPS_FILTER_CONFIG: GpsFilterConfig = {
  // Indoor / room tracking often starts from coarse fallback readings. Accepting a
  // much wider accuracy window avoids the sample being dropped before the path
  // processor sees it. Keep the movement distances small so a room walk has a
  // chance to become a visible, retained route instead of only a single startup coordinate.
  maxAccuracyMeters: 2000,
  minMovementDistanceMeters: 0.5,
  maxReasonableRunningSpeedMetersPerSecond: 16,
  maxJumpDistanceMeters: 80,
};

export class GpsFilter {
  constructor(private readonly config: GpsFilterConfig = DEFAULT_GPS_FILTER_CONFIG) {}

  public validateRawPoint(raw: RawGpsPayload): RawGpsPayload | null {
    if (
      raw === null ||
      typeof raw !== 'object' ||
      !Number.isFinite(raw.latitude) ||
      !Number.isFinite(raw.longitude) ||
      raw.latitude < -90 ||
      raw.latitude > 90 ||
      raw.longitude < -180 ||
      raw.longitude > 180
    ) {
      return null;
    }

    if (raw.accuracy !== undefined && raw.accuracy !== null && raw.accuracy > this.config.maxAccuracyMeters) {
      return null;
    }

    if (raw.speed !== undefined && raw.speed !== null && raw.speed > this.config.maxReasonableRunningSpeedMetersPerSecond) {
      return null;
    }

    return raw;
  }

  public rejectDuplicate(lastAccepted: RunningGpsPoint | null, candidate: RawGpsPayload): boolean {
    if (!lastAccepted) {
      return false;
    }

    const distance = calculateDistanceMeters(
      { latitude: lastAccepted.latitude, longitude: lastAccepted.longitude },
      { latitude: candidate.latitude, longitude: candidate.longitude }
    );

    return distance < this.config.minMovementDistanceMeters;
  }

  public smoothPoint(
    last: RunningGpsPoint | null,
    candidate: RawGpsPayload
  ): { latitude: number; longitude: number } {
    if (!last) {
      return {
        latitude: candidate.latitude,
        longitude: candidate.longitude,
      };
    }

    const alpha = 0.38;
    const filteredLatitude = alpha * candidate.latitude + (1 - alpha) * last.latitude;
    const filteredLongitude = alpha * candidate.longitude + (1 - alpha) * last.longitude;

    return {
      latitude: filteredLatitude,
      longitude: filteredLongitude,
    };
  }

  public snapshotSummary(rawCount: number, optimizedCount: number): number {
    if (rawCount === 0) {
      return 0;
    }

    return Math.max(0, Math.round(((rawCount - optimizedCount) / rawCount) * 100));
  }
}
