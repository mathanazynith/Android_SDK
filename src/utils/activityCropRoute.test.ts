import { describe, expect, it } from 'vitest';
import { getRichestActivityCropRoute } from './activityCropRoute';

describe('getRichestActivityCropRoute', () => {
  it('selects the longest valid backend route and normalizes its points', () => {
    const points = getRichestActivityCropRoute([
      [{ latitude: 1, longitude: 2 }],
      [
        { latitude: '3', longitude: '4', timestamp: '2025-01-01T00:00:00Z' },
        { latitude: 5, longitude: 6, is_paused: true },
        { latitude: null, longitude: 7 },
        { latitude: 91, longitude: 7 },
      ],
    ]);

    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      latitude: 3,
      longitude: 4,
      timestamp: '2025-01-01T00:00:00Z',
      is_paused: false,
    });
    expect(points[1]).toMatchObject({
      latitude: 5,
      longitude: 6,
      is_paused: true,
    });
  });

  it('uses the decoded polyline when it contains more points than backend arrays', () => {
    const points = getRichestActivityCropRoute([
      [{ latitude: 1, longitude: 2 }],
    ], '_p~iF~ps|U_ulLnnqC_mqNvxq`@');

    expect(points).toHaveLength(3);
    expect(points[0]).toMatchObject({ latitude: 38.5, longitude: -120.2 });
  });

  it('returns an empty route when no valid source points exist', () => {
    expect(getRichestActivityCropRoute([
      [{ latitude: null, longitude: null }],
      [{ latitude: 0, longitude: 181 }],
    ])).toEqual([]);
  });
});
