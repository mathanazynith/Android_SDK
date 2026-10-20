import { calculateDistanceMeters } from './distance';

/** A route must not imply a path through a gap that GPS did not record. */
export const MAX_ROUTE_POINT_GAP_MS = 5_000;
export const MAX_ROUTE_POINT_SPEED_METERS_PER_SECOND = 8;

export interface TimestampedCoordinate {
  latitude: number;
  longitude: number;
  timestamp: number | string | Date;
}

export const toRouteTimestampMilliseconds = (timestamp: number | string | Date): number => {
  if (timestamp instanceof Date) return timestamp.getTime();
  if (typeof timestamp === 'number') return timestamp;
  const numeric = Number(timestamp);
  return Number.isFinite(numeric) ? numeric : Date.parse(timestamp);
};

/** True only when connecting these fixes is a reasonable short GPS segment. */
export const canConnectRoutePoints = (
  previous: TimestampedCoordinate,
  current: TimestampedCoordinate,
): boolean => {
  const elapsedMs = toRouteTimestampMilliseconds(current.timestamp) - toRouteTimestampMilliseconds(previous.timestamp);
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || elapsedMs > MAX_ROUTE_POINT_GAP_MS) return false;

  const distance = calculateDistanceMeters(previous, current);
  return Number.isFinite(distance)
    && distance / (elapsedMs / 1_000) <= MAX_ROUTE_POINT_SPEED_METERS_PER_SECOND;
};

export const splitRouteAtGaps = <T extends TimestampedCoordinate>(points: T[]): T[][] => {
  const segments: T[][] = [];
  for (const point of points) {
    const current = segments.at(-1);
    if (!current || !canConnectRoutePoints(current.at(-1)!, point)) {
      segments.push([point]);
    } else {
      current.push(point);
    }
  }
  return segments;
};
