import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivitySubmissionPayload } from '../types/running';

const queueState = vi.hoisted(() => ({ contents: '[]' }));

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock/',
  getInfoAsync: vi.fn(async () => ({ exists: queueState.contents !== null })),
  readAsStringAsync: vi.fn(async () => queueState.contents),
  writeAsStringAsync: vi.fn(async (_uri: string, contents: string) => {
    queueState.contents = contents;
  }),
}));

vi.mock('./activityApi', () => ({
  activityAPI: { cacheSavedWorkout: vi.fn(async () => undefined) },
}));
vi.mock('./activityDistanceOverrides', () => ({
  activityDistanceOverrides: { save: vi.fn(async () => undefined) },
}));
vi.mock('./activityTimingOverrides', () => ({
  activityTimingOverrides: { save: vi.fn(async () => undefined) },
}));
vi.mock('./runningApi', () => ({
  ACTIVITY_UPLOAD_PREFLIGHT_ERROR_CODE: 'ACTIVITY_UPLOAD_PREFLIGHT_FAILED',
  RunningApiClient: class {},
}));

const makePayload = (distance: number): ActivitySubmissionPayload => ({
  gps_points: [],
  start_time: '2026-01-01T00:00:00.000Z',
  end_time: '2026-01-01T00:01:00.000Z',
  moving_time: 60,
  elapsed_time: 60,
  moving_time_s: 60,
  elapsed_time_s: 60,
  activity_type: 'RUN',
  distance,
  distance_meters: distance,
  workout_distance_meters: distance,
  additional_distance_meters: 0,
  total_distance_meters: distance,
  split_distance_m: 1000,
  avg_pace: 300,
  pace_seconds_per_km: 300,
});

const enqueue = (queue: typeof import('./offlineWorkoutQueue').offlineWorkoutQueue, payload: ActivitySubmissionPayload) => (
  queue.enqueue({
    runId: `offline-${payload.distance}`,
    userId: 'user-1',
    payload,
    totalDistance: payload.distance,
    movingTimePayloadSeconds: payload.moving_time_s,
    elapsedTimePayloadSeconds: payload.elapsed_time_s,
    pausedTimeSeconds: 0,
    pauseCount: 0,
  })
);

describe('offlineWorkoutQueue upload handling', () => {
  beforeEach(() => {
    queueState.contents = '[]';
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('removes an item only after confirmed success and preserves the submitted payload', async () => {
    const { offlineWorkoutQueue } = await import('./offlineWorkoutQueue');
    const payload = makePayload(1234.5);
    await enqueue(offlineWorkoutQueue, payload);
    const client = {
      submitActivity: vi.fn(async () => ({ success: true, activityId: 17 })),
      stopRun: vi.fn(async () => true),
    } as any;

    const result = await offlineWorkoutQueue.syncPending(client, 'user-1');

    expect(result).toMatchObject({ synced: 1, failed: 0 });
    expect(client.submitActivity).toHaveBeenCalledWith(payload, `offline-${payload.distance}`);
    expect(await offlineWorkoutQueue.getPending('user-1')).toEqual([]);
  });

  it('retains a workout after HTTP 500 and continues uploading later queued workouts', async () => {
    const { offlineWorkoutQueue } = await import('./offlineWorkoutQueue');
    const failedPayload = makePayload(500);
    const nextPayload = makePayload(900);
    await enqueue(offlineWorkoutQueue, failedPayload);
    await enqueue(offlineWorkoutQueue, nextPayload);
    const serverError = Object.assign(new Error('Request failed with status code 500'), {
      response: { status: 500, data: '<html>Internal Server Error</html>' },
    });
    const client = {
      submitActivity: vi.fn()
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({ success: true, activityId: 19 }),
      stopRun: vi.fn(async () => true),
    } as any;

    const result = await offlineWorkoutQueue.syncPending(client, 'user-1');
    const pending = await offlineWorkoutQueue.getPending('user-1');

    expect(result).toMatchObject({ synced: 1, failed: 1 });
    expect(client.submitActivity).toHaveBeenCalledTimes(2);
    expect(client.submitActivity.mock.calls.map(([payload]: [ActivitySubmissionPayload]) => payload))
      .toEqual([failedPayload, nextPayload]);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.payload).toEqual(failedPayload);
    expect(pending[0]?.totalDistance).toBe(failedPayload.total_distance_meters);
  });

  it('keeps client-rejected workouts queued until an upload is confirmed successful', async () => {
    const { offlineWorkoutQueue } = await import('./offlineWorkoutQueue');
    const payload = makePayload(321);
    await enqueue(offlineWorkoutQueue, payload);
    const client = {
      submitActivity: vi.fn().mockRejectedValue(Object.assign(new Error('Invalid workout'), {
        response: { status: 422, data: { detail: 'Invalid workout' } },
      })),
      stopRun: vi.fn(async () => true),
    } as any;

    const result = await offlineWorkoutQueue.syncPending(client, 'user-1');

    expect(result).toMatchObject({ synced: 0, failed: 1 });
    expect((await offlineWorkoutQueue.getPending('user-1'))[0]?.payload).toEqual(payload);
  });
});
