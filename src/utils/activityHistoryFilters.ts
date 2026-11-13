import type { BackendActivity } from '../services/activityApi';

export type ActivityDateFilter = 'all' | 'month' | 'year' | 'week' | 'day';
export type ActivityDistanceFilter = 'all' | 'under100' | 'under1000' | 'over1000';

export const matchesDateFilter = (
  activity: Pick<BackendActivity, 'start_time'>,
  filter: ActivityDateFilter,
  filterDate: Date,
  weekStartDay: number,
): boolean => {
  if (filter === 'all') return true;

  const activityDate = new Date(activity.start_time);
  if (!Number.isFinite(activityDate.getTime())) return false;

  const start = new Date(filterDate);
  start.setHours(0, 0, 0, 0);
  if (filter === 'month') start.setDate(1);
  if (filter === 'year') {
    start.setMonth(0, 1);
  } else if (filter === 'week') {
    const daysSinceWeekStart = (start.getDay() - weekStartDay + 7) % 7;
    start.setDate(start.getDate() - daysSinceWeekStart);
  }

  const end = new Date(start);
  if (filter === 'month') end.setMonth(end.getMonth() + 1);
  else if (filter === 'year') end.setFullYear(end.getFullYear() + 1);
  else if (filter === 'week') end.setDate(end.getDate() + 7);
  else end.setDate(end.getDate() + 1);

  return activityDate >= start && activityDate < end;
};

export const getDateFilterStart = (
  filter: ActivityDateFilter,
  filterDate: Date,
  weekStartDay: number,
): number | null => {
  if (filter === 'all') return null;

  const start = new Date(filterDate);
  start.setHours(0, 0, 0, 0);
  if (filter === 'month') start.setDate(1);
  else if (filter === 'year') start.setMonth(0, 1);
  else if (filter === 'week') {
    const daysSinceWeekStart = (start.getDay() - weekStartDay + 7) % 7;
    start.setDate(start.getDate() - daysSinceWeekStart);
  }
  return start.getTime();
};

export const matchesDistanceRange = (
  activity: Pick<BackendActivity, 'distance'>,
  range: ActivityDistanceFilter,
): boolean => {
  if (range === 'all') return true;

  const distanceMeters = Number(activity.distance) || 0;
  if (range === 'under100') return distanceMeters < 100;
  if (range === 'under1000') return distanceMeters >= 100 && distanceMeters <= 1000;
  return distanceMeters > 1000;
};
