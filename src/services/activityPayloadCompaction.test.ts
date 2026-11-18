import { describe, expect, it } from 'vitest';
import type {
  ActivityGpsPointPayload,
  ActivitySubmissionPayload,
} from '../types/running';
import {
  compactActivitySubmissionPayload,
  filterActivityPointsForBackendAccuracy,
  normalizeActivityPauseMetrics,
  normalizeActivityTimestampsToSeconds,
} from './activityPayloadCompaction';

const makePoint = (index: number, extraDistance = false): ActivityGpsPointPayload => ({
  latitude: 0,
  longitude: index * 0.00001,
  altitude: 12,
  accuracy: 4,
  speed: 2,
  heading: 90,
  timestamp: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString(),
  is_extra_distance: extraDistance,
  is_paused: false,
  pause_sequence: null,
});

const makePayload = (gpsPoints: ActivityGpsPointPayload[]): ActivitySubmissionPayload => ({
  gps_points: gpsPoints,
  start_time: gpsPoints[0]?.timestamp ?? '2026-01-01T00:00:00.000Z',
  end_time: gpsPoints.at(-1)?.timestamp ?? '2026-01-01T00:00:00.000Z',
  moving_time: Math.max(0, gpsPoints.length - 1),
  elapsed_time: Math.max(0, gpsPoints.length - 1),
  moving_time_s: Math.max(0, gpsPoints.length - 1),
  elapsed_time_s: Math.max(0, gpsPoints.length - 1),
  activity_type: 'RUN',
  distance: 100,
  distance_meters: 100,
  workout_distance_meters: 100,
  additional_distance_meters: 0,
  total_distance_meters: 100,
  split_distance_m: 1000,
  avg_pace: 300,
  pace_seconds_per_km: 300,
  pause_events: [],
  pause_count: 0,
  paused_time_s: 0,
});

describe('compactActivitySubmissionPayload', () => {
  it('replaces redundant interval and extra route points with timestamp references', () => {
    const points = [makePoint(0), makePoint(1)];
    const payload = makePayload(points);
    payload.segments = [{
      sequence: 1,
      type: 'RUN',
      planned_distance_m: 100,
      planned_time_s: 60,
      completed_distance_m: 100,
      actual_time_s: 60,
      actual_pace_s_per_km: 600,
      gps_points: points,
      recovery: {
        sequence: 2,
        type: 'RECOVERY',
        planned_time_s: 10,
        actual_time_s: 10,
        distance_m: 0,
        pace_s_per_km: 0,
        gps_points: [points[1]],
      },
    }];
    payload.extra = {
      type: 'EXTRA',
      distance_m: 0,
      actual_time_s: 0,
      pace_s_per_km: 0,
      gps_points: [points[1]],
    };

    const result = compactActivitySubmissionPayload(payload);

    expect(result.payload.gps_points).toEqual(points);
    expect(result.payload.segments?.[0]?.gps_points).toEqual(
      points.map(({ timestamp }) => ({ timestamp })),
    );
    expect(result.payload.segments?.[0]?.recovery?.gps_points).toEqual([
      { timestamp: points[1].timestamp },
    ]);
    expect(result.payload.extra?.gps_points).toEqual([
      { timestamp: points[1].timestamp },
    ]);
    expect(result.payload.distance_meters).toBe(payload.distance_meters);
    expect(result.toleranceMeters).toBeNull();
    expect(result.bytes).toBeLessThan(result.originalBytes);
    expect(payload.segments?.[0]?.gps_points).toEqual(points);
  });

  it('thins only oversized routes while preserving endpoints, interval edges, extra boundaries, and time gaps', () => {
    const points = Array.from({ length: 1000 }, (_, index) => (
      makePoint(index, index >= 500)
    ));
    const payload = makePayload(points);
    payload.segments = [{
      sequence: 1,
      type: 'RUN',
      planned_distance_m: 1000,
      planned_time_s: 1000,
      completed_distance_m: 1000,
      actual_time_s: 1000,
      actual_pace_s_per_km: 1000,
      gps_points: points,
    }];
    payload.extra = {
      type: 'EXTRA',
      distance_m: 500,
      actual_time_s: 500,
      pace_s_per_km: 1000,
      gps_points: points.slice(500),
    };
    payload.pause_events = [{
      sequence: 1,
      paused_at: points[400].timestamp,
      resumed_at: points[450].timestamp,
      duration_s: 50,
      pause_location: null,
      resume_location: null,
      paused_points: points.slice(400, 451),
    }];

    const budget = 16 * 1024;
    const result = compactActivitySubmissionPayload(payload, budget);
    const kept = result.payload.gps_points;
    const keptTimes = kept.map(({ timestamp }) => Date.parse(timestamp));

    expect(result.toleranceMeters).not.toBeNull();
    expect(result.bytes).toBeLessThanOrEqual(budget);
    expect(kept[0]?.timestamp).toBe(points[0].timestamp);
    expect(kept.at(-1)?.timestamp).toBe(points.at(-1)?.timestamp);
    expect(kept.some(({ timestamp }) => timestamp === points[499].timestamp)).toBe(true);
    expect(kept.some(({ timestamp }) => timestamp === points[500].timestamp)).toBe(true);
    expect(result.payload.segments?.[0]?.gps_points.map(({ timestamp }) => timestamp))
      .toEqual(kept.map(({ timestamp }) => timestamp));
    expect(result.payload.extra?.gps_points.map(({ timestamp }) => timestamp))
      .toEqual(kept.filter((point) => point.is_extra_distance).map(({ timestamp }) => timestamp));
    expect(Math.max(...keptTimes.slice(1).map((time, index) => (time - keptTimes[index]) / 1000)))
      .toBeLessThanOrEqual(20);
    expect(payload.gps_points).toHaveLength(points.length);
    expect(payload.pause_events?.[0]?.paused_points).toHaveLength(51);
  });
});

describe('filterActivityPointsForBackendAccuracy', () => {
  it('matches the backend 30 m accuracy cutoff and removes stale nested references', () => {
    const points = [
      { ...makePoint(0), accuracy: 30 },
      { ...makePoint(1), accuracy: 31 },
      { ...makePoint(2), accuracy: 12 },
    ];
    const payload = makePayload(points);
    payload.segments = [{
      sequence: 1,
      type: 'RUN',
      planned_distance_m: 100,
      planned_time_s: 60,
      completed_distance_m: 100,
      actual_time_s: 60,
      actual_pace_s_per_km: 600,
      gps_points: points,
    }];
    payload.extra = {
      type: 'EXTRA',
      distance_m: 0,
      actual_time_s: 0,
      pace_s_per_km: 0,
      gps_points: points,
    };

    const result = filterActivityPointsForBackendAccuracy(payload);

    expect(result.payload.gps_points).toEqual([points[0], points[2]]);
    expect(result.payload.segments?.[0]?.gps_points).toEqual([points[0], points[2]]);
    expect(result.payload.extra?.gps_points).toEqual([points[0], points[2]]);
    expect(result.rejectedPointCount).toBe(1);
    expect(payload.gps_points).toEqual(points);
  });
});

describe('normalizeActivityPauseMetrics', () => {
  it('derives pause totals from event timestamps and closes an open final pause', () => {
    const payload = makePayload([makePoint(0), makePoint(1)]);
    payload.end_time = '2026-01-01T00:00:05.000Z';
    payload.pause_events = [
      {
        sequence: 1,
        paused_at: '2026-01-01T00:00:01.000Z',
        resumed_at: '2026-01-01T00:00:02.250Z',
        duration_s: 9,
        pause_location: null,
        resume_location: null,
        paused_points: [],
      },
      {
        sequence: 2,
        paused_at: '2026-01-01T00:00:03.500Z',
        resumed_at: null,
        duration_s: null,
        pause_location: null,
        resume_location: null,
        paused_points: [],
      },
    ];
    payload.pause_count = 99;
    payload.paused_time_s = 999;

    const normalized = normalizeActivityPauseMetrics(payload);

    expect(normalized.pause_count).toBe(2);
    expect(normalized.paused_time_s).toBe(2.75);
    expect(normalized.pause_events?.[0]?.duration_s).toBe(1.25);
    expect(normalized.pause_events?.[1]?.duration_s).toBe(1.5);
    expect(normalized.pause_events?.[1]?.resumed_at).toBe(payload.end_time);
  });

  it('rejects pause events with invalid or reversed timestamps', () => {
    const payload = makePayload([makePoint(0), makePoint(1)]);
    payload.pause_events = [{
      sequence: 1,
      paused_at: 'not-a-timestamp',
      resumed_at: payload.end_time,
      duration_s: 1,
      pause_location: null,
      resume_location: null,
      paused_points: [],
    }];

    expect(() => normalizeActivityPauseMetrics(payload)).toThrow(RangeError);
  });
});

describe('normalizeActivityTimestampsToSeconds', () => {
  it.each([
    ['2026-11-17T10:25:44.849Z', '2026-11-17T10:28:55.744Z', 191],
    ['2026-11-17T11:28:34.681Z', '2026-11-17T11:35:42.407Z', 428],
  ])('converts an emulator duration to the same whole seconds used by iOS', (
    start,
    end,
    expectedSeconds,
  ) => {
    const payload = makePayload([makePoint(0)]);
    payload.start_time = start;
    payload.end_time = end;

    const normalized = normalizeActivityTimestampsToSeconds(payload);
    const durationSeconds = (
      Date.parse(normalized.end_time) - Date.parse(normalized.start_time)
    ) / 1000;

    expect(durationSeconds).toBe(expectedSeconds);
    expect(Math.trunc(durationSeconds)).toBe(Math.round(durationSeconds));
  });

  it('matches iOS whole-second timestamps and keeps pause metrics consistent', () => {
    const points = [
      { ...makePoint(0), timestamp: '2026-01-01T00:00:00.849Z' },
      { ...makePoint(1), timestamp: '2026-01-01T00:00:03.744Z' },
    ];
    const payload = makePayload(points);
    payload.start_time = '2026-01-01T00:00:00.849Z';
    payload.end_time = '2026-01-01T00:00:03.744Z';
    payload.pause_events = [{
      sequence: 1,
      paused_at: '2026-01-01T00:00:01.400Z',
      resumed_at: '2026-01-01T00:00:02.800Z',
      duration_s: 1.4,
      pause_location: null,
      resume_location: null,
      paused_points: [{ ...points[0], timestamp: '2026-01-01T00:00:01.900Z' }],
    }];
    payload.steps_per_minute = [{
      interval_number: 1,
      start_time: '2026-01-01T00:00:00.849Z',
      end_time: '2026-01-01T00:00:03.744Z',
      step_count: 3,
      active_duration_s: 3,
    }];
    payload.lap_events = [{
      event_number: 1,
      timestamp: '2026-01-01T00:00:02.800Z',
    }];

    const normalized = normalizeActivityTimestampsToSeconds(payload);
    const normalizedPauses = normalizeActivityPauseMetrics(normalized);

    expect(normalized.start_time).toBe('2026-01-01T00:00:00Z');
    expect(normalized.end_time).toBe('2026-01-01T00:00:03Z');
    expect(normalized.gps_points.map(({ timestamp }) => timestamp)).toEqual([
      '2026-01-01T00:00:00Z',
      '2026-01-01T00:00:03Z',
    ]);
    expect(normalized.steps_per_minute?.[0]).toMatchObject({
      start_time: '2026-01-01T00:00:00Z',
      end_time: '2026-01-01T00:00:03Z',
    });
    expect(normalized.lap_events?.[0]?.timestamp).toBe('2026-01-01T00:00:02Z');
    expect(normalized.pause_events?.[0]).toMatchObject({
      paused_at: '2026-01-01T00:00:01Z',
      resumed_at: '2026-01-01T00:00:02Z',
      paused_points: [{ timestamp: '2026-01-01T00:00:01Z' }],
    });
    expect(normalizedPauses.paused_time_s).toBe(1);
    expect(payload.start_time).toBe('2026-01-01T00:00:00.849Z');
  });

  it('rejects invalid timestamps instead of sending them to the backend', () => {
    const payload = makePayload([makePoint(0)]);
    payload.start_time = 'not-a-timestamp';

    expect(() => normalizeActivityTimestampsToSeconds(payload)).toThrow(RangeError);
  });
});
