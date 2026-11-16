import type { ActivityStepsPerMinutePayload } from '../types/running';

const STEP_INTERVAL_MS = 60_000;

export interface StepPauseInterval {
  paused_at: string;
  resumed_at: string | null;
}

export interface ActivityStepTrackerSnapshot {
  intervalSteps: { intervalNumber: number; stepCount: number }[];
}

export interface ActivityStepSegmentMetadata {
  type: string;
  sequence: number;
}

export class ActivityStepTracker {
  private totalSteps = 0;
  private readonly stepsByInterval = new Map<number, number>();

  public constructor(
    private readonly startedAtMs: number,
    snapshot?: ActivityStepTrackerSnapshot,
  ) {
    if (Array.isArray(snapshot?.intervalSteps)) {
      snapshot.intervalSteps.forEach(({ intervalNumber, stepCount }) => {
        if (
          Number.isInteger(intervalNumber)
          && intervalNumber > 0
          && Number.isFinite(stepCount)
          && stepCount > 0
        ) {
          this.stepsByInterval.set(intervalNumber, stepCount);
          this.totalSteps += stepCount;
        }
      });
    }
  }

  public recordStepDelta(stepDelta: number, timestampMs: number): void {
    if (
      !Number.isFinite(stepDelta)
      || stepDelta <= 0
      || !Number.isFinite(timestampMs)
      || timestampMs < this.startedAtMs
    ) {
      return;
    }

    const intervalNumber = Math.floor((timestampMs - this.startedAtMs) / STEP_INTERVAL_MS) + 1;
    this.totalSteps += stepDelta;
    this.stepsByInterval.set(
      intervalNumber,
      (this.stepsByInterval.get(intervalNumber) ?? 0) + stepDelta,
    );
  }

  public getTotalSteps(): number {
    return this.totalSteps;
  }

  public getSnapshot(): ActivityStepTrackerSnapshot {
    return {
      intervalSteps: Array.from(this.stepsByInterval, ([intervalNumber, stepCount]) => ({
        intervalNumber,
        stepCount,
      })),
    };
  }

  public getStepsPerMinute(
    endedAtMs: number,
    pauses: StepPauseInterval[],
    getSegmentAtTime?: (timestampMs: number) => ActivityStepSegmentMetadata | null,
  ): ActivityStepsPerMinutePayload[] {
    if (!Number.isFinite(this.startedAtMs) || !Number.isFinite(endedAtMs) || endedAtMs <= this.startedAtMs) {
      return [];
    }

    const intervalCount = Math.ceil((endedAtMs - this.startedAtMs) / STEP_INTERVAL_MS);
    return Array.from({ length: intervalCount }, (_, index) => {
      const intervalStartMs = this.startedAtMs + index * STEP_INTERVAL_MS;
      const intervalEndMs = Math.min(intervalStartMs + STEP_INTERVAL_MS, endedAtMs);
      let activeDurationMs = intervalEndMs - intervalStartMs;

      pauses.forEach((pause) => {
        const pauseStartMs = Date.parse(pause.paused_at);
        const pauseEndMs = pause.resumed_at === null ? endedAtMs : Date.parse(pause.resumed_at);
        if (!Number.isFinite(pauseStartMs) || !Number.isFinite(pauseEndMs)) return;
        const overlapMs = Math.max(
          0,
          Math.min(intervalEndMs, pauseEndMs) - Math.max(intervalStartMs, pauseStartMs),
        );
        activeDurationMs -= overlapMs;
      });

      const segment = getSegmentAtTime?.(intervalStartMs + (intervalEndMs - intervalStartMs) / 2) ?? null;
      return {
        interval_number: index + 1,
        start_time: new Date(intervalStartMs).toISOString(),
        end_time: new Date(intervalEndMs).toISOString(),
        step_count: this.stepsByInterval.get(index + 1) ?? 0,
        active_duration_s: Math.round(Math.max(0, activeDurationMs) / 1_000),
        ...(segment
          ? {
            segment_type: segment.type,
            segment_sequence: segment.sequence,
          }
          : {}),
      };
    });
  }
}
