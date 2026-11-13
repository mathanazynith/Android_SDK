import { describe, expect, it } from 'vitest';
import {
  getDateFilterStart,
  matchesDateFilter,
  matchesDistanceRange,
} from './activityHistoryFilters';

const localDate = (year: number, month: number, day: number) => new Date(year, month, day, 12);

describe('activity history date filters', () => {
  it('uses the device week start and excludes the adjacent weeks', () => {
    const filterDate = localDate(2024, 0, 3);

    expect(getDateFilterStart('week', filterDate, 1)).toBe(localDate(2024, 0, 1).setHours(0, 0, 0, 0));
    expect(matchesDateFilter({ start_time: localDate(2024, 0, 7).toISOString() }, 'week', filterDate, 1)).toBe(true);
    expect(matchesDateFilter({ start_time: localDate(2023, 11, 31).toISOString() }, 'week', filterDate, 1)).toBe(false);
    expect(matchesDateFilter({ start_time: localDate(2024, 0, 8).toISOString() }, 'week', filterDate, 1)).toBe(false);
  });

  it('includes the full selected month, including leap day, but not the next month', () => {
    const filterDate = localDate(2024, 1, 15);

    expect(matchesDateFilter({ start_time: localDate(2024, 1, 29).toISOString() }, 'month', filterDate, 0)).toBe(true);
    expect(matchesDateFilter({ start_time: localDate(2024, 2, 1).toISOString() }, 'month', filterDate, 0)).toBe(false);
  });

  it('uses the selected calendar year and treats all time as unbounded', () => {
    const filterDate = localDate(2024, 5, 10);

    expect(matchesDateFilter({ start_time: localDate(2024, 0, 1).toISOString() }, 'year', filterDate, 0)).toBe(true);
    expect(matchesDateFilter({ start_time: localDate(2025, 0, 1).toISOString() }, 'year', filterDate, 0)).toBe(false);
    expect(getDateFilterStart('all', filterDate, 0)).toBeNull();
    expect(matchesDateFilter({ start_time: 'invalid' }, 'all', filterDate, 0)).toBe(true);
  });

  it('uses exclusive next-day boundaries for the day filter', () => {
    const filterDate = localDate(2024, 5, 10);

    expect(matchesDateFilter({ start_time: localDate(2024, 5, 10).toISOString() }, 'day', filterDate, 0)).toBe(true);
    expect(matchesDateFilter({ start_time: localDate(2024, 5, 11).toISOString() }, 'day', filterDate, 0)).toBe(false);
  });
});

describe('activity history distance filters', () => {
  it('keeps the exact 100 m and 1 km boundaries in the middle range', () => {
    expect(matchesDistanceRange({ distance: 99.99 }, 'under100')).toBe(true);
    expect(matchesDistanceRange({ distance: 100 }, 'under100')).toBe(false);
    expect(matchesDistanceRange({ distance: 100 }, 'under1000')).toBe(true);
    expect(matchesDistanceRange({ distance: 1000 }, 'under1000')).toBe(true);
    expect(matchesDistanceRange({ distance: 1000.01 }, 'over1000')).toBe(true);
  });
});
