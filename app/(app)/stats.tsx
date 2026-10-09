import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, {
  cancelAnimation,
  Easing as ReanimatedEasing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import BenchmarkBadgeIcon from '../../components/BenchmarkBadgeIcon';
import MotionEntrance from '../../components/MotionEntrance';
import { useQuestionnaire } from '../../contexts/QuestionnaireContext';
import { useTheme } from '../../contexts/ThemeContext';
import { customWorkoutAPI, type UserWorkoutResponse } from '../../service/customWorkout';
import { activityAPI, BackendActivity } from '../../src/services/activityApi';
import ActivityStore from '../../src/services/activityStore';
import { BenchmarkStore } from '../../src/services/benchmarkStore';
import {
  PlanBenchmarkStore,
  type PlanBenchmarkAssignment,
} from '../../src/services/planBenchmarkStore';
import {
  AggregatedStats,
  calculatePeriodStats,
  calculateYearStats,
  ChartBarPoint,
  formatKm,
  formatPaceMinutes,
  formatTimeHoursMins,
  formatWeekRange,
  getAvailableYears,
  getMonthName,
  normalizeActivities,
  PeriodFilter,
  UnifiedActivity,
} from '../../src/utils/statsCalculations';
import {
  buildPlanFromPlanSegments,
  buildWorkoutExecutionPlan,
  type WorkoutExecutionStep
} from '../../src/utils/workoutPlanBuilder';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_BAR_MAX_HEIGHT = 125;

interface ChartMorph {
  sourceData: ChartBarPoint[];
  targetData: ChartBarPoint[];
  sourceMax: number;
  targetMax: number;
  sourcePeriod: PeriodFilter;
  targetPeriod: PeriodFilter;
}

interface PeriodStatsCache {
  activities: UnifiedActivity[];
  period: PeriodFilter;
  year: number;
  month: number;
  weekDate: number;
  stats: AggregatedStats;
}

interface ChartPointRange {
  start: number;
  end: number;
  center: number;
}

interface MorphBarProps {
  styles: ReturnType<typeof getThemeStyles>;
  progress: SharedValue<number>;
  left: number;
  width: number;
  height: number;
  translateX: [number, number];
  translateY?: [number, number];
  scaleX: [number, number];
  scaleY: [number, number];
  opacity: [number, number];
  color: string;
}

function MorphBar({
  styles,
  progress,
  left,
  width,
  height,
  translateX,
  translateY = [0, 0],
  scaleX,
  scaleY,
  opacity,
  color,
}: MorphBarProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const value = progress.value;
    return {
      opacity: interpolate(value, [0, 1], opacity),
      transform: [
        { translateX: interpolate(value, [0, 1], translateX) },
        { translateY: interpolate(value, [0, 1], translateY) },
        { scaleX: interpolate(value, [0, 1], scaleX) },
        { scaleY: interpolate(value, [0, 1], scaleY) },
      ],
    };
  }, [opacity, scaleX, scaleY, translateX, translateY]);

  return (
    <Reanimated.View
      style={[
        styles.chartMorphBar,
        { left, width, height, backgroundColor: color },
        animatedStyle,
      ]}
    />
  );
}

interface MorphTrackProps {
  styles: ReturnType<typeof getThemeStyles>;
  progress: SharedValue<number>;
  left: number;
  width: number;
  color: string;
  opacity: [number, number];
}

function MorphTrack({ styles, progress, left, width, color, opacity }: MorphTrackProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], opacity),
  }), [opacity]);

  return (
    <Reanimated.View
      style={[
        styles.chartMorphTrack,
        { left, width, backgroundColor: color },
        animatedStyle,
      ]}
    />
  );
}

interface MorphLabelProps {
  styles: ReturnType<typeof getThemeStyles>;
  progress: SharedValue<number>;
  left: number;
  width: number;
  label: string;
  opacity: [number, number];
}

function MorphLabel({ styles, progress, left, width, label, opacity }: MorphLabelProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], opacity),
  }), [opacity]);

  return (
    <Reanimated.Text
      style={[
        styles.barLabel,
        styles.chartMorphLabel,
        { left, width },
        animatedStyle,
      ]}
    >
      {label}
    </Reanimated.Text>
  );
}

function getChartPointRange(period: PeriodFilter, point: ChartBarPoint): ChartPointRange | null {
  if (!point.targetDate) return null;

  const date = point.targetDate;
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let endDate: Date;

  if (period === 'week') {
    endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
  } else if (period === 'month') {
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    endDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      Math.min(startDate.getDate() + 7, daysInMonth + 1)
    );
  } else {
    endDate = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  }

  const start = startDate.getTime();
  const end = endDate.getTime();
  return { start, end, center: start + (end - start) / 2 };
}

function findMorphTargetIndex(
  sourcePeriod: PeriodFilter,
  sourcePoint: ChartBarPoint,
  targetPeriod: PeriodFilter,
  targetData: ChartBarPoint[]
): number {
  if (targetData.length === 0) return -1;

  const sourceRange = getChartPointRange(sourcePeriod, sourcePoint);
  if (!sourceRange) return 0;

  const targetRanges = targetData.map((point) => getChartPointRange(targetPeriod, point));
  const containingIndex = targetRanges.findIndex(
    (range) => range && sourceRange.center >= range.start && sourceRange.center < range.end
  );
  if (containingIndex >= 0) return containingIndex;

  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  targetRanges.forEach((range, index) => {
    if (!range || sourceRange.start >= range.end || sourceRange.end <= range.start) return;
    const distance = Math.abs(range.center - sourceRange.center);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });
  return Number.isFinite(closestDistance) ? closestIndex : -1;
}

export default function StatsScreen() {
  const { workoutPlan, fetchWorkoutPlan } = useQuestionnaire();
  const [customWorkouts, setCustomWorkouts] = useState<UserWorkoutResponse[]>([]);
  const [benchmarkIds, setBenchmarkIds] = useState<number[]>([]);
  const [planBenchmarks, setPlanBenchmarks] = useState<PlanBenchmarkAssignment[]>([]);

  const userCustomWorkouts = useMemo(() => {
    return customWorkouts.filter((w) => w.is_custom !== false && w.plan == null);
  }, [customWorkouts]);

  const hasCustomWorkouts = userCustomWorkouts.length > 0;

  const hasPlanWorkouts = Boolean(
    (workoutPlan?.weeks && workoutPlan.weeks.some((wk) => wk.workouts?.length > 0)) ||
    customWorkouts.some((w) => w.is_custom === false || w.plan != null)
  );

  const hasActivePlan = Boolean(
    hasPlanWorkouts || planBenchmarks.length > 0
  );

  const { isDark } = useTheme();
  const reduceMotion = useReducedMotion();
  const styles = getThemeStyles(isDark);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<PeriodFilter>('week');
  const [activities, setActivities] = useState<UnifiedActivity[]>([]);
  const [selectedPointKey, setSelectedPointKey] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedWeekDate, setSelectedWeekDate] = useState<Date>(new Date());
  const chartValueHighlight = useMemo(() => new Animated.Value(1), []);
  const periodIndicatorPosition = useMemo(() => new Animated.Value(0), []);
  const [periodTabsWidth, setPeriodTabsWidth] = useState(0);
  const [chartWidth, setChartWidth] = useState(0);
  const [chartMorph, setChartMorph] = useState<ChartMorph | null>(null);
  const chartMorphProgress = useSharedValue(0);
  const chartMorphFinalValues = useRef<Record<string, number>>({});
  const [periodStatsCache, setPeriodStatsCache] = useState<PeriodStatsCache | null>(null);
  const [barHeightValues, setBarHeightValues] = useState<Record<string, Animated.Value>>({});
  const barHeightAnims = useRef(new Map<string, Animated.Value>());
  const hasRenderedChart = useRef(false);
  const distributionAnim = useMemo(() => new Animated.Value(0), []);
  const [showYearModal, setShowYearModal] = useState(false);
  const [showBenchmarkModal, setShowBenchmarkModal] = useState(false);
  const [startingWorkoutId, setStartingWorkoutId] = useState<number | null>(null);
  const [startingPlanKey, setStartingPlanKey] = useState<string | null>(null);

  const finishChartMorph = useCallback(() => {
    const finalHeights = new Map<string, Animated.Value>();
    Object.entries(chartMorphFinalValues.current).forEach(([key, value]) => {
      finalHeights.set(key, new Animated.Value(value));
    });
    barHeightAnims.current.forEach((height) => height.stopAnimation());
    barHeightAnims.current.clear();
    finalHeights.forEach((height, key) => barHeightAnims.current.set(key, height));
    setBarHeightValues(Object.fromEntries(finalHeights));
    setChartMorph(null);
  }, []);

  useEffect(() => {
    fetchWorkoutPlan().catch(() => {});
  }, [fetchWorkoutPlan]);

  const loadActivities = useCallback(async () => {
    try {
      let backendList: BackendActivity[] = [];
      try {
        backendList = await activityAPI.list();
      } catch (err) {
        console.warn('Could not fetch backend activities for stats:', err);
      }

      const localList = ActivityStore.list();
      const unified = normalizeActivities(backendList, localList);
      setActivities(unified);

      try {
        const [customRes, benchIds, planBenchList] = await Promise.all([
          customWorkoutAPI.list(),
          BenchmarkStore.getBenchmarkIds(),
          PlanBenchmarkStore.getActiveBenchmarkList(),
        ]);
        const customList: UserWorkoutResponse[] = Array.isArray(customRes.data)
          ? customRes.data
          : ((customRes.data as any)?.results || []);
        setCustomWorkouts(customList);
        const serverBenchIds = customList
          .filter((w: UserWorkoutResponse) => w.is_custom !== false && w.plan == null && Boolean(w.is_benchmark))
          .map((w: UserWorkoutResponse) => w.id);
        const mergedBenchIds = Array.from(new Set([...serverBenchIds, ...benchIds]));
        setBenchmarkIds(mergedBenchIds);
        setPlanBenchmarks(planBenchList);
      } catch (err) {
        console.warn('Error loading custom workouts for stats benchmarks:', err);
        console.warn('Error loading plan benchmarks for stats:', err);
      }
    } catch (e) {
      console.warn('Error loading stats activities:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadActivities();
      BenchmarkStore.getBenchmarkIds().then((ids) => {
        setBenchmarkIds((prev) => Array.from(new Set([...prev, ...ids])));
      });
      PlanBenchmarkStore.getActiveBenchmarkList().then(setPlanBenchmarks);
      const unsub = BenchmarkStore.subscribe((ids) => {
        setBenchmarkIds((prev) => Array.from(new Set([...prev, ...ids])));
      });
      const unsubPlan = PlanBenchmarkStore.subscribe((assignments) => {
        setPlanBenchmarks(Object.values(assignments).filter((a) => a && a.isBenchmark));
      });
      return () => {
        unsub();
        unsubPlan();
      };
    }, [loadActivities])
  );

  const benchmarkWorkouts = useMemo(() => {
    return customWorkouts.filter(
      (w) => w.is_custom !== false && w.plan == null && Boolean(w.is_benchmark || benchmarkIds.includes(w.id))
    );
  }, [customWorkouts, benchmarkIds]);

  const activePlanBenchmarks = useMemo(() => {
    const map = new Map<string, PlanBenchmarkAssignment>();

    // 1. Add plan benchmark assignments from local store
    for (const pb of planBenchmarks) {
      if (pb && pb.isBenchmark) {
        const key = pb.workoutKey || pb.planWorkoutTitle || 'plan';
        map.set(key, pb);
      }
    }

    // 2. Add / merge plan workouts directly from database workouts table (where is_custom === false or plan != null, and is_benchmark === true)
    const dbPlanBenchmarks = customWorkouts.filter(
      (w) => (w.is_custom === false || w.plan != null) && Boolean(w.is_benchmark)
    );
    for (const w of dbPlanBenchmarks) {
      const key = String(w.id);
      const dateKey = w.workout_date || '';
      const existing = (dateKey && map.get(dateKey)) || map.get(key);
      if (existing) {
        existing.workoutDbId = w.id;
      } else {
        map.set(key, {
          workoutKey: key,
          isBenchmark: true,
          benchmarkType: 'plan',
          benchmarkTitle: w.title || 'Plan Benchmark',
          workoutDbId: w.id,
          planWorkoutTitle: w.title,
          planWorkoutDate: w.workout_date || undefined,
          planWorkoutDay: w.weekday || undefined,
          planWorkoutType: w.workout_type,
          planWorkoutDistance: w.display_distance
            ? `${w.display_distance} ${w.distance_unit || 'km'}`
            : w.distance
            ? `${(w.distance / 1000).toFixed(1)} km`
            : undefined,
          planWorkoutDuration: w.duration ? `${Math.round(w.duration / 60)} min` : undefined,
          planWorkoutPace: w.target_pace || w.pace || undefined,
          planWorkoutSegments: w.segments,
          notes: w.notes,
        });
      }
    }

    return Array.from(map.values());
  }, [planBenchmarks, customWorkouts]);

  const totalBenchmarksCount = benchmarkWorkouts.length + activePlanBenchmarks.length;

  const handleStartBenchmarkWorkout = (workout: UserWorkoutResponse) => {
    setStartingWorkoutId(workout.id);
    const plan = buildWorkoutExecutionPlan(workout);
    setShowBenchmarkModal(false);
    router.push({
      pathname: '/(app)/screens/map',
      params: {
        workoutTitle: workout.title || 'Benchmark Workout',
        workoutPlan: JSON.stringify(plan),
      },
    });
    setTimeout(() => setStartingWorkoutId(null), 1000);
  };

  const handleStartPlanBenchmark = (pb: PlanBenchmarkAssignment) => {
    setStartingPlanKey(pb.workoutKey);
    setShowBenchmarkModal(false);

    let planSteps: WorkoutExecutionStep[] = [];
    if (pb.benchmarkType === '1k') {
      planSteps = [
        { id: 'bench-1k-warmup', title: 'Warm Up (Easy Jog)', stepType: 'Warmup', targetType: 'DURATION', targetDurationSeconds: 300 },
        { id: 'bench-1k-run', title: '1 km Benchmark (Max Effort)', stepType: 'Run', targetType: 'DISTANCE', targetDistanceMeters: 1000 },
        { id: 'bench-1k-cooldown', title: 'Cool Down', stepType: 'Cooldown', targetType: 'DURATION', targetDurationSeconds: 300 },
      ];
    } else if (pb.benchmarkType === '5k') {
      planSteps = [
        { id: 'bench-5k-warmup', title: 'Warm Up (Easy Jog)', stepType: 'Warmup', targetType: 'DURATION', targetDurationSeconds: 300 },
        { id: 'bench-5k-run', title: '5 km Benchmark (Paced Effort)', stepType: 'Run', targetType: 'DISTANCE', targetDistanceMeters: 5000 },
        { id: 'bench-5k-cooldown', title: 'Cool Down', stepType: 'Cooldown', targetType: 'DURATION', targetDurationSeconds: 300 },
      ];
    } else if (pb.benchmarkType === 'cooper') {
      planSteps = [
        { id: 'bench-cooper-warmup', title: 'Warm Up (Easy Jog)', stepType: 'Warmup', targetType: 'DURATION', targetDurationSeconds: 300 },
        { id: 'bench-cooper-run', title: '12-Minute Cooper Test (Max Distance)', stepType: 'Run', targetType: 'DURATION', targetDurationSeconds: 720 },
        { id: 'bench-cooper-cooldown', title: 'Cool Down', stepType: 'Cooldown', targetType: 'DURATION', targetDurationSeconds: 300 },
      ];
    } else if (Array.isArray(pb.planWorkoutSegments) && pb.planWorkoutSegments.length > 0) {
      planSteps = buildPlanFromPlanSegments(pb.planWorkoutSegments, pb.planWorkoutTitle || pb.benchmarkTitle);
    }

    if (planSteps.length > 0) {
      router.push({
        pathname: '/(app)/screens/map',
        params: {
          workoutTitle: pb.benchmarkTitle || pb.planWorkoutTitle || 'Benchmark Workout',
          workoutPlan: JSON.stringify(planSteps),
        },
      });
    } else {
      router.push({
        pathname: '/(app)/run',
        params: {
          workoutId: pb.workoutKey,
          workoutTitle: `${pb.planWorkoutTitle || pb.benchmarkTitle} (Benchmark)`,
          workoutType: 'Benchmark',
          workoutDuration: pb.planWorkoutDuration,
          workoutDistance: pb.planWorkoutDistance,
          workoutPace: pb.planWorkoutPace,
        },
      });
    }
    setTimeout(() => setStartingPlanKey(null), 1000);
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadActivities();
  }, [loadActivities]);

  // Update data immediately; animate only the value emphasis and chart marks.
  const triggerTransition = useCallback((updateFn: () => void) => {
    updateFn();
    chartValueHighlight.stopAnimation();

    if (reduceMotion) {
      chartValueHighlight.setValue(1);
      return;
    }

    chartValueHighlight.setValue(0.82);
    Animated.timing(chartValueHighlight, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [chartValueHighlight, reduceMotion]);

  const selectedWeekMonday = useMemo(() => {
    const base = new Date(selectedWeekDate);
    const day = (base.getDay() + 6) % 7;
    const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - day);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }, [selectedWeekDate]);

  // Aggregate stats based on active period, year, month, and week
  const stats: AggregatedStats = useMemo(() => {
    const cached = periodStatsCache;
    if (
      cached &&
      cached.activities === activities &&
      cached.period === period &&
      cached.year === selectedYear &&
      cached.month === selectedMonth &&
      cached.weekDate === selectedWeekMonday.getTime()
    ) {
      return cached.stats;
    }
    return calculatePeriodStats(activities, period, selectedYear, selectedMonth, selectedWeekMonday);
  }, [activities, period, selectedYear, selectedMonth, selectedWeekMonday, periodStatsCache]);

  useEffect(() => {
    if (chartMorph) return;

    const activeKeys = new Set<string>();
    stats.chartData.forEach((bar, index) => {
      const animationKey = String(index);
      const ratio = stats.chartMax > 0 ? bar.value / stats.chartMax : 0;
      const targetHeight = bar.value > 0 ? Math.max(8, Math.round(ratio * CHART_BAR_MAX_HEIGHT)) : 4;
      activeKeys.add(animationKey);
      let height = barHeightAnims.current.get(animationKey);
      if (!height) {
        height = new Animated.Value(hasRenderedChart.current ? 4 : targetHeight);
        barHeightAnims.current.set(animationKey, height);
      }

      height.stopAnimation();
      if (reduceMotion || !hasRenderedChart.current) {
        height.setValue(targetHeight);
      } else {
        Animated.timing(height, {
          toValue: targetHeight,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      }
    });

    barHeightAnims.current.forEach((height, key) => {
      if (!activeKeys.has(key)) {
        height.stopAnimation();
        barHeightAnims.current.delete(key);
      }
    });
    hasRenderedChart.current = true;
    setBarHeightValues(Object.fromEntries(barHeightAnims.current));
  }, [stats.chartData, stats.chartMax, reduceMotion, chartMorph]);

  useEffect(() => {
    if (reduceMotion) {
      distributionAnim.setValue(1);
      return;
    }

    distributionAnim.setValue(0);
    Animated.timing(distributionAnim, {
      toValue: 1,
      duration: 420,
      useNativeDriver: false,
    }).start();
  }, [distributionAnim, reduceMotion, stats.runCount, stats.walkCount]);

  const weekCompletion = useMemo(() => {
    const weeklyStats = calculatePeriodStats(activities, 'week', selectedYear, selectedMonth, selectedWeekMonday);
    return {
      workouts: weeklyStats.totalWorkouts,
      distanceKm: weeklyStats.totalDistanceKm,
    };
  }, [activities, selectedYear, selectedMonth, selectedWeekMonday]);

  // Available years from recorded activities
  const availableYears = useMemo(() => {
    return getAvailableYears(activities);
  }, [activities]);

  // Stats for the selected calendar year (Summary List Card)
  const yearStats = useMemo(() => {
    return calculateYearStats(activities, selectedYear);
  }, [activities, selectedYear]);

  // Active selected chart point (or current/latest active point by default)
  const activePoint: ChartBarPoint | null = useMemo(() => {
    if (!stats.chartData.length) return null;
    if (selectedPointKey) {
      const found = stats.chartData.find((p) => p.key === selectedPointKey);
      if (found) return found;
    }
    const current = stats.chartData.find((p) => p.isCurrent && p.value > 0);
    if (current) return current;
    const lastActive = [...stats.chartData].reverse().find((p) => p.value > 0);
    return lastActive || stats.chartData[0];
  }, [stats.chartData, selectedPointKey]);
  const hasAnimatedBarValues = Object.keys(barHeightValues).length > 0;

  // Dynamic distance and label for the hero card (bold KM updates dynamically on selection)
  const displayedDistance = useMemo(() => {
    if (selectedPointKey && activePoint) {
      return activePoint.value.toFixed(1);
    }
    return stats.totalDistanceKm.toFixed(1);
  }, [selectedPointKey, activePoint, stats.totalDistanceKm]);

  const displayedLabel = useMemo(() => {
    if (selectedPointKey && activePoint) {
      return (activePoint.fullLabel || activePoint.label).toUpperCase();
    }
    return period === 'week'
      ? 'DISTANCE THIS WEEK'
      : period === 'month'
      ? 'DISTANCE THIS MONTH'
      : period === 'year'
      ? 'DISTANCE THIS YEAR'
      : 'TOTAL DISTANCE';
  }, [selectedPointKey, activePoint, period]);

  // Dynamic Overview Metrics reflecting active selection or current period
  const activeMetrics = useMemo(() => {
    if (selectedPointKey && activePoint) {
      const pointActs = activities.filter((a) => {
        if (period === 'week' && activePoint.targetDate) {
          return a.date.toDateString() === activePoint.targetDate.toDateString();
        }
        if (period === 'month' && activePoint.targetDate) {
          const d = a.date.getDate();
          const startDay = activePoint.targetDate.getDate();
          return (
            a.date.getFullYear() === selectedYear &&
            a.date.getMonth() === selectedMonth &&
            d >= startDay &&
            d <= startDay + 6
          );
        }
        if (period === 'year' && activePoint.monthIndex !== undefined) {
          return (
            a.date.getFullYear() === selectedYear &&
            a.date.getMonth() === activePoint.monthIndex
          );
        }
        return false;
      });

      const runs = pointActs.filter((a) => a.activityType === 'RUN').length;
      return {
        title: `Overview Metrics (${activePoint.label})`,
        runs: runs > 0 ? runs : activePoint.workoutCount,
        distanceKm: activePoint.value,
        calories: pointActs.reduce((acc, a) => acc + a.calories, 0),
        avgPaceSeconds: activePoint.paceSecondsPerKm,
        totalDurationSeconds: activePoint.durationSeconds,
        totalWorkouts: activePoint.workoutCount,
      };
    }

    const periodLabel =
      period === 'week'
        ? 'Selected Week'
        : period === 'month'
        ? `${getMonthName(selectedMonth, false)} ${selectedYear}`
        : period === 'year'
        ? `${selectedYear}`
        : 'All Time';

    return {
      title: `Overview Metrics (${periodLabel})`,
      runs: stats.runCount > 0 ? stats.runCount : stats.totalWorkouts,
      distanceKm: stats.totalDistanceKm,
      calories: stats.totalCalories,
      avgPaceSeconds: stats.averagePaceSeconds,
      totalDurationSeconds: stats.totalDurationSeconds,
      totalWorkouts: stats.totalWorkouts,
    };
  }, [selectedPointKey, activePoint, activities, period, selectedYear, selectedMonth, stats]);

  // Sub-Navigation actions with smooth fading transitions
  const navigatePrevWeek = () => {
    triggerTransition(() => {
      setSelectedWeekDate((prev) => {
        const next = new Date(prev);
        next.setDate(next.getDate() - 7);
        setSelectedYear(next.getFullYear());
        setSelectedMonth(next.getMonth());
        return next;
      });
      setSelectedPointKey(null);
    });
  };

  const navigateNextWeek = () => {
    triggerTransition(() => {
      setSelectedWeekDate((prev) => {
        const next = new Date(prev);
        next.setDate(next.getDate() + 7);
        setSelectedYear(next.getFullYear());
        setSelectedMonth(next.getMonth());
        return next;
      });
      setSelectedPointKey(null);
    });
  };

  const jumpToCurrentWeek = () => {
    triggerTransition(() => {
      const today = new Date();
      setSelectedWeekDate(today);
      setSelectedYear(today.getFullYear());
      setSelectedMonth(today.getMonth());
      setSelectedPointKey(null);
    });
  };

  const navigatePrevMonth = () => {
    triggerTransition(() => {
      if (selectedMonth === 0) {
        setSelectedMonth(11);
        setSelectedYear((y) => y - 1);
      } else {
        setSelectedMonth((m) => m - 1);
      }
      setSelectedPointKey(null);
    });
  };

  const navigateNextMonth = () => {
    triggerTransition(() => {
      if (selectedMonth === 11) {
        setSelectedMonth(0);
        setSelectedYear((y) => y + 1);
      } else {
        setSelectedMonth((m) => m + 1);
      }
      setSelectedPointKey(null);
    });
  };

  const jumpToCurrentMonth = () => {
    triggerTransition(() => {
      const today = new Date();
      setSelectedMonth(today.getMonth());
      setSelectedYear(today.getFullYear());
      setSelectedPointKey(null);
    });
  };

  const navigatePrevYear = () => {
    triggerTransition(() => {
      setSelectedYear((y) => y - 1);
      setSelectedPointKey(null);
    });
  };

  const navigateNextYear = () => {
    triggerTransition(() => {
      setSelectedYear((y) => y + 1);
      setSelectedPointKey(null);
    });
  };

  const jumpToCurrentYear = () => {
    triggerTransition(() => {
      setSelectedYear(new Date().getFullYear());
      setSelectedPointKey(null);
    });
  };

  // Bidirectional drill-down / drill-up handlers
  const drillDownToMonth = (monthIdx: number) => {
    triggerTransition(() => {
      setSelectedMonth(monthIdx);
      setPeriod('month');
      setSelectedPointKey(null);
    });
  };

  const drillDownToWeek = (targetDate: Date) => {
    triggerTransition(() => {
      setSelectedWeekDate(new Date(targetDate));
      setSelectedMonth(targetDate.getMonth());
      setSelectedYear(targetDate.getFullYear());
      setPeriod('week');
      setSelectedPointKey(null);
    });
  };

  const drillUpToMonth = () => {
    triggerTransition(() => {
      setPeriod('month');
      setSelectedPointKey(null);
    });
  };

  const drillUpToYear = () => {
    triggerTransition(() => {
      setPeriod('year');
      setSelectedPointKey(null);
    });
  };

  const handleBarPress = (pointKey: string) => {
    setSelectedPointKey((prev) => (prev === pointKey ? null : pointKey));
  };

  const periodLabels: { id: PeriodFilter; label: string }[] = [
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'year', label: 'Year' },
    { id: 'all', label: 'All Time' },
  ];
  const handlePeriodChange = (nextPeriod: PeriodFilter) => {
    if (nextPeriod === period) return;

    const nextPeriodIndex = periodLabels.findIndex((tab) => tab.id === nextPeriod);
    const periodSlotWidth = periodTabsWidth / periodLabels.length;
    periodIndicatorPosition.stopAnimation();
    if (reduceMotion) {
      periodIndicatorPosition.setValue(nextPeriodIndex * periodSlotWidth);
    } else {
      Animated.timing(periodIndicatorPosition, {
        toValue: nextPeriodIndex * periodSlotWidth,
        duration: 135,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }

    cancelAnimation(chartMorphProgress);
    if (!reduceMotion && chartWidth > 0 && stats.chartData.length > 0) {
      const nextStats = calculatePeriodStats(
        activities,
        nextPeriod,
        selectedYear,
        selectedMonth,
        selectedWeekMonday
      );
      setPeriodStatsCache({
        activities,
        period: nextPeriod,
        year: selectedYear,
        month: selectedMonth,
        weekDate: selectedWeekMonday.getTime(),
        stats: nextStats,
      });
      setChartMorph({
        sourceData: stats.chartData,
        targetData: nextStats.chartData,
        sourceMax: stats.chartMax,
        targetMax: nextStats.chartMax,
        sourcePeriod: period,
        targetPeriod: nextPeriod,
      });
      chartMorphFinalValues.current = Object.fromEntries(
        nextStats.chartData.map((bar, index) => [
          String(index),
          bar.value > 0
            ? Math.max(8, Math.round((bar.value / nextStats.chartMax) * CHART_BAR_MAX_HEIGHT))
            : 4,
        ])
      );
      chartMorphProgress.value = 0;
      setPeriod(nextPeriod);
      setSelectedPointKey(null);

      chartMorphProgress.value = withTiming(1, {
        duration: 300,
        easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
      }, (finished) => {
        if (finished) scheduleOnRN(finishChartMorph);
      });
      return;
    }

    setChartMorph(null);
    triggerTransition(() => {
      setPeriod(nextPeriod);
      setSelectedPointKey(null);
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? '#0A0A0C' : '#F8FAFC'} />

      {/* Screen Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Statistics</Text>
          <Text style={styles.headerSubtitle}>
            {isDark
              ? stats.totalWorkouts > 0
                ? `${stats.totalWorkouts} activities recorded`
                : 'Track your running performance'
              : 'Track your running'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={onRefresh}
          disabled={loading || refreshing}
          accessibilityLabel="Refresh Statistics"
        >
          {loading || refreshing ? (
            <ActivityIndicator size="small" color="#30D158" />
          ) : (
            <Feather name="rotate-cw" size={18} color="#8E8E93" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#30D158"
            colors={['#30D158']}
          />
        }
      >
        {/* 1. Year Selector Pill */}
        <TouchableOpacity
          style={styles.yearPill}
          onPress={() => setShowYearModal(true)}
          activeOpacity={0.8}
          accessibilityLabel={`Select Year, currently ${selectedYear}`}
        >
          <Text style={styles.yearPillLabel}>Year</Text>
          <View style={styles.yearPillValueRow}>
            <Text style={styles.yearPillValue}>{selectedYear}</Text>
            <Feather name="chevron-down" size={16} color="#8E8E93" style={{ marginLeft: 6 }} />
          </View>
        </TouchableOpacity>

        {/* 2. Benchmark Workouts Card */}
        <TouchableOpacity
          style={styles.benchmarkCard}
          onPress={() => setShowBenchmarkModal(true)}
          activeOpacity={0.8}
          accessibilityLabel="Benchmark workouts"
        >
          <View style={styles.benchmarkLeft}>
            <View style={styles.benchmarkIconWrapper}>
              <BenchmarkBadgeIcon size={24} color="#30D158" />
            </View>
            <View style={styles.benchmarkTextCol}>
              <Text style={styles.benchmarkTitle}>Benchmark workouts</Text>
              <Text style={styles.benchmarkSubtitle}>{totalBenchmarksCount} saved</Text>
            </View>
          </View>
          <Feather name="chevron-right" size={20} color="#8E8E93" />
        </TouchableOpacity>



        {/* Section Header: Trends & Detailed Visualizations */}
        <MotionEntrance delay={70}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Performance Trends & Charts</Text>
          </View>
        </MotionEntrance>

        {/* Period Selector Tabs */}
        <MotionEntrance delay={115}>
        <View
          style={styles.periodTabsContainer}
          onLayout={(event) => {
            const width = Math.max(0, event.nativeEvent.layout.width - 8);
            setPeriodTabsWidth((previous) => previous === width ? previous : width);
            if (periodTabsWidth === 0) {
              const selectedIndex = periodLabels.findIndex((tab) => tab.id === period);
              periodIndicatorPosition.setValue(selectedIndex * (width / periodLabels.length));
            }
          }}
        >
          {periodTabsWidth > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.periodTabIndicator,
                {
                  width: periodTabsWidth / periodLabels.length,
                  transform: [{ translateX: periodIndicatorPosition }],
                },
              ]}
            />
          )}
          {periodLabels.map((tab) => {
            const active = period === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={styles.periodTab}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => handlePeriodChange(tab.id)}
                activeOpacity={0.8}
              >
                <Text style={[styles.periodTabText, active && styles.periodTabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        </MotionEntrance>

        {/* Sub-Navigation Bar for Week / Month / Year navigation & drill up */}


        {/* Hero interactive distance and chart card; data changes in place. */}
        <MotionEntrance delay={160}>
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.heroLabel}>{displayedLabel}</Text>
              <View style={styles.heroValueRow}>
                <Animated.Text style={[styles.heroValue, { opacity: chartValueHighlight }]}>
                  {displayedDistance}
                </Animated.Text>
                <Text style={styles.heroUnit}>km</Text>
              </View>
              {selectedPointKey && (
                <TouchableOpacity
                  style={styles.clearSelectionBtn}
                  onPress={() => setSelectedPointKey(null)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.clearSelectionText}>✕ Reset to total</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Streak & Consistency Badge */}
            <View style={styles.streakBadge}>
              <Feather name="zap" size={14} color="#30D158" />
              <Text style={styles.streakText}>
                {stats.streakDays > 0 ? `${stats.streakDays} Day Streak` : `${stats.activeDaysCount} Days Active`}
              </Text>
            </View>
          </View>

          {/* Point Tooltip */}
          {activePoint && activePoint.value > 0 ? (
            <View style={styles.tooltipBox}>
              <View style={styles.tooltipLeft}>
                <Text style={styles.tooltipTitle}>{activePoint.fullLabel}</Text>
                <Text style={styles.tooltipSub}>
                  {activePoint.workoutCount} {activePoint.workoutCount === 1 ? 'activity' : 'activities'}
                </Text>
              </View>
              <View style={styles.tooltipRight}>
                <Text style={styles.tooltipValue}>{activePoint.value.toFixed(2)} km</Text>
                <Text style={styles.tooltipPace}>
                  {formatPaceMinutes(activePoint.paceSecondsPerKm)}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.tooltipBoxPlaceholder}>
              <Text style={styles.tooltipHint}>
                {stats.totalDistanceKm > 0
                  ? 'Tap any bar below to view details'
                  : 'No activities recorded in this period'}
              </Text>
            </View>
          )}


          {/* Interactive Native Bar Chart with Fluid Upward Fill */}
          <View style={styles.chartArea}>
            <View
              style={styles.barsRow}
              onLayout={(event) => {
                const width = event.nativeEvent.layout.width;
                setChartWidth((previous) => previous === width ? previous : width);
              }}
            >
              {chartMorph && chartWidth > 0 ? (
                (() => {
                  const sourceCount = chartMorph.sourceData.length;
                  const targetCount = chartMorph.targetData.length;
                  const sourceSlotWidth = chartWidth / Math.max(sourceCount, 1);
                  const targetSlotWidth = chartWidth / Math.max(targetCount, 1);
                  const barWidthForSlot = (slotWidth: number) => Math.min(24, slotWidth * 0.55);
                  const sourcePositions = chartMorph.sourceData.map((bar, index) => {
                    const sourceCenter = sourceSlotWidth * (index + 0.5);
                    const targetIndex = findMorphTargetIndex(
                      chartMorph.sourcePeriod,
                      bar,
                      chartMorph.targetPeriod,
                      chartMorph.targetData
                    );

                    return {
                      bar,
                      index,
                      sourceCenter,
                      targetIndex,
                      targetCenter: targetIndex >= 0
                        ? targetSlotWidth * (targetIndex + 0.5)
                        : sourceCenter,
                    };
                  });

                  const targetMorphs = chartMorph.targetData.map((bar, index) => {
                    const donors = sourcePositions.filter((source) => source.targetIndex === index);
                    const contribution = donors.reduce((sum, source) => sum + source.bar.value, 0);
                    const sourceCenter = donors.length > 0
                      ? donors.reduce((sum, source) => sum + source.sourceCenter, 0) / donors.length
                      : targetSlotWidth * (index + 0.5);
                    const initialHeight = chartMorph.sourceMax > 0 && contribution > 0
                      ? Math.max(8, (contribution / chartMorph.sourceMax) * CHART_BAR_MAX_HEIGHT)
                      : 4;
                    const finalHeight = chartMorph.targetMax > 0 && bar.value > 0
                      ? Math.max(8, (bar.value / chartMorph.targetMax) * CHART_BAR_MAX_HEIGHT)
                      : 4;

                    return {
                      bar,
                      index,
                      sourceCenter,
                      targetCenter: targetSlotWidth * (index + 0.5),
                      initialHeight,
                      finalHeight,
                      initialWidth: donors.length > 0
                        ? Math.min(barWidthForSlot(targetSlotWidth), Math.max(8, donors.length * 4))
                        : 4,
                    };
                  });
                  const trackColor = isDark ? '#1E1E22' : '#D9DADD';

                  return (
                    <View style={styles.chartMorphCanvas} pointerEvents="none">
                      {sourcePositions.map(({ bar, index, sourceCenter }) => {
                        const trackWidth = barWidthForSlot(sourceSlotWidth);
                        return (
                          <MorphTrack
                            key={`source-track-${bar.key}-${index}`}
                            styles={styles}
                            progress={chartMorphProgress}
                            left={sourceCenter - trackWidth / 2}
                            width={trackWidth}
                            color={trackColor}
                            opacity={[1, 0]}
                          />
                        );
                      })}
                      {chartMorph.targetData.map((bar, index) => {
                        const center = targetSlotWidth * (index + 0.5);
                        const trackWidth = barWidthForSlot(targetSlotWidth);
                        return (
                          <MorphTrack
                            key={`target-track-${bar.key}`}
                            styles={styles}
                            progress={chartMorphProgress}
                            left={center - trackWidth / 2}
                            width={trackWidth}
                            color={trackColor}
                            opacity={[0, 1]}
                          />
                        );
                      })}
                      {sourcePositions.map(({ bar, index, sourceCenter, targetCenter }) => {
                        const sourceHeight = chartMorph.sourceMax > 0 && bar.value > 0
                          ? Math.max(8, (bar.value / chartMorph.sourceMax) * CHART_BAR_MAX_HEIGHT)
                          : 4;
                        const sourceWidth = barWidthForSlot(sourceSlotWidth);
                        return (
                          <View key={`source-${bar.key}-${index}`} style={styles.chartMorphItem}>
                            <MorphBar
                              styles={styles}
                              progress={chartMorphProgress}
                              left={sourceCenter - sourceWidth / 2}
                              width={sourceWidth}
                              height={sourceHeight}
                              translateX={[0, targetCenter - sourceCenter]}
                              scaleX={[1, 0.15]}
                              scaleY={[1, 0.15]}
                              opacity={[1, 0]}
                              color={bar.value > 0 ? '#0A84FF' : '#2A2A2E'}
                            />
                            <MorphLabel
                              styles={styles}
                              progress={chartMorphProgress}
                              left={sourceSlotWidth * index}
                              width={sourceSlotWidth}
                              label={bar.label}
                              opacity={[1, 0]}
                            />
                          </View>
                        );
                      })}

                      {targetMorphs.map((target) => {
                        const finalWidth = barWidthForSlot(targetSlotWidth);
                        return (
                          <View key={`target-${target.bar.key}`} style={styles.chartMorphItem}>
                            <MorphBar
                              styles={styles}
                              progress={chartMorphProgress}
                              left={target.targetCenter - finalWidth / 2}
                              width={finalWidth}
                              height={target.finalHeight}
                              translateX={[target.sourceCenter - target.targetCenter, 0]}
                              translateY={[(target.finalHeight - target.initialHeight) / 2, 0]}
                              scaleX={[target.initialWidth / finalWidth, 1]}
                              scaleY={[target.initialHeight / target.finalHeight, 1]}
                              opacity={[0, 1]}
                              color={target.bar.value > 0 ? '#0A84FF' : '#2A2A2E'}
                            />
                            <MorphLabel
                              styles={styles}
                              progress={chartMorphProgress}
                              left={targetSlotWidth * target.index}
                              width={targetSlotWidth}
                              label={target.bar.label}
                              opacity={[0, 1]}
                            />
                          </View>
                        );
                      })}
                    </View>
                  );
                })()
              ) : (
                stats.chartData.map((bar, index) => {
                  const isSelected = activePoint?.key === bar.key;
                  const ratio = stats.chartMax > 0 ? bar.value / stats.chartMax : 0;
                  const barHeight = bar.value > 0 ? Math.max(8, Math.round(ratio * CHART_BAR_MAX_HEIGHT)) : 4;
                  const animatedBarHeight = barHeightValues[String(index)];

                  return (
                    <TouchableOpacity
                      key={bar.key}
                      style={styles.barColumn}
                      onPress={() => handleBarPress(bar.key)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.barTrack}>
                        <Animated.View
                          style={[
                            styles.barFill,
                            {
                              height: animatedBarHeight || (hasAnimatedBarValues ? 4 : barHeight),
                              backgroundColor: isSelected
                                ? '#30D158'
                                : bar.value > 0
                                ? '#0A84FF'
                                : '#2A2A2E',
                              opacity: bar.value === 0 ? 0.35 : 1,
                            },
                          ]}
                        >
                          {bar.value > 0 && (
                            <LinearGradient
                              colors={
                                isSelected
                                  ? ['#30D158', '#28CD41']
                                  : ['#388BFF', '#0A84FF']
                              }
                              style={StyleSheet.absoluteFill}
                            />
                          )}
                        </Animated.View>
                      </View>
                      <Text
                        style={[
                          styles.barLabel,
                          bar.isCurrent && styles.barLabelCurrent,
                          isSelected && styles.barLabelSelected,
                        ]}
                      >
                        {bar.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </View>
        </View>
        </MotionEntrance>

        {/* Dynamic Key Running Metrics Grid (2 x 3) */}
        <MotionEntrance delay={210}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{activeMetrics.title}</Text>
            <Text style={styles.sectionSubBadge}>
              {activeMetrics.totalWorkouts > 0 ? `${activeMetrics.totalWorkouts} activities` : '0 activities'}
            </Text>
          </View>
        </MotionEntrance>

        <MotionEntrance delay={250}>
        <View style={styles.metricsGrid}>
          {/* 1. Runs */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconCircle, { backgroundColor: 'rgba(48, 209, 88, 0.15)' }]}>
              <Feather name="activity" size={20} color="#30D158" />
            </View>
            <Text style={styles.metricCardValue}>{activeMetrics.runs}</Text>
            <Text style={styles.metricCardLabel}>Runs</Text>
          </View>

          {/* 2. Distance */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconCircle, { backgroundColor: 'rgba(48, 209, 88, 0.15)' }]}>
              <Feather name="navigation" size={18} color="#30D158" />
            </View>
            <Text style={styles.metricCardValue}>{activeMetrics.distanceKm.toFixed(1)} km</Text>
            <Text style={styles.metricCardLabel}>Distance</Text>
          </View>

          {/* 3. Calories */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconCircle, { backgroundColor: 'rgba(255, 159, 10, 0.15)' }]}>
              <Ionicons name="flame" size={20} color="#FF9F0A" />
            </View>
            <Text style={styles.metricCardValue}>
              {activeMetrics.calories > 0 ? `${activeMetrics.calories.toLocaleString()} kcal` : '0 kcal'}
            </Text>
            <Text style={styles.metricCardLabel}>Calories</Text>
          </View>

          {/* 4. Average Pace */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconCircle, { backgroundColor: 'rgba(48, 209, 88, 0.15)' }]}>
              <Ionicons name="speedometer-outline" size={19} color="#30D158" />
            </View>
            <Text style={styles.metricCardValue}>
              {formatPaceMinutes(activeMetrics.avgPaceSeconds)}
            </Text>
            <Text style={styles.metricCardLabel}>Avg Pace</Text>
          </View>

          {/* 5. Active Time */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconCircle, { backgroundColor: 'rgba(10, 132, 255, 0.15)' }]}>
              <Feather name="clock" size={18} color="#0A84FF" />
            </View>
            <Text style={styles.metricCardValue}>
              {formatTimeHoursMins(activeMetrics.totalDurationSeconds)}
            </Text>
            <Text style={styles.metricCardLabel}>Active Time</Text>
          </View>

          {/* 6. Total Workouts */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconCircle, { backgroundColor: 'rgba(191, 90, 242, 0.15)' }]}>
              <Feather name="award" size={18} color="#BF5AF2" />
            </View>
            <Text style={styles.metricCardValue}>
              {activeMetrics.totalWorkouts}
            </Text>
            <Text style={styles.metricCardLabel}>Workouts</Text>
          </View>
        </View>
        </MotionEntrance>

        {/* Activity Distribution: Runs vs Walks */}
        {stats.totalWorkouts > 0 && (
          <MotionEntrance delay={300}>
          <View style={styles.cardContainer}>
            <View style={styles.splitHeader}>
              <Text style={styles.cardTitle}>Activity Breakdown</Text>
              <Text style={styles.splitSubtext}>
                {stats.runCount} Runs · {stats.walkCount} Walks
              </Text>
            </View>

            <View style={styles.splitBarTrack}>
              <Animated.View
                style={[
                  styles.splitBarFill,
                  {
                    flex: distributionAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, Math.max(stats.runCount, 0.05)],
                    }),
                    backgroundColor: '#0A84FF',
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.splitBarFill,
                  {
                    flex: distributionAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, Math.max(stats.walkCount, 0.05)],
                    }),
                    backgroundColor: '#30D158',
                  },
                ]}
              />
            </View>

            <View style={styles.splitLegendRow}>
              <View style={styles.splitLegendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#0A84FF' }]} />
                <Text style={styles.legendText}>
                  Runs ({stats.totalWorkouts > 0 ? Math.round((stats.runCount / stats.totalWorkouts) * 100) : 0}%)
                </Text>
              </View>

              <View style={styles.splitLegendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#30D158' }]} />
                <Text style={styles.legendText}>
                  Walks ({stats.totalWorkouts > 0 ? Math.round((stats.walkCount / stats.totalWorkouts) * 100) : 0}%)
                </Text>
              </View>
            </View>
          </View>
          </MotionEntrance>
        )}

        {/* Personal Bests & Milestones */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>All-Time Personal Records</Text>
        </View>

        <View style={styles.bestsGrid}>
          {/* Longest Distance */}
          <View style={styles.bestItemCard}>
            <View style={styles.bestIconBadge}>
              <Text style={{ fontSize: 16 }}>🥇</Text>
            </View>
            <View style={styles.bestContent}>
              <Text style={styles.bestTitle}>Longest Run</Text>
              <Text style={styles.bestValue}>
                {stats.personalBests.longestDistanceKm > 0
                  ? formatKm(stats.personalBests.longestDistanceKm)
                  : '--'}
              </Text>
            </View>
          </View>

          {/* Fastest Pace */}
          <View style={styles.bestItemCard}>
            <View style={styles.bestIconBadge}>
              <Text style={{ fontSize: 16 }}>⚡</Text>
            </View>
            <View style={styles.bestContent}>
              <Text style={styles.bestTitle}>Fastest Pace</Text>
              <Text style={styles.bestValue}>
                {stats.personalBests.fastestPaceSeconds > 0
                  ? formatPaceMinutes(stats.personalBests.fastestPaceSeconds)
                  : '--'}
              </Text>
            </View>
          </View>

          {/* Longest Duration */}
          <View style={styles.bestItemCard}>
            <View style={styles.bestIconBadge}>
              <Text style={{ fontSize: 16 }}>⏳</Text>
            </View>
            <View style={styles.bestContent}>
              <Text style={styles.bestTitle}>Longest Time</Text>
              <Text style={styles.bestValue}>
                {stats.personalBests.longestDurationSeconds > 0
                  ? formatTimeHoursMins(stats.personalBests.longestDurationSeconds)
                  : '--'}
              </Text>
            </View>
          </View>

          {/* Max Calories */}
          <View style={styles.bestItemCard}>
            <View style={styles.bestIconBadge}>
              <Text style={{ fontSize: 16 }}>🔥</Text>
            </View>
            <View style={styles.bestContent}>
              <Text style={styles.bestTitle}>Max Burn</Text>
              <Text style={styles.bestValue}>
                {stats.personalBests.maxCalories > 0
                  ? `${stats.personalBests.maxCalories} kcal`
                  : '--'}
              </Text>
            </View>
          </View>
        </View>

        {/* Recent Workouts Shortcut */}
        {activities.length > 0 && (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent Activities</Text>
              <TouchableOpacity onPress={() => router.push('/(app)/activity')}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>

            {activities.slice(0, 3).map((act) => (
              <TouchableOpacity
                key={act.id}
                style={styles.recentCard}
                onPress={() => router.push(`/(app)/activity/${act.id}`)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.recentBar,
                    { backgroundColor: act.activityType === 'RUN' ? '#0A84FF' : '#30D158' },
                  ]}
                />
                <View style={styles.recentContent}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recentTitle}>
                      {act.activityType === 'RUN' ? 'Run' : 'Walk'}
                    </Text>
                    <Text style={styles.recentDate}>
                      {act.date.toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>

                  <View style={styles.recentMetrics}>
                    <Text style={styles.recentDist}>{formatKm(act.distanceKm)}</Text>
                    <Text style={styles.recentMeta}>
                      {formatTimeHoursMins(act.durationSeconds)} · {formatPaceMinutes(act.paceSecondsPerKm)}
                    </Text>
                  </View>

                  <Feather name="chevron-right" size={16} color="#8E8E93" style={{ marginLeft: 8 }} />
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Empty State */}
        {activities.length === 0 && !loading && (
          <View style={styles.emptyStateCard}>
            <View style={styles.emptyIconCircle}>
              <Feather name="bar-chart-2" size={32} color="#30D158" />
            </View>
            <Text style={styles.emptyStateTitle}>Start Your Running Journey</Text>
            <Text style={styles.emptyStateSubtext}>
              Once you start recording workouts or outdoor runs, detailed pace trends, weekly graphs, and personal bests will automatically appear here.
            </Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
              onPress={() => router.replace('/(app)/dashboard')}
              activeOpacity={0.85}
            >
              <Feather name="play" size={16} color="#000000" />
              <Text style={styles.emptyStateButtonText}>Start a Run</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom padding for floating navigation */}
        <View style={{ height: 110 }} />
      </ScrollView>

      {/* Year Picker Modal */}
      <Modal
        visible={showYearModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowYearModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowYearModal(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Year</Text>
              <TouchableOpacity
                onPress={() => setShowYearModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="x" size={20} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            {availableYears.map((yr) => (
              <TouchableOpacity
                key={yr}
                style={[styles.modalItemRow, selectedYear === yr && styles.modalItemRowActive]}
                onPress={() => {
                  setSelectedYear(yr);
                  setShowYearModal(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalItemText, selectedYear === yr && styles.modalItemTextActive]}>
                  {yr}
                </Text>
                {selectedYear === yr && <Feather name="check" size={18} color="#30D158" />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Benchmark Workouts Modal */}
      <Modal
        visible={showBenchmarkModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBenchmarkModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowBenchmarkModal(false)}>
          <View style={styles.benchmarkSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Benchmark Workouts</Text>
                <Text style={styles.modalSubtitle}>Measure your progress against standardized baselines</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowBenchmarkModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="x" size={20} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            {/* Benchmark items */}
            <ScrollView
              style={styles.benchmarkList}
              contentContainerStyle={{ flexGrow: 1 }}
              showsVerticalScrollIndicator={false}
            >
              {totalBenchmarksCount > 0 ? (
                <>
                  {/* Custom Workouts Benchmarks */}
                  {benchmarkWorkouts.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <View style={styles.benchmarkSectionHeader}>
                        <BenchmarkBadgeIcon size={14} color="#30D158" />
                        <Text style={[styles.benchmarkSectionTitle, { color: '#30D158' }]}>
                          CUSTOM WORKOUT BENCHMARKS ({benchmarkWorkouts.length})
                        </Text>
                      </View>
                      {benchmarkWorkouts.map((workout, idx) => {
                        const isStarting = startingWorkoutId === workout.id;
                        const metaParts = [
                          workout.workout_type,
                          workout.distance ? `${workout.distance} km` : null,
                          workout.duration ? `${workout.duration} min` : null,
                          workout.target_pace ? `@ ${workout.target_pace}` : null,
                        ].filter(Boolean);
                        const isLast = idx === benchmarkWorkouts.length - 1;

                        return (
                          <View
                            key={`custom-${workout.id}`}
                            style={[styles.benchmarkItem, isLast && { borderBottomWidth: 0 }]}
                          >
                            <View
                              style={[
                                styles.benchmarkItemIcon,
                                { backgroundColor: 'rgba(48, 209, 88, 0.15)' },
                              ]}
                            >
                              <BenchmarkBadgeIcon size={20} color="#30D158" />
                            </View>
                            <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={styles.benchmarkItemTitle} numberOfLines={1}>
                                  {workout.title || 'Custom Benchmark'}
                                </Text>
                                <View style={styles.customBadge}>
                                  <Text style={styles.customBadgeText}>CUSTOM</Text>
                                </View>
                              </View>
                              <Text style={styles.benchmarkItemDesc} numberOfLines={1}>
                                {metaParts.length > 0
                                  ? metaParts.join(' · ')
                                  : 'Custom Benchmark Run'}
                              </Text>
                            </View>
                            <TouchableOpacity
                              style={[styles.benchmarkStartBtn, { backgroundColor: '#30D158' }]}
                              onPress={() => handleStartBenchmarkWorkout(workout)}
                              disabled={isStarting}
                              activeOpacity={0.8}
                              accessibilityLabel={`Start ${workout.title}`}
                            >
                              {isStarting ? (
                                <ActivityIndicator size="small" color="#000000" />
                              ) : (
                                <>
                                  <Feather
                                    name="play"
                                    size={13}
                                    color="#000000"
                                    style={{ marginRight: 4 }}
                                  />
                                  <Text style={styles.benchmarkStartBtnText}>START</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Training Plan Benchmarks */}
                  {activePlanBenchmarks.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <View style={styles.benchmarkSectionHeader}>
                        <BenchmarkBadgeIcon size={14} color="#F59E0B" />
                        <Text style={styles.benchmarkSectionTitle}>
                          TRAINING PLAN BENCHMARKS ({activePlanBenchmarks.length})
                        </Text>
                      </View>
                      {activePlanBenchmarks.map((pb, idx) => {
                        const isStarting = startingPlanKey === pb.workoutKey;
                        const metaParts = [
                          pb.planWorkoutDay || pb.planWorkoutDate,
                          pb.planWorkoutDistance,
                          pb.planWorkoutPace ? `@ ${pb.planWorkoutPace}` : null,
                          pb.planWorkoutDuration,
                        ].filter(Boolean);
                        const isLast = idx === activePlanBenchmarks.length - 1;

                        return (
                          <View
                            key={pb.workoutKey}
                            style={[styles.benchmarkItem, isLast && { borderBottomWidth: 0 }]}
                          >
                            <View
                              style={[
                                styles.benchmarkItemIcon,
                                { backgroundColor: 'rgba(245, 158, 11, 0.15)' },
                              ]}
                            >
                              <BenchmarkBadgeIcon size={20} color="#F59E0B" />
                            </View>
                            <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={styles.benchmarkItemTitle} numberOfLines={1}>
                                  {pb.planWorkoutTitle || pb.benchmarkTitle || 'Plan Benchmark'}
                                </Text>
                                <View style={styles.planBadge}>
                                  <Text style={styles.planBadgeText}>PLAN</Text>
                                </View>
                              </View>
                              <Text style={styles.benchmarkItemDesc} numberOfLines={1}>
                                {metaParts.length > 0
                                  ? metaParts.join(' · ')
                                  : 'Scheduled Benchmark Run'}
                              </Text>
                            </View>
                            <TouchableOpacity
                              style={[styles.benchmarkStartBtn, { backgroundColor: '#F59E0B' }]}
                              onPress={() => handleStartPlanBenchmark(pb)}
                              disabled={isStarting}
                              activeOpacity={0.8}
                              accessibilityLabel={`Start ${pb.planWorkoutTitle || pb.benchmarkTitle}`}
                            >
                              {isStarting ? (
                                <ActivityIndicator size="small" color="#000000" />
                              ) : (
                                <>
                                  <Feather
                                    name="play"
                                    size={13}
                                    color="#000000"
                                    style={{ marginRight: 4 }}
                                  />
                                  <Text style={styles.benchmarkStartBtnText}>START</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.benchmarkEmptyState}>
                  <View style={styles.benchmarkEmptyIcon}>
                    <BenchmarkBadgeIcon size={32} color="#8E8E93" />
                  </View>
                  <Text style={styles.benchmarkEmptyTitle}>No Benchmark Workouts Yet</Text>
                  <Text style={styles.benchmarkEmptySubtitle}>
                    {hasActivePlan
                      ? 'Mark a custom workout or a training plan day as a benchmark to measure your progress.'
                      : 'Create a custom workout and tap the benchmark icon to track your baseline performance.'}
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Quick action buttons row */}
            {(hasCustomWorkouts || hasPlanWorkouts) && (
              <View style={styles.benchmarkModalActionsRow}>
                {hasCustomWorkouts && (
                  <TouchableOpacity
                    style={[
                      styles.benchmarkActionBtn,
                      {
                        flex: 1,
                        backgroundColor: '#30D158',
                        marginRight: hasPlanWorkouts ? 10 : 0,
                      },
                    ]}
                    onPress={() => {
                      setShowBenchmarkModal(false);
                      router.push('/(app)/custom-workout/cards');
                    }}
                    activeOpacity={0.85}
                  >
                    <Feather name="list" size={16} color="#000000" style={{ marginRight: 8 }} />
                    <Text style={styles.benchmarkActionBtnText}>Custom Workouts</Text>
                  </TouchableOpacity>
                )}

                {hasPlanWorkouts && (
                  <TouchableOpacity
                    style={[
                      styles.benchmarkActionBtn,
                      {
                        flex: 1,
                        backgroundColor: '#1C1C1E',
                        borderWidth: 1,
                        borderColor: 'rgba(255, 255, 255, 0.15)',
                      },
                    ]}
                    onPress={() => {
                      setShowBenchmarkModal(false);
                      router.push('/(app)/training-plan');
                    }}
                    activeOpacity={0.85}
                  >
                    <Feather name="calendar" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={[styles.benchmarkActionBtnText, { color: '#FFFFFF' }]}>
                      Training Plan
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const baseStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1E',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 2,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  periodTabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#161618',
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'white',
  },
  periodTabIndicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: 9,
    backgroundColor: '#30D158',
  },
  periodTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    zIndex: 1,
  },
  periodTabText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  periodTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  navRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141416',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#242428',
  },
  navArrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E1E22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navRangeCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  navRangeText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  navChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  navTodayChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(48, 209, 88, 0.15)',
  },
  navTodayChipText: {
    color: '#30D158',
    fontSize: 11,
    fontWeight: '700',
  },
  drillNavChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(10, 132, 255, 0.15)',
  },
  drillNavChipText: {
    color: '#0A84FF',
    fontSize: 11,
    fontWeight: '700',
  },
  drillBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(48, 209, 88, 0.25)',
    marginBottom: 12,
  },
  drillBannerText: {
    color: '#30D158',
    fontSize: 12,
    fontWeight: '700',
  },
  clearSelectionBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  clearSelectionText: {
    color: '#8E8E93',
    fontSize: 10,
    fontWeight: '600',
  },
  heroCard: {
    backgroundColor: '#141416',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#26262B',
    marginBottom: 20,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heroLabel: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  heroValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
    gap: 6,
  },
  heroValue: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
  },
  heroUnit: {
    color: '#30D158',
    fontSize: 18,
    fontWeight: '700',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(48, 209, 88, 0.3)',
  },
  streakText: {
    color: '#30D158',
    fontSize: 12,
    fontWeight: '700',
  },
  tooltipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1E22',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2A30',
  },
  tooltipLeft: {
    flex: 1,
  },
  tooltipTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  tooltipSub: {
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 1,
  },
  tooltipRight: {
    alignItems: 'flex-end',
  },
  tooltipValue: {
    color: '#30D158',
    fontSize: 14,
    fontWeight: '700',
  },
  tooltipPace: {
    color: '#8E8E93',
    fontSize: 11,
  },
  tooltipBoxPlaceholder: {
    paddingVertical: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  tooltipHint: {
    color: '#636366',
    fontSize: 12,
    fontStyle: 'italic',
  },
  chartArea: {
    height: 160,
    justifyContent: 'flex-end',
    paddingTop: 8,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 150,
    position: 'relative',
  },
  chartMorphCanvas: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  chartMorphItem: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  chartMorphBar: {
    position: 'absolute',
    bottom: 22,
    borderRadius: 6,
    overflow: 'hidden',
  },
  chartMorphTrack: {
    position: 'absolute',
    bottom: 22,
    height: 125,
    borderRadius: 6,
  },
  chartMorphLabel: {
    position: 'absolute',
    bottom: 0,
    marginTop: 0,
    textAlign: 'center',
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  barTrack: {
    width: '55%',
    maxWidth: 24,
    height: 125,
    backgroundColor: '#1E1E22',
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: 6,
    overflow: 'hidden',
  },
  barLabel: {
    color: '#636366',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 8,
  },
  barLabelCurrent: {
    color: '#8E8E93',
    fontWeight: '700',
  },
  barLabelSelected: {
    color: '#30D158',
    fontWeight: '800',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  seeAllText: {
    color: '#30D158',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionSubBadge: {
    color: '#30D158',
    fontSize: 13,
    fontWeight: '600',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    width: (SCREEN_WIDTH - 36 - 12) / 2,
    backgroundColor: '#141416',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#242428',
  },
  metricIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  metricCardValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  metricCardLabel: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  cardContainer: {
    backgroundColor: '#141416',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#242428',
    marginBottom: 16,
  },
  splitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  splitSubtext: {
    color: '#8E8E93',
    fontSize: 12,
  },
  splitBarTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1E1E22',
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 12,
  },
  splitBarFill: {
    height: '100%',
  },
  splitLegendRow: {
    flexDirection: 'row',
    gap: 20,
  },
  splitLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '500',
  },
  bestsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  bestItemCard: {
    width: (SCREEN_WIDTH - 36 - 10) / 2,
    backgroundColor: '#141416',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#242428',
  },
  bestIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E1E22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bestContent: {
    flex: 1,
  },
  bestTitle: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '600',
  },
  bestValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141416',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#242428',
  },
  recentBar: {
    width: 5,
    height: '100%',
  },
  recentContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  recentTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  recentDate: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  recentMetrics: {
    alignItems: 'flex-end',
  },
  recentDist: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  recentMeta: {
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 2,
  },
  emptyStateCard: {
    backgroundColor: '#141416',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#242428',
    marginTop: 10,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyStateTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    color: '#8E8E93',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#30D158',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyStateButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },

  /* New Mockup Elements Styles */
  yearPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1E24',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#262930',
  },
  yearPillLabel: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  yearPillValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  yearPillValue: {
    fontSize: 16,
    color: '#30D158',
    fontWeight: '700',
  },

  benchmarkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1E24',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#262930',
  },
  benchmarkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  benchmarkIconWrapper: {
    marginRight: 14,
  },
  benchmarkTextCol: {
    flex: 1,
  },
  benchmarkTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  benchmarkSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },

  summaryListCard: {
    backgroundColor: '#1C1E24',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 4,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#262930',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  summaryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryIcon: {
    width: 24,
    textAlign: 'center',
    marginRight: 12,
  },
  summaryLabel: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },

  weekCompletionWrapper: {
    alignItems: 'center',
    marginBottom: 24,
  },
  weekCompletionCard: {
    backgroundColor: '#1C1E24',
    borderRadius: 24,
    paddingHorizontal: 32,
    paddingVertical: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#262930',
    minWidth: 260,
  },
  weekCompletionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  weekCompletionCount: {
    fontSize: 15,
    fontWeight: '500',
    color: '#E5E7EB',
    marginTop: 8,
    textAlign: 'center',
  },
  weekCompletionDistance: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 4,
    textAlign: 'center',
  },

  /* Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalSheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1C1E24',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2D313A',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  modalItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  modalItemRowActive: {
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
  },
  modalItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  modalItemTextActive: {
    color: '#30D158',
    fontWeight: '700',
  },

  benchmarkSheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: '#1C1E24',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#2D313A',
  },
  benchmarkList: {
    marginTop: 6,
    marginBottom: 20,
    maxHeight: 320,
  },
  benchmarkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  benchmarkItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benchmarkItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  benchmarkItemDesc: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
    lineHeight: 16,
  },
  benchmarkStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#30D158',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  benchmarkStartBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 0.5,
  },
  benchmarkEmptyState: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  benchmarkEmptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  benchmarkEmptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  benchmarkEmptySubtitle: {
    color: '#8E8E93',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  benchmarkActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#30D158',
    borderRadius: 16,
    paddingVertical: 14,
  },
  benchmarkActionBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
    marginRight: 8,
  },
  benchmarkSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  benchmarkSectionTitle: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  planBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  planBadgeText: {
    color: '#F59E0B',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  customBadge: {
    backgroundColor: 'rgba(48, 209, 88, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  customBadgeText: {
    color: '#30D158',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  benchmarkModalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
});

const lightStyles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F8FAFC',
  },
  header: {
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    color: '#111111',
  },
  headerSubtitle: {
    color: '#111111',
  },
  refreshBtn: {
    backgroundColor: '#E9EAEC',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  scrollContent: {
    paddingBottom: 112,
  },
  periodTabsContainer: {
    backgroundColor: '#D7D8DA',
    borderColor: '#D7D8DA',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  periodTabText: {
    color: '#55575B',
  },
  periodTabTextActive: {
    color: '#000000',
  },
  navRangeRow: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E3E6',
  },
  navArrowBtn: {
    backgroundColor: '#E9EAEC',
  },
  navRangeText: {
    color: '#111111',
  },
  navTodayChip: {
    backgroundColor: 'rgba(48, 209, 88, 0.14)',
  },
  navTodayChipText: {
    color: '#1F8E3B',
  },
  drillNavChip: {
    backgroundColor: 'rgba(10, 132, 255, 0.14)',
  },
  drillNavChipText: {
    color: '#0066CC',
  },
  drillBanner: {
    backgroundColor: 'rgba(48, 209, 88, 0.10)',
    borderColor: 'rgba(48, 160, 78, 0.25)',
  },
  drillBannerText: {
    color: '#1F8E3B',
  },
  clearSelectionBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  clearSelectionText: {
    color: '#55575B',
  },
  barLabelSelected: {
    color: '#1F8E3B',
  },
  heroCard: {
    backgroundColor: '#F1F2F4',
    borderColor: '#D8DADD',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  heroLabel: {
    color: '#202124',
  },
  heroValue: {
    color: '#050505',
  },
  streakBadge: {
    backgroundColor: 'rgba(48, 209, 88, 0.10)',
    borderColor: 'rgba(48, 160, 78, 0.20)',
  },
  tooltipBox: {
    backgroundColor: '#E8EAED',
    borderColor: '#D8DADD',
  },
  tooltipTitle: {
    color: '#111111',
  },
  tooltipSub: {
    color: '#6B7280',
  },
  tooltipPace: {
    color: '#6B7280',
  },
  tooltipHint: {
    color: '#202124',
  },
  barTrack: {
    backgroundColor: '#D9DADD',
    
  },
  barLabel: {
    color: '#171717',
  },
  barLabelCurrent: {
    color: '#171717',
  },
  sectionTitle: {
    color: '#171717',
  },
  sectionSubBadge: {
    color: '#202124',
  },
  metricCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E3E6',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  metricCardValue: {
    color: '#111111',
  },
  metricCardLabel: {
    color: '#6B7280',
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E3E6',
  },
  cardTitle: {
    color: '#111111',
  },
  splitSubtext: {
    color: '#6B7280',
  },
  splitBarTrack: {
    backgroundColor: '#E5E7EB',
  },
  legendText: {
    color: '#6B7280',
  },
  bestItemCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E3E6',
  },
  bestIconBadge: {
    backgroundColor: '#F1F5F9',
  },
  bestTitle: {
    color: '#6B7280',
  },
  bestValue: {
    color: '#111111',
  },
  recentCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E3E6',
  },
  recentTitle: {
    color: '#111111',
  },
  recentDate: {
    color: '#6B7280',
  },
  recentDist: {
    color: '#111111',
  },
  recentMeta: {
    color: '#6B7280',
  },
  emptyStateCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E3E6',
  },
  emptyStateTitle: {
    color: '#111111',
  },
  emptyStateSubtext: {
    color: '#6B7280',
  },
  yearPill: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E3E6',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  yearPillLabel: {
    color: '#111111',
  },
  yearPillValue: {
    color: '#30D158',
  },
  benchmarkCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E3E6',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  benchmarkTitle: {
    color: '#111111',
  },
  benchmarkSubtitle: {
    color: '#6B7280',
  },
  summaryListCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E3E6',
  },
  summaryLabel: {
    color: '#111111',
  },
  summaryValue: {
    color: '#111111',
  },
  summaryDivider: {
    backgroundColor: '#E5E7EB',
  },
  weekCompletionCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E3E6',
  },
  weekCompletionTitle: {
    color: '#111111',
  },
  weekCompletionCount: {
    color: '#334155',
  },
  weekCompletionDistance: {
    color: '#6B7280',
  },
  modalOverlay: {
    backgroundColor: 'rgba(15, 23, 42, 0.32)',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E3E6',
  },
  benchmarkSheet: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E1E3E6',
  },
  modalHeader: {
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    color: '#111111',
  },
  modalSubtitle: {
    color: '#6B7280',
  },
  modalItemText: {
    color: '#111111',
  },
  benchmarkItem: {
    borderBottomColor: '#E5E7EB',
  },
  benchmarkItemTitle: {
    color: '#111111',
  },
  benchmarkItemDesc: {
    color: '#6B7280',
  },
  benchmarkEmptyIcon: {
    backgroundColor: '#F1F5F9',
  },
  benchmarkEmptyTitle: {
    color: '#111111',
  },
  benchmarkEmptySubtitle: {
    color: '#6B7280',
  },
});

function getThemeStyles(isDark: boolean) {
  if (isDark) return baseStyles;

  const themedStyles = { ...baseStyles } as Record<string, unknown>;
  Object.keys(lightStyles).forEach((key) => {
    themedStyles[key] = [
      baseStyles[key as keyof typeof baseStyles],
      lightStyles[key as keyof typeof lightStyles],
    ];
  });

  return themedStyles as typeof baseStyles;
}
