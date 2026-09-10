import {
  ActiveWorkoutSegment,
  WorkoutLap,
} from '../types/workout';

import {
  RunningGpsPoint,
} from '../types/running';

import { calculateDistanceMeters } from '../utils/distance';

export class WorkoutLapManager {
  private currentLap: WorkoutLap | null = null;

  private completedLaps: WorkoutLap[] = [];

  private segmentDistance = 0;

  private segmentStartTimestamp: number | null = null;

  private lastPoint: RunningGpsPoint | null = null;

  public startLap(
    segment: ActiveWorkoutSegment,
    gpsPoint: RunningGpsPoint | null,
  ): WorkoutLap {

    const now = gpsPoint?.timestamp ?? Date.now();

    this.segmentDistance = 0;

    this.segmentStartTimestamp = now;

    this.lastPoint = gpsPoint;

    this.currentLap = {
      ...segment,
      startedAt: now,
      completedAt: null,
      distanceMeters: 0,
      elapsedSeconds: 0,
      completed: false,
    };

    return this.currentLap;
  }

  public ingestGpsPoint(point: RunningGpsPoint): void {

    if (!this.currentLap) {
      return;
    }

    if (this.lastPoint) {

      const delta = calculateDistanceMeters(
        this.lastPoint,
        point,
      );

      if (
        Number.isFinite(delta) &&
        delta >= 0 &&
        delta < 500
      ) {
        this.segmentDistance += delta;
      }
    }

    this.lastPoint = point;

    this.currentLap.distanceMeters = this.segmentDistance;

    this.currentLap.elapsedSeconds =
      Math.max(
        0,
        (point.timestamp - this.currentLap.startedAt) / 1000,
      );
  }

  public completeLap(
    gpsPoint: RunningGpsPoint | null,
  ): WorkoutLap | null {

    if (!this.currentLap) {
      return null;
    }

    const endTimestamp =
      gpsPoint?.timestamp ?? Date.now();

    this.currentLap.completedAt = endTimestamp;

    this.currentLap.completed = true;

    this.currentLap.distanceMeters =
      this.segmentDistance;

    this.currentLap.elapsedSeconds =
      Math.max(
        0,
        (endTimestamp - this.currentLap.startedAt) / 1000,
      );

    const completed = {
      ...this.currentLap,
    };

    this.completedLaps.push(completed);

    this.currentLap = null;

    this.lastPoint = null;

    this.segmentDistance = 0;

    this.segmentStartTimestamp = null;

    return completed;
  }

  public cancelCurrentLap(): WorkoutLap | null {

    if (!this.currentLap) {
      return null;
    }

    const incomplete = {
      ...this.currentLap,
      completed: false,
    };

    this.currentLap = null;

    this.lastPoint = null;

    this.segmentDistance = 0;

    this.segmentStartTimestamp = null;

    return incomplete;
  }

  public getCurrentLap(): WorkoutLap | null {

    return this.currentLap
      ? { ...this.currentLap }
      : null;
  }

  public getCompletedLaps(): WorkoutLap[] {

    return this.completedLaps.map(
      lap => ({ ...lap }),
    );
  }

  public getCurrentDistance(): number {

    return this.segmentDistance;
  }

  /** Keep elapsed lap time paused while the workout is manually paused. */
  public shiftCurrentLapStartBy(
    milliseconds: number,
  ): void {

    if (!this.currentLap || milliseconds <= 0) {
      return;
    }

    this.currentLap.startedAt += milliseconds;
  }

  public reset(): void {

    this.currentLap = null;

    this.completedLaps = [];

    this.segmentDistance = 0;

    this.segmentStartTimestamp = null;

    this.lastPoint = null;
  }
}
