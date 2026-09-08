import polyline from '@mapbox/polyline';
import api from '../../service/api';
import { activityDistanceOverrides } from './activityDistanceOverrides';

interface BackendGpsPoint {
  latitude: number;
  longitude: number;
  timestamp?: string;
}

export interface CropActivityResult {
  activity_id: string | number;
  start_time: string;
  end_time: string;
  distance: number;
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
  avg_speed: number;
  max_speed: number;
  avg_pace: number;
  calories: number;
  elevation_gain: number;
  elevation_loss: number;
  gps_points_count: number;
  route_generated: boolean;
  encoded_polyline?: string | null;
  route?: {
    encoded_polyline?: string | null;
    gps_points?: BackendGpsPoint[];
    points?: BackendGpsPoint[];
    coordinates?: BackendGpsPoint[];
  } | null;
  gps_points?: BackendGpsPoint[];
  points?: BackendGpsPoint[];
  coordinates?: BackendGpsPoint[];
  processing_status: string;
  is_processed: boolean;
}

const ACTIVITY_HISTORY_PATH = (
  process.env.EXPO_PUBLIC_ACTIVITY_HISTORY_PATH || '/rundata/activities/'
).trim();

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
  return {
    ...activity,
    gps_points: activity.gps_points ?? gpsPoints,
    encoded_polyline: activity.encoded_polyline
      ?? activity.route?.encoded_polyline
      ?? encodeRouteFallback(activity),
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

export const activityAPI = {
  async list(): Promise<BackendActivity[]> {
    const response = await api.get(ACTIVITY_HISTORY_PATH);
    const normalized = extractActivities(response.data).map(normalizeActivity);
    const activities = await Promise.all(normalized.map(applySdkDistance));
    return activities.filter((activity) => {
      const activityType = String(activity.activity_type).toUpperCase();
      return (
        (activityType === 'RUN' || activityType === 'WALK') &&
        activity.processing_status === 'COMPLETED' &&
        Number(activity.distance) > 0
      );
    });
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
