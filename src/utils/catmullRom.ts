import { RunningCoordinate } from '../types/running';

export interface CatmullRomConfig {
  subdivisions: number;
  maxJumpMeters: number;
}

export const DEFAULT_CATMULL_ROM_CONFIG: CatmullRomConfig = {
  subdivisions: 4,
  maxJumpMeters: 100,
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const distanceSquared = (first: RunningCoordinate, second: RunningCoordinate) => {
  const latitudeScale = 111_320;
  const longitudeScale = latitudeScale * Math.cos(toRadians(first.latitude));
  const deltaLatitude = (second.latitude - first.latitude) * latitudeScale;
  const deltaLongitude = (second.longitude - first.longitude) * longitudeScale;
  return deltaLatitude ** 2 + deltaLongitude ** 2;
};

const interpolate = (
  previous: RunningCoordinate,
  start: RunningCoordinate,
  end: RunningCoordinate,
  next: RunningCoordinate,
  amount: number
): RunningCoordinate => {
  const amountSquared = amount * amount;
  const amountCubed = amountSquared * amount;
  const latitude = 0.5 * (
    (2 * start.latitude)
    + (-previous.latitude + end.latitude) * amount
    + (2 * previous.latitude - 5 * start.latitude + 4 * end.latitude - next.latitude) * amountSquared
    + (-previous.latitude + 3 * start.latitude - 3 * end.latitude + next.latitude) * amountCubed
  );
  const longitude = 0.5 * (
    (2 * start.longitude)
    + (-previous.longitude + end.longitude) * amount
    + (2 * previous.longitude - 5 * start.longitude + 4 * end.longitude - next.longitude) * amountSquared
    + (-previous.longitude + 3 * start.longitude - 3 * end.longitude + next.longitude) * amountCubed
  );

  return { latitude, longitude };
};

const clampToSegmentBounds = (
  point: RunningCoordinate,
  start: RunningCoordinate,
  end: RunningCoordinate
): RunningCoordinate => {
  const latitudePadding = Math.abs(end.latitude - start.latitude) * 0.25;
  const longitudePadding = Math.abs(end.longitude - start.longitude) * 0.25;
  return {
    latitude: Math.max(
      Math.min(point.latitude, Math.max(start.latitude, end.latitude) + latitudePadding),
      Math.min(start.latitude, end.latitude) - latitudePadding
    ),
    longitude: Math.max(
      Math.min(point.longitude, Math.max(start.longitude, end.longitude) + longitudePadding),
      Math.min(start.longitude, end.longitude) - longitudePadding
    ),
  };
};

const removeStationaryPoints = (points: RunningCoordinate[]) => {
  const result: RunningCoordinate[] = [];
  for (const point of points) {
    if (result.length === 0 || distanceSquared(result[result.length - 1], point) > 0.01) {
      result.push(point);
    }
  }
  return result;
};

export const createCatmullRomPolyline = (
  points: RunningCoordinate[],
  config: CatmullRomConfig = DEFAULT_CATMULL_ROM_CONFIG
): RunningCoordinate[] => {
  const source = points.map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
  const usablePoints = removeStationaryPoints(source);

  if (usablePoints.length < 2) {  
    return source;
  }

  for (let index = 1; index < usablePoints.length; index += 1) {
    if (Math.sqrt(distanceSquared(usablePoints[index - 1], usablePoints[index])) > config.maxJumpMeters) {
      return source;
    }
  }

  const subdivisions = Math.max(2, Math.min(8, Math.floor(config.subdivisions)));
  const smoothed: RunningCoordinate[] = [usablePoints[0]];

  for (let index = 0; index < usablePoints.length - 1; index += 1) {
    const previous = usablePoints[Math.max(0, index - 1)];
    const start = usablePoints[index];
    const end = usablePoints[index + 1];
    const next = usablePoints[Math.min(usablePoints.length - 1, index + 2)];
    for (let step = 1; step <= subdivisions; step += 1) {
      const amount = step / subdivisions;
      const candidate = interpolate(previous, start, end, next, amount);
      const bounded = clampToSegmentBounds(candidate, start, end);
      const last = smoothed[smoothed.length - 1];
      if (distanceSquared(last, bounded) > 0.01) {
        smoothed.push(bounded);
      }
    }
  }

  return smoothed;
};
