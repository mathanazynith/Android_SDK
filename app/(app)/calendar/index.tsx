import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuestionnaire } from '../../../contexts/QuestionnaireContext';
import { useAuth } from '../../../service/auth';
import type { CurrentWorkout } from '../../../service/workoutPlan';
import RunningPlanHeader from './components/RunningPlanHeader';
import Timeline from './components/Timeline';
import TrainingCalendarCard from './components/TrainingCalendarCard';
import { RunningPlanData, WorkoutDetail } from './components/types';
import WorkoutModal from './components/WorkoutModal';

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

const toWorkoutDetail = (workout: CurrentWorkout): WorkoutDetail => {
  const isRest = `${workout.workout_type} ${workout.title}`.toLowerCase().includes('rest');
  const date = workout.workout_date ? new Date(`${workout.workout_date}T00:00:00`) : null;
  return {
    id: `${workout.week_number}-${workout.display_order}-${workout.workout_date}`,
    day: workout.weekday ? `${workout.weekday.slice(0, 1)}${workout.weekday.slice(1).toLowerCase()}` : '',
    date: date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '',
    title: workout.title, workoutType: workout.workout_type, iconName: iconForWorkout(workout), accentColor: '#63C72B', isRest,
    description: workout.notes, instructions: '', warmUp: formatDistance(workout.warmup), steps: workout.segments.map(formatSegment).filter(Boolean), coolDown: formatDistance(workout.cooldown),
    estimatedDuration: formatDuration(workout.duration), estimatedCalories: '', targetPace: workout.target_pace ? `${workout.target_pace} ${workout.pace_unit}`.trim() : '', heartRateZone: workout.zone, distance: formatDistance(workout.distance), notes: workout.notes,
  };
};

export default function CalendarScreen() {
  const { user } = useAuth();
  const { workoutPlan, workoutPlanError, isWorkoutPlanLoading, fetchWorkoutPlan } = useQuestionnaire();
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutDetail | null>(null);
  const weekAnimation = useRef(new Animated.Value(1)).current;
  const userName = user?.first_name?.trim() || user?.username?.trim() || 'Runner';
  useEffect(() => { fetchWorkoutPlan(); }, [fetchWorkoutPlan]);
  useEffect(() => {
    if (!workoutPlan) return;
    const today = new Date().toISOString().slice(0, 10);
    const currentWeek = workoutPlan.weeks.findIndex((week) => {
      const dates = week.workouts.map((workout) => workout.workout_date).filter(Boolean).sort();
      return dates.length > 0 && dates[0] <= today && today <= dates[dates.length - 1];
    });
    setSelectedWeekIndex(currentWeek >= 0 ? currentWeek : 0);
  }, [workoutPlan]);
  useEffect(() => { weekAnimation.setValue(0.94); Animated.spring(weekAnimation, { toValue: 1, useNativeDriver: true, damping: 15, stiffness: 190 }).start(); }, [selectedWeekIndex, weekAnimation]);

  const plan = useMemo<RunningPlanData | null>(() => {
    if (!workoutPlan) return null;
    return { name: workoutPlan.training_plan || workoutPlan.template_name, focus: '', totalWeeks: workoutPlan.weeks.length, weeks: workoutPlan.weeks.map((week) => {
      const dates = week.workouts.map((workout) => workout.workout_date).filter(Boolean).sort();
      const range = dates.length ? `${new Date(`${dates[0]}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(`${dates[dates.length - 1]}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : '';
      return { id: String(week.week_number), label: `Week ${week.week_number} of ${workoutPlan.weeks.length}`, dateRange: range, statusText: '', workouts: week.workouts.map(toWorkoutDetail) };
    }) };
  }, [workoutPlan]);
  const selectedWeek = plan?.weeks[selectedWeekIndex];
  const changeWeek = (direction: -1 | 1) => setSelectedWeekIndex((index) => Math.max(0, Math.min((plan?.weeks.length ?? 1) - 1, index + direction)));

  if (isWorkoutPlanLoading && !plan) return <SafeAreaView style={styles.container}><StatusBar barStyle="light-content" /><View style={styles.center}><ActivityIndicator size="large" color="#28a745" /><Text style={styles.message}>Loading your training plan...</Text></View></SafeAreaView>;
  if (!plan) return <SafeAreaView style={styles.container}><StatusBar barStyle="light-content" /><View style={styles.center}><Text style={styles.error}>{workoutPlanError || 'No training plan is available.'}</Text><TouchableOpacity onPress={() => fetchWorkoutPlan(true)} style={styles.retry}><Text style={styles.retryText}>Retry</Text></TouchableOpacity></View></SafeAreaView>;

  return <SafeAreaView style={styles.container}><StatusBar barStyle="light-content" /><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <RunningPlanHeader planName={plan.name} focusLabel={plan.focus} userName={userName} />
    <TrainingCalendarCard weekLabel={selectedWeek?.label ?? ''} rangeLabel={selectedWeek?.dateRange ?? ''} statusText={selectedWeek?.statusText ?? ''} totalWeeks={plan.totalWeeks} currentWeekIndex={selectedWeekIndex + 1} onPrevious={() => changeWeek(-1)} onNext={() => changeWeek(1)} previousDisabled={selectedWeekIndex <= 0} nextDisabled={selectedWeekIndex >= plan.weeks.length - 1} />
    <Animated.View style={[styles.timelineWrapper, { transform: [{ scale: weekAnimation }] }]}><Timeline workouts={selectedWeek?.workouts ?? []} onSelectWorkout={setSelectedWorkout} /></Animated.View>
  </ScrollView><WorkoutModal visible={selectedWorkout !== null} workout={selectedWorkout} onClose={() => setSelectedWorkout(null)} /></SafeAreaView>;
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#06090B' }, content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 34 }, timelineWrapper: { flex: 1 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }, message: { color: '#fff', marginTop: 12 }, error: { color: '#fff', fontSize: 16, marginBottom: 12, textAlign: 'center' }, retry: { backgroundColor: '#28a745', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 }, retryText: { color: '#fff' } });
