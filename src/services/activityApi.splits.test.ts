import { describe, expect, it, vi } from 'vitest';
import { ACTIVITY_HISTORY_FIELDS, normalizeActivitySplits, normalizeHistoryPage } from './activityApi';

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
      split_distance_m: 500,
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

  it('uses the saved manual lap events when a RUN segment has no GPS-derived splits', () => {
    const result = normalizeActivitySplits({
      split_distance_m: 1000,
      segments: [{
        sequence: 1,
        type: 'RUN',
        completed_distance_m: 0,
        actual_time_s: 0,
        gps_points: [],
        splits: [],
      }],
      lap_events: [{
        event_number: 1,
        timestamp: '2026-11-10T05:35:00.000Z',
        split_number: 1,
        distance_m: 1000,
        time_s: 300,
        pace_s_per_km: 300,
      }],
    });

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]?.completed_distance_m).toBe(1000);
    expect(result.segments[0]?.actual_time_s).toBe(300);
    expect(result.segments[0]?.splits).toEqual([{
      split_number: 1,
      distance_m: 1000,
      time_s: 300,
      pace_s_per_km: 300,
    }]);
  });

  it('keeps timestamp-only lap events visible as laps without inventing distance', () => {
    const result = normalizeActivitySplits({
      activity_type: 'RUN',
      start_time: '2026-11-02T01:11:07Z',
      end_time: '2026-11-02T02:01:53Z',
      gps_points: [{
        latitude: 13.0827,
        longitude: 80.2707,
        timestamp: '2026-11-02T01:11:08Z',
      }],
      lap_events: [
        { event_number: 1, timestamp: '2026-11-02T01:20:30Z' },
        { event_number: 2, timestamp: '2026-11-02T01:31:00Z' },
      ],
    });

    expect(result.laps).toHaveLength(2);
    expect(result.laps.map((lap) => lap.label)).toEqual(['Lap 1', 'Lap 2']);
    expect(result.laps[0]?.time_s).toBe(563);
    expect(result.laps[1]?.time_s).toBe(630);
    expect(result.laps[0]?.distance_m).toBeUndefined();
    expect(result.laps[0]?.pace_s_per_km).toBeUndefined();
  });

  it('subtracts paused time from timestamp-only manual lap duration', () => {
    const result = normalizeActivitySplits({
      start_time: '2026-11-02T01:11:07Z',
      end_time: '2026-11-02T02:01:53Z',
      gps_points: [{ latitude: 13.0827, longitude: 80.2707, timestamp: '2026-11-02T01:11:08Z' }],
      lap_events: [{ event_number: 1, timestamp: '2026-11-02T01:31:00Z' }],
      pause_events: [{
        sequence: 1,
        paused_at: '2026-11-02T01:25:00Z',
        resumed_at: '2026-11-02T01:26:00Z',
        duration_s: 60,
      }],
    });

    expect(result.laps[0]?.time_s).toBe(1_133);
  });

  it('prefers complete backend lap records while retaining generated split rows', () => {
    const result = normalizeActivitySplits({
      split_distance_m: 1000,
      start_time: '2026-11-02T01:11:07Z',
      laps: [{
        segment_order: 1,
        segment_type: 'Run',
        repeat_number: 1,
        total_repeats: 2,
        distance_meters: 1000,
        duration_seconds: 300,
        pace_seconds_per_km: 300,
      }],
      lap_events: [{ event_number: 1, timestamp: '2026-11-02T01:20:30Z' }],
      gps_points: [
        { latitude: 0, longitude: 0, timestamp: '2026-11-02T01:11:07Z' },
        { latitude: 0, longitude: 0.01, timestamp: '2026-11-02T01:20:30Z' },
      ],
    });

    expect(result.laps).toEqual([{
      sequence: 1,
      label: 'Run 1/2',
      distance_m: 1000,
      time_s: 300,
      pace_s_per_km: 300,
    }]);
    expect(result.segments[0]?.splits.length).toBeGreaterThan(0);
  });

  it('uses a backend-provided split distance for GPS estimates', () => {
    const metresToLongitude = (metres: number) => metres / (6_371_000 * Math.PI / 180);
    const result = normalizeActivitySplits({
      split_distance_m: 1000,
      segments: [{
        sequence: 1,
        type: 'RUN',
        gps_points: [
          { latitude: 0, longitude: 0, timestamp: '2026-01-01T00:00:00Z' },
          { latitude: 0, longitude: metresToLongitude(1500), timestamp: '2026-01-01T00:15:00Z' },
        ],
      }],
    });

    expect(result.segments[0]?.splits[0]?.distance_m).toBe(1000);
    expect(result.segments[0]?.splits[1]?.distance_m).toBeCloseTo(500, 5);
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

describe('activity history elevation metrics', () => {
  it('requests backend elevation gain and loss in the history fields', () => {
    expect(ACTIVITY_HISTORY_FIELDS.split(',')).toContain('elevation_gain');
    expect(ACTIVITY_HISTORY_FIELDS.split(',')).toContain('elevation_loss');
  });

  it('preserves backend elevation values when normalizing history rows', async () => {
    vi.stubGlobal('__DEV__', false);
    try {
      const result = await normalizeHistoryPage({
        results: [{
          id: 21,
          activity_type: 'RUN',
          distance: 5000,
          moving_time: 1800,
          elapsed_time: 1900,
          avg_pace: 360,
          start_time: '2026-11-04T06:00:00Z',
          end_time: '2026-11-04T06:31:40Z',
          elevation_gain: 124.6,
          elevation_loss: 119.2,
          processing_status: 'COMPLETED',
        }],
        has_more: false,
      }, 10);

      expect(result.activities[0]?.elevation_gain).toBe(124.6);
      expect(result.activities[0]?.elevation_loss).toBe(119.2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps only one History row when the backend repeats an activity ID', async () => {
    vi.stubGlobal('__DEV__', false);
    const activity = {
      id: 'run-duplicate-page-row',
      activity_type: 'RUN',
      distance: 5000,
      moving_time: 1800,
      elapsed_time: 1900,
      avg_pace: 360,
      start_time: '2026-11-04T06:00:00Z',
      end_time: '2026-11-04T06:31:40Z',
      processing_status: 'COMPLETED',
    };

    try {
      const result = await normalizeHistoryPage({
        results: [activity, { ...activity }],
        has_more: false,
      }, 10);

      expect(result.activities).toHaveLength(1);
      expect(result.activities[0]?.id).toBe(activity.id);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
