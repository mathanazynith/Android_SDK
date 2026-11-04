import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';
import type { CurrentWorkout, CurrentWorkoutPlan } from '../../service/workoutPlan';
import DashboardText from '../../components/common/DashboardText';

type DashboardActivePlanProps = {
  plan: CurrentWorkoutPlan;
  todayWorkout: CurrentWorkout | null;
  nextWorkout: CurrentWorkout | null;
};

const popularWorkouts = [
  { title: '30 MIN', subtitle: 'Easy Run', icon: 'activity' as const },
  { title: '70 MIN', subtitle: 'Long Run', icon: 'clock' as const },
  { title: '10 x 400m', subtitle: 'Interval Run', icon: 'target' as const },
  { title: '20 MIN', subtitle: 'Tempo Run', icon: 'trending-up' as const },
];

const detailsFor = (workout: CurrentWorkout | null) => {
  if (!workout) return '';
  return [
    workout.distance != null ? `${(workout.distance / 1000).toFixed(1)} km` : '',
    workout.duration != null ? `${Math.round(workout.duration / 60)} min` : '',
    workout.target_pace ? `${workout.target_pace} ${workout.pace_unit}`.trim() : '',
  ].filter(Boolean).join('  ·  ');
};

const formatWorkoutDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
};

const isRestWorkout = (workout: CurrentWorkout | null) =>
  Boolean(workout && `${workout.workout_type} ${workout.title}`.toLowerCase().includes('rest'));

export default function DashboardActivePlan({ plan, todayWorkout, nextWorkout }: DashboardActivePlanProps) {
  const { colors } = useTheme();
  const isRestDay = isRestWorkout(todayWorkout);
  const planName = plan.training_plan || plan.template_name || 'Training Plan';
  const pace = plan.target_pace ? `${plan.target_pace}` : '—';
  const paceUnit = plan.pace_unit || 'min/km';

  const handleStartTodayWorkout = () => {
    if (isRestDay || !todayWorkout) {
      router.push('/(app)/screens/map');
      return;
    }

    router.push({
      pathname: '/(app)/workout-setup',
      params: {
        workoutTitle: todayWorkout.title || "Today's Workout",
        workoutType: todayWorkout.workout_type,
        targetPace: todayWorkout.target_pace || undefined,
        duration: todayWorkout.duration ? String(Math.round(todayWorkout.duration / 60)) : undefined,
        distance: todayWorkout.distance ? String(todayWorkout.distance) : undefined,
        planSegments: todayWorkout.segments?.length ? JSON.stringify(todayWorkout.segments) : undefined,
        workoutDbId: todayWorkout.id ? String(todayWorkout.id) : undefined,
      },
    });
  };

  const openPopularWorkoutSetup = (workout: typeof popularWorkouts[0]) => {
    let presetId = 'preset-easy-run-30';
    if (workout.subtitle === 'Interval Run') presetId = 'preset-interval-10x400';
    if (workout.subtitle === 'Long Run') presetId = 'preset-long-run-70';
    if (workout.subtitle === 'Easy Run') presetId = 'preset-easy-run-30';
    if (workout.subtitle === 'Tempo Run') presetId = 'preset-tempo-run-20';

    router.push({ pathname: '/(app)/workout-setup', params: { presetId, workoutTitle: `${workout.title} ${workout.subtitle}` } });
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={`View ${planName} training plan`}
        onPress={() => router.push('/(app)/training-plan')}
        style={[styles.planCard, { backgroundColor: colors.surface, borderColor: `${BRAND_GREEN}66` }]}
      >
        <View style={styles.planHeading}>
          <View style={styles.planTitleGroup}>
            <DashboardText style={[styles.eyebrow, { color: colors.text }]}>YOUR TRAINING PLAN</DashboardText>
            <DashboardText style={[styles.planName, { color: BRAND_GREEN }]} numberOfLines={1}>{planName}</DashboardText>
          </View>
          <Feather name="check-circle" size={36} color={BRAND_GREEN} />
        </View>
        <View style={styles.metricsRow}>
          <View style={[styles.metric, { backgroundColor: colors.background }]}>
            <DashboardText style={[styles.metricValue, { color: colors.text }]}>{plan.weeks.length}</DashboardText>
            <DashboardText style={[styles.metricLabel, { color: colors.textSecondary }]}>WEEKS</DashboardText>
          </View>
          <View style={[styles.metric, { backgroundColor: colors.background }]}>
            <DashboardText style={[styles.metricValue, { color: colors.text }]}>{plan.running_days}</DashboardText>
            <DashboardText style={[styles.metricLabel, { color: colors.textSecondary }]}>RUN DAYS</DashboardText>
          </View>
          <View style={[styles.metric, { backgroundColor: colors.background }]}>
            <DashboardText style={[styles.metricValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{pace}</DashboardText>
            <DashboardText style={[styles.metricLabel, { color: colors.textSecondary }]}>{paceUnit}</DashboardText>
          </View>
        </View>
        <View style={styles.viewPlanRow}>
          <Feather name="calendar" size={18} color={colors.text} />
          <DashboardText style={[styles.viewPlanText, { color: colors.text }]}>VIEW TRAINING PLAN</DashboardText>
          <Feather name="chevron-right" size={23} color={colors.text} />
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.85}
        accessibilityRole="button"
        onPress={() => router.push('/(app)/screens/map')}
        style={[styles.recordButton, { backgroundColor: BRAND_GREEN }]}
      >
        <Feather name="play" size={21} color="#081009" />
        <DashboardText style={styles.recordButtonText}>Record Workout</DashboardText>
      </TouchableOpacity>

      <TouchableOpacity activeOpacity={0.9} onPress={handleStartTodayWorkout} style={[styles.workoutCard, { backgroundColor: colors.surface }]}>
        <View style={styles.workoutHeader}>
          <DashboardText style={[styles.eyebrow, { color: colors.text }]}>TODAY&apos;S WORKOUT</DashboardText>
          <View style={[styles.workoutIcon, { backgroundColor: BRAND_GREEN }]}><Feather name={isRestDay ? 'moon' : 'activity'} size={15} color="#FFFFFF" /></View>
        </View>
        <DashboardText style={[styles.workoutName, { color: BRAND_GREEN }]}>{todayWorkout?.title || (todayWorkout ? todayWorkout.workout_type : 'No workout scheduled')}</DashboardText>
        <DashboardText style={[styles.workoutNotes, { color: colors.textSecondary }]}>
          {todayWorkout?.notes || (isRestDay ? 'Take it easy and recover for the next workout.' : todayWorkout ? detailsFor(todayWorkout) : 'Enjoy a rest day and recover for your next workout.')}
        </DashboardText>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => router.push({ pathname: '/(app)/training-plan', params: { selectedWeek: String(nextWorkout?.week_number ?? 1), selectedDate: nextWorkout?.workout_date } })}
        style={[styles.workoutCard, styles.nextWorkoutCard, { backgroundColor: colors.surface }]}
      >
        <View style={styles.workoutHeader}>
          <DashboardText style={[styles.eyebrow, { color: colors.text }]}>NEXT DAY&apos;S WORKOUT</DashboardText>
          <View style={[styles.workoutIcon, { backgroundColor: BRAND_GREEN }]}><Feather name="activity" size={15} color="#FFFFFF" /></View>
        </View>
        <DashboardText style={[styles.workoutDate, { color: colors.textSecondary }]}>{formatWorkoutDate(nextWorkout?.workout_date) || 'No upcoming workout'}</DashboardText>
        <DashboardText style={[styles.nextWorkoutName, { color: colors.text }]}>{nextWorkout?.title || nextWorkout?.workout_type || 'Your plan is up to date'}</DashboardText>
        {detailsFor(nextWorkout) ? <DashboardText style={[styles.workoutDetails, { color: colors.textSecondary }]}>{detailsFor(nextWorkout)}</DashboardText> : null}
        {nextWorkout?.notes ? <DashboardText style={[styles.workoutNotes, styles.nextNotes, { color: colors.textSecondary }]}>{nextWorkout.notes}</DashboardText> : null}
      </TouchableOpacity>

      <DashboardText style={[styles.sectionTitle, { color: colors.text }]}>POPULAR WORKOUTS</DashboardText>
      <View style={styles.workoutRow}>
        {popularWorkouts.map((workout) => (
          <TouchableOpacity key={workout.subtitle} style={[styles.popularCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => openPopularWorkoutSetup(workout)}>
            <Feather name={workout.icon} size={30} color={BRAND_GREEN} />
            <DashboardText style={[styles.popularTitle, { color: colors.text }]}>{workout.title}</DashboardText>
            <DashboardText style={[styles.popularSubtitle, { color: colors.textSecondary }]}>{workout.subtitle}</DashboardText>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  planCard: { padding: 20, marginBottom: 14, borderRadius: 28, borderWidth: 1.5 },
  planHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  planTitleGroup: { flex: 1, gap: 5 },
  eyebrow: { fontSize: 18, lineHeight: 24, fontWeight: '800' },
  planName: { fontSize: 21, lineHeight: 27, fontWeight: '800' },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1, minWidth: 0, minHeight: 72, paddingHorizontal: 5, paddingVertical: 10, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  metricValue: { fontSize: 22, lineHeight: 27, fontWeight: '800' },
  metricLabel: { fontSize: 11, lineHeight: 16, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  viewPlanRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 16 },
  viewPlanText: { flex: 1, fontSize: 17, fontWeight: '800' },
  recordButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 14, borderRadius: 20 },
  recordButtonText: { color: '#081009', fontSize: 16, fontWeight: '800' },
  workoutCard: { padding: 20, marginBottom: 14, borderRadius: 28 },
  nextWorkoutCard: { paddingBottom: 22 },
  workoutHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  workoutIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  workoutName: { fontSize: 21, lineHeight: 27, fontWeight: '800', marginTop: 14 },
  workoutNotes: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  workoutDate: { fontSize: 15, lineHeight: 21, marginTop: 14 },
  nextWorkoutName: { fontSize: 20, lineHeight: 26, fontWeight: '800', marginTop: 14 },
  workoutDetails: { fontSize: 15, lineHeight: 22, marginTop: 12 },
  nextNotes: { marginTop: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '800', marginBottom: 12, marginTop: 6 },
  workoutRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginBottom: 14 },
  popularCard: { width: '48.5%', minHeight: 122, padding: 13, borderRadius: 22, borderWidth: 1.25 },
  popularTitle: { fontSize: 17, fontWeight: '800', marginTop: 12 },
  popularSubtitle: { fontSize: 15, marginTop: 3 },
});
