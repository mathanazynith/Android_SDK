import { describe, expect, it } from 'vitest';
import { buildActivityRouteGroups, mergeActivityRouteGroups } from './activityRouteGroups';

describe('buildActivityRouteGroups', () => {
  it('keeps a standard unpaused activity in one running group', () => {
    expect(buildActivityRouteGroups([
      { latitude: 0, longitude: 0, accuracy: 5, is_paused: false, is_extra_distance: false },
      { latitude: 0, longitude: 0.001, accuracy: 5, is_paused: false, is_extra_distance: false },
      { latitude: 0, longitude: 0.002, accuracy: 5, is_paused: false, is_extra_distance: false },
    ])).toEqual([{
      type: 'running',
      coordinates: [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 0.001 },
        { latitude: 0, longitude: 0.002 },
      ],
    }]);
  });

  it('does not treat serialized false flags as route boundaries', () => {
    const points = JSON.parse('[{"latitude":0,"longitude":0,"accuracy":5,"is_paused":"false","is_extra_distance":"false"},{"latitude":0,"longitude":0.001,"accuracy":5,"is_paused":"false","is_extra_distance":"false"}]');

    expect(buildActivityRouteGroups(points)).toEqual([{
      type: 'running',
      coordinates: [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 0.001 },
      ],
    }]);
  });
});

describe('mergeActivityRouteGroups', () => {
  it('joins contiguous route groups and removes duplicated boundaries', () => {
    const first = { latitude: 0, longitude: 0 };
    const shared = { latitude: 0, longitude: 0.001 };
    const last = { latitude: 0, longitude: 0.002 };

    expect(mergeActivityRouteGroups([
      { type: 'running', coordinates: [first, shared] },
      { type: 'extra', coordinates: [shared, last] },
    ])).toEqual([{
      type: 'running',
      coordinates: [first, shared, last],
    }]);
  });

  it('does not create a line from fewer than two distinct coordinates', () => {
    expect(mergeActivityRouteGroups([
      { type: 'running', coordinates: [{ latitude: 0, longitude: 0 }] },
      { type: 'pause', coordinates: [{ latitude: 0, longitude: 0 }] },
    ])).toEqual([]);
  });
});
