import { describe, expect, it } from 'vitest';
import { ActivityStepTracker } from './activityStepTracker';

describe('ActivityStepTracker', () => {
  it('groups new step deltas into minute intervals and subtracts paused time', () => {
    const startedAt = Date.parse('2026-11-11T06:00:00.000Z');
    const tracker = new ActivityStepTracker(startedAt);
    tracker.recordStepDelta(165, startedAt + 20_000);
    tracker.recordStepDelta(172, startedAt + 90_000);

    const intervals = tracker.getStepsPerMinute(startedAt + 150_000, [
      {
        paused_at: new Date(startedAt + 30_000).toISOString(),
        resumed_at: new Date(startedAt + 50_000).toISOString(),
      },
      {
        paused_at: new Date(startedAt + 90_000).toISOString(),
        resumed_at: new Date(startedAt + 120_000).toISOString(),
      },
    ]);

    expect(tracker.getTotalSteps()).toBe(337);
    expect(intervals).toEqual([
      {
        interval_number: 1,
        start_time: '2026-11-11T06:00:00.000Z',
        end_time: '2026-11-11T06:01:00.000Z',
        step_count: 165,
        active_duration_s: 40,
      },
      {
        interval_number: 2,
        start_time: '2026-11-11T06:01:00.000Z',
        end_time: '2026-11-11T06:02:00.000Z',
        step_count: 172,
        active_duration_s: 30,
      },
      {
        interval_number: 3,
        start_time: '2026-11-11T06:02:00.000Z',
        end_time: '2026-11-11T06:02:30.000Z',
        step_count: 0,
        active_duration_s: 30,
      },
    ]);
  });

  it('ignores invalid and pre-activity step updates', () => {
    const startedAt = Date.parse('2026-11-11T06:00:00.000Z');
    const tracker = new ActivityStepTracker(startedAt);
    tracker.recordStepDelta(5, startedAt - 1);
    tracker.recordStepDelta(0, startedAt);
    tracker.recordStepDelta(Number.NaN, startedAt);

    expect(tracker.getTotalSteps()).toBe(0);
    expect(tracker.getStepsPerMinute(startedAt, [])).toEqual([]);
  });

  it('restores saved interval counts for a recovered activity', () => {
    const startedAt = Date.parse('2026-11-11T06:00:00.000Z');
    const tracker = new ActivityStepTracker(startedAt);
    tracker.recordStepDelta(125, startedAt + 10_000);

    const restoredTracker = new ActivityStepTracker(startedAt, tracker.getSnapshot());
    restoredTracker.recordStepDelta(25, startedAt + 70_000);

    expect(restoredTracker.getTotalSteps()).toBe(150);
    expect(restoredTracker.getStepsPerMinute(startedAt + 80_000, []).map((interval) => interval.step_count))
      .toEqual([125, 25]);
  });
});
