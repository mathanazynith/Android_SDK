import polyline from '@mapbox/polyline';
import api from '../../service/api';
import { storage } from '../../service/storage';
import { ActivityExtraSplits, ActivitySegmentSplits, ActivitySplit, SPLIT_DISTANCE_METERS } from '../types/activity';
import { calculateDistanceMeters } from '../utils/distance';
import { activityDistanceOverrides } from './activityDistanceOverrides';

export interface BackendGpsPoint {
  latitude: number;
  longitude: number;
  timestamp?: string;
  is_extra_distance?: boolean;
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
    pace_s_per_km: toNumber(split.pace_s_per_km ?? split.pace_s_per_km, time / (distance / 1000)),
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
    splits: isRecovery(type) ? [] : normalizeSplits(segment.splits).map((split, splitIndex) => ({
      ...split,
      split_number: splitIndex + 1,
    })),
    gps_points: gpsPoints,
    recovery: nestedRecovery ? { ...nestedRecovery, splits: [] } : undefined,
  };
};

export const normalizeActivitySplits = (activity: unknown): {
  segments: ActivitySegmentSplits[];
  extra: ActivityExtraSplits | null;
} => {
  const source = activity && typeof activity === 'object' && 'data' in activity
    ? (activity as { data?: unknown }).data
    : activity;
  const value = source && typeof source === 'object' ? source as Record<string, unknown> : {};
  const splitDistanceMeters = SPLIT_DISTANCE_METERS;
  const normalizedSegments = Array.isArray(value.segments)
    ? value.segments.map((segment, index) => normalizeSegment(segment, index)).filter((segment): segment is ActivitySegmentSplits => segment !== null)
    : [];
  const activityPoints = getActivityPoints(value);
  const generatedActivitySplits = createSplitsFromGpsPoints(activityPoints.filter((point) => !point.is_extra_distance), splitDistanceMeters);
  const generatedExtraSplits = createSplitsFromGpsPoints(activityPoints.filter((point) => point.is_extra_distance), splitDistanceMeters);
  const segmentsWithGeneratedSplits = normalizedSegments.map((segment) => {
    const generatedSplits = segment.gps_points
      ? createSplitsFromGpsPoints(segment.gps_points, splitDistanceMeters)
      : [];
    return {
      ...segment,
      splits: isRecovery(segment.type)
        ? []
        : generatedSplits.length > 0 ? generatedSplits : segment.splits,
    };
  });
  const extraSegment = segmentsWithGeneratedSplits.find((segment) => segment.type === 'EXTRA')
    ?? normalizeSegment(value.extra, normalizedSegments.length + 1);
  const segments = segmentsWithGeneratedSplits.filter((segment) => segment.type !== 'EXTRA');
  if (segments.length === 0 && generatedActivitySplits.length > 0) {
    segments.push({
      sequence: 1,
      type: 'RUN',
      completed_distance_m: generatedActivitySplits.reduce((total, split) => total + split.distance_m, 0),
      splits: generatedActivitySplits,
    });
  }
  return {
    segments,
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
  avg_speed: number;
  avg_pace: number;
  gps_points_count: number;
}

export interface BackendActivity {
  id: string | number;
  activity_type: 'RUN' | 'WALK' | string;
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
  elevation_gain: number;
  elevation_loss: number;
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
  } | null;
  gps_points?: BackendGpsPoint[];
  points?: BackendGpsPoint[];
  coordinates?: BackendGpsPoint[];
  processing_status: string;
  is_processed: boolean;
  segments?: ActivitySegmentSplits[];
  extra?: ActivityExtraSplits | null;
}

const ACTIVITY_HISTORY_PATH = (
  process.env.EXPO_PUBLIC_ACTIVITY_HISTORY_PATH || '/rundata/activities/'
).trim();
const ACTIVITY_HISTORY_CACHE_KEY = 'activity_history_first_page_v2';

export interface ActivityHistoryPage {
  activities: BackendActivity[];
  hasMore: boolean;
  nextCursor: string | null;
}

const getActivityDetailPath = (activityId: BackendActivity['id']) => {
  const basePath = ACTIVITY_HISTORY_PATH.replace(/\/+$/, '');
  return `${basePath}/${encodeURIComponent(String(activityId))}/`;
};

const extractActivities = (payload: unknown): BackendActivity[] => {
  if (Array.isArray(payload)) return payload as BackendActivity[];

  if (payload && typeof payload === 'object') {
    const data = payload as { results?: unknown; activities?: unknown; data?: unknown };
    return extractActivities(data.results ?? data.activities ?? data.data);
  }

  return [];
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

const normalizeActivity = (activity: BackendActivity): BackendActivity => {
  const gpsPoints = getBackendGpsPoints(activity);
  const splitData = normalizeActivitySplits(activity);
  return {
    ...activity,
    gps_points: activity.gps_points ?? gpsPoints,
    encoded_polyline: activity.encoded_polyline
      ?? activity.route?.encoded_polyline
      ?? encodeRouteFallback(activity),
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
  if (sdkDistance === null) return activity;

  console.log(
    `[ActivityDistance] Using SDK total ${sdkDistance.toFixed(2)}m for activity ${activity.id} `
    + `instead of backend GPS total ${activity.distance.toFixed(2)}m`
  );
  return { ...activity, distance: sdkDistance };
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
  const isUnpaginatedResponse = rawActivities.length > limit && explicitNextCursor === null;
  const cursorIndex = cursorSent && isUnpaginatedResponse
    ? rawActivities.findIndex((activity) => String(activity.id) === cursorSent)
    : -1;
  const pageStart = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  const rawSlice = rawActivities.slice(pageStart, pageStart + limit);
  const normalized = await Promise.all(rawSlice.map(normalizeActivity).map(applySdkDistance));
  const activities = normalized.filter((activity) => {
    const activityType = String(activity.activity_type).toUpperCase();
    return (
      (activityType === 'RUN' || activityType === 'WALK') &&
      activity.processing_status === 'COMPLETED' &&
      Number(activity.distance) > 0
    );
  });
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
    console.log('[ActivityHistory] page fetch', {
      cursorSent,
      rawCount: rawActivities.length,
      pageRawCount: rawSlice.length,
      filteredCount: activities.length,
      nextCursor,
      hasMore,
    });
  }

  return {
    activities,
    nextCursor,
    hasMore,
  };
};

const toCachedActivity = (activity: BackendActivity): BackendActivity => ({
  id: activity.id,
  activity_type: activity.activity_type,
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
});

export const activityAPI = {
  async listPage(cursor: string | null = null, limit = 10): Promise<ActivityHistoryPage> {
    const response = await api.get(ACTIVITY_HISTORY_PATH, {
      params: {
        limit,
        ...(cursor ? { cursor, last_id: cursor } : {}),
        // Route geometry is fetched only for an individual activity, never in the list payload.
        fields: 'id,activity_type,distance,moving_time,elapsed_time,start_time,end_time,avg_pace,processing_status,is_processed,thumbnail_url',
      },
    });
    if (__DEV__ && cursor === null) {
      const rawSource = getPaginationSource(response.data);
      const rawActivities = extractActivities(response.data);
      console.log('[ActivityHistory] first page raw response', {
        has_more: rawSource.has_more,
        hasMore: rawSource.hasMore,
        next_cursor: rawSource.next_cursor,
        nextCursor: rawSource.nextCursor,
        last_id: rawSource.last_id,
        count: rawSource.count,
        total: rawSource.total,
        total_count: rawSource.total_count,
        rawCount: rawActivities.length,
        processingStatuses: rawActivities.map((activity) => activity.processing_status),
        rawJson: JSON.stringify(response.data),
      });
    }
    const result = await normalizeHistoryPage(response.data, limit, cursor);
    if (cursor === null) {
      await storage.setItem(ACTIVITY_HISTORY_CACHE_KEY, JSON.stringify({
        ...result,
        activities: result.activities.map(toCachedActivity),
      }));
    }
    return result;
  },

  async getCachedFirstPage(): Promise<ActivityHistoryPage | null> {
    try {
      const cached = await storage.getItem(ACTIVITY_HISTORY_CACHE_KEY);
      if (!cached) return null;
      const parsed = JSON.parse(cached) as ActivityHistoryPage;
      return Array.isArray(parsed.activities) ? parsed : null;
    } catch {
      return null;
    }
  },

  async list(): Promise<BackendActivity[]> {
    return (await this.listPage(null)).activities;
  },

  async get(activityId: BackendActivity['id']): Promise<BackendActivity> {
    const response = await api.get(getActivityDetailPath(activityId));
    const payload = response.data?.data ?? response.data;
    return applySdkDistance(normalizeActivity(payload as BackendActivity));
  },

  async delete(activityId: BackendActivity['id']): Promise<string> {
    const response = await api.delete(`${getActivityDetailPath(activityId)}delete/`);
    return typeof response.data?.message === 'string'
      ? response.data.message
      : 'Activity deleted successfully.';
  },

  async cropPreview(
    activityId: BackendActivity['id'],
    startTime: string,
    endTime: string,
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

    console.log('[CropActivity] Preview payload JSON:', JSON.stringify(payload, null, 2));
    console.log('[CropActivity] Request:', {
      method: 'POST',
      url: endpoint,
      payload,
      startTimeMilliseconds: startMilliseconds,
      endTimeMilliseconds: endMilliseconds,
    });

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
    return result as CropActivityResult;
  },

  async crop(
    activityId: BackendActivity['id'],
    startTime: string,
    endTime: string,
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

    console.log('[CropActivity] Apply payload JSON:', JSON.stringify(payload, null, 2));
    console.log('[CropActivity] Apply request:', { method: 'POST', url: endpoint, payload });

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
    const croppedDistance = Number(result.distance);
    if (Number.isFinite(croppedDistance)) {
      await activityDistanceOverrides.save(activityId, croppedDistance);
    }
    console.log(
      `[Activity] Cropped distance returned by backend: ${croppedDistance.toFixed(2)}m; `
      + `pace returned by backend: ${Number(result.avg_pace).toFixed(2)}s/km`
    );
    return result as CropActivityResult;
  },

};
