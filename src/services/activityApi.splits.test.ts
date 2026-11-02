import { describe, expect, it, vi } from 'vitest';
import { normalizeActivitySplits } from './activityApi';

vi.mock('../../service/storage', () => ({
  storage: {
    KEYS: { ACCESS_TOKEN: 'access', REFRESH_TOKEN: 'refresh' },
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

describe('normalizeActivitySplits', () => {
  it('creates independent 500 metre splits from each segment GPS sequence', () => {
    const metresToLongitude = (metres: number) => metres / (6_371_000 * Math.PI / 180);
    const point = (metres: number, seconds: number) => ({
      latitude: 0,
      longitude: metresToLongitude(metres),
      timestamp: new Date(seconds * 1000).toISOString(),
    });
    const result = normalizeActivitySplits({
      split_distance_m: 5,
      segments: [
        { id: 'warmup-1', type: 'WARM_UP', gps_points: [point(0, 0), point(700, 700)] },
        { id: 'run-1', type: 'RUN', gps_points: [point(0, 10), point(700, 710)] },
        { id: 'recovery-1', type: 'RECOVERY', gps_points: [point(0, 20), point(7, 50)] },
      ],
    });

    expect(result.segments[0]?.splits[0]?.distance_m).toBe(500);
    expect(result.segments[0]?.splits[1]?.distance_m).toBeCloseTo(200, 5);
    expect(result.segments[0]?.splits.map((split) => split.split_number)).toEqual([1, 2]);
    expect(result.segments[1]?.splits.map((split) => split.split_number)).toEqual([1, 2]);
    expect(result.segments[1]?.splits[0]?.distance_m).toBe(500);
    expect(result.segments[1]?.splits[1]?.distance_m).toBeCloseTo(200, 5);
    expect(result.segments[1]?.splits[0]?.time_s).toBeCloseTo(500, 0);
    expect(result.segments[2]?.splits).toEqual([]);
    expect(result.segments[2]?.id).toBe('recovery-1');
  });

  it('preserves backend split values instead of replacing them with GPS estimates', () => {
    const result = normalizeActivitySplits({
      segments: [{
        sequence: 1,
        type: 'RUN',
        gps_points: [
          { latitude: 0, longitude: 0, timestamp: '2026-01-01T00:00:00Z' },
          { latitude: 0, longitude: 0.01, timestamp: '2026-01-01T00:01:00Z' },
        ],
        splits: [{
          split_number: 7,
          distance_m: 499.876,
          time_s: 61.25,
          pace_s_per_km: 122.62,
        }],
      }],
    });

    expect(result.segments[0]?.splits).toEqual([{
      split_number: 7,
      distance_m: 499.876,
      time_s: 61.25,
      pace_s_per_km: 122.62,
    }]);
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
    expect(result.segments[0]?.splits.map((split) => split.split_number)).toEqual([4, 5]);
    expect(result.segments[1]?.type).toBe('RECOVERY');
    expect(result.segments[1]?.splits).toEqual([]);
    expect(result.extra?.splits.map((split) => split.distance_m)).toEqual([24, 6]);
  });
});