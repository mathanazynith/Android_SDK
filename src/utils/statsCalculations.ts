import { BackendActivity } from '../services/activityApi';
import { ActivityRecord } from '../services/activityStore';

export type PeriodFilter = 'week' | 'month' | 'year' | 'all';

export interface ChartBarPoint {
  key: string;
  label: string;
  fullLabel: string;
  value: number; // distance in km
  durationSeconds: number;
  paceSecondsPerKm: number;
  workoutCount: number;
  isCurrent: boolean;
}

export interface PersonalBests {
  longestDistanceKm: number;
  longestDurationSeconds: number;
  fastestPaceSeconds: number;
  maxCalories: number;
}

export interface AggregatedStats {
  period: PeriodFilter;
  totalDistanceKm: number;
  totalDurationSeconds: number;
  averagePaceSeconds: number;
  totalCalories: number;
  totalWorkouts: number;
  elevationGainMeters: number;
  activeDaysCount: number;
  streakDays: number;
  runCount: number;
  walkCount: number;
  chartData: ChartBarPoint[];
  chartMax: number;
  chartAvg: number;
  personalBests: PersonalBests;
}

export interface UnifiedActivity {
  id: string | number;
  date: Date;
  distanceKm: number;
  durationSeconds: number;
  paceSecondsPerKm: number;
  calories: number;
  elevationGain: number;
  activityType: 'RUN' | 'WALK';
}

/** Convert either BackendActivity or ActivityRecord into a clean UnifiedActivity */
export function normalizeActivities(
  backendActivities: BackendActivity[] = [],
  localActivities: ActivityRecord[] = []
): UnifiedActivity[] {
  const map = new Map<string, UnifiedActivity>();

  backendActivities.forEach((act) => {
    const date = new Date(act.start_time);
    if (isNaN(date.getTime())) return;
    const distanceKm = Math.max(0, Number(act.distance || 0)) / 1000;
    const duration = Math.max(0, Number(act.moving_time || act.elapsed_time || 0));
    const pace = Number(act.avg_pace || 0);

    const key = String(act.id);
    map.set(key, {
      id: act.id,
      date,
      distanceKm,
      durationSeconds: duration,
      paceSecondsPerKm: pace > 0 ? pace : (duration > 0 && distanceKm > 0 ? duration / distanceKm : 0),
      calories: Number(act.calories || 0),
      elevationGain: Number(act.elevation_gain || 0),
      activityType: String(act.activity_type).toUpperCase() === 'WALK' ? 'WALK' : 'RUN',
    });
  });

  localActivities.forEach((act) => {
    if (map.has(act.id)) return;
    const date = new Date(act.date);
    if (isNaN(date.getTime())) return;
    const distanceKm = Math.max(0, Number(act.distanceMeters || 0)) / 1000;
    const duration = Math.max(0, Number(act.durationSeconds || 0));
    const pace = Number(act.paceSecondsPerKm || 0);

    map.set(act.id, {
      id: act.id,
      date,
      distanceKm,
      durationSeconds: duration,
      paceSecondsPerKm: pace > 0 ? pace : (duration > 0 && distanceKm > 0 ? duration / distanceKm : 0),
      calories: Number(act.calories || 0),
      elevationGain: 0,
      activityType: 'RUN',
    });
  });

  return Array.from(map.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Compute Personal Records across all-time activities */
export function calculatePersonalBests(activities: UnifiedActivity[]): PersonalBests {
  let longestDistanceKm = 0;
  let longestDurationSeconds = 0;
  let fastestPaceSeconds = 0;
  let maxCalories = 0;

  activities.forEach((act) => {
    if (act.distanceKm > longestDistanceKm) longestDistanceKm = act.distanceKm;
    if (act.durationSeconds > longestDurationSeconds) longestDurationSeconds = act.durationSeconds;
    if (act.calories > maxCalories) maxCalories = act.calories;
    if (act.paceSecondsPerKm > 0 && act.distanceKm >= 0.5) {
      if (fastestPaceSeconds === 0 || act.paceSecondsPerKm < fastestPaceSeconds) {
        fastestPaceSeconds = act.paceSecondsPerKm;
      }
    }
  });

  return {
    longestDistanceKm,
    longestDurationSeconds,
    fastestPaceSeconds,
    maxCalories,
  };
}

/** Calculate consecutive active days streak */
export function calculateStreak(activities: UnifiedActivity[]): number {
  if (!activities.length) return 0;

  const dateSet = new Set<string>();
  activities.forEach((act) => {
    const yyyy = act.date.getFullYear();
    const mm = String(act.date.getMonth() + 1).padStart(2, '0');
    const dd = String(act.date.getDate()).padStart(2, '0');
    dateSet.add(`${yyyy}-${mm}-${dd}`);
  });

  const today = new Date();
  let streak = 0;
  const cursor = new Date(today);
  cursor.setHours(0, 0, 0, 0);

  const todayKey = cursor.toISOString().split('T')[0];
  if (!dateSet.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (true) {
    const key = cursor.toISOString().split('T')[0];
    if (dateSet.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

/** Aggregate activities based on chosen period ('week' | 'month' | 'year' | 'all') and target year */
export function calculatePeriodStats(
  activities: UnifiedActivity[],
  period: PeriodFilter,
  targetYear: number = new Date().getFullYear()
): AggregatedStats {
  const now = new Date();
  const personalBests = calculatePersonalBests(activities);
  const streakDays = calculateStreak(activities);

  let filtered: UnifiedActivity[] = [];
  let chartData: ChartBarPoint[] = [];

  if (period === 'week') {
    const isCurrentYear = targetYear === now.getFullYear();
    const baseDate = isCurrentYear ? now : new Date(targetYear, 11, 28);
    const weekStart = new Date(baseDate);
    const day = (baseDate.getDay() + 6) % 7;
    weekStart.setDate(baseDate.getDate() - day);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    filtered = activities.filter((a) => a.date >= weekStart && a.date < weekEnd);

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    chartData = dayNames.map((label, idx) => {
      const barDate = new Date(weekStart);
      barDate.setDate(weekStart.getDate() + idx);
      const isCurrent = isCurrentYear && barDate.toDateString() === now.toDateString();

      const dayActs = filtered.filter(
        (a) => a.date.toDateString() === barDate.toDateString()
      );

      const value = dayActs.reduce((acc, a) => acc + a.distanceKm, 0);
      const durationSeconds = dayActs.reduce((acc, a) => acc + a.durationSeconds, 0);
      const paceSecondsPerKm = value > 0 ? durationSeconds / value : 0;

      return {
        key: `day-${idx}`,
        label,
        fullLabel: barDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }),
        value,
        durationSeconds,
        paceSecondsPerKm,
        workoutCount: dayActs.length,
        isCurrent,
      };
    });
  } else if (period === 'month') {
    const isCurrentYear = targetYear === now.getFullYear();
    const activeMonth = isCurrentYear ? now.getMonth() : 11;
    const monthStart = new Date(targetYear, activeMonth, 1);
    const nextMonthStart = new Date(targetYear, activeMonth + 1, 1);

    filtered = activities.filter((a) => a.date >= monthStart && a.date < nextMonthStart);

    const weeks: { start: number; end: number; label: string }[] = [
      { start: 1, end: 7, label: 'W1' },
      { start: 8, end: 14, label: 'W2' },
      { start: 15, end: 21, label: 'W3' },
      { start: 22, end: 31, label: 'W4+' },
    ];

    const currentDay = isCurrentYear ? now.getDate() : 31;

    chartData = weeks.map((w, idx) => {
      const weekActs = filtered.filter((a) => {
        const d = a.date.getDate();
        return d >= w.start && d <= w.end;
      });

      const value = weekActs.reduce((acc, a) => acc + a.distanceKm, 0);
      const durationSeconds = weekActs.reduce((acc, a) => acc + a.durationSeconds, 0);
      const paceSecondsPerKm = value > 0 ? durationSeconds / value : 0;
      const isCurrent = isCurrentYear && currentDay >= w.start && currentDay <= w.end;

      return {
        key: `week-${idx}`,
        label: w.label,
        fullLabel: `Day ${w.start}–${w.end} ${monthStart.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`,
        value,
        durationSeconds,
        paceSecondsPerKm,
        workoutCount: weekActs.length,
        isCurrent,
      };
    });
  } else if (period === 'year') {
    const yearStart = new Date(targetYear, 0, 1);
    const nextYearStart = new Date(targetYear + 1, 0, 1);

    filtered = activities.filter((a) => a.date >= yearStart && a.date < nextYearStart);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = now.getMonth();

    chartData = monthNames.map((label, idx) => {
      const monthActs = filtered.filter((a) => a.date.getMonth() === idx);
      const value = monthActs.reduce((acc, a) => acc + a.distanceKm, 0);
      const durationSeconds = monthActs.reduce((acc, a) => acc + a.durationSeconds, 0);
      const paceSecondsPerKm = value > 0 ? durationSeconds / value : 0;

      return {
        key: `month-${idx}`,
        label,
        fullLabel: `${label} ${targetYear}`,
        value,
        durationSeconds,
        paceSecondsPerKm,
        workoutCount: monthActs.length,
        isCurrent: targetYear === now.getFullYear() && idx === currentMonth,
      };
    });
  } else {
    filtered = activities;

    const monthMap = new Map<string, { label: string; fullLabel: string; acts: UnifiedActivity[] }>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = d.toLocaleDateString(undefined, { month: 'short' });
      const fullLabel = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      monthMap.set(key, { label, fullLabel, acts: [] });
    }

    filtered.forEach((a) => {
      const key = `${a.date.getFullYear()}-${a.date.getMonth()}`;
      const bucket = monthMap.get(key);
      if (bucket) {
        bucket.acts.push(a);
      }
    });

    chartData = Array.from(monthMap.entries()).map(([key, data], idx) => {
      const value = data.acts.reduce((acc, a) => acc + a.distanceKm, 0);
      const durationSeconds = data.acts.reduce((acc, a) => acc + a.durationSeconds, 0);
      const paceSecondsPerKm = value > 0 ? durationSeconds / value : 0;

      return {
        key: `all-${key}-${idx}`,
        label: data.label,
        fullLabel: data.fullLabel,
        value,
        durationSeconds,
        paceSecondsPerKm,
        workoutCount: data.acts.length,
        isCurrent: idx === monthMap.size - 1,
      };
    });
  }

  const totalDistanceKm = filtered.reduce((acc, a) => acc + a.distanceKm, 0);
  const totalDurationSeconds = filtered.reduce((acc, a) => acc + a.durationSeconds, 0);
  const totalCalories = filtered.reduce((acc, a) => acc + a.calories, 0);
  const elevationGainMeters = filtered.reduce((acc, a) => acc + a.elevationGain, 0);
  const totalWorkouts = filtered.length;
  const averagePaceSeconds =
    totalDistanceKm > 0 ? Math.round(totalDurationSeconds / totalDistanceKm) : 0;

  const activeDaysSet = new Set<string>();
  filtered.forEach((a) => {
    activeDaysSet.add(a.date.toDateString());
  });
  const activeDaysCount = activeDaysSet.size;

  const runCount = filtered.filter((a) => a.activityType === 'RUN').length;
  const walkCount = filtered.filter((a) => a.activityType === 'WALK').length;

  const chartMax = Math.max(...chartData.map((d) => d.value), 1);
  const activeChartPoints = chartData.filter((d) => d.value > 0);
  const chartAvg =
    activeChartPoints.length > 0
      ? activeChartPoints.reduce((acc, d) => acc + d.value, 0) / activeChartPoints.length
      : 0;

  return {
    period,
    totalDistanceKm,
    totalDurationSeconds,
    averagePaceSeconds,
    totalCalories,
    totalWorkouts,
    elevationGainMeters,
    activeDaysCount,
    streakDays,
    runCount,
    walkCount,
    chartData,
    chartMax,
    chartAvg,
    personalBests,
  };
}

export function formatKm(km: number): string {
  if (km >= 100) return `${km.toFixed(0)} km`;
  if (km >= 10) return `${km.toFixed(1)} km`;
  return `${km.toFixed(2)} km`;
}

export function formatTimeHoursMins(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return '0m';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes > 0 ? `${minutes}m` : ''}`.trim();
  }
  return `${minutes}m`;
}

export function formatPaceMinutes(secondsPerKm: number): string {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '--:-- /km';
  const min = Math.floor(secondsPerKm / 60);
  const sec = Math.round(secondsPerKm % 60);
  return `${min}:${String(sec).padStart(2, '0')} /km`;
}

export interface YearSummaryStats {
  runs: number;
  distanceKm: number;
  calories: number;
  avgPaceSeconds: number;
  totalDurationSeconds: number;
  totalWorkouts: number;
}

export interface WeekCompletionStats {
  workouts: number;
  distanceKm: number;
}

/** Calculate summary statistics for a given calendar year */
export function calculateYearStats(
  activities: UnifiedActivity[],
  year: number
): YearSummaryStats {
  const filtered = activities.filter((a) => a.date.getFullYear() === year);
  const runActivities = filtered.filter((a) => a.activityType === 'RUN');
  const runs = runActivities.length > 0 ? runActivities.length : filtered.length;
  const distanceKm = filtered.reduce((acc, a) => acc + a.distanceKm, 0);
  const calories = filtered.reduce((acc, a) => acc + a.calories, 0);
  const totalDurationSeconds = filtered.reduce((acc, a) => acc + a.durationSeconds, 0);
  const avgPaceSeconds = distanceKm > 0 ? Math.round(totalDurationSeconds / distanceKm) : 0;
  const totalWorkouts = filtered.length;

  return {
    runs,
    distanceKm,
    calories,
    avgPaceSeconds,
    totalDurationSeconds,
    totalWorkouts,
  };
}

/** Calculate workouts and distance completed during the current calendar week (Monday to Sunday) */
export function calculateWeekCompletion(activities: UnifiedActivity[]): WeekCompletionStats {
  const now = new Date();
  const weekStart = new Date(now);
  const day = (now.getDay() + 6) % 7; // Monday = 0
  weekStart.setDate(now.getDate() - day);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const weekActs = activities.filter((a) => a.date >= weekStart && a.date < weekEnd);
  const workouts = weekActs.length;
  const distanceKm = weekActs.reduce((acc, a) => acc + a.distanceKm, 0);

  return {
    workouts,
    distanceKm,
  };
}

/** Extract unique years present in activities, ensuring current year is included */
export function getAvailableYears(activities: UnifiedActivity[]): number[] {
  const currentYear = new Date().getFullYear();
  const yearSet = new Set<number>([currentYear]);
  activities.forEach((a) => {
    yearSet.add(a.date.getFullYear());
  });
  return Array.from(yearSet).sort((a, b) => b - a);
}


