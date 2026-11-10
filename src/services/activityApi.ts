import polyline from '@mapbox/polyline';
import api from '../../service/api';
import { storage } from '../../service/storage';
import { ActivityExtraSplits, ActivityLapRecord, ActivitySegmentSplits, ActivitySplit, SPLIT_DISTANCE_METERS } from '../types/activity';
import { calculateDistanceMeters } from '../utils/distance';
import { activityDistanceOverrides } from './activityDistanceOverrides';
import { activityTimingOverrides } from './activityTimingOverrides';
import { toGpxActivityImportRequest, type GpxWorkoutPreview } from './gpxService';

export interface BackendGpsPoint {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  timestamp?: string;
  is_extra_distance?: boolean;
  is_paused?: boolean;
  pause_sequence?: number | null;
}

export interface BackendPolylineRoute {
  sequence: number;
  encoded_polyline: string | null;
  point_count: number;
}

export interface BackendPauseEvent {
  sequence?: number;
  paused_at?: string;
  resumed_at?: string | null;
  duration_s?: number | null;
  pause_location?: BackendGpsPoint | { latitude?: number; longitude?: number } | null;
  resume_location?: BackendGpsPoint | { latitude?: number; longitude?: number } | null;
}

const getPointTimestamp = (point: BackendGpsPoint): number | null => {
  if (!point.timestamp) return null;
  const timestamp = Date.parse(point.timestamp);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const createSplitsFromGpsPoints = (points: BackendGpsPoint[], splitDistanceMeters: number): ActivitySplit[] => {
  if (!Number.isFinite(splitDistanceMeters) || splitDistanceMeters <= 0) return [];
  if (points.length < 2) return [];

  const splits: ActivitySplit[] = [];
  let splitNumber = 1;
  let splitDistance = 0;
  let splitTime = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const distance = calculateDistanceMeters(previous, current);
    if (!Number.isFinite(distance) || distance <= 0) continue;

    const previousTime = getPointTimestamp(previous);
    const currentTime = getPointTimestamp(current);
    const intervalTime = previousTime !== null && currentTime !== null
      ? Math.max(0, (currentTime - previousTime) / 1000)
      : 0;
    let remainingDistance = distance;
    let remainingTime = intervalTime;

    while (remainingDistance > 0) {
      const distanceToBoundary = splitDistanceMeters - splitDistance;
      const distancePart = Math.min(distanceToBoundary, remainingDistance);
      const timePart = remainingDistance > 0
        ? remainingTime * (distancePart / remainingDistance)
        : 0;
      splitDistance += distancePart;
      splitTime += timePart;
      remainingDistance -= distancePart;
      remainingTime -= timePart;

      if (splitDistance >= splitDistanceMeters - 0.000001) {
        splits.push({
          split_number: splitNumber,
          distance_m: splitDistanceMeters,
          time_s: splitTime,
          pace_s_per_km: splitTime / (splitDistanceMeters / 1000),
        });
        splitNumber += 1;
        splitDistance = 0;
        splitTime = 0;
      }
    }
  }

  if (splitDistance > 0.000001) {
    splits.push({
      split_number: splitNumber,
      distance_m: splitDistance,
      time_s: splitTime,
      pace_s_per_km: splitTime / (splitDistance / 1000),
    });
  }

  return splits;
};

const getActivityPoints = (value: Record<string, unknown>): BackendGpsPoint[] => {
  const route = value.route && typeof value.route === 'object'
    ? value.route as Record<string, unknown>
    : {};
  const candidates = [value.gps_points, value.points, value.coordinates, route.points, route.gps_points, route.coordinates];
  const points = candidates.find((candidate): candidate is BackendGpsPoint[] => (
    Array.isArray(candidate) && candidate.length >= 2
  ));
  return points ?? [];
};

const getLapGpsPoints = (value: Record<string, unknown>): BackendGpsPoint[] => {
  const route = value.route && typeof value.route === 'object'
    ? value.route as Record<string, unknown>
    : {};
  const candidates = [value.gps_points, value.points, value.coordinates, route.points, route.gps_points, route.coordinates];
  return candidates.find((candidate): candidate is BackendGpsPoint[] => (
    Array.isArray(candidate) && candidate.length > 0
  )) ?? [];
};

const parseTimestamp = (value: unknown): number | null => {
  const timestamp = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Date.parse(value)
      : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
};

const optionalNumber = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return undefined;
};

const pauseSecondsBetween = (
  pauses: unknown[],
  intervalStart: number,
  intervalEnd: number,
  activityEnd: number,
): number => pauses.reduce<number>((total, pause) => {
  if (!pause || typeof pause !== 'object') return total;
  const value = pause as Record<string, unknown>;
  const pauseStart = parseTimestamp(value.paused_at);
  const pauseEnd = parseTimestamp(value.resumed_at) ?? activityEnd;
  if (pauseStart === null || pauseEnd <= pauseStart) return total;
  const overlap = Math.max(0, Math.min(intervalEnd, pauseEnd) - Math.max(intervalStart, pauseStart));
  return total + overlap / 1000;
}, 0);

const distanceBetweenPoints = (
  points: BackendGpsPoint[],
  intervalStart: number,
  intervalEnd: number,
): number | undefined => {
  let distance = 0;
  let foundTimedPair = false;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous.is_paused || current.is_paused || previous.is_extra_distance || current.is_extra_distance) continue;
    const previousTime = getPointTimestamp(previous);
    const currentTime = getPointTimestamp(current);
    if (previousTime === null || currentTime === null || currentTime <= previousTime) continue;
    const overlapStart = Math.max(intervalStart, previousTime);
    const overlapEnd = Math.min(intervalEnd, currentTime);
    if (overlapEnd <= overlapStart) continue;
    const segmentDistance = calculateDistanceMeters(previous, current);
    if (!Number.isFinite(segmentDistance) || segmentDistance <= 0) continue;
    distance += segmentDistance * ((overlapEnd - overlapStart) / (currentTime - previousTime));
    foundTimedPair = true;
  }
  return foundTimedPair ? distance : undefined;
};

const normalizeLapRecords = (value: Record<string, unknown>): ActivityLapRecord[] => {
  const backendLaps = Array.isArray(value.laps) ? value.laps : [];
  const lapEvents = Array.isArray(value.lap_events) ? value.lap_events : [];
  const points = getLapGpsPoints(value);
  const pauses = Array.isArray(value.pause_events)
    ? value.pause_events
    : Array.isArray(value.pauses)
      ? value.pauses
      : [];
  const activityStart = parseTimestamp(value.start_time ?? value.started_at);
  const activityEnd = parseTimestamp(value.end_time ?? value.ended_at) ?? Date.now();

  if (backendLaps.length > 0) {
    return backendLaps.flatMap((lap, index) => {
      if (!lap || typeof lap !== 'object') return [];
      const item = lap as Record<string, unknown>;
      const sequence = Math.max(1, Math.floor(toNumber(item.lap_number ?? item.event_number ?? item.sequence, index + 1)));
      const segmentType = String(item.segment_type ?? item.type ?? '').replace(/[-_]/g, ' ').trim();
      const repeat = optionalNumber(item.repeat_number);
      const repeats = optionalNumber(item.total_repeats);
      const label = segmentType
        ? `${segmentType}${repeat !== undefined ? ` ${repeat}${repeats !== undefined ? `/${repeats}` : ''}` : ''}`
        : `Lap ${sequence}`;
      const distance = optionalNumber(item.distance_meters, item.distance_m, item.distance);
      const time = optionalNumber(item.duration_seconds, item.time_s, item.duration);
      const pace = optionalNumber(item.pace_seconds_per_km, item.pace_s_per_km, item.pace)
        ?? (distance !== undefined && distance > 0 && time !== undefined ? time / (distance / 1000) : undefined);
      return [{
        sequence,
        label,
        timestamp: typeof item.timestamp === 'string' ? item.timestamp : undefined,
        distance_m: distance,
        time_s: time,
        pace_s_per_km: pace,
      }];
    });
  }

  let previousBoundary = activityStart;
  return lapEvents.flatMap((event, index) => {
    if (!event || typeof event !== 'object') return [];
    const item = event as Record<string, unknown>;
    const eventTimestamp = parseTimestamp(item.timestamp ?? item.ended_at);
    const sequence = Math.max(1, Math.floor(toNumber(item.split_number ?? item.event_number ?? item.sequence, index + 1)));
    const distance = optionalNumber(item.distance_m, item.distance_meters, item.distance)
      ?? (eventTimestamp !== null && previousBoundary !== null
        ? distanceBetweenPoints(points, previousBoundary, eventTimestamp)
        : undefined);
    const suppliedTime = optionalNumber(item.time_s, item.duration_seconds, item.duration);
    const time = suppliedTime ?? (eventTimestamp !== null && previousBoundary !== null
      ? Math.max(0, (eventTimestamp - previousBoundary) / 1000
        - pauseSecondsBetween(pauses, previousBoundary, eventTimestamp, activityEnd))
      : undefined);
    const pace = optionalNumber(item.pace_s_per_km, item.pace)
      ?? (distance !== undefined && distance > 0 && time !== undefined ? time / (distance / 1000) : undefined);
    if (eventTimestamp !== null) previousBoundary = eventTimestamp;
    if (eventTimestamp === null && time === undefined && distance === undefined) return [];
    return [{
      sequence,
      label: `Lap ${sequence}`,
      timestamp: typeof item.timestamp === 'string' ? item.timestamp : undefined,
      distance_m: distance,
      time_s: time,
      pace_s_per_km: pace,
    }];
  });
};

const toNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalizeSplit = (value: unknown, index: number): ActivitySplit | null => {
  if (!value || typeof value !== 'object') return null;
  const split = value as Record<string, unknown>;
  const distance = toNumber(split.distance_m ?? split.distance);
  const time = toNumber(split.time_s ?? split.duration_s ?? split.duration);
  if (distance <= 0 || time < 0) return null;
  return {
    split_number: Math.max(1, Math.floor(toNumber(split.split_number, index + 1))),
    distance_m: distance,
    time_s: time,
    pace_s_per_km: toNumber(split.pace_s_per_km ?? split.pace, time / (distance / 1000)),
  };
};

const normalizeSplits = (value: unknown): ActivitySplit[] =>
  Array.isArray(value)
    ? value.map((split, index) => normalizeSplit(split, index)).filter((split): split is ActivitySplit => split !== null)
    : [];

const isRecovery = (type: string) => ['RECOVERY', 'REST'].includes(type.replace(/[-_ ]/g, '').toUpperCase());

const normalizeSegment = (value: unknown, index: number): ActivitySegmentSplits | null => {
  if (!value || typeof value !== 'object') return null;
  const segment = value as Record<string, unknown>;
  const gpsPoints = Array.isArray(segment.gps_points)
    ? segment.gps_points as BackendGpsPoint[]
    : undefined;
  const type = String(segment.type ?? segment.segment_type ?? 'RUN').toUpperCase();
  const nestedRecovery = segment.recovery && typeof segment.recovery === 'object'
    ? normalizeSegment(segment.recovery, index + 1)
    : undefined;
  return {
    id: typeof segment.id === 'string' || typeof segment.id === 'number' ? segment.id : undefined,
    sequence: Math.max(1, Math.floor(toNumber(segment.sequence ?? segment.segment_order, index + 1))),
    type,
    planned_distance_m: toNumber(segment.planned_distance_m ?? segment.planned_distance ?? segment.rep_distance, 0) || undefined,
    completed_distance_m: toNumber(segment.completed_distance_m ?? segment.completed_distance ?? segment.distance_m, 0) || undefined,
    actual_time_s: toNumber(segment.actual_time_s ?? segment.time_s ?? segment.duration_s ?? segment.actual_time, 0) || undefined,
    actual_pace_s_per_km: toNumber(segment.actual_pace_s_per_km ?? segment.pace_s_per_km ?? segment.pace, 0) || undefined,
    splits: isRecovery(type) ? [] : normalizeSplits(segment.splits),
    gps_points: gpsPoints,
    recovery: nestedRecovery ? { ...nestedRecovery, splits: [] } : undefined,
  };
};

export const normalizeActivitySplits = (activity: unknown): {
  segments: ActivitySegmentSplits[];
  extra: ActivityExtraSplits | null;
  laps: ActivityLapRecord[];
} => {
  const source = activity && typeof activity === 'object' && 'data' in activity
    ? (activity as { data?: unknown }).data
    : activity;
  const value = source && typeof source === 'object' ? source as Record<string, unknown> : {};
  const configuredSplitDistance = toNumber(value.split_distance_m, SPLIT_DISTANCE_METERS);
  const splitDistanceMeters = configuredSplitDistance > 0
    ? configuredSplitDistance
    : SPLIT_DISTANCE_METERS;
  const normalizedSegments = Array.isArray(value.segments)
    ? value.segments.map((segment, index) => normalizeSegment(segment, index)).filter((segment): segment is ActivitySegmentSplits => segment !== null)
    : [];
  const lapSplits = Array.isArray(value.laps)
    ? value.laps
      .map((lap, index) => {
        if (!lap || typeof lap !== 'object') return null;
        const lapValue = lap as Record<string, unknown>;
        return normalizeSplit({
          split_number: lapValue.repeat_number ?? index + 1,
          distance_m: lapValue.distance_meters ?? lapValue.distance_m,
          time_s: lapValue.duration_seconds ?? lapValue.time_s,
          pace_s_per_km: lapValue.pace_seconds_per_km ?? lapValue.pace_s_per_km,
        }, index);
      })
      .filter((split): split is ActivitySplit => split !== null)
    : [];
  const manualLapSplits = Array.isArray(value.lap_events)
    ? value.lap_events
      .map((event, index) => {
        if (!event || typeof event !== 'object') return null;
        const lapEvent = event as Record<string, unknown>;
        return normalizeSplit({
          split_number: lapEvent.split_number ?? lapEvent.event_number ?? index + 1,
          distance_m: lapEvent.distance_m,
          time_s: lapEvent.time_s,
          pace_s_per_km: lapEvent.pace_s_per_km,
        }, index);
      })
      .filter((split): split is ActivitySplit => split !== null)
    : [];
  const activityPoints = getActivityPoints(value);
  const generatedActivitySplits = createSplitsFromGpsPoints(activityPoints.filter((point) => !point.is_extra_distance), splitDistanceMeters);
  const generatedExtraSplits = createSplitsFromGpsPoints(activityPoints.filter((point) => point.is_extra_distance), splitDistanceMeters);
  const runSegmentIndex = normalizedSegments.findIndex((segment) => segment.type === 'RUN');
  const segmentsWithGeneratedSplits = normalizedSegments.map((segment, index) => {
    const generatedSplits = segment.gps_points
      ? createSplitsFromGpsPoints(segment.gps_points, splitDistanceMeters)
      : [];
    const manualSplits = index === runSegmentIndex ? manualLapSplits : [];
    const splits = segment.splits.length > 0
      ? segment.splits
      : manualSplits.length > 0
        ? manualSplits
        : generatedSplits;
    const manualDistance = manualSplits.reduce((total, split) => total + split.distance_m, 0);
    const manualTime = manualSplits.reduce((total, split) => total + split.time_s, 0);
    return {
      ...segment,
      completed_distance_m: segment.completed_distance_m ?? (manualDistance > 0 ? manualDistance : undefined),
      actual_time_s: segment.actual_time_s ?? (manualTime > 0 ? manualTime : undefined),
      actual_pace_s_per_km: segment.actual_pace_s_per_km
        ?? (manualDistance > 0 ? manualTime / (manualDistance / 1000) : undefined),
      splits: isRecovery(segment.type)
        ? []
        : splits,
    };
  });
  const extraSegment = segmentsWithGeneratedSplits.find((segment) => segment.type === 'EXTRA')
    ?? normalizeSegment(value.extra, normalizedSegments.length + 1);
  const segments = segmentsWithGeneratedSplits.filter((segment) => segment.type !== 'EXTRA');
  if (segments.length === 0 && manualLapSplits.length > 0) {
    const manualDistance = manualLapSplits.reduce((total, split) => total + split.distance_m, 0);
    const manualTime = manualLapSplits.reduce((total, split) => total + split.time_s, 0);
    segments.push({
      sequence: 1,
      type: 'RUN',
      completed_distance_m: manualDistance,
      actual_time_s: manualTime,
      actual_pace_s_per_km: manualDistance > 0 ? manualTime / (manualDistance / 1000) : undefined,
      splits: manualLapSplits,
    });
  } else if (segments.length === 0 && lapSplits.length > 0) {
    const lapDistance = lapSplits.reduce((total, split) => total + split.distance_m, 0);
    const lapTime = lapSplits.reduce((total, split) => total + split.time_s, 0);
    segments.push({
      sequence: 1,
      type: 'RUN',
      completed_distance_m: lapDistance,
      actual_time_s: lapTime,
      actual_pace_s_per_km: lapDistance > 0 ? lapTime / (lapDistance / 1000) : undefined,
      splits: lapSplits,
    });
  } else if (segments.length === 0 && generatedActivitySplits.length > 0) {
    const generatedDistance = generatedActivitySplits.reduce((total, split) => total + split.distance_m, 0);
    const generatedTime = generatedActivitySplits.reduce((total, split) => total + split.time_s, 0);
    segments.push({
      sequence: 1,
      type: 'RUN',
      completed_distance_m: generatedDistance,
      actual_time_s: generatedTime,
      actual_pace_s_per_km: generatedDistance > 0 ? generatedTime / (generatedDistance / 1000) : undefined,
      splits: generatedActivitySplits,
    });
  }
  return {
    segments,
    laps: normalizeLapRecords(value),
    extra: extraSegment && (extraSegment.splits.length > 0 || generatedExtraSplits.length > 0)
      ? {
        id: extraSegment.id,
        type: 'EXTRA',
        distance_m: extraSegment.completed_distance_m ?? extraSegment.planned_distance_m,
        actual_time_s: extraSegment.actual_time_s,
        actual_pace_s_per_km: extraSegment.actual_pace_s_per_km,
        splits: extraSegment.splits.length > 0 ? extraSegment.splits : generatedExtraSplits,
      }
      : null,
  };
};

export interface CropActivityResult {
  activity_id: string | number;
  start_time: string;
  end_time: string;
  distance: number;
  planned_distance?: number | null;
  planned_distance_km?: number | null;
  extra_distance?: number | null;
  extra_distance_km?: number | null;
  distance_km: number;
  elapsed_time: number;
  moving_time: number;
  paused_time_s?: number;
  pause_count?: number;
  avg_speed: number;
  avg_pace: number;
  gps_points_count: number;
}

export interface CropTimingFallback {
  elapsed_time: number;
  moving_time: number;
}

export interface BackendActivity {
  id: string | number;
  activity_id?: string | number;
  activity_type: 'RUN' | 'WALK' | string;
  thumbnail_url?: string | null;
  start_time: string;
  end_time: string;
  moving_time: number;
  elapsed_time: number;
  distance: number;
  planned_distance?: number | null;
  planned_distance_km?: number | null;
  extra_distance?: number | null;
  extra_distance_km?: number | null;
  avg_speed: number;
  max_speed: number;
  avg_pace: number;
  calories: number;
  elevation_gain?: number | null;
  elevation_loss?: number | null;
  gps_points_count: number;
  route_generated: boolean;
  encoded_polyline?: string | null;
  planned_encoded_polyline?: string | null;
  extra_encoded_polyline?: string | null;
  route?: {
    encoded_polyline?: string | null;
    planned_encoded_polyline?: string | null;
    extra_encoded_polyline?: string | null;
    gps_points?: BackendGpsPoint[];
    points?: BackendGpsPoint[];
    coordinates?: BackendGpsPoint[];
    planned_points?: BackendGpsPoint[];
    extra_points?: BackendGpsPoint[];
    pause_points?: BackendGpsPoint[];
    pause_events?: BackendPauseEvent[];
    pauses?: BackendPauseEvent[];
    running_routes?: BackendPolylineRoute[];
    pause_routes?: BackendPolylineRoute[];
  } | null;
  gps_points?: BackendGpsPoint[];
  points?: BackendGpsPoint[];
  coordinates?: BackendGpsPoint[];
  pause_events?: BackendPauseEvent[];
  pauses?: BackendPauseEvent[];
  processing_status: string;
  is_processed?: boolean;
  is_saved_to_my_routes?: boolean;
  saved_route_id?: number | null;
  saved_route_is_public?: boolean;
  segments?: ActivitySegmentSplits[];
  extra?: ActivityExtraSplits | null;
}

export interface SavedRunRouteVisibility {
  id: number;
  is_public: boolean;
}

const ACTIVITY_HISTORY_PATH = (
  process.env.EXPO_PUBLIC_ACTIVITY_HISTORY_PATH || '/rundata/activities/'
).trim();
const RUN_ROUTES_PATH = (
  process.env.EXPO_PUBLIC_RUN_ROUTES_PATH || '/rundata/run-routes/'
).replace(/\/+$/, '');
const GPX_ACTIVITY_IMPORT_PATH = (
  process.env.EXPO_PUBLIC_GPX_ACTIVITY_IMPORT_PATH || '/rundata/activities/import-gpx/'
).trim();
const ACTIVITY_HISTORY_CACHE_KEY = 'activity_history_first_page_v4';
export const ACTIVITY_HISTORY_FIELDS = 'id,activity_type,distance,moving_time,elapsed_time,start_time,end_time,avg_pace,elevation_gain,elevation_loss,processing_status,is_processed,thumbnail_url,is_saved_to_my_routes,saved_route_id';

const getActivityHistoryCacheKey = async () => {
  try {
    const userJson = await storage.getItem(storage.KEYS.USER);
    const user = userJson ? JSON.parse(userJson) as { id?: string | number } : null;
    const userId = user?.id;
    return userId === undefined || userId === null || String(userId).trim() === ''
      ? `${ACTIVITY_HISTORY_CACHE_KEY}_anonymous`
      : `${ACTIVITY_HISTORY_CACHE_KEY}_user_${encodeURIComponent(String(userId))}`;
  } catch {
    return `${ACTIVITY_HISTORY_CACHE_KEY}_anonymous`;
  }
};

export interface ActivityHistoryPage {
  activities: BackendActivity[];
  hasMore: boolean;
  nextCursor: string | null;
  totalCount: number | null;
}

const getActivityDetailPath = (activityId: BackendActivity['id']) => {
  const basePath = ACTIVITY_HISTORY_PATH.replace(/\/+$/, '');
  return `${basePath}/${encodeURIComponent(String(activityId))}/`;
};

const getActivityDeletePath = (activityId: BackendActivity['id']) =>
  `${getActivityDetailPath(activityId)}delete/`;

const extractActivities = (payload: unknown): BackendActivity[] => {
  if (Array.isArray(payload)) return payload as BackendActivity[];

  if (payload && typeof payload === 'object') {
    const data = payload as { results?: unknown; activities?: unknown; data?: unknown };
    return extractActivities(data.results ?? data.activities ?? data.data);
  }

  return [];
};

const deduplicateActivitiesById = (activities: BackendActivity[]): BackendActivity[] => {
  const seenIds = new Set<string>();
  return activities.filter((activity) => {
    const id = String(activity.id ?? activity.activity_id ?? '').trim();
    if (!id || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });
};

const encodeRouteFallback = (activity: BackendActivity): string | null => {
  const candidates = [
    activity.gps_points,
    activity.points,
    activity.coordinates,
    activity.route?.gps_points,
    activity.route?.points,
    activity.route?.coordinates,
  ];
  const points = candidates.find((candidate): candidate is BackendGpsPoint[] =>
    Array.isArray(candidate) && candidate.length >= 2
  );

  if (!points) return null;

  const coordinates = points
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
    .map((point) => [point.latitude, point.longitude] as [number, number]);

  return coordinates.length >= 2 ? polyline.encode(coordinates) : null;
};

const getBackendGpsPoints = (activity: BackendActivity): BackendGpsPoint[] | undefined =>
  activity.gps_points
  ?? activity.points
  ?? activity.coordinates
  ?? activity.route?.gps_points
  ?? activity.route?.points
  ?? activity.route?.coordinates;

const getActivityId = (activity: BackendActivity): string | number => {
  const id = activity.id ?? activity.activity_id;
  if ((typeof id !== 'string' && typeof id !== 'number') || String(id).trim() === '') {
    throw new Error('Activity response is missing its ID.');
  }
  return id;
};

const normalizeActivity = (activity: BackendActivity): BackendActivity => {
  const id = getActivityId(activity);
  const gpsPoints = getBackendGpsPoints(activity);
  const splitData = normalizeActivitySplits(activity);
  const hasBackendRouteGroups = Array.isArray(activity.route?.running_routes);
  return {
    ...activity,
    id,
    gps_points: activity.gps_points ?? gpsPoints,
    encoded_polyline: activity.encoded_polyline
      ?? activity.route?.encoded_polyline
      ?? (hasBackendRouteGroups ? null : encodeRouteFallback(activity)),
    planned_encoded_polyline: activity.planned_encoded_polyline
      ?? activity.route?.planned_encoded_polyline
      ?? null,
    extra_encoded_polyline: activity.extra_encoded_polyline
      ?? activity.route?.extra_encoded_polyline
      ?? null,
    segments: splitData.segments,
    extra: splitData.extra,
  };
};

const applySdkDistance = async (activity: BackendActivity): Promise<BackendActivity> => {
  const sdkDistance = await activityDistanceOverrides.get(activity.id);
  const timing = await activityTimingOverrides.get(activity.id);
  if (sdkDistance === null && !timing) return activity;

  return { ...activity, ...(sdkDistance !== null ? { distance: sdkDistance } : {}), ...(timing ?? {}) };
};

const applyCropTimingFallback = (
  result: CropActivityResult,
  fallback?: CropTimingFallback,
): CropActivityResult => {
  if (!fallback) return result;

  const fallbackElapsed = Number(fallback.elapsed_time);
  const fallbackMoving = Number(fallback.moving_time);
  const responseElapsed = Number(result.elapsed_time);
  const responseMoving = Number(result.moving_time);
  const elapsedTime = Number.isFinite(responseElapsed) && responseElapsed > 0
    ? responseElapsed
    : fallbackElapsed;
  const movingTime = Number.isFinite(responseMoving) && responseMoving > 0
    ? responseMoving
    : fallbackMoving;

  if (
    !Number.isFinite(elapsedTime)
    || elapsedTime < 0
    || !Number.isFinite(movingTime)
    || movingTime < 0
  ) {
    return result;
  }

  return {
    ...result,
    elapsed_time: elapsedTime,
    moving_time: Math.min(movingTime, elapsedTime),
  };
};

const getPaginationSource = (payload: unknown): Record<string, unknown> => {
  const source = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const nestedData = source.data && typeof source.data === 'object'
    ? source.data as Record<string, unknown>
    : null;
  return nestedData && (
    'has_more' in nestedData || 'hasMore' in nestedData || 'next_cursor' in nestedData
    || 'nextCursor' in nestedData || 'last_id' in nestedData
  ) ? nestedData : source;
};

const toCursor = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const cursor = String(value).trim();
  return cursor.length > 0 ? cursor : null;
};

export const normalizeHistoryPage = async (
  payload: unknown,
  limit: number,
  cursorSent: string | null = null,
): Promise<ActivityHistoryPage> => {
  const source = getPaginationSource(payload);
  const rawActivities = extractActivities(payload);
  const explicitNextCursor = toCursor(source.next_cursor ?? source.nextCursor ?? source.last_id);
  const hasMoreValue = source.has_more ?? source.hasMore;
  const rawTotalCount = Number(source.total_count ?? source.total ?? source.count ?? rawActivities.length);
  const totalCount = Number.isFinite(rawTotalCount) && rawTotalCount >= 0 ? rawTotalCount : rawActivities.length;
  const isUnpaginatedResponse = rawActivities.length > limit && explicitNextCursor === null;
  const cursorIndex = cursorSent && isUnpaginatedResponse
    ? rawActivities.findIndex((activity) => String(activity.id) === cursorSent)
    : -1;
  const pageStart = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  const rawSlice = rawActivities.slice(pageStart, pageStart + limit);
  const normalized = await Promise.all(rawSlice.map(normalizeActivity).map(applySdkDistance));
  const activities = deduplicateActivitiesById(normalized.filter((activity) => {
    const activityType = String(activity.activity_type).toUpperCase();
    const hasDistance = Number(activity.distance) > 0;
    const hasTime = Number(activity.moving_time || activity.elapsed_time) > 0;
    const isCompleted = !activity.processing_status || activity.processing_status === 'COMPLETED';
    return (
      (activityType === 'RUN' || activityType === 'WALK') &&
      isCompleted &&
      (hasDistance || hasTime)
    );
  }));
  const parsedResponseLimit = Number(source.limit ?? limit);
  const responseLimit = Number.isFinite(parsedResponseLimit) && parsedResponseLimit > 0
    ? parsedResponseLimit
    : limit;
  const fallbackCursor = toCursor(rawSlice.at(-1)?.id);
  const rawPageHasMore = isUnpaginatedResponse
    ? pageStart + rawSlice.length < rawActivities.length && fallbackCursor !== null
    : rawActivities.length >= responseLimit && fallbackCursor !== null;
  const hasMore = typeof hasMoreValue === 'boolean'
    ? hasMoreValue || rawPageHasMore
    : rawPageHasMore;
  const nextCursor = explicitNextCursor ?? fallbackCursor;

  if (__DEV__) {
    if (hasMoreValue === false && rawPageHasMore) {
      console.warn('[ActivityHistory] Backend reported no more data for a full raw page; continuing with the raw cursor.', {
        cursorSent,
        fallbackCursor,
      });
    }
  }

  return {
    activities,
    nextCursor,
    hasMore,
    totalCount,
  };
};

const toCachedActivity = (activity: BackendActivity): BackendActivity => ({
  id: activity.id,
  activity_type: activity.activity_type,
  thumbnail_url: activity.thumbnail_url ?? null,
  start_time: activity.start_time,
  end_time: activity.end_time,
  moving_time: activity.moving_time,
  elapsed_time: activity.elapsed_time,
  distance: activity.distance,
  avg_speed: activity.avg_speed,
  max_speed: activity.max_speed,
  avg_pace: activity.avg_pace,
  calories: activity.calories,
  elevation_gain: activity.elevation_gain,
  elevation_loss: activity.elevation_loss,
  gps_points_count: activity.gps_points_count,
  route_generated: activity.route_generated,
  processing_status: activity.processing_status,
  is_processed: activity.is_processed,
  is_saved_to_my_routes: activity.is_saved_to_my_routes,
  saved_route_id: activity.saved_route_id,
});

export const activityAPI = {
  async listPage(cursor: string | null = null, limit = 10): Promise<ActivityHistoryPage> {
    const historyCacheKey = cursor === null ? await getActivityHistoryCacheKey() : null;
    const response = await api.get(ACTIVITY_HISTORY_PATH, {
      params: {
        limit,
        ...(cursor ? { cursor, last_id: cursor } : {}),
        // Route geometry is fetched only for an individual activity, never in the list payload.
        fields: ACTIVITY_HISTORY_FIELDS,
      },
    });
    if (__DEV__ && cursor === null) {
      const rawSource = getPaginationSource(response.data);
      const rawActivities = extractActivities(response.data);
    }
    const result = await normalizeHistoryPage(response.data, limit, cursor);
    if (historyCacheKey) {
      await storage.setItem(historyCacheKey, JSON.stringify({
        ...result,
        activities: result.activities.map(toCachedActivity),
      }));
    }
    return result;
  },

  async getCachedFirstPage(): Promise<ActivityHistoryPage | null> {
    try {
      const historyCacheKey = await getActivityHistoryCacheKey();
      const cached = await storage.getItem(historyCacheKey);
      if (!cached) return null;
      const parsed = JSON.parse(cached) as ActivityHistoryPage;
      return Array.isArray(parsed.activities)
        ? { ...parsed, activities: deduplicateActivitiesById(parsed.activities) }
        : null;
    } catch {
      return null;
    }
  },

  async listAll(limit = 1000): Promise<BackendActivity[]> {
    try {
      const page = await this.listPage(null, limit);
      if (page.activities && page.activities.length > 0) {
        return page.activities;
      }
    } catch (err) {
      console.warn('[ActivityAPI] listAll network error:', err);
    }
    const cached = await this.getCachedFirstPage();
    return cached?.activities ?? [];
  },

  async list(limit = 1000): Promise<BackendActivity[]> {
    return this.listAll(limit);
  },

  async get(activityId: BackendActivity['id']): Promise<BackendActivity> {
    const response = await api.get(getActivityDetailPath(activityId));
    const payload = response.data?.data ?? response.data;
    return applySdkDistance(normalizeActivity(payload as BackendActivity));
  },

  async importGpxWorkout(preview: GpxWorkoutPreview): Promise<BackendActivity> {
    const response = await api.post(
      GPX_ACTIVITY_IMPORT_PATH,
      toGpxActivityImportRequest(preview),
    );
    const payload = response.data?.data ?? response.data;
    const activityPayload = payload?.activity ?? payload;
    const activityId = activityPayload?.activity_id ?? activityPayload?.id;
    if (
      (typeof activityId !== 'string' && typeof activityId !== 'number')
      || String(activityId).trim() === ''
    ) {
      throw new Error('The GPX import endpoint did not return the created workout ID.');
    }
    return this.get(activityId);
  },

  async saveRoute(activityId: BackendActivity['id']): Promise<{ routeId: number | null }> {
    const response = await api.post(`${getActivityDetailPath(activityId)}save-route/`, {});
    const historyCacheKey = await getActivityHistoryCacheKey();
    await storage.removeItem(historyCacheKey).catch(() => undefined);
    const payload = response.data?.data ?? response.data;
    const savedRoute = payload?.route ?? payload?.run_route ?? payload;
    const routeId = Number(savedRoute?.id ?? savedRoute?.run_route_id ?? savedRoute?.route_id ?? savedRoute?.saved_route_id);
    return { routeId: Number.isInteger(routeId) && routeId > 0 ? routeId : null };
  },

  async delete(activityId: BackendActivity['id']): Promise<string> {
    if (
      (typeof activityId !== 'string' && typeof activityId !== 'number')
      || String(activityId).trim() === ''
    ) {
      throw new Error('Cannot delete activity because its ID is missing.');
    }
    const response = await api.delete(getActivityDeletePath(activityId));
    const historyCacheKey = await getActivityHistoryCacheKey();
    await storage.removeItem(historyCacheKey).catch(() => undefined);
    return typeof response.data?.message === 'string'
      ? response.data.message
      : 'Activity deleted successfully.';
  },

  async cropPreview(
    activityId: BackendActivity['id'],
    startTime: string,
    endTime: string,
    timingFallback?: CropTimingFallback,
  ): Promise<CropActivityResult> {
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    const startMilliseconds = startDate.getTime();
    const endMilliseconds = endDate.getTime();
    if (!Number.isFinite(startMilliseconds) || !Number.isFinite(endMilliseconds) || endMilliseconds <= startMilliseconds) {
      throw new Error('Crop interval must contain valid timestamps in chronological order.');
    }

    const payload = {
      start_time: startTime,
      end_time: endTime,
    };
    const endpoint = `${getActivityDetailPath(activityId)}crop/preview/`;


    let response;
    try {
      response = await api.post(endpoint, payload);
    } catch (error: any) {
      console.error('[CropActivity] Backend response:', {
        status: error?.response?.status,
        data: error?.response?.data,
        requestUrl: error?.config?.url,
        requestData: error?.config?.data,
      });
      throw error;
    }

    const result = response.data?.data ?? response.data;
    return applyCropTimingFallback(result as CropActivityResult, timingFallback);
  },

  async crop(
    activityId: BackendActivity['id'],
    startTime: string,
    endTime: string,
    timingFallback?: CropTimingFallback,
  ): Promise<CropActivityResult> {
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    const startMilliseconds = startDate.getTime();
    const endMilliseconds = endDate.getTime();
    if (!Number.isFinite(startMilliseconds) || !Number.isFinite(endMilliseconds) || endMilliseconds <= startMilliseconds) {
      throw new Error('Crop interval must contain valid timestamps in chronological order.');
    }

    const payload = {
      start_time: startTime,
      end_time: endTime,
    };
    const endpoint = `${getActivityDetailPath(activityId)}crop/`;


    let response;
    try {
      response = await api.post(endpoint, payload);
    } catch (error: any) {
      console.error('[CropActivity] Backend response:', {
        status: error?.response?.status,
        data: error?.response?.data,
        requestUrl: error?.config?.url,
        requestData: error?.config?.data,
      });
      throw error;
    }

    const responseResult = response.data?.data ?? response.data;
    const result = applyCropTimingFallback(responseResult as CropActivityResult, timingFallback);
    const croppedDistance = Number(result.distance);
    if (Number.isFinite(croppedDistance)) {
      await activityDistanceOverrides.save(activityId, croppedDistance);
    }
    const croppedElapsedTime = Number(result.elapsed_time);
    const croppedMovingTime = Number(result.moving_time);
    if (
      Number.isFinite(croppedElapsedTime)
      && croppedElapsedTime >= 0
      && Number.isFinite(croppedMovingTime)
      && croppedMovingTime >= 0
    ) {
      const pausedTime = Number(result.paused_time_s);
      const pauseCount = Number(result.pause_count);
      await activityTimingOverrides.save(activityId, {
        moving_time: croppedMovingTime,
        elapsed_time: croppedElapsedTime,
        moving_time_s: croppedMovingTime,
        elapsed_time_s: croppedElapsedTime,
        paused_time_s: Number.isFinite(pausedTime) && pausedTime >= 0
          ? pausedTime
          : Math.max(0, croppedElapsedTime - croppedMovingTime),
        pause_count: Number.isFinite(pauseCount) && pauseCount >= 0
          ? pauseCount
          : 0,
      });
    } else {
      console.warn(
        `[ActivityTiming] Crop saved for activity ${activityId}, but its response did not contain valid elapsed_time and moving_time values`,
      );
    }
    return result as CropActivityResult;
  },

};

export const runRouteAPI = {
  async get(routeId: number): Promise<SavedRunRouteVisibility> {
    const response = await api.get(`${RUN_ROUTES_PATH}/${encodeURIComponent(String(routeId))}/`);
    return (response.data?.data ?? response.data) as SavedRunRouteVisibility;
  },

  async setVisibility(routeId: number, isPublic: boolean): Promise<void> {
    await api.patch(`${RUN_ROUTES_PATH}/${encodeURIComponent(String(routeId))}/visibility/`, {
      is_public: isPublic,
    });
  },

};
