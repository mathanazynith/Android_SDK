import { describe, expect, it } from 'vitest';
import { estimateSplitsFromGps } from './gpsSplitEstimates';

describe('estimateSplitsFromGps', () => {
  it('scales estimated splits to canonical activity distance and moving time', () => {
    const point = (meters: number, seconds: number) => ({
      latitude: 0,
      longitude: meters / 111_320,
      timestamp: new Date(seconds * 1000).toISOString(),
    });

    const splits = estimateSplitsFromGps(
      [point(0, 0), point(1000, 500)],
      500,
      900,
      600,
    );

    expect(splits.map((split) => split.distance_m)).toEqual([500, 400]);
    expect(splits.reduce((total, split) => total + split.time_s, 0)).toBeCloseTo(600);
    expect(splits.map((split) => split.pace_s_per_km)).toEqual([600, 600]);
  });

  it('returns no splits if the GPS route has no measurable distance', () => {
    const point = {
      latitude: 0,
      longitude: 0,
      timestamp: new Date(0).toISOString(),
    };

    expect(estimateSplitsFromGps([point, point], 500, 900, 600)).toEqual([]);
  });
});
