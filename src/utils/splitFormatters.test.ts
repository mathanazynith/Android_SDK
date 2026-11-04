import { describe, expect, it } from 'vitest';
import { formatDurationMmSs, formatPace, formatSplitDistance, formatSplitTime } from './splitFormatters';

describe('split formatters', () => {
  it('shows full split intervals as 500m and other distances to two decimals', () => {
    expect(formatSplitDistance(500)).toBe('500m');
    expect(formatSplitDistance(54.45)).toBe('54.45m');
    expect(formatSplitDistance(499.876)).toBe('499.88m');
    expect(formatSplitDistance(1010.41)).toBe('1010.41m');
  });

  it('formats all split durations as mm:ss', () => {
    expect(formatSplitTime(11.7)).toBe('00:12');
    expect(formatSplitTime(221.6)).toBe('03:42');
    expect(formatDurationMmSs(3665)).toBe('61:05');
  });

  it('formats pace as mm:ss/km', () => {
    expect(formatPace(884)).toBe('14:44/km');
  });
});