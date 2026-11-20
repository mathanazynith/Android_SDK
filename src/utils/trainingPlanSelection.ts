export type PlanWeekDateGroup = {
  workouts: readonly { rawDate?: string | null }[];
};

export type PlanWeekSelectionOptions = {
  selectedWeek?: string | null;
  selectedDate?: string | null;
  today: string;
};

export type PlanWeekSelection = {
  weekIndex: number;
  dateKey: string | null;
};

export const resolvePlanWeekSelection = (
  weeks: readonly PlanWeekDateGroup[],
  options: PlanWeekSelectionOptions,
): PlanWeekSelection => {
  if (weeks.length === 0) return { weekIndex: 0, dateKey: null };

  const requestedDate = String(options.selectedDate ?? '').slice(0, 10);
  const requestedDateWeek = requestedDate
    ? weeks.findIndex((week) => week.workouts.some((workout) => workout.rawDate === requestedDate))
    : -1;
  const requestedWeek = Number.parseInt(String(options.selectedWeek ?? ''), 10);
  const currentWeek = weeks.findIndex((week) => week.workouts.some((workout) => workout.rawDate === options.today));
  const weekIndex = requestedDateWeek >= 0
    ? requestedDateWeek
    : Number.isFinite(requestedWeek) && requestedWeek > 0
      ? Math.min(requestedWeek - 1, weeks.length - 1)
      : currentWeek >= 0
        ? currentWeek
        : 0;
  const week = weeks[weekIndex];
  const dateKey = requestedDateWeek >= 0
    ? requestedDate
    : week.workouts.some((workout) => workout.rawDate === options.today)
      ? options.today
      : week.workouts[0]?.rawDate ?? null;

  return { weekIndex, dateKey };
};
