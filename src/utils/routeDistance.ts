import type { RunningGpsPoint } from '../types/running';
import { calculateDistanceMeters } from './distance';

export interface RouteTimeInterval {
  startedAt: number;
  endedAt: number;
}

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
