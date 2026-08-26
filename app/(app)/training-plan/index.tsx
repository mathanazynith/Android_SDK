import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  PanResponder,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../service/auth';
import { useQuestionnaire } from '../../../contexts/QuestionnaireContext';
import type { CurrentWorkout } from '../../../service/workoutPlan';
import RunningPlanHeader from '../calendar/components/RunningPlanHeader';
import Timeline from '../calendar/components/Timeline';
import TrainingCalendarCard from '../calendar/components/TrainingCalendarCard';
import WorkoutModal from '../calendar/components/WorkoutModal';
import type { WorkoutDetail, RunningPlanData } from '../calendar/components/types';
import GlobalBottomNav from '../../../components/navigation/GlobalBottomNav';
import { useTheme } from '../../../contexts/ThemeContext';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const formatDateKey = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (dateKey: string, days: number) => {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateKey(date);
};

const mondayFor = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  return addDays(dateKey, -mondayOffset);
};

const createRestWorkout = (weekNumber: number, displayOrder: number, workoutDate: string): CurrentWorkout => ({
  week_number: weekNumber,
  display_order: displayOrder,
  workout_date: workoutDate,
  weekday: WEEKDAYS[displayOrder - 1],
  workout_type: 'Rest',
  title: 'Rest Day',
  duration: null,
  distance: null,
  target_pace: null,
  pace_unit: '',
  zone: '',
  warmup: null,
  cooldown: null,
  notes: 'Active recovery',
  priority: 0,
  segments: [],
});

const completeWeek = (week: { week_number: number; workouts: CurrentWorkout[] }, planStartDate: string) => {
  const existingDates = week.workouts.map((workout) => workout.workout_date).filter(Boolean).sort();
  const weekStart = existingDates.length ? mondayFor(existingDates[0]) : addDays(mondayFor(planStartDate), (week.week_number - 1) * 7);
  const workoutsByDate = new Map(week.workouts.map((workout) => [workout.workout_date, workout]));

  return Array.from({ length: 7 }, (_, index) => {
    const workoutDate = addDays(weekStart, index);
    return workoutsByDate.get(workoutDate) ?? createRestWorkout(week.week_number, index + 1, workoutDate);
  });
};

const iconForWorkout = (workout: CurrentWorkout): WorkoutDetail['iconName'] => {
  const label = `${workout.workout_type} ${workout.title}`.toLowerCase();
  if (label.includes('rest')) return 'moon-outline';
  if (label.includes('interval')) return 'flash-outline';
  if (label.includes('tempo')) return 'speedometer-outline';
  if (label.includes('recovery')) return 'bicycle-outline';
  if (label.includes('long')) return 'walk-outline';
  return 'walk-outline';
};

const formatDuration = (seconds: number | null) => seconds == null ? '' : `${Math.round(seconds / 60)} min`;
const formatDistance = (metres: number | null) => metres == null ? '' : `${(metres / 1000).toFixed(1)} km`;

const toWorkoutDetail = (workout: CurrentWorkout): WorkoutDetail => {
  const isRest = `${workout.workout_type} ${workout.title}`.toLowerCase().includes('rest');
  const date = workout.workout_date ? new Date(`${workout.workout_date}T00:00:00`) : null;
  const title = workout.title || workout.workout_type || 'Workout';
  const description = workout.notes || (isRest ? 'Active recovery' : 'Easy aerobic run');
  const workoutType = isRest ? 'Recovery' : workout.workout_type;

  return {
    id: `${workout.week_number}-${workout.display_order}-${workout.workout_date}`,
    day: workout.weekday ? workout.weekday.slice(0, 3) : '',
    date: date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '',
    title,
    workoutType,
    iconName: iconForWorkout(workout),
    accentColor: isRest ? '#8A8F94' : '#63C72B',
    isRest,
    description,
    instructions: '',
    warmUp: formatDistance(workout.warmup),
    steps: workout.segments.map((segment: CurrentWorkout['segments'][number]) => [
      segment.segment_type,
      segment.repeats > 1 ? `${segment.repeats}×` : '',
      segment.rep_distance != null ? `${(segment.rep_distance / 1000).toFixed(1)} km` : '',
      segment.duration != null ? formatDuration(segment.duration) : '',
      segment.target_pace ? `${segment.target_pace} ${segment.pace_unit}`.trim() : '',
      segment.rest_duration != null ? `rest ${formatDuration(segment.rest_duration)}` : '',
      segment.notes,
    ].filter(Boolean).join(' · ')).filter(Boolean),
    coolDown: formatDistance(workout.cooldown),
    estimatedDuration: formatDuration(workout.duration),
    estimatedCalories: '',
    targetPace: workout.target_pace ? `${workout.target_pace} ${workout.pace_unit}`.trim() : '',
    heartRateZone: workout.zone,
    distance: formatDistance(workout.distance),
    notes: workout.notes,
  };
};

export default function TrainingPlanScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ selectedWeek?: string }>();
  const { user } = useAuth();
  const { workoutPlan, workoutPlanError, isWorkoutPlanLoading, fetchWorkoutPlan } = useQuestionnaire();
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(() => {
    const requestedWeek = Number.parseInt(String(params.selectedWeek ?? ''), 10);
    return Number.isFinite(requestedWeek) && requestedWeek > 0 ? requestedWeek - 1 : 0;
  });
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutDetail | null>(null);

  useEffect(() => {
    void fetchWorkoutPlan();
  }, [fetchWorkoutPlan]);

  const plan = useMemo<RunningPlanData | null>(() => {
    if (!workoutPlan) return null;

    return {
      name: workoutPlan.training_plan || workoutPlan.template_name || 'Advanced 5K',
      focus: 'Intensity Timeline',
      totalWeeks: workoutPlan.weeks.length,
      weeks: workoutPlan.weeks.map((week: { week_number: number; workouts: CurrentWorkout[] }) => {
        const completedWorkouts = completeWeek(week, workoutPlan.start_date);
        const dateKeys = completedWorkouts.map((workout) => workout.workout_date);
        const range = `${new Date(`${dateKeys[0]}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${new Date(`${dateKeys[dateKeys.length - 1]}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
        const scheduleNote = completedWorkouts.some((workout) => `${workout.title} ${workout.workout_type}`.toLowerCase().includes('tempo'))
          ? 'Tempo Run moved to the current week for a stronger block.'
          : '';

        return {
          id: String(week.week_number),
          label: `Week ${week.week_number} of ${workoutPlan.weeks.length}`,
          dateRange: range,
          statusText: scheduleNote,
          workouts: completedWorkouts.map(toWorkoutDetail),
        };
      }),
    };
  }, [workoutPlan]);

  const safeWeekIndex = plan ? Math.min(selectedWeekIndex, Math.max(0, plan.weeks.length - 1)) : 0;
  const selectedWeek = plan?.weeks[safeWeekIndex] ?? null;
  const userName = user?.first_name?.trim() || user?.username?.trim() || 'Runner';

  const changeWeek = (direction: -1 | 1) => {
    if (!plan) return;
    setSelectedWeekIndex((current) => Math.max(0, Math.min(plan.weeks.length - 1, safeWeekIndex + direction)));
  };

  const weekSwipeResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) => (
      Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2
    ),
    onPanResponderRelease: (_, gestureState) => {
      if (Math.abs(gestureState.dx) < 48) return;
      changeWeek(gestureState.dx < 0 ? 1 : -1);
    },
  });

  if (isWorkoutPlanLoading && !plan) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#63C72B" />
          <Text style={[styles.message, { color: colors.text }]}>Loading your training plan...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!plan) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.center}>
          <Text style={[styles.error, { color: colors.text }]}>{workoutPlanError || 'No training plan is available.'}</Text>
          <TouchableOpacity onPress={() => void fetchWorkoutPlan(true)} style={[styles.retry, { backgroundColor: '#4ADE80' }]}>
            <Text style={[styles.retryText, { color: colors.background }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <RunningPlanHeader planName={plan.name} focusLabel={plan.focus} userName={userName} />

        <View {...weekSwipeResponder.panHandlers}>
          <TrainingCalendarCard
            weekLabel={selectedWeek?.label ?? `Week ${selectedWeekIndex + 1}`}
            rangeLabel={selectedWeek?.dateRange ?? ''}
            statusText={selectedWeek?.statusText ?? ''}
            totalWeeks={plan.totalWeeks}
            currentWeekIndex={safeWeekIndex + 1}
            onPrevious={() => changeWeek(-1)}
            onNext={() => changeWeek(1)}
            previousDisabled={safeWeekIndex <= 0}
            nextDisabled={safeWeekIndex >= plan.weeks.length - 1}
          />

          <View style={styles.timelineWrapper}>
            <Timeline
              workouts={selectedWeek?.workouts ?? []}
              onSelectWorkout={setSelectedWorkout}
              onSwapWorkout={(workout: WorkoutDetail) => {
                Alert.alert('Swap Session', `Swap ${workout.title} to a different day.`);
              }}
            />
          </View>
        </View>
      </ScrollView>

      <WorkoutModal visible={selectedWorkout !== null} workout={selectedWorkout} onClose={() => setSelectedWorkout(null)} />
      <GlobalBottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06090B' },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 118 },
  timelineWrapper: { marginTop: 8 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  message: { color: '#fff', marginTop: 12 },
  error: { color: '#fff', fontSize: 16, marginBottom: 12, textAlign: 'center' },
  retry: { backgroundColor: '#63C72B', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#091200', fontWeight: '700' },
});