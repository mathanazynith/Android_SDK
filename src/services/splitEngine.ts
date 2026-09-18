import { SPLIT_DISTANCE_METERS } from '../types/activity';

export interface CompletedLiveSplit {
  splitNumber: number;
  distanceMeters: number;
  timeSeconds: number;
  paceSecondsPerKm: number;
}

interface SplitEngineState {
  segmentDistanceMeters: number;
  segmentTimeSeconds: number;
  splitNumber: number;
  lastTimestamp: number | null;
}

export class DistanceSplitEngine {
  private state: SplitEngineState = {
    segmentDistanceMeters: 0,
    segmentTimeSeconds: 0,
    splitNumber: 0,
    lastTimestamp: null,
  };

  public reset(): void {
    this.state = {
      segmentDistanceMeters: 0,
      segmentTimeSeconds: 0,
      splitNumber: 0,
      lastTimestamp: null,
    };
  }

  public addAcceptedDistance(distanceMeters: number, timestamp: number): CompletedLiveSplit[] {
    if (!Number.isFinite(distanceMeters) || distanceMeters <= 0 || !Number.isFinite(timestamp)) return [];

    const previousTimestamp = this.state.lastTimestamp;
    const intervalSeconds = previousTimestamp === null
      ? 0
      : Math.max(0, (timestamp - previousTimestamp) / 1000);
    this.state.lastTimestamp = timestamp;

    const completed: CompletedLiveSplit[] = [];
    let remainingDistance = distanceMeters;
    let remainingTime = intervalSeconds;

    while (remainingDistance > 0) {
      const distanceToBoundary = SPLIT_DISTANCE_METERS - this.state.segmentDistanceMeters;
      const distanceForPart = Math.min(distanceToBoundary, remainingDistance);
      const timeForPart = remainingDistance > 0
        ? remainingTime * (distanceForPart / remainingDistance)
        : 0;

      this.state.segmentDistanceMeters += distanceForPart;
      this.state.segmentTimeSeconds += timeForPart;
      remainingDistance -= distanceForPart;
      remainingTime -= timeForPart;

      if (this.state.segmentDistanceMeters + 0.000001 < SPLIT_DISTANCE_METERS) break;

      this.state.splitNumber += 1;
      const timeSeconds = this.state.segmentTimeSeconds;
      completed.push({
        splitNumber: this.state.splitNumber,
        distanceMeters: SPLIT_DISTANCE_METERS,
        timeSeconds,
        paceSecondsPerKm: timeSeconds / (SPLIT_DISTANCE_METERS / 1000),
      });
      this.state.segmentDistanceMeters = 0;
      this.state.segmentTimeSeconds = 0;
    }

    return completed;
  }
}