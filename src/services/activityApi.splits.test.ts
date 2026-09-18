import { describe, expect, it } from 'vitest';
import { normalizeActivitySplits } from './activityApi';

describe('normalizeActivitySplits', () => {
  it('creates independent dynamic splits from each segment GPS sequence', () => {
    const metresToLongitude = (metres: number) => metres / 111_320;
    const point = (metres: number, seconds: number) => ({
      latitude: 0,
      longitude: metresToLongitude(metres),
      timestamp: new Date(seconds * 1000).toISOString(),
    });
    const result = normalizeActivitySplits({
      split_distance_m: 5,
      segments: [
        { id: 'warmup-1', type: 'WARM_UP', gps_points: [point(0, 0), point(7, 7)] },
        { id: 'run-1', type: 'RUN', gps_points: [point(0, 10), point(7, 17)] },
        { id: 'recovery-1', type: 'RECOVERY', gps_points: [point(0, 20), point(7, 50)] },
      ],
    });

    expect(result.segments[0]?.splits.map((split) => split.distance_m)).toEqual([5, 2]);
    expect(result.segments[0]?.splits.map((split) => split.split_number)).toEqual([1, 2]);
    expect(result.segments[1]?.splits.map((split) => split.split_number)).toEqual([1, 2]);
    expect(result.segments[1]?.splits[0]?.time_s).toBeCloseTo(5, 0);
    expect(result.segments[2]?.splits).toEqual([]);
    expect(result.segments[2]?.id).toBe('recovery-1');
  });

  it('maps EXTRA segments into the separate extra split section', () => {
    const result = normalizeActivitySplits({
      success: true,
      data: {
        segments: [
          {
            sequence: 1,
            type: 'RUN',
            splits: [
              { split_number: 4, distance_m: 10, time_s: 14, pace_s_per_km: 1400 },
              { split_number: 5, distance_m: 11, time_s: 15, pace_s_per_km: 1364 },
            ],
          },
          {
            sequence: 2,
            type: 'RECOVERY',
            splits: [{ split_number: 6, distance_m: 10, time_s: 20, pace_s_per_km: 2000 }],
          },
          {
            sequence: 3,
            type: 'EXTRA',
            splits: [
              { split_number: 1, distance_m: 24, time_s: 18, pace_s_per_km: 735 },
              { split_number: 2, distance_m: 6, time_s: 5, pace_s_per_km: 825 },
            ],
          },
        ],
      },
    });

    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]?.type).toBe('RUN');
    expect(result.segments[0]?.splits.map((split) => split.split_number)).toEqual([1, 2]);
    expect(result.segments[1]?.type).toBe('RECOVERY');
    expect(result.segments[1]?.splits.map((split) => split.split_number)).toEqual([1]);
    expect(result.extra?.splits.map((split) => split.distance_m)).toEqual([24, 6]);
  });
});