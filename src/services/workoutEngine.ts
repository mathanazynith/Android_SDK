import {
  BackendWorkout,
  ActiveWorkoutSegment,
  WorkoutEngineState,
  WorkoutLap,
  WorkoutEngineSnapshot,
} from '../types/workout';

import { RunningGpsPoint } from '../types/running';

import { calculateDistanceMeters } from '../utils/distance';

import { WorkoutLapManager } from './workoutLapManager';

export interface WorkoutEngineCallbacks {
  onSegmentStarted?: (
    segment: ActiveWorkoutSegment,
  ) => void;

  onSegmentCompleted?: (
    lap: WorkoutLap,
  ) => void;

  onRestStarted?: (
    seconds: number,
  ) => void;

  onWorkoutCompleted?: () => void;

  onPopupRequired?: (
    lap: WorkoutLap,
  ) => void;
}

export class WorkoutEngine {

  private readonly lapManager =
    new WorkoutLapManager();

  private readonly callbacks: WorkoutEngineCallbacks;

  private workout: BackendWorkout | null = null;

  private executionQueue: ActiveWorkoutSegment[] = [];

  private currentIndex = -1;

  private state: WorkoutEngineState = 'idle';

  private currentSegment: ActiveWorkoutSegment | null = null;

  private lastGpsPoint: RunningGpsPoint | null = null;

  private overallDistance = 0;

  private overallStartTimestamp: number | null = null;

  private lastOverallPoint: RunningGpsPoint | null = null;

  private restStartedAt: number | null = null;

  private pausedAt: number | null = null;

  private totalPausedMilliseconds = 0;

  constructor(
    callbacks: WorkoutEngineCallbacks = {},
  ) {
    this.callbacks = callbacks;
  }

  /**
   * Convert backend workout JSON into a flat execution queue.
   */
  public loadWorkout(
    workout: BackendWorkout,
  ): void {

    this.reset();

    this.workout = workout;

    this.executionQueue =
      this.buildExecutionQueue(workout);

    console.log(
      '[WorkoutEngine] Execution queue:',
      JSON.stringify(
        this.executionQueue,
        null,
        2,
      ),
    );
  }

  /**
   * START RUN
   *
   * GPS must already be started by the screen.
   */
  public start(
    initialGpsPoint?: RunningGpsPoint | null,
  ): void {

    if (
      this.state === 'running'
    ) {
      return;
    }

    if (
      this.state === 'completed'
    ) {
      return;
    }

    this.state = 'running';

    const now =
      initialGpsPoint?.timestamp ??
      Date.now();

    if (!this.overallStartTimestamp) {
      this.overallStartTimestamp = now;
    }

    if (initialGpsPoint) {
      this.lastGpsPoint = initialGpsPoint;
      this.lastOverallPoint = initialGpsPoint;
    }

    if (this.currentSegment === null) {
      this.startNextSegment(
        initialGpsPoint ?? null,
      );
    }
  }

  /**
   * Pause does NOT stop GPS automatically.
   *
   * The screen decides whether GPS should remain alive.
   */
  public pause(): void {

    if (this.state !== 'running') {
      return;
    }

    this.state = 'paused';

    this.pausedAt = Date.now();
  }

  public resume(
    gpsPoint?: RunningGpsPoint | null,
  ): void {

    if (this.state !== 'paused') {
      return;
    }

    this.state = 'running';

    if (this.pausedAt !== null) {
      const pausedMilliseconds = Math.max(0, Date.now() - this.pausedAt);
      this.totalPausedMilliseconds += pausedMilliseconds;
      this.lapManager.shiftCurrentLapStartBy(pausedMilliseconds);
      this.pausedAt = null;
    }

    if (gpsPoint) {
      this.lastGpsPoint = gpsPoint;
      this.lastOverallPoint = gpsPoint;
    }
  }

  /**
   * Every raw accepted GPS point should be passed here.
   */
  public ingestGpsPoint(
    point: RunningGpsPoint,
  ): void {

    this.lastGpsPoint = point;

    if (
      this.state !== 'running'
    ) {
      return;
    }

    this.updateOverallDistance(point);

    this.lapManager.ingestGpsPoint(point);

    this.checkCurrentSegmentCompletion(point);
  }

  private updateOverallDistance(
    point: RunningGpsPoint,
  ): void {

    if (this.lastOverallPoint) {

      const delta =
        calculateDistanceMeters(
          this.lastOverallPoint,
          point,
        );

      if (
        Number.isFinite(delta) &&
        delta >= 0 &&
        delta < 500
      ) {
        this.overallDistance += delta;
      }
    }

    this.lastOverallPoint = point;
  }

  private checkCurrentSegmentCompletion(
    point: RunningGpsPoint,
  ): void {

    if (!this.currentSegment) {
      return;
    }

    const distance =
      this.lapManager.getCurrentDistance();

    const lap =
      this.lapManager.getCurrentLap();

    if (!lap) {
      return;
    }

    /**
     * Distance based segment.
     */
    if (
      this.currentSegment.targetDistanceMeters !== null
    ) {

      if (
        distance >=
        this.currentSegment.targetDistanceMeters
      ) {

        this.completeCurrentSegment(point);

        return;
      }
    }

    /**
     * Time based segment.
     */
    if (
      this.currentSegment.targetDurationSeconds !== null
    ) {

      const elapsed =
        (point.timestamp -
          lap.startTimestamp) / 1000;

      if (
        elapsed >=
        this.currentSegment.targetDurationSeconds
      ) {

        this.completeCurrentSegment(point);
      }
    }
  }

  private completeCurrentSegment(
    point: RunningGpsPoint,
  ): void {

    const completedLap =
      this.lapManager.completeLap(
        point,
      );

    if (!completedLap) {
      return;
    }

    this.callbacks.onSegmentCompleted?.(
      completedLap,
    );

    const next =
      this.executionQueue[
        this.currentIndex + 1
      ];

    if (!next) {

      this.currentSegment = null;

      this.state = 'completed';

      this.callbacks.onWorkoutCompleted?.();

      return;
    }

    // Segment boundaries are logical only. The GPS watcher remains active and
    // the next lap begins immediately from the same fresh GPS sample.
    this.currentSegment = null;
    this.startNextSegment(point);
  }

  /**
   * Call this every second while a workout is active. This lets duration-based
   * laps complete even when Android has not emitted another GPS update.
   */
  public tick(
    timestamp = Date.now(),
  ): void {

    if (
      this.state !== 'running'
    ) {
      return;
    }

    if (!this.currentSegment) {
      return;
    }

    const lap = this.lapManager.getCurrentLap();

    if (!lap) {
      return;
    }

    const duration =
      this.currentSegment.targetDurationSeconds;

    if (
      duration === null
    ) {
      return;
    }

    const elapsed =
      (timestamp - lap.startTimestamp) / 1000;

    if (
      elapsed >= duration
    ) {
      const completedLap = this.lapManager.completeLap(null);

      if (!completedLap) {
        return;
      }

      this.callbacks.onSegmentCompleted?.(completedLap);
      this.currentSegment = null;
      this.startNextSegment(this.lastGpsPoint);
    }
  }

  /**
   * Continue after popup.
   */
  public continueWorkout(): void {

    if (
      this.state === 'completed'
    ) {
      return;
    }

    if (
      this.state === 'paused'
    ) {
      this.state = 'running';
    }

    if (
      this.currentSegment === null
    ) {

      this.startNextSegment(
        this.lastGpsPoint,
      );
    }
  }

  /**
   * Called when the user explicitly wants to
   * save/finish the current activity.
   */
  public stop(): void {

    if (
      this.currentSegment
    ) {
      this.lapManager.cancelCurrentLap();
    }

    this.state = 'stopped';
  }

  private startNextSegment(
    point: RunningGpsPoint | null,
  ): void {

    const nextIndex =
      this.currentIndex + 1;

    if (
      nextIndex >=
      this.executionQueue.length
    ) {

      this.currentSegment = null;

      this.state = 'completed';

      this.callbacks.onWorkoutCompleted?.();

      return;
    }

    this.currentIndex = nextIndex;

    const next =
      this.executionQueue[
        this.currentIndex
      ];

    this.currentSegment = next;

    if (
      next.segmentType === 'Rest'
    ) {
      this.restStartedAt =
        point?.timestamp ??
        Date.now();

      this.lapManager.startLap(next, point);

      this.callbacks.onRestStarted?.(
        next.targetDurationSeconds ?? 0,
      );
    } else {
      this.lapManager.startLap(next, point);
      this.callbacks.onSegmentStarted?.(next);
    }
  }

  /**
   * Convert backend segments into execution
   * laps.
   */
  private buildExecutionQueue(
    workout: BackendWorkout,
  ): ActiveWorkoutSegment[] {

    const result: ActiveWorkoutSegment[] = [];

    /**
     * Workout has no segments.
     *
     * Example:
     * Easy Run / Long Run
     */
    if (
      !workout.segments ||
      workout.segments.length === 0
    ) {

      result.push({
        segmentOrder: 1,

        segmentType: 'Run',

        repeatNumber: 1,

        totalRepeats: 1,

        targetDistanceMeters:
          workout.distance,

        targetDurationSeconds:
          workout.duration,

          targetPace:
            workout.target_pace,

          paceUnit:
            workout.pace_unit,

        restDurationSeconds:
          null,

        notes:
          workout.notes,
      });

      return result;
    }

    for (
      const backendSegment
      of [...workout.segments]
        .sort(
          (a, b) =>
            a.segment_order -
            b.segment_order,
        )
    ) {

      const type =
        this.normalizeSegmentType(
          backendSegment.segment_type,
        );

      const repeats =
        Math.max(
          1,
          backendSegment.repeats ?? 1,
        );

      /**
       * Warmup
       */
      if (
        type === 'Warmup'
      ) {

        result.push({
          segmentOrder:
            backendSegment.segment_order,

          segmentType:
            'Warmup',

          repeatNumber: 1,

          totalRepeats: 1,

          targetDistanceMeters:
            backendSegment.rep_distance,

          targetDurationSeconds:
            backendSegment.duration,

          targetPace:
            backendSegment.target_pace,

          paceUnit:
            backendSegment.pace_unit,

          restDurationSeconds:
            null,

          notes:
            backendSegment.notes,
        });

        continue;
      }

      /**
       * Run repetitions.
       */
      if (
        type === 'Run'
      ) {

        for (
          let repeat = 1;
          repeat <= repeats;
          repeat += 1
        ) {

          result.push({
            segmentOrder:
              backendSegment.segment_order,

            segmentType:
              'Run',

            repeatNumber:
              repeat,

            totalRepeats:
              repeats,

            targetDistanceMeters:
              backendSegment.rep_distance,

            targetDurationSeconds:
              backendSegment.duration,

            targetPace:
              backendSegment.target_pace,

            paceUnit:
              backendSegment.pace_unit,

            restDurationSeconds:
              backendSegment.rest_duration,

            notes:
              backendSegment.notes,
          });

          /**
           * Rest happens BETWEEN repetitions.
           *
           * Do not add rest after the last repetition.
           */
          if (
            repeat < repeats &&
            backendSegment.rest_duration !== null &&
            backendSegment.rest_duration > 0
          ) {

            result.push({
              segmentOrder:
                backendSegment.segment_order,

              segmentType:
                'Rest',

              repeatNumber:
                repeat,

              totalRepeats:
                repeats,

              targetDistanceMeters:
                null,

              targetDurationSeconds:
                backendSegment.rest_duration,

              targetPace:
                null,

              paceUnit:
                null,

              restDurationSeconds:
                backendSegment.rest_duration,

              notes:
                `Rest after repetition ${repeat}`,
            });
          }
        }

        continue;
      }

      /**
       * Cooldown
       */
      if (
        type === 'Cooldown'
      ) {

        result.push({
          segmentOrder:
            backendSegment.segment_order,

          segmentType:
            'Cooldown',

          repeatNumber: 1,

          totalRepeats: 1,

          targetDistanceMeters:
            backendSegment.rep_distance,

          targetDurationSeconds:
            backendSegment.duration,

          targetPace:
            backendSegment.target_pace,

          paceUnit:
            backendSegment.pace_unit,

          restDurationSeconds:
            null,

          notes:
            backendSegment.notes,
        });
      }
    }

    return result;
  }

  private normalizeSegmentType(
    value: string,
  ):
    | 'Warmup'
    | 'Run'
    | 'Cooldown'
    | 'Rest' {

    const normalized =
      value.trim().toLowerCase();

    if (
      normalized === 'warmup' ||
      normalized === 'warm-up'
    ) {
      return 'Warmup';
    }

    if (
      normalized === 'cooldown' ||
      normalized === 'cool-down'
    ) {
      return 'Cooldown';
    }

    if (
      normalized === 'rest'
    ) {
      return 'Rest';
    }

    return 'Run';
  }

  public getSnapshot():
    WorkoutEngineSnapshot {

    const currentLap =
      this.lapManager.getCurrentLap();

    let currentDuration = 0;

    if (currentLap) {
      currentDuration =
        currentLap.durationSeconds;
    }

    return {
      state: this.state,

      currentSegment:
        this.currentSegment
          ? {
              ...this.currentSegment,
            }
          : null,

      currentLap,

      completedLaps:
        this.lapManager
          .getCompletedLaps(),

      totalLaps:
        this.executionQueue.length,

      currentSegmentDistanceMeters:
        this.lapManager
          .getCurrentDistance(),

      currentSegmentDurationSeconds:
        currentDuration,

      overallDistanceMeters:
        this.overallDistance,

      overallDurationSeconds:
        this.overallStartTimestamp
          ? Math.max(
              0,
              (
                Date.now() -
                this.overallStartTimestamp -
                this.totalPausedMilliseconds
              ) / 1000,
            )
          : 0,
    };
  }

  public getCompletedLaps(): WorkoutLap[] {

    return this.lapManager
      .getCompletedLaps();
  }

  public getExecutionQueue(): ActiveWorkoutSegment[] {

    return this.executionQueue.map(
      segment => ({
        ...segment,
      }),
    );
  }

  public getState(): WorkoutEngineState {

    return this.state;
  }

  public reset(): void {

    this.executionQueue = [];

    this.currentIndex = -1;

    this.state = 'idle';

    this.currentSegment = null;

    this.lastGpsPoint = null;

    this.overallDistance = 0;

    this.overallStartTimestamp = null;

    this.lastOverallPoint = null;

    this.restStartedAt = null;

    this.pausedAt = null;

    this.totalPausedMilliseconds = 0;

    this.lapManager.reset();

    this.workout = null;
  }
}
