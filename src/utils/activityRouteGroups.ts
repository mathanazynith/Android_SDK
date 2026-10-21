import type { BackendGpsPoint, BackendPauseEvent } from '../services/activityApi';

export interface ActivityRouteCoordinate {
  latitude: number;
  longitude: number;
}

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

export const buildActivityRouteGroups = (
  points: BackendGpsPoint[] = [],
): ActivityRouteGroup[] => {
  const indexedPoints = points.map((point, index) => ({
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
    const coordinate = toRouteCoordinate(point);
    if (!coordinate) return;
    const type: ActivityRouteType = point.is_paused
      ? 'pause'
      : point.is_extra_distance
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
