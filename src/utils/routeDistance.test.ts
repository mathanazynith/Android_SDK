import { describe, expect, it } from 'vitest';
import {
  calculateAcceptedRouteDistance,
  calculateRouteDistanceBreakdown,
  filterRoutePointsByMaximumJump,
} from './routeDistance';

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

  it('splits the canonical distance into workout and additional distance', () => {
    const points = [pointAt(0, 0), pointAt(10, 1_000), pointAt(20, 2_000)];

    expect(calculateRouteDistanceBreakdown(
      points,
      [],
      (point) => point.timestamp === 2_000,
    )).toEqual({
      totalDistance: expect.closeTo(20, 0),
      additionalDistance: expect.closeTo(10, 0),
      workoutDistance: expect.closeTo(10, 0),
    });
  });

  it('rejects large jumps without bridging from the last accepted point', () => {
    const points = [pointAt(0, 0), pointAt(100, 1_000), pointAt(110, 2_000)];

    expect(filterRoutePointsByMaximumJump(points, 50)).toEqual([points[0]]);
  });
});
