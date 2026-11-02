import polyline from '@mapbox/polyline';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { BackendActivity, BackendGpsPoint } from './activityApi';

const MAX_GPX_CHARACTERS = 10_000_000;
const MAX_GPX_POINTS = 100_000;
const MAX_WORKOUT_DURATION_SECONDS = 72 * 60 * 60;
const LONG_GAP_WARNING_SECONDS = 15 * 60;
const EARTH_RADIUS_METERS = 6_371_000;

export interface GpxWorkoutPoint {
  latitude: number;
  longitude: number;
  altitude: number | null;
  timestamp: string;
}

export interface GpxWorkoutPreview {
  fileName: string;
  activityType: 'RUN' | 'WALK';
  points: GpxWorkoutPoint[];
  startTime: string;
  endTime: string;
  elapsedSeconds: number;
  distanceMeters: number;
  longGapCount: number;
}

export interface GpxActivityImportRequest {
  source: 'GPX';
  source_file_name: string;
  activity_type: 'RUN' | 'WALK';
  start_time: string;
  end_time: string;
  elapsed_time_s: number;
  distance_estimate_m: number;
  gps_points: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: null;
    speed: null;
    heading: null;
    timestamp: string;
    is_extra_distance: false;
    is_paused: false;
    pause_sequence: null;
  }[];
}

type XmlObject = Record<string, unknown>;
type GpxExportActivity = Pick<BackendActivity, 'id' | 'activity_type' | 'start_time' | 'end_time'>
  & Partial<Pick<BackendActivity, 'gps_points' | 'points' | 'coordinates' | 'route' | 'encoded_polyline'>>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: false,
});

const asObject = (value: unknown): XmlObject | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as XmlObject
    : null
);

const asArray = (value: unknown): unknown[] => (
  value === undefined || value === null
    ? []
    : Array.isArray(value)
      ? value
      : [value]
);

const readText = (value: unknown): string | null => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
);

const readFiniteNumber = (value: unknown): number | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const readPointGroups = (gpx: XmlObject, pointType: 'trkpt' | 'rtept' | 'wpt'): unknown[] => {
  if (pointType === 'trkpt') {
    return asArray(gpx.trk).flatMap((track) => {
      const trackObject = asObject(track);
      return asArray(trackObject?.trkseg).flatMap((segment) => (
        asArray(asObject(segment)?.trkpt)
      ));
    });
  }
  if (pointType === 'rtept') {
    return asArray(gpx.rte).flatMap((route) => (
      asArray(asObject(route)?.rtept)
    ));
  }
  return asArray(gpx.wpt);
};

const toIsoTimestamp = (value: unknown): string => {
  const rawTimestamp = readText(value);
  if (!rawTimestamp || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(rawTimestamp)) {
    throw new Error('Every GPX point must have a timestamp with a timezone.');
  }
  const timestamp = Date.parse(rawTimestamp);
  if (!Number.isFinite(timestamp)) {
    throw new Error('The GPX file contains an invalid timestamp.');
  }
  return new Date(timestamp).toISOString();
};

const haversineDistanceMeters = (left: GpxWorkoutPoint, right: GpxWorkoutPoint): number => {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const latitudeLeft = radians(left.latitude);
  const latitudeRight = radians(right.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeLeft) * Math.cos(latitudeRight) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

export const parseGpxWorkout = (xml: string, fileName: string): GpxWorkoutPreview => {
  if (xml.length === 0 || xml.length > MAX_GPX_CHARACTERS) {
    throw new Error('The GPX file is empty or larger than the 10 MB import limit.');
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error('GPX files containing document type declarations are not supported.');
  }

  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new Error('The selected file is not valid XML.');
  }

  const document = asObject(parser.parse(xml));
  const gpx = asObject(document?.gpx);
  if (!gpx) {
    throw new Error('The selected XML file does not have a GPX root element.');
  }

  const trackPoints = readPointGroups(gpx, 'trkpt');
  const routePoints = trackPoints.length > 0 ? [] : readPointGroups(gpx, 'rtept');
  const sourcePoints = trackPoints.length > 0
    ? trackPoints
    : routePoints.length > 0
      ? routePoints
      : readPointGroups(gpx, 'wpt');

  if (sourcePoints.length < 2) {
    throw new Error('The GPX file must contain at least two track, route, or waypoint points.');
  }
  if (sourcePoints.length > MAX_GPX_POINTS) {
    throw new Error(`The GPX file exceeds the ${MAX_GPX_POINTS.toLocaleString()} point limit.`);
  }

  const points = sourcePoints.map((sourcePoint, index): GpxWorkoutPoint => {
    const point = asObject(sourcePoint);
    const latitude = readFiniteNumber(point?.['@_lat'] ?? point?.lat);
    const longitude = readFiniteNumber(point?.['@_lon'] ?? point?.lon);
    if (
      latitude === null
      || longitude === null
      || latitude < -90
      || latitude > 90
      || longitude < -180
      || longitude > 180
    ) {
      throw new Error(`GPX point ${index + 1} has invalid latitude or longitude.`);
    }

    return {
      latitude,
      longitude,
      altitude: readFiniteNumber(point?.ele),
      timestamp: toIsoTimestamp(point?.time),
    };
  });

  let distanceMeters = 0;
  let longGapCount = 0;
  let previousTimestamp = Date.parse(points[0].timestamp);
  for (let index = 1; index < points.length; index += 1) {
    const timestamp = Date.parse(points[index].timestamp);
    if (timestamp < previousTimestamp) {
      throw new Error(`GPX point ${index + 1} has a timestamp earlier than the previous point.`);
    }
    const intervalSeconds = (timestamp - previousTimestamp) / 1000;
    if (intervalSeconds > LONG_GAP_WARNING_SECONDS) longGapCount += 1;
    distanceMeters += haversineDistanceMeters(points[index - 1], points[index]);
    previousTimestamp = timestamp;
  }

  const startTime = points[0].timestamp;
  const endTime = points[points.length - 1].timestamp;
  const elapsedSeconds = Math.round((Date.parse(endTime) - Date.parse(startTime)) / 1000);
  if (elapsedSeconds <= 0 || elapsedSeconds > MAX_WORKOUT_DURATION_SECONDS) {
    throw new Error('The GPX workout duration must be between 1 second and 72 hours.');
  }
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    throw new Error('The GPX points do not describe a measurable route.');
  }

  const typeValue = readText(
    asObject(asArray(gpx.trk)[0])?.type
    ?? asObject(asArray(gpx.rte)[0])?.type
    ?? gpx.type,
  )?.toLowerCase();

  return {
    fileName,
    activityType: typeValue?.includes('walk') ? 'WALK' : 'RUN',
    points,
    startTime,
    endTime,
    elapsedSeconds,
    distanceMeters,
    longGapCount,
  };
};

export const toGpxActivityImportRequest = (
  preview: GpxWorkoutPreview,
): GpxActivityImportRequest => ({
  source: 'GPX',
  source_file_name: preview.fileName,
  activity_type: preview.activityType,
  start_time: preview.startTime,
  end_time: preview.endTime,
  elapsed_time_s: preview.elapsedSeconds,
  distance_estimate_m: Math.round(preview.distanceMeters),
  gps_points: preview.points.map((point) => ({
    ...point,
    accuracy: null,
    speed: null,
    heading: null,
    is_extra_distance: false,
    is_paused: false,
    pause_sequence: null,
  })),
});

const escapeXml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const normalizeExportPoint = (value: unknown): BackendGpsPoint | null => {
  if (!value || typeof value !== 'object') return null;
  const point = value as Record<string, unknown>;
  const latitude = readFiniteNumber(point.latitude ?? point.lat);
  const longitude = readFiniteNumber(point.longitude ?? point.lon ?? point.lng);
  if (
    latitude === null
    || longitude === null
    || latitude < -90
    || latitude > 90
    || longitude < -180
    || longitude > 180
  ) return null;

  const altitude = readFiniteNumber(point.altitude ?? point.elevation ?? point.ele);
  const timestamp = readText(point.timestamp ?? point.time);
  return {
    latitude,
    longitude,
    ...(altitude !== null ? { altitude } : {}),
    ...(timestamp ? { timestamp } : {}),
  };
};

const hasReplayTimestamp = (point: BackendGpsPoint): boolean => {
  const timestamp = readText(point.timestamp);
  return Boolean(
    timestamp
    && /(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp)
    && Number.isFinite(Date.parse(timestamp)),
  );
};

const getActivityPoints = (activity: GpxExportActivity): BackendGpsPoint[] => {
  const candidates = [
    activity.route?.gps_points,
    activity.route?.points,
    activity.gps_points,
    activity.points,
    activity.coordinates,
  ];
  let firstUsableCandidate: BackendGpsPoint[] | null = null;
  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || candidate.length < 2) continue;
    const points = candidate
      .map(normalizeExportPoint)
      .filter((point): point is BackendGpsPoint => point !== null);
    if (points.length < 2) continue;
    if (!firstUsableCandidate) firstUsableCandidate = points;
    if (points.every(hasReplayTimestamp)) return points;
  }

  if (activity.encoded_polyline) {
    try {
      const points = polyline.decode(activity.encoded_polyline)
        .map(([latitude, longitude]) => normalizeExportPoint({ latitude, longitude }))
        .filter((point): point is BackendGpsPoint => point !== null);
      if (points.length >= 2) return points;
    } catch {
      throw new Error('This workout route has an invalid encoded GPS path and cannot be exported.');
    }
  }
  return firstUsableCandidate ?? [];
};

export const serializeActivityAsGpx = (activity: GpxExportActivity): string => {
  const points = getActivityPoints(activity);
  if (points.length < 2) {
    throw new Error('This workout does not have at least two valid GPS points to export a GPX track.');
  }
  if (points.length > MAX_GPX_POINTS) {
    throw new Error(`This workout exceeds the ${MAX_GPX_POINTS.toLocaleString()} point GPX limit.`);
  }
  if (!points.every(hasReplayTimestamp)) {
    throw new Error('This workout is missing valid GPS point timestamps, so it cannot be replayed as a timed GPX route.');
  }

  const title = `${activity.activity_type.toLowerCase()} workout ${activity.id}`;
  const pointXml = points.map((point) => {
    const altitude = readFiniteNumber(point.altitude);
    const timestamp = new Date(point.timestamp!).toISOString();
    const elevationXml = altitude === null ? '' : `\n        <ele>${altitude}</ele>`;
    return `      <trkpt lat="${point.latitude.toFixed(7)}" lon="${point.longitude.toFixed(7)}">${elevationXml}\n        <time>${timestamp}</time>\n      </trkpt>`;
  }).join('\n');

  const activityStartTimestamp = Date.parse(activity.start_time);
  const metadataTime = Number.isFinite(activityStartTimestamp)
    ? `\n    <time>${new Date(activityStartTimestamp).toISOString()}</time>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ZY-RUN" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(title)}</name>${metadataTime}
  </metadata>
  <trk>
    <name>${escapeXml(title)}</name>
    <type>${escapeXml(activity.activity_type.toLowerCase())}</type>
    <trkseg>
${pointXml}
    </trkseg>
  </trk>
</gpx>`;
};
