import type { RunningGpsPoint } from '../types/running';
import { calculateDistanceMeters } from './distance';

export interface RouteTimeInterval {
  startedAt: number;
  endedAt: number;
}

export interface RouteDistanceBreakdown {
  totalDistance: number;
  additionalDistance: number;
  workoutDistance: number;
}

export const filterRoutePointsByMaximumJump = (
  points: RunningGpsPoint[],
  maximumJumpDistance: number,
): RunningGpsPoint[] => points.reduce((accepted, point) => {
  const previous = accepted.at(-1);
  if (previous && calculateDistanceMeters(previous, point) >= maximumJumpDistance) {
    return accepted;
  }
  accepted.push(point);
  return accepted;
}, [] as RunningGpsPoint[]);

export const calculateAcceptedRouteDistance = (
  points: RunningGpsPoint[],
  excludedIntervals: RouteTimeInterval[] = [],
  includeSegment?: (point: RunningGpsPoint) => boolean,
): number => {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const crossesExcludedInterval = excludedIntervals.some((interval) => (
      interval.startedAt < current.timestamp && interval.endedAt > previous.timestamp
    ));
    if (crossesExcludedInterval || (includeSegment && !includeSegment(current))) continue;

    const distance = calculateDistanceMeters(previous, current);
    if (Number.isFinite(distance) && distance > 0 && distance < 50) {
      total += distance;
    }
  }
  return total;
};

export const calculateRouteDistanceBreakdown = (
  points: RunningGpsPoint[],
  excludedIntervals: RouteTimeInterval[] = [],
  isAdditionalDistancePoint?: (point: RunningGpsPoint) => boolean,
): RouteDistanceBreakdown => {
  const totalDistance = calculateAcceptedRouteDistance(points, excludedIntervals);
  const additionalDistance = isAdditionalDistancePoint
    ? calculateAcceptedRouteDistance(points, excludedIntervals, isAdditionalDistancePoint)
    : 0;

  return {
    totalDistance,
    additionalDistance,
    workoutDistance: Math.max(0, totalDistance - additionalDistance),
  };
};
