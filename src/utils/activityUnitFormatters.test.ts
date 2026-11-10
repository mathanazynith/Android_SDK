import { describe, expect, it } from 'vitest';
import {
    formatDistanceFromMeters,
    formatDistanceValueFromMeters,
    formatElevationFromMeters,
    formatPaceFromSecondsPerKm,
    formatPaceValueFromSecondsPerKm,
    formatSpeedFromKilometersPerHour,
    formatSpeedFromMetersPerSecond,
    formatSplitDistance,
    formatSplitDistanceValue,
} from './activityUnitFormatters';

describe('activity unit formatters', () => {
  it('formats activity distance and elevation using the selected units', () => {
    expect(formatDistanceFromMeters(1609.344, 'km')).toBe('1.61 km');
    expect(formatDistanceFromMeters(1609.344, 'mile')).toBe('1.00 mi');
    expect(formatDistanceValueFromMeters(1609.344, 'km')).toBe('1.61');
    expect(formatDistanceValueFromMeters(1609.344, 'mile')).toBe('1.00');
    expect(formatElevationFromMeters(100, 'km')).toBe('100 m');
    expect(formatElevationFromMeters(100, 'mile')).toBe('328 ft');
  });

  it('converts pace from canonical seconds per kilometer and uses lowercase unit labels', () => {
    expect(formatPaceFromSecondsPerKm(360, 'km')).toBe('06:00 min/km');
    expect(formatPaceFromSecondsPerKm(360, 'mile')).toBe('09:39 min/mi');
    expect(formatPaceFromSecondsPerKm(0, 'mile')).toBe('--:-- min/mi');
    expect(formatPaceValueFromSecondsPerKm(360, 'mile')).toBe('09:39');
  });

  it('formats split intervals in the selected distance unit', () => {
    expect(formatSplitDistance(1000, 'km')).toBe('1000 m');
    expect(formatSplitDistance(1000, 'mile')).toBe('0.62 mi');
    expect(formatSplitDistanceValue(1000, 'km')).toBe('1000');
    expect(formatSplitDistanceValue(1000, 'mile')).toBe('0.62');
    expect(formatSplitDistanceValue(500, 'km')).toBe('500.00');
  });

  it('converts speed values in their source units to the selected units', () => {
    expect(formatSpeedFromMetersPerSecond(5, 'km')).toBe('18.0 km/h');
    expect(formatSpeedFromMetersPerSecond(5, 'mile')).toBe('11.2 mph');
    expect(formatSpeedFromKilometersPerHour(18, 'km')).toBe('18.0 km/h');
    expect(formatSpeedFromKilometersPerHour(18, 'mile')).toBe('11.2 mph');
  });
});
