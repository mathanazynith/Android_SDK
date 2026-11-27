import { describe, expect, it } from 'vitest';
import { getActivityExtraDistanceMeters } from './extraDistance';

describe('getActivityExtraDistanceMeters', () => {
  it('uses the positive meter value when available', () => {
    expect(getActivityExtraDistanceMeters({ extra_distance: 250, extra_distance_km: 0.3 })).toBe(250);
  });

  it('converts the kilometer value when the meter value is absent or not positive', () => {
    expect(getActivityExtraDistanceMeters({ extra_distance_km: 0.25 })).toBe(250);
    expect(getActivityExtraDistanceMeters({ extra_distance: 0, extra_distance_km: '0.25' })).toBe(250);
  });

  it('returns null when the record has no valid positive extra distance', () => {
    expect(getActivityExtraDistanceMeters(null)).toBeNull();
    expect(getActivityExtraDistanceMeters({ extra_distance: 0, extra_distance_km: 0 })).toBeNull();
    expect(getActivityExtraDistanceMeters({ extra_distance: Number.NaN, extra_distance_km: -1 })).toBeNull();
    expect(getActivityExtraDistanceMeters({ extra_distance: 'not-a-number' })).toBeNull();
  });
});
