import { describe, expect, it } from 'vitest';
import { calculateAcceptedRouteDistance } from './routeDistance';

const pointAt = (eastMeters: number, timestamp: number) => ({
  latitude: 0,
  longitude: eastMeters / 111_320,
  sequence: timestamp,
  point_id: String(timestamp),
  accuracy: 3,
  altitude: null,
  speed: 1,
  heading: null,
  timestamp,
});

describe('calculateAcceptedRouteDistance', () => {
  it('calculates only the segments represented by the submitted points', () => {
    const points = [pointAt(0, 0), pointAt(10, 1_000), pointAt(20, 2_000)];

    expect(calculateAcceptedRouteDistance(points)).toBeCloseTo(20, 0);
  });

  it('does not bridge a pause or count movement within a non-counting interval', () => {
    const points = [
      pointAt(0, 0),
      pointAt(10, 9_000),
      pointAt(30, 21_000),
      pointAt(40, 30_000),
    ];

    expect(calculateAcceptedRouteDistance(points, [{ startedAt: 10_000, endedAt: 20_000 }]))
      .toBeCloseTo(20, 0);
  });

  it('can total only extra-route segments from the same accepted points', () => {
    const points = [pointAt(0, 0), pointAt(10, 1_000), pointAt(20, 2_000)];

    expect(calculateAcceptedRouteDistance(points, [], (point) => point.timestamp === 2_000))
      .toBeCloseTo(10, 0);
  });
});
