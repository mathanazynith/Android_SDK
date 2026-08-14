import api from '../../service/api';

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
  } | null;
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

const normalizeActivity = (activity: BackendActivity): BackendActivity => ({
  ...activity,
  encoded_polyline: activity.encoded_polyline ?? activity.route?.encoded_polyline ?? null,
});

export const activityAPI = {
  async list(): Promise<BackendActivity[]> {
    const response = await api.get(ACTIVITY_HISTORY_PATH);
    return extractActivities(response.data).map(normalizeActivity).filter((activity) => {
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
    return normalizeActivity(payload as BackendActivity);
  },

  async delete(activityId: BackendActivity['id']): Promise<string> {
    const response = await api.delete(`${getActivityDetailPath(activityId)}delete/`);
    return typeof response.data?.message === 'string'
      ? response.data.message
      : 'Activity deleted successfully.';
  },
};
