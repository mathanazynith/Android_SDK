import { describe, expect, it } from 'vitest';
import { resolvePlanWeekSelection, type PlanWeekDateGroup } from './trainingPlanSelection';

const weeks: PlanWeekDateGroup[] = [
  { workouts: [{ rawDate: '2026-11-09' }, { rawDate: '2026-11-10' }] },
  { workouts: [{ rawDate: '2026-11-16' }, { rawDate: '2026-11-17' }] },
  { workouts: [{ rawDate: '2026-11-23' }, { rawDate: '2026-11-24' }] },
];

describe('resolvePlanWeekSelection', () => {
  it('selects the current week and day when there is no explicit selection', () => {
    expect(resolvePlanWeekSelection(weeks, { today: '2026-11-17' })).toEqual({
      weekIndex: 1,
      dateKey: '2026-11-17',
    });
  });

  it('keeps an explicit week selection', () => {
    expect(resolvePlanWeekSelection(weeks, { selectedWeek: '1', today: '2026-11-17' })).toEqual({
      weekIndex: 0,
      dateKey: '2026-11-09',
    });
  });

  it('lets an explicit date choose its containing week', () => {
    expect(resolvePlanWeekSelection(weeks, {
      selectedWeek: '1',
      selectedDate: '2026-11-24',
      today: '2026-11-17',
    })).toEqual({
      weekIndex: 2,
      dateKey: '2026-11-24',
    });
  });
});
