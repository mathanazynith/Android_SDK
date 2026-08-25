import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useQuestionnaire } from '../../../contexts/QuestionnaireContext';
import { useAuth } from '../../../service/auth';
import type { CurrentWorkout } from '../../../service/workoutPlan';
import RunningPlanHeader from './components/RunningPlanHeader';
import Timeline from './components/Timeline';
import TrainingCalendarCard from './components/TrainingCalendarCard';
import { RunningPlanData, RunningPlanWeek, WorkoutDetail } from './components/types';
import WorkoutModal from './components/WorkoutModal';
import GlobalBottomNav from '../../../components/navigation/GlobalBottomNav';

const iconForWorkout = (workout: CurrentWorkout): WorkoutDetail['iconName'] => {
  const label = `${workout.workout_type} ${workout.title}`.toLowerCase();
  if (label.includes('rest')) return 'moon-outline';
  if (label.includes('interval')) return 'flash-outline';
  if (label.includes('tempo')) return 'speedometer-outline';
  if (label.includes('recovery')) return 'heart-outline';
  return 'walk-outline';
};
const formatDuration = (seconds: number | null) => seconds == null ? '' : `${Math.round(seconds / 60)} min`;
const formatDistance = (metres: number | null) => metres == null ? '' : `${metres / 1000} km`;
const formatSegment = (segment: CurrentWorkout['segments'][number]) => [
  segment.segment_type,
  segment.repeats > 1 ? `${segment.repeats}×` : '',
  segment.rep_distance != null ? `${segment.rep_distance / 1000} km` : '',
  segment.duration != null ? formatDuration(segment.duration) : '',
  segment.target_pace ? `${segment.target_pace} ${segment.pace_unit}`.trim() : '',
  segment.rest_duration != null ? `rest ${formatDuration(segment.rest_duration)}` : '',
  segment.notes,
].filter(Boolean).join(' · ');

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
  notes: 'Recovery',
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

const toWorkoutDetail = (workout: CurrentWorkout): WorkoutDetail => {
  const isRest = `${workout.workout_type} ${workout.title}`.toLowerCase().includes('rest');
  const date = workout.workout_date ? new Date(`${workout.workout_date}T00:00:00`) : null;
  return {
    id: `${workout.week_number}-${workout.display_order}-${workout.workout_date}`,
    day: workout.weekday ? `${workout.weekday.slice(0, 1)}${workout.weekday.slice(1).toLowerCase()}` : '',
    date: date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '',
    title: workout.title, workoutType: isRest ? 'Recovery' : workout.workout_type, iconName: iconForWorkout(workout), accentColor: isRest ? '#8A8F94' : '#63C72B', isRest,
    description: workout.notes, instructions: '', warmUp: formatDistance(workout.warmup), steps: workout.segments.map(formatSegment).filter(Boolean), coolDown: formatDistance(workout.cooldown),
    estimatedDuration: formatDuration(workout.duration), estimatedCalories: '', targetPace: workout.target_pace ? `${workout.target_pace} ${workout.pace_unit}`.trim() : '', heartRateZone: workout.zone, distance: formatDistance(workout.distance), notes: workout.notes,
  };
};

export default function CalendarScreen() {
  const { user } = useAuth();
  const { workoutPlan, workoutPlanError, isWorkoutPlanLoading, fetchWorkoutPlan } = useQuestionnaire();
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutDetail | null>(null);
  const pagerRef = useRef<FlatList<RunningPlanWeek>>(null);
  const { width: windowWidth } = useWindowDimensions();
  const pageWidth = Math.max(0, windowWidth - 36);
  const userName = user?.first_name?.trim() || user?.username?.trim() || 'Runner';
  useEffect(() => { fetchWorkoutPlan(); }, [fetchWorkoutPlan]);
  useEffect(() => {
    if (!workoutPlan) return;
    const today = new Date().toISOString().slice(0, 10);
    const currentWeek = workoutPlan.weeks.findIndex((week) => {
      const dates = completeWeek(week, workoutPlan.start_date).map((workout) => workout.workout_date);
      return dates[0] <= today && today <= dates[dates.length - 1];
    });
    const nextIndex = currentWeek >= 0 ? currentWeek : 0;
    const updateTimer = setTimeout(() => setSelectedWeekIndex(nextIndex), 0);
    return () => clearTimeout(updateTimer);
  }, [workoutPlan]);

  const plan = useMemo<RunningPlanData | null>(() => {
    if (!workoutPlan) return null;
    return { name: workoutPlan.training_plan || workoutPlan.template_name, focus: '', totalWeeks: workoutPlan.weeks.length, weeks: workoutPlan.weeks.map((week) => {
      const completedWorkouts = completeWeek(week, workoutPlan.start_date);
      const dates = completedWorkouts.map((workout) => workout.workout_date);
      const range = `${new Date(`${dates[0]}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(`${dates[dates.length - 1]}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
      return { id: String(week.week_number), label: `Week ${week.week_number} of ${workoutPlan.weeks.length}`, dateRange: range, statusText: '', workouts: completedWorkouts.map(toWorkoutDetail) };
    }) };
  }, [workoutPlan]);
  const selectedWeek = plan?.weeks[selectedWeekIndex];
  const changeWeek = (direction: -1 | 1) => {
    const nextIndex = Math.max(0, Math.min((plan?.weeks.length ?? 1) - 1, selectedWeekIndex + direction));
    if (nextIndex === selectedWeekIndex) return;
    setSelectedWeekIndex(nextIndex);
    pagerRef.current?.scrollToIndex({ index: nextIndex, animated: true });
  };
  const renderWeekPage = ({ item }: { item: RunningPlanWeek }) => (
    <View style={[styles.weekPage, { width: pageWidth }]}>
      <View style={styles.timelineWrapper}>
        <Timeline workouts={item.workouts} onSelectWorkout={setSelectedWorkout} />
      </View>
    </View>
  );
  const handlePagerSettled = (event: any) => {
    if (!pageWidth || !plan?.weeks.length) return;
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    const boundedIndex = Math.max(0, Math.min(plan.weeks.length - 1, nextIndex));
    if (boundedIndex !== selectedWeekIndex) setSelectedWeekIndex(boundedIndex);
  };

  if (isWorkoutPlanLoading && !plan) return <SafeAreaView style={styles.container}><StatusBar barStyle="light-content" /><View style={styles.center}><ActivityIndicator size="large" color="#28a745" /><Text style={styles.message}>Loading your training plan...</Text></View></SafeAreaView>;
  if (!plan) return <SafeAreaView style={styles.container}><StatusBar barStyle="light-content" /><View style={styles.center}><Text style={styles.error}>{workoutPlanError || 'No training plan is available.'}</Text><TouchableOpacity onPress={() => fetchWorkoutPlan(true)} style={styles.retry}><Text style={styles.retryText}>Retry</Text></TouchableOpacity></View></SafeAreaView>;

  return <SafeAreaView style={styles.container}><StatusBar barStyle="light-content" /><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <RunningPlanHeader planName={plan.name} focusLabel={plan.focus} userName={userName} />
    <TrainingCalendarCard weekLabel={selectedWeek?.label ?? ''} rangeLabel={selectedWeek?.dateRange ?? ''} statusText={selectedWeek?.statusText ?? ''} totalWeeks={plan.totalWeeks} currentWeekIndex={selectedWeekIndex + 1} onPrevious={() => changeWeek(-1)} onNext={() => changeWeek(1)} previousDisabled={selectedWeekIndex <= 0} nextDisabled={selectedWeekIndex >= plan.weeks.length - 1} />
    <FlatList
      ref={pagerRef}
      data={plan.weeks}
      keyExtractor={(week) => week.id}
      renderItem={renderWeekPage}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      initialScrollIndex={selectedWeekIndex}
      onMomentumScrollEnd={handlePagerSettled}
      getItemLayout={(_, index) => ({ length: pageWidth, offset: pageWidth * index, index })}
      onScrollToIndexFailed={({ index }) => setTimeout(() => pagerRef.current?.scrollToIndex({ index, animated: true }), 50)}
      style={styles.pager}
    />
  </ScrollView><WorkoutModal visible={selectedWorkout !== null} workout={selectedWorkout} onClose={() => setSelectedWorkout(null)} /><GlobalBottomNav /></SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06090B' },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 118 },
  pager: { marginHorizontal: -18 },
  weekPage: { paddingHorizontal: 18 },
  timelineWrapper: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  message: { color: '#fff', marginTop: 12 },
  error: { color: '#fff', fontSize: 16, marginBottom: 12, textAlign: 'center' },
  retry: { backgroundColor: '#28a745', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff' },
});
