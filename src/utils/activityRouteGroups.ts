import type { BackendGpsPoint, BackendPauseEvent } from '../services/activityApi';

export interface ActivityRouteCoordinate {
  latitude: number;
  longitude: number;
}

export const MAX_ROUTE_POINT_ACCURACY_METERS = 15;

export const isReliableRoutePoint = (point: { accuracy?: number | null }) => (
  typeof point.accuracy === 'number'
  && Number.isFinite(point.accuracy)
  && point.accuracy >= 0
  && point.accuracy <= MAX_ROUTE_POINT_ACCURACY_METERS
);

export type ActivityRouteType = 'running' | 'pause' | 'extra';

export interface ActivityRouteGroup {
  type: ActivityRouteType;
  coordinates: ActivityRouteCoordinate[];
}

export interface ActivityPauseMarker {
  key: string;
  title: 'Paused' | 'Resumed';
  coordinate: ActivityRouteCoordinate;
}

const toRouteCoordinate = (value: {
  latitude?: unknown;
  longitude?: unknown;
} | null | undefined): ActivityRouteCoordinate | null => {
  if (!value) return null;
  const latitude = typeof value.latitude === 'string' && value.latitude.trim()
    ? Number(value.latitude)
    : value.latitude;
  const longitude = typeof value.longitude === 'string' && value.longitude.trim()
    ? Number(value.longitude)
    : value.longitude;
  if (
    typeof latitude !== 'number'
    || typeof longitude !== 'number'
    || !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || latitude < -90
    || latitude > 90
    || longitude < -180
    || longitude > 180
  ) return null;
  return { latitude, longitude };
};

const isEnabledFlag = (value: unknown): boolean => (
  value === true
  || value === 1
  || (typeof value === 'string' && ['true', '1'].includes(value.trim().toLowerCase()))
);

export const buildActivityRouteGroups = (
  points: BackendGpsPoint[] = [],
): ActivityRouteGroup[] => {
  const pointsWithReliableAccuracy = points.some((point) => typeof point.accuracy === 'number')
    ? points.filter(isReliableRoutePoint)
    : points;
  const indexedPoints = pointsWithReliableAccuracy.map((point, index) => ({
    point,
    index,
    timestamp: point.timestamp ? Date.parse(point.timestamp) : Number.NaN,
  }));
  const allPointsHaveTimestamps = indexedPoints.every(({ timestamp }) => Number.isFinite(timestamp));
  const orderedPoints = allPointsHaveTimestamps
    ? indexedPoints.sort((left, right) => left.timestamp - right.timestamp || left.index - right.index)
    : indexedPoints;
  const groups: ActivityRouteGroup[] = [];
  let previousCoordinate: ActivityRouteCoordinate | null = null;

  orderedPoints.forEach(({ point }) => {
    if (!isReliableRoutePoint(point)) return;
    const coordinate = toRouteCoordinate(point);
    if (!coordinate) return;
    const type: ActivityRouteType = isEnabledFlag(point.is_paused)
      ? 'pause'
      : isEnabledFlag(point.is_extra_distance)
        ? 'extra'
        : 'running';
    let group = groups.at(-1);
    if (!group || group.type !== type) {
      group = { type, coordinates: previousCoordinate ? [previousCoordinate] : [] };
      groups.push(group);
    }

    const lastCoordinate = group.coordinates.at(-1);
    if (
      !lastCoordinate
      || lastCoordinate.latitude !== coordinate.latitude
      || lastCoordinate.longitude !== coordinate.longitude
    ) {
      group.coordinates.push(coordinate);
    }
    previousCoordinate = coordinate;
  });

  return groups;
};

export const mergeActivityRouteGroups = (
  groups: ActivityRouteGroup[],
): ActivityRouteGroup[] => {
  const coordinates = groups.flatMap((group) => group.coordinates).filter((coordinate, index, all) => (
    index === 0
    || coordinate.latitude !== all[index - 1].latitude
    || coordinate.longitude !== all[index - 1].longitude
  ));
  return coordinates.length >= 2 ? [{ type: 'running', coordinates }] : [];
};

export const buildActivityPauseMarkers = (
  events: BackendPauseEvent[] = [],
  startTimestamp?: string,
  endTimestamp?: string,
): ActivityPauseMarker[] => {
  const start = startTimestamp ? Date.parse(startTimestamp) : Number.NaN;
  const end = endTimestamp ? Date.parse(endTimestamp) : Number.NaN;
  const hasCropRange = Number.isFinite(start) && Number.isFinite(end);

  return events.flatMap((event, index) => {
    const sequence = event.sequence ?? index + 1;
    const pauseTimestamp = event.paused_at ? Date.parse(event.paused_at) : Number.NaN;
    const resumeTimestamp = event.resumed_at ? Date.parse(event.resumed_at) : Number.NaN;
    const pauseLocation = toRouteCoordinate(event.pause_location);
    const resumeLocation = toRouteCoordinate(event.resume_location);
    return [
      ...(
        pauseLocation
        && (!hasCropRange || !Number.isFinite(pauseTimestamp) || (pauseTimestamp >= start && pauseTimestamp <= end))
          ? [{ key: `pause-${sequence}`, title: 'Paused' as const, coordinate: pauseLocation }]
          : []
      ),
      ...(
        resumeLocation
        && (!hasCropRange || !Number.isFinite(resumeTimestamp) || (resumeTimestamp >= start && resumeTimestamp <= end))
          ? [{ key: `resume-${sequence}`, title: 'Resumed' as const, coordinate: resumeLocation }]
          : []
      ),
    ];
  });
};
