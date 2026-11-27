import api from '../../service/api';
import { ActivitySubmissionPayload, RunSessionStartPayload, RunSessionStartResponse, RunStopPayload, UploadBatchPayload } from '../types/running';
import { calculateDistanceMeters } from '../utils/distance';
import {
  compactActivitySubmissionPayload,
  filterActivityPointsForBackendAccuracy,
  MAX_BACKEND_GPS_ACCURACY_METERS,
  normalizeActivityPauseMetrics,
  normalizeActivityTimestampsToSeconds,
} from './activityPayloadCompaction';
import { activityManualLapOverrides } from './activityManualLapOverrides';
import { getOnlyMeDefaultAudience, socialAPI } from './socialApi';

// `service/api.ts` supplies the /api/v1 base URL and authenticated Bearer
// token, so this resolves to POST /api/v1/rundata/upload/ by default.
const ACTIVITY_UPLOAD_PATH = (
  process.env.EXPO_PUBLIC_ACTIVITY_UPLOAD_PATH || '/rundata/upload/'
).trim();

export const ACTIVITY_UPLOAD_PREFLIGHT_ERROR_CODE = 'ACTIVITY_UPLOAD_PREFLIGHT_FAILED';

export class ActivityUploadPreflightError extends Error {
  readonly code = ACTIVITY_UPLOAD_PREFLIGHT_ERROR_CODE;

  constructor(message: string) {
    super(message);
    this.name = 'ActivityUploadPreflightError';
  }
}

const createRunId = (): string =>
  `RUN-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

type LapRoutePoint = {
  latitude: number;
  longitude: number;
  timestamp: string;
  is_paused?: boolean;
  is_extra_distance?: boolean;
};

type LapRoute = { key: string; points: LapRoutePoint[] };

const getDistanceAtTime = (points: LapRoutePoint[], timestampMs: number) => {
  const orderedPoints = points
    .filter((point) => !point.is_paused)
    .map((point) => ({ point, time: Date.parse(point.timestamp) }))
    .filter((item) => Number.isFinite(item.time))
    .sort((left, right) => left.time - right.time);
  if (orderedPoints.length < 2) return null;

  let cumulativeDistance = 0;
  for (let index = 1; index < orderedPoints.length; index += 1) {
    const previous = orderedPoints[index - 1];
    const current = orderedPoints[index];
    const intervalDistance = calculateDistanceMeters(previous.point, current.point);
    if (!Number.isFinite(intervalDistance) || intervalDistance < 0) continue;

    if (timestampMs >= previous.time && timestampMs <= current.time) {
      const duration = current.time - previous.time;
      const fraction = duration > 0 ? (timestampMs - previous.time) / duration : 0;
      return cumulativeDistance + intervalDistance * Math.max(0, Math.min(1, fraction));
    }
    cumulativeDistance += intervalDistance;
  }
  return null;
};

const roundBackendMeter = (meters: number) => {
  const lower = Math.floor(meters);
  const fraction = meters - lower;
  if (fraction < 0.5) return lower;
  if (fraction > 0.5) return lower + 1;
  return lower % 2 === 0 ? lower : lower + 1;
};

/**
 * The backend turns manual lap event distances into whole meters and rejects
 * duplicate or terminal lap boundaries. Drop only boundaries that cannot
 * form a valid positive lap; the final activity/segment distance then remains
 * part of the automatically generated final lap.
 */
const keepValidManualLapEvents = (payload: ActivitySubmissionPayload) => {
  const routes: LapRoute[] = [];
  if (payload.segments?.length) {
    payload.segments.forEach((segment) => {
      routes.push({ key: `segment-${segment.sequence}`, points: segment.gps_points });
      if (segment.recovery) {
        routes.push({ key: `segment-${segment.recovery.sequence}`, points: segment.recovery.gps_points });
      }
    });
    if (payload.extra?.gps_points.length) {
      routes.push({ key: 'extra', points: payload.extra.gps_points });
    }
  } else {
    const regularPoints = payload.gps_points.filter((point) => !point.is_extra_distance);
    if (regularPoints.length) routes.push({ key: 'activity', points: regularPoints });
    const extraPoints = payload.extra?.gps_points?.length
      ? payload.extra.gps_points
      : payload.gps_points.filter((point) => point.is_extra_distance);
    if (extraPoints.length) routes.push({ key: 'extra', points: extraPoints });
  }

  const previousRoundedDistance = new Map<string, number>();
  const events = (payload.lap_events ?? []).flatMap((event) => {
    const eventTime = Date.parse(event.timestamp);
    if (!Number.isFinite(eventTime)) return [];
    const matches = routes.flatMap((route) => {
      const ordered = route.points
        .map((point) => ({ point, time: Date.parse(point.timestamp) }))
        .filter((item) => Number.isFinite(item.time))
        .sort((left, right) => left.time - right.time);
      if (ordered.length < 2 || eventTime < ordered[0].time || eventTime > ordered.at(-1)!.time) return [];
      const distance = getDistanceAtTime(route.points, eventTime);
      const totalDistance = ordered.slice(1).reduce((total, current, index) => (
        total + calculateDistanceMeters(ordered[index].point, current.point)
      ), 0);
      return distance === null ? [] : [{ route, distance, totalDistance }];
    });

    // A manual lap timestamp with no route interval, or one that ambiguously
    // falls on multiple segment timelines, cannot be split safely by backend.
    if (matches.length !== 1) return [];
    const [{ route, distance, totalDistance }] = matches;
    const roundedDistance = roundBackendMeter(distance);
    const roundedTotal = roundBackendMeter(totalDistance);
    const previousDistance = previousRoundedDistance.get(route.key) ?? 0;
    if (roundedDistance <= previousDistance || roundedDistance >= roundedTotal) return [];
    previousRoundedDistance.set(route.key, roundedDistance);
    return [event];
  });

  return events.map((event, index) => ({ ...event, event_number: index + 1 }));
};

/**
 * Keep free activities and structured interval activities on distinct API
 * shapes. This also repairs queued payloads created by older app versions.
 */
export const normalizeActivitySubmissionPayload = (
  payload: ActivitySubmissionPayload,
): ActivitySubmissionPayload => {
  const hasIntervalStructure = Boolean(payload.laps?.length || payload.segments?.length);
  const { laps, segments, ...activity } = payload;
  const lap_events = keepValidManualLapEvents(payload);

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
    const accuracyFilteredPayload = filterActivityPointsForBackendAccuracy(payload);
    if (__DEV__) {
      console.info('[ActivityUpload] Backend GPS accuracy filter', {
        submittedPoints: payload.gps_points.length,
        acceptedPoints: accuracyFilteredPayload.payload.gps_points.length,
        rejectedPoints: accuracyFilteredPayload.rejectedPointCount,
        maxAccuracyMeters: MAX_BACKEND_GPS_ACCURACY_METERS,
      });
    }
    if (accuracyFilteredPayload.payload.gps_points.length === 0) {
      throw new ActivityUploadPreflightError(
        `No GPS points meet the server's ${MAX_BACKEND_GPS_ACCURACY_METERS} m accuracy limit.`,
      );
    }

    let pauseNormalizedPayload: ActivitySubmissionPayload;
    try {
      const secondPrecisionPayload = normalizeActivityTimestampsToSeconds(
        accuracyFilteredPayload.payload,
      );
      pauseNormalizedPayload = normalizeActivityPauseMetrics(secondPrecisionPayload);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      throw new ActivityUploadPreflightError(`Workout timing data is invalid: ${error.message}`);
    }
    const normalizedPayload = normalizeActivitySubmissionPayload(pauseNormalizedPayload);
    const compactedPayload = compactActivitySubmissionPayload(normalizedPayload);
    const submissionPayload = compactedPayload.payload;
    if (__DEV__) {
      console.info('[ActivityUpload] Payload compaction', {
        originalBytes: compactedPayload.originalBytes,
        bytes: compactedPayload.bytes,
        toleranceMeters: compactedPayload.toleranceMeters,
      });
    }
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
          : JSON.stringify(responseData)?.slice(0, 4_000);
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
    if (normalizedActivityId !== null && await getOnlyMeDefaultAudience()) {
      try {
        await socialAPI.createWorkoutPost({
          activity_id: Number(normalizedActivityId),
          visibility: 'ONLY_ME',
        });
      } catch (postError) {
        // The activity upload is already committed; a post failure must not
        // turn a successful workout save into a failed upload or retry.
        console.warn('[WorkoutSharing] Private post creation failed', postError);
      }
    }
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
