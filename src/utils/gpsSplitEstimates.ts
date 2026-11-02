import { calculateDistanceMeters } from './distance';

export interface SplitGpsPoint {
  latitude: number;
  longitude: number;
  timestamp?: string;
}

export interface EstimatedSplit {
  split_number: number;
  distance_m: number;
  time_s: number;
  pace_s_per_km: number;
}

interface GpsInterval {
  distance: number;
  time: number;
}

export const estimateSplitsFromGps = (
  points: SplitGpsPoint[],
  splitDistanceMeters: number,
  targetDistanceMeters?: number,
  targetTimeSeconds?: number,
): EstimatedSplit[] => {
  if (!Number.isFinite(splitDistanceMeters) || splitDistanceMeters <= 0 || points.length < 2) return [];

  const intervals: GpsInterval[] = [];
  let routeDistance = 0;
  let routeTime = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (
      !Number.isFinite(previous.latitude)
      || !Number.isFinite(previous.longitude)
      || !Number.isFinite(current.latitude)
      || !Number.isFinite(current.longitude)
    ) continue;

    const distance = calculateDistanceMeters(previous, current);
    if (!Number.isFinite(distance) || distance <= 0) continue;

    const previousTimestamp = previous.timestamp ? Date.parse(previous.timestamp) : Number.NaN;
    const currentTimestamp = current.timestamp ? Date.parse(current.timestamp) : Number.NaN;
    const time = Number.isFinite(previousTimestamp) && Number.isFinite(currentTimestamp)
      ? Math.max(0, (currentTimestamp - previousTimestamp) / 1000)
      : 0;

    intervals.push({ distance, time });
    routeDistance += distance;
    routeTime += time;
  }

  if (routeDistance <= 0) return [];

  const distanceScale = Number.isFinite(targetDistanceMeters) && targetDistanceMeters! > 0
    ? targetDistanceMeters! / routeDistance
    : 1;
  const scaledDistance = routeDistance * distanceScale;
  const scaledTime = Number.isFinite(targetTimeSeconds) && targetTimeSeconds! >= 0
    ? targetTimeSeconds!
    : routeTime;
  const canScaleTimeByTimestamps = routeTime > 0;
  const splits: EstimatedSplit[] = [];
  let splitNumber = 1;
  let currentDistance = 0;
  let currentTime = 0;

  const pushSplit = (distance: number, time: number) => {
    if (distance <= 0) return;
    splits.push({
      split_number: splitNumber,
      distance_m: distance,
      time_s: time,
      pace_s_per_km: time / (distance / 1000),
    });
    splitNumber += 1;
  };

  for (const interval of intervals) {
    let remainingDistance = interval.distance * distanceScale;
    let remainingTime = canScaleTimeByTimestamps
      ? scaledTime * (interval.time / routeTime)
      : scaledTime * (interval.distance / routeDistance);

    while (remainingDistance > 0) {
      const distanceToBoundary = splitDistanceMeters - currentDistance;
      const distancePart = Math.min(distanceToBoundary, remainingDistance);
      const timePart = remainingDistance > 0
        ? remainingTime * (distancePart / remainingDistance)
        : 0;
      currentDistance += distancePart;
      currentTime += timePart;
      remainingDistance -= distancePart;
      remainingTime -= timePart;

      if (currentDistance >= splitDistanceMeters - 0.000001) {
        pushSplit(splitDistanceMeters, currentTime);
        currentDistance = 0;
        currentTime = 0;
      }
    }
  }

  if (currentDistance > 0.000001) {
    const completedDistance = splits.reduce((total, split) => total + split.distance_m, 0);
    const finalDistance = Math.max(0, scaledDistance - completedDistance);
    pushSplit(finalDistance || currentDistance, currentTime);
  }

  return splits;
};
