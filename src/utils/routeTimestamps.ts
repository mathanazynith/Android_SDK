interface TimedRoutePoint {
  latitude: number;
  longitude: number;
  timestamp?: string;
}

export const addRouteTimestamps = <T extends TimedRoutePoint>(
  points: T[],
  activityStart: string,
  activityEnd: string,
): T[] => {
  const startMilliseconds = Date.parse(activityStart);
  const endMilliseconds = Date.parse(activityEnd);
  const duration = endMilliseconds - startMilliseconds;

  if (!Number.isFinite(startMilliseconds) || !Number.isFinite(endMilliseconds) || duration < 0) {
    return points;
  }

  const lastIndex = Math.max(1, points.length - 1);
  return points.map((point, index) => ({
    ...point,
    timestamp: point.timestamp ?? new Date(
      startMilliseconds + (duration * index) / lastIndex
    ).toISOString(),
  }));
};
