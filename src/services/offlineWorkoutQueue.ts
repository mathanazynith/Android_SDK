import * as FileSystem from 'expo-file-system/legacy';
import { ActivitySubmissionPayload } from '../types/running';
import { activityAPI } from './activityApi';
import {
  ACTIVITY_UPLOAD_PREFLIGHT_ERROR_CODE,
  RunningApiClient,
} from './runningApi';
import { activityDistanceOverrides } from './activityDistanceOverrides';
import { activityTimingOverrides } from './activityTimingOverrides';

export interface QueuedOfflineWorkout {
  id: string;
  runId: string | null;
  userId: string | null;
  workoutTitle?: string | null;
  payload: ActivitySubmissionPayload;
  totalDistance: number;
  movingTimePayloadSeconds: number;
  elapsedTimePayloadSeconds: number;
  pausedTimeSeconds: number;
  pauseCount: number;
  createdAt: number;
  retryCount: number;
  lastError?: string;
}

export interface SyncPendingResult {
  synced: number;
  failed: number;
  lastError?: string;
}

const QUEUE_FILE_URI = `${FileSystem.documentDirectory ?? ''}zyrun-offline-workouts.json`;
let queueWriteChain: Promise<void> = Promise.resolve();
const queueListeners = new Set<{
  listener: (count: number) => void;
  userId?: string | number | null;
}>();
let isSyncing = false;

const notifyListeners = () => {
  queueListeners.forEach(({ listener, userId }) => {
    try {
      void offlineWorkoutQueue.getCount(userId).then(listener);
    } catch (e) {
      console.warn('[OfflineWorkoutQueue] Listener error', e);
    }
  });
};

export const offlineWorkoutQueue = {
  subscribe(listener: (count: number) => void, userId?: string | number | null): () => void {
    const subscription = { listener, userId };
    queueListeners.add(subscription);
    void offlineWorkoutQueue.getCount(userId).then(listener);
    return () => {
      queueListeners.delete(subscription);
    };
  },

  async getPending(userId?: string | number | null): Promise<QueuedOfflineWorkout[]> {
    if (!QUEUE_FILE_URI) return [];
    try {
      const info = await FileSystem.getInfoAsync(QUEUE_FILE_URI);
      if (!info.exists) return [];
      const text = await FileSystem.readAsStringAsync(QUEUE_FILE_URI);
      const items = JSON.parse(text);
      const pending = Array.isArray(items) ? (items as QueuedOfflineWorkout[]) : [];
      if (userId === undefined) return pending;
      if (userId === null) return [];
      return pending.filter((item) => item.userId != null && String(item.userId) === String(userId));
    } catch (error) {
      console.warn('[OfflineWorkoutQueue] Failed to read offline workouts queue', error);
      return [];
    }
  },

  async getCount(userId?: string | number | null): Promise<number> {
    const items = await this.getPending(userId);
    return items.length;
  },

  async enqueue(
    workout: Omit<QueuedOfflineWorkout, 'id' | 'createdAt' | 'retryCount'>
  ): Promise<string> {
    const id = `offline-workout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let queuedId = id;
    const fullItem: QueuedOfflineWorkout = {
      ...workout,
      id,
      createdAt: Date.now(),
      retryCount: 0,
    };

    queueWriteChain = queueWriteChain.then(async () => {
      const current = await offlineWorkoutQueue.getPending();
      const existing = workout.runId
        ? current.find((item) => item.runId === workout.runId
          && item.userId != null
          && workout.userId != null
          && String(item.userId) === String(workout.userId))
        : undefined;
      if (existing) {
        queuedId = existing.id;
        return;
      }
      current.push(fullItem);
      if (QUEUE_FILE_URI) {
        await FileSystem.writeAsStringAsync(QUEUE_FILE_URI, JSON.stringify(current));
      }
      notifyListeners();
    });

    await queueWriteChain;
    console.log(`[OfflineWorkoutQueue] Workout ${queuedId} saved to offline queue.`);
    return queuedId;
  },

  async remove(id: string): Promise<void> {
    queueWriteChain = queueWriteChain.then(async () => {
      const current = await offlineWorkoutQueue.getPending();
      const filtered = current.filter((item) => item.id !== id);
      if (QUEUE_FILE_URI) {
        await FileSystem.writeAsStringAsync(QUEUE_FILE_URI, JSON.stringify(filtered));
      }
      notifyListeners();
    });
    await queueWriteChain;
  },

  async clear(userId?: string | number | null): Promise<void> {
    if (userId === null) return;
    queueWriteChain = queueWriteChain.then(async () => {
      const current = await offlineWorkoutQueue.getPending();
      const remaining = userId === undefined
        ? []
        : current.filter((item) => item.userId == null || String(item.userId) !== String(userId));
      if (QUEUE_FILE_URI) {
        await FileSystem.writeAsStringAsync(QUEUE_FILE_URI, JSON.stringify(remaining));
      }
      notifyListeners();
    });
    await queueWriteChain;
    console.log('[OfflineWorkoutQueue] Cleared all offline workouts.');
  },

  async syncPending(
    client?: RunningApiClient,
    userId?: string | number | null,
  ): Promise<SyncPendingResult> {
    if (userId == null) return { synced: 0, failed: 0 };
    if (isSyncing) {
      return { synced: 0, failed: 0 };
    }

    const items = await this.getPending(userId);
    if (items.length === 0) {
      return { synced: 0, failed: 0 };
    }

    isSyncing = true;
    const apiClient = client ?? new RunningApiClient();
    let synced = 0;
    let failed = 0;
    let lastError: string | undefined;

    console.log(`[OfflineWorkoutQueue] Attempting to sync ${items.length} offline workouts...`);

    for (const item of items) {
      try {
        const submission = await apiClient.submitActivity(item.payload, item.runId);
        if (submission.success) {
          const activityId = submission.activityId;
          if (activityId !== null) {
            await activityAPI.cacheSavedWorkout(activityId, item.payload, item.userId).catch((cacheError) => {
              console.warn('[OfflineWorkoutQueue] Could not cache synced workout in History', cacheError);
            });
            try {
              await activityDistanceOverrides.save(activityId, item.totalDistance);
              await activityTimingOverrides.save(activityId, {
                moving_time: item.movingTimePayloadSeconds,
                elapsed_time: item.elapsedTimePayloadSeconds,
                moving_time_s: item.movingTimePayloadSeconds,
                elapsed_time_s: item.elapsedTimePayloadSeconds,
                paused_time_s: Math.round(item.pausedTimeSeconds),
                pause_count: item.pauseCount,
              });
            } catch (overrideError) {
              console.warn('[OfflineWorkoutQueue] Override save failed during sync', overrideError);
            }
          }

          if (item.runId && !item.runId.startsWith('offline-')) {
            try {
              await apiClient.stopRun({
                run_id: item.runId,
                ended_at: item.payload.end_time,
                final_sequence: item.payload.gps_points?.length ?? 0,
              });
            } catch (stopErr) {
              console.warn('[OfflineWorkoutQueue] stopRun failed during sync', stopErr);
            }
          }

          await this.remove(item.id);
          synced += 1;
          console.log(`[OfflineWorkoutQueue] Workout ${item.id} successfully synced to server!`);
        } else {
          failed += 1;
          lastError = 'Server rejected workout submission';
        }
      } catch (error: any) {
        failed += 1;
        const responseData = error?.response?.data;
        let errorMsg: string;
        if (typeof responseData === 'string' && (responseData.includes('<html') || responseData.includes('Server Error'))) {
          errorMsg = `Server Error (${error?.response?.status || 500}): The server returned no diagnostic details. Check the backend logs for the exception.`;
        } else {
          errorMsg =
            responseData?.message ||
            responseData?.detail ||
            responseData?.error ||
            (typeof responseData === 'string' ? responseData : null) ||
            error?.message ||
            'Network connection error';
        }
        lastError = errorMsg;
        console.warn(`[OfflineWorkoutQueue] Sync failed for workout ${item.id}:`, errorMsg);
        const responseStatus = Number(error?.response?.status);
        // Keep every failed workout intact until the server confirms success.
        // A server response for this item does not prevent attempting later
        // queued workouts; only a connection-level failure stops this pass.
        const isUploadPreflightFailure = error?.code === ACTIVITY_UPLOAD_PREFLIGHT_ERROR_CODE;
        const isNetwork =
          !error?.response ||
          error?.code === 'ECONNABORTED' ||
          error?.code === 'ETIMEDOUT' ||
          error?.message?.toLowerCase().includes('network') ||
          error?.message?.toLowerCase().includes('timeout');
        if (responseStatus >= 500) {
          console.warn(`[OfflineWorkoutQueue] Keeping workout ${item.id} queued after retryable server error (HTTP ${responseStatus}).`);
        }
        if (isNetwork && !isUploadPreflightFailure) {
          break;
        }
      }
    }

    isSyncing = false;
    return { synced, failed, lastError };
  },
};

