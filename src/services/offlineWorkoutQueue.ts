import * as FileSystem from 'expo-file-system/legacy';
import { ActivitySubmissionPayload } from '../types/running';
import { RunningApiClient } from './runningApi';
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
const queueListeners = new Set<(count: number) => void>();
let isSyncing = false;

const notifyListeners = (count: number) => {
  queueListeners.forEach((listener) => {
    try {
      listener(count);
    } catch (e) {
      console.warn('[OfflineWorkoutQueue] Listener error', e);
    }
  });
};

export const offlineWorkoutQueue = {
  subscribe(listener: (count: number) => void): () => void {
    queueListeners.add(listener);
    void offlineWorkoutQueue.getCount().then(listener);
    return () => {
      queueListeners.delete(listener);
    };
  },

  async getPending(): Promise<QueuedOfflineWorkout[]> {
    if (!QUEUE_FILE_URI) return [];
    try {
      const info = await FileSystem.getInfoAsync(QUEUE_FILE_URI);
      if (!info.exists) return [];
      const text = await FileSystem.readAsStringAsync(QUEUE_FILE_URI);
      const items = JSON.parse(text);
      return Array.isArray(items) ? (items as QueuedOfflineWorkout[]) : [];
    } catch (error) {
      console.warn('[OfflineWorkoutQueue] Failed to read offline workouts queue', error);
      return [];
    }
  },

  async getCount(): Promise<number> {
    const items = await this.getPending();
    return items.length;
  },

  async enqueue(
    workout: Omit<QueuedOfflineWorkout, 'id' | 'createdAt' | 'retryCount'>
  ): Promise<string> {
    const id = `offline-workout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fullItem: QueuedOfflineWorkout = {
      ...workout,
      id,
      createdAt: Date.now(),
      retryCount: 0,
    };

    queueWriteChain = queueWriteChain.then(async () => {
      const current = await offlineWorkoutQueue.getPending();
      current.push(fullItem);
      if (QUEUE_FILE_URI) {
        await FileSystem.writeAsStringAsync(QUEUE_FILE_URI, JSON.stringify(current));
      }
      notifyListeners(current.length);
    });

    await queueWriteChain;
    console.log(`[OfflineWorkoutQueue] Workout ${id} saved to offline queue.`);
    return id;
  },

  async remove(id: string): Promise<void> {
    queueWriteChain = queueWriteChain.then(async () => {
      const current = await offlineWorkoutQueue.getPending();
      const filtered = current.filter((item) => item.id !== id);
      if (QUEUE_FILE_URI) {
        await FileSystem.writeAsStringAsync(QUEUE_FILE_URI, JSON.stringify(filtered));
      }
      notifyListeners(filtered.length);
    });
    await queueWriteChain;
  },

  async clear(): Promise<void> {
    queueWriteChain = queueWriteChain.then(async () => {
      if (QUEUE_FILE_URI) {
        await FileSystem.writeAsStringAsync(QUEUE_FILE_URI, JSON.stringify([]));
      }
      notifyListeners(0);
    });
    await queueWriteChain;
    console.log('[OfflineWorkoutQueue] Cleared all offline workouts.');
  },

  async syncPending(
    client?: RunningApiClient
  ): Promise<SyncPendingResult> {
    if (isSyncing) {
      return { synced: 0, failed: 0 };
    }

    const items = await this.getPending();
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
        const submission = await apiClient.submitActivity(item.payload);
        if (submission.success) {
          const activityId = submission.activityId;
          if (activityId !== null) {
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
          errorMsg = `Server Error (${error?.response?.status || 500}): Backend failed while processing this workout (e.g. insufficient GPS points or 0-distance test run).`;
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
        // If it's a network error, stop trying further items right now
        const isNetwork =
          !error?.response ||
          error?.code === 'ECONNABORTED' ||
          error?.message?.toLowerCase().includes('network');
        if (isNetwork) {
          break;
        }
      }
    }

    isSyncing = false;
    return { synced, failed, lastError };
  },
};

