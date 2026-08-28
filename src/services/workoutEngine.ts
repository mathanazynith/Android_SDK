import { RunningGpsPoint } from '../types/running';
import {
    ActiveWorkoutSegment,
    BackendWorkout,
    WorkoutEngineSnapshot,
    WorkoutEngineState,
    WorkoutLap,
    WorkoutSegmentType,
} from '../types/workout';
import { calculateDistanceMeters } from '../utils/distance';

export interface WorkoutEngineCallbacks {
  onSegmentStarted?: (segment: ActiveWorkoutSegment) => void;
  onSegmentCompleted?: (lap: WorkoutLap) => void;
  onWorkoutCompleted?: () => void;
}

/**
 * Owns only workout progress. LocationService and PathProcessor remain the
 * source of GPS data and continue to record during rest or manual pause.
 */
export class WorkoutEngine {
  private readonly callbacks: WorkoutEngineCallbacks;
  private queue: ActiveWorkoutSegment[] = [];
  private index = -1;
  private state: WorkoutEngineState = 'idle';
  private currentLap: WorkoutLap | null = null;
  private completedLaps: WorkoutLap[] = [];
  private lastPoint: RunningGpsPoint | null = null;
  private distanceAnchor: RunningGpsPoint | null = null;
  private pausedAt: number | null = null;
  private stateBeforePause: WorkoutEngineState = 'running';

  public constructor(callbacks: WorkoutEngineCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public loadWorkout(workout: BackendWorkout): void {
    this.queue = this.expand(workout);
    this.index = -1;
    this.currentLap = null;
    this.completedLaps = [];
    this.lastPoint = null;
    this.distanceAnchor = null;
    this.state = 'idle';
  }

  public start(initialPoint: RunningGpsPoint | null): void {
    if (this.state !== 'idle') return;
    this.lastPoint = initialPoint;
    this.startNext(initialPoint);
  }

  /** Pass the previous sample separately so distance is never derived from UI state. */
  public ingestDistancePoint(previous: RunningGpsPoint | null, point: RunningGpsPoint): void {
    this.lastPoint = point;
    if (this.state !== 'running' || !this.currentLap || this.currentLap.segmentType === 'Rest') return;
    if (!previous) {
      this.distanceAnchor = point;
      this.refreshDuration(point.timestamp);
      return;
    }
    const anchor = this.distanceAnchor ?? previous;
    const delta = calculateDistanceMeters(anchor, point);
    const elapsedSeconds = Math.max(0.001, (point.timestamp - anchor.timestamp) / 1_000);
    const impliedSpeed = delta / elapsedSeconds;
    const accuracyRadius = Math.max(anchor.accuracy ?? 0, point.accuracy ?? 0);
    const minimumMeaningfulDistance = Math.max(3, Math.min(12, accuracyRadius));
    if (
      Number.isFinite(delta)
      && delta >= minimumMeaningfulDistance
      && impliedSpeed <= 12
    ) {
      this.currentLap.distanceMeters += delta;
      this.distanceAnchor = point;
    }
    this.refreshDuration(point.timestamp);
    if (this.currentLap.targetDistanceMeters !== null && this.currentLap.distanceMeters >= this.currentLap.targetDistanceMeters) {
      this.completeCurrent(point.timestamp);
    }
  }

  public tick(now = Date.now()): void {
    if (this.state !== 'running' || !this.currentLap) return;
    this.refreshDuration(now);
    if (this.currentLap.targetDurationSeconds !== null && this.currentLap.elapsedSeconds >= this.currentLap.targetDurationSeconds) {
      this.completeCurrent(now);
    }
  }

  public continue(): void {
    if (this.state !== 'waiting') return;
    this.startNext(this.lastPoint);
  }

  public pause(): void {
    if (this.state !== 'running' && this.state !== 'waiting') return;
    this.stateBeforePause = this.state;
    this.pausedAt = Date.now();
    this.state = 'paused';
  }

  public resume(): void {
    if (this.state !== 'paused') return;
    if (this.currentLap && this.pausedAt !== null) {
      this.currentLap.startedAt += Math.max(0, Date.now() - this.pausedAt);
    }
    this.pausedAt = null;
    this.state = this.stateBeforePause;
  }

  public shouldUseLightPolyline(): boolean {
    // Rest is still part of the planned workout, so it remains green.
    // Only post-workout continuation (or a manual pause) is gray.
    return this.state === 'completed' || this.state === 'paused';
  }

  public isDistanceCounting(): boolean {
    return this.state === 'running' && this.currentLap?.segmentType !== 'Rest';
  }

  public getSnapshot(): WorkoutEngineSnapshot {
    return {
      state: this.state,
      currentSegment: this.currentLap ? this.segmentOf(this.currentLap) : null,
      currentLap: this.currentLap ? { ...this.currentLap } : null,
      completedLaps: this.completedLaps.map((lap) => ({ ...lap })),
      totalLaps: this.queue.length,
    };
  }

  private startNext(point: RunningGpsPoint | null): void {
    this.index += 1;
    const segment = this.queue[this.index];
    if (!segment) {
      this.currentLap = null;
      this.state = 'completed';
      this.callbacks.onWorkoutCompleted?.();
      return;
    }
    const now = point?.timestamp ?? Date.now();
    this.currentLap = {
      ...segment, startedAt: now, completedAt: null,
      distanceMeters: 0, elapsedSeconds: 0, completed: false,
    };
    this.state = 'running';
    this.callbacks.onSegmentStarted?.(segment);
  }

  private completeCurrent(timestamp: number): void {
    if (!this.currentLap || this.state !== 'running') return;
    this.refreshDuration(timestamp);
    this.currentLap.completed = true;
    this.currentLap.completedAt = timestamp;
    const completed = { ...this.currentLap };
    this.completedLaps.push(completed);
    this.currentLap = null;
    const isFinalLap = this.index === this.queue.length - 1;
    this.state = isFinalLap ? 'completed' : 'waiting';
    this.callbacks.onSegmentCompleted?.(completed);
    if (isFinalLap) {
      this.callbacks.onWorkoutCompleted?.();
    }
  }

  private refreshDuration(timestamp: number): void {
    if (!this.currentLap) return;
    this.currentLap.elapsedSeconds = Math.max(0, (timestamp - this.currentLap.startedAt) / 1000);
  }

  private segmentOf(lap: WorkoutLap): ActiveWorkoutSegment {
    const { startedAt, completedAt, distanceMeters, elapsedSeconds, completed, ...segment } = lap;
    return segment;
  }

  private expand(workout: BackendWorkout): ActiveWorkoutSegment[] {
    const source = workout.segments.length > 0 ? workout.segments : [{
      segment_order: 1, segment_type: 'Run', repeats: 1, rep_distance: workout.distance,
      duration: workout.duration, target_pace: workout.target_pace, pace_unit: workout.pace_unit,
      rest_duration: null, notes: workout.notes,
    }];
    const result: ActiveWorkoutSegment[] = [];
    for (const item of [...source].sort((a, b) => a.segment_order - b.segment_order)) {
      const type = this.normalize(item.segment_type);
      const repeats = Math.max(1, item.repeats || 1);
      for (let repeat = 1; repeat <= repeats; repeat += 1) {
        result.push(this.segment(item.segment_order, type, repeat, repeats, item));
        if (type === 'Run' && repeat < repeats && (item.rest_duration ?? 0) > 0) {
          result.push({
            segmentOrder: item.segment_order, segmentType: 'Rest', repeatNumber: repeat,
            totalRepeats: repeats, targetDistanceMeters: null,
            targetDurationSeconds: item.rest_duration, targetPace: null, paceUnit: null,
            notes: `Rest after interval ${repeat}.`,
          });
        }
      }
    }
    return result;
  }

  private segment(order: number, type: WorkoutSegmentType, repeat: number, total: number, item: BackendWorkout['segments'][number]): ActiveWorkoutSegment {
    return {
      segmentOrder: order, segmentType: type, repeatNumber: repeat, totalRepeats: total,
      targetDistanceMeters: item.rep_distance, targetDurationSeconds: item.duration,
      targetPace: item.target_pace, paceUnit: item.pace_unit, notes: item.notes,
    };
  }

  private normalize(value: string): WorkoutSegmentType {
    const type = value.trim().toLowerCase();
    if (type === 'warmup' || type === 'warm-up') return 'Warmup';
    if (type === 'cooldown' || type === 'cool-down') return 'Cooldown';
    if (type === 'rest') return 'Rest';
    return 'Run';
  }
}
