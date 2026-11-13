import api from '../../service/api';
import { ActivitySubmissionPayload, RunSessionStartPayload, RunSessionStartResponse, RunStopPayload, UploadBatchPayload } from '../types/running';
import { activityManualLapOverrides } from './activityManualLapOverrides';

// `service/api.ts` supplies the /api/v1 base URL and authenticated Bearer
// token, so this resolves to POST /api/v1/rundata/upload/ by default.
const ACTIVITY_UPLOAD_PATH = (
  process.env.EXPO_PUBLIC_ACTIVITY_UPLOAD_PATH || '/rundata/upload/'
).trim();

const createRunId = (): string =>
  `RUN-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

/**
 * Keep free activities and structured interval activities on distinct API
 * shapes. This also repairs queued payloads created by older app versions.
 */
export const normalizeActivitySubmissionPayload = (
  payload: ActivitySubmissionPayload,
): ActivitySubmissionPayload => {
  const { laps, segments, lap_events, ...activity } = payload;
  const hasIntervalStructure = Boolean(laps?.length || segments?.length);

  if (hasIntervalStructure) {
    return {
      ...activity,
      laps,
      segments,
      ...(lap_events ? { lap_events } : {}),
    };
  }

  const endTimeMs = activity.end_time ? new Date(activity.end_time).getTime() : 0;
  const cleanLapEvents = (lap_events ?? [])
    .filter((event) => {
      const eventTimeMs = event?.timestamp ? new Date(event.timestamp).getTime() : 0;
      return eventTimeMs > 0 && (endTimeMs === 0 || eventTimeMs < endTimeMs - 1000);
    })
    .map((event, index) => ({
      event_number: index + 1,
      timestamp: event.timestamp,
    }));

  return {
    ...activity,
    lap_events: cleanLapEvents,
  };
};

export class RunningApiClient {
  public async startRun(userId: string, startedAtIso: string): Promise<RunSessionStartResponse> {
    const runId = createRunId();
    const payload: RunSessionStartPayload = {
      user_id: userId,
      started_at: startedAtIso,
      run_id: runId,
    };


    return {
      success: true,
      run_id: runId,
    };
  }

  public async uploadBatch(runId: string, points: UploadBatchPayload['points']): Promise<boolean> {
    const payload: UploadBatchPayload = {
      run_id: runId,
      points,
    };

    return true;
  }

  public async stopRun(payload: RunStopPayload): Promise<boolean> {
    return true;
  }

  /** Send the optimized final activity as JSON to Django's UploadActivityAPIView. */
  public async submitActivity(payload: ActivitySubmissionPayload, idempotencyKey?: string | null): Promise<{
    success: boolean;
    activityId: string | number | null;
  }> {
    const submissionPayload = normalizeActivitySubmissionPayload(payload);
    const timingPayload = {
      moving_time: submissionPayload.moving_time,
      moving_time_s: submissionPayload.moving_time_s,
      paused_time_s: submissionPayload.paused_time_s,
      elapsed_time: submissionPayload.elapsed_time,
      elapsed_time_s: submissionPayload.elapsed_time_s,
      pause_count: submissionPayload.pause_count,
      pause_events: submissionPayload.pause_events ?? [],
    };
    console.warn('[WORKOUT_PAUSE_PAYLOAD] ===== EXACT TIMING SENT =====');
    console.warn(JSON.stringify(timingPayload, null, 2));
    console.warn('[WORKOUT_PAUSE_PAYLOAD] moving_time_s + paused_time_s = elapsed_time_s');
    console.warn(
      `[WORKOUT_PAUSE_PAYLOAD] ${payload.moving_time_s} + ${payload.paused_time_s ?? 0} = ${payload.elapsed_time_s}`
    );
    console.warn('[WORKOUT_PAUSE_PAYLOAD] ==============================');
    console.warn('[BACKEND PAYLOAD]');
    console.warn(JSON.stringify(submissionPayload, null, 2));

    let response;
    try {
      console.warn(`[WORKOUT_PAUSE_PAYLOAD] POST started: ${ACTIVITY_UPLOAD_PATH}`);
      // The API must persist this key and return the original result for retries
      // to guarantee one History row after an ambiguous timeout.
      response = await api.post(ACTIVITY_UPLOAD_PATH, submissionPayload, {
        timeout: 60000,
        headers: {
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
      });
    } catch (error: any) {
      if (__DEV__) {
        const responseData = error?.response?.data;
        const responseDetails = typeof responseData === 'string'
          ? responseData.slice(0, 4_000)
          : responseData;
        console.error('[ActivityUpload] Request failed', {
          status: error?.response?.status ?? null,
          method: error?.config?.method ?? 'post',
          url: error?.config?.url ?? ACTIVITY_UPLOAD_PATH,
          requestId: error?.response?.headers?.['x-request-id']
            ?? error?.response?.headers?.['x-correlation-id']
            ?? null,
          response: responseDetails ?? null,
          message: error?.message ?? 'Unknown request error',
        });
      }
      throw error;
    }

    console.warn('[BACKEND RESPONSE]');
    console.warn(JSON.stringify(response.data, null, 2));
    const data = response.data?.data ?? response.data;
    const backendRoute = data?.route && typeof data.route === 'object' ? data.route : {};
    const backendPoints = data?.gps_points
      ?? data?.points
      ?? data?.coordinates
      ?? backendRoute.gps_points
      ?? backendRoute.points
      ?? backendRoute.coordinates;
    console.info('[GPS_POINT_COUNTS] Backend response', JSON.stringify({
      gps_points_count: data?.gps_points_count ?? null,
      returnedPointArrayLength: Array.isArray(backendPoints) ? backendPoints.length : null,
    }));
    const activityId = data?.activity_id ?? data?.id ?? null;
    const normalizedActivityId = typeof activityId === 'string' || typeof activityId === 'number'
      ? activityId
      : null;
    if (normalizedActivityId !== null && submissionPayload.lap_events?.length) {
      try {
        await activityManualLapOverrides.save(normalizedActivityId, submissionPayload.lap_events);
      } catch (error) {
        console.warn('[ActivityUpload] Could not persist local manual lap details', error);
      }
    }
    return {
      success: response.status >= 200 && response.status < 300,
      activityId: normalizedActivityId,
    };
  }
}
