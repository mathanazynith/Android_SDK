import { decodePolyline } from './polylineDecoder';

export interface ActivityCropRoutePoint {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  timestamp?: string;
  is_extra_distance?: boolean;
  is_paused?: boolean;
  pause_sequence?: number | null;
}

const toValidGPSPoints = (points: unknown): ActivityCropRoutePoint[] => {
  if (!Array.isArray(points)) return [];

  return points.flatMap((point) => {
    if (!point || typeof point !== 'object') return [];
    const value = point as Record<string, unknown>;
    const latitudeValue = value.latitude;
    const longitudeValue = value.longitude;
    const latitude = typeof latitudeValue === 'number'
      || (typeof latitudeValue === 'string' && latitudeValue.trim() !== '')
      ? Number(latitudeValue)
      : Number.NaN;
    const longitude = typeof longitudeValue === 'number'
      || (typeof longitudeValue === 'string' && longitudeValue.trim() !== '')
      ? Number(longitudeValue)
      : Number.NaN;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return [];

    return [{
      latitude,
      longitude,
      accuracy: typeof value.accuracy === 'number' ? value.accuracy : null,
      timestamp: typeof value.timestamp === 'string' ? value.timestamp : undefined,
      is_extra_distance: typeof value.is_extra_distance === 'boolean' ? value.is_extra_distance : false,
      is_paused: typeof value.is_paused === 'boolean' ? value.is_paused : false,
      pause_sequence: typeof value.pause_sequence === 'number' ? value.pause_sequence : null,
    }];
  });
};

export const getRichestActivityCropRoute = (
  candidates: unknown[],
  encodedPolyline?: string | null,
): ActivityCropRoutePoint[] => {
  const backendPoints = candidates.reduce<ActivityCropRoutePoint[]>((longest, candidate) => {
    const points = toValidGPSPoints(candidate);
    return points.length > longest.length ? points : longest;
  }, []);

  const encodedRoute = encodedPolyline?.trim();
  const decodedPoints = encodedRoute
    ? toValidGPSPoints(decodePolyline(encodedRoute))
    : [];

  return backendPoints.length >= decodedPoints.length ? backendPoints : decodedPoints;
};
