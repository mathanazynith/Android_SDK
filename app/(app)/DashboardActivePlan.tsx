import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/theme';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';
import type { CurrentWorkout } from '../../service/workoutPlan';

type DashboardActivePlanProps = {
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
  ].filter(Boolean).join(' · ');
};

export default function DashboardActivePlan({ todayWorkout, nextWorkout }: DashboardActivePlanProps) {
  const { colors } = useTheme();
  const isRestDay = todayWorkout?.workout_type === 'Rest' || todayWorkout?.workout_type === 'Rest Day';
  const todayDescription = todayWorkout
    ? [todayWorkout.title, detailsFor(todayWorkout), todayWorkout.notes].filter(Boolean).join('\n')
    : 'No workout is scheduled for today.';
  const nextDescription = nextWorkout
    ? [nextWorkout.title, detailsFor(nextWorkout), nextWorkout.notes].filter(Boolean).join('\n')
    : 'No upcoming workout is available.';

  const handleStartTodayWorkout = () => {
    if (isRestDay || !todayWorkout) {
      router.push('/(app)/screens/map');
      return;
    }

    router.push({
      pathname: '/(app)/workout-setup',
      params: {
        workoutTitle: todayWorkout.title || 'Today\'s Workout',
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

    router.push({
      pathname: '/(app)/workout-setup',
      params: {
        presetId,
        workoutTitle: `${workout.title} ${workout.subtitle}`,
      },
    });
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handleStartTodayWorkout}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.heading}>
          <Feather name={isRestDay ? 'moon' : 'activity'} size={25} color={BRAND_GREEN} />
          <Text style={[styles.title, { color: colors.text }]}>TODAY&apos;S WORKOUT</Text>
        </View>
        <Text style={[styles.description, { color: colors.text }]}>{todayDescription}</Text>
        <View style={[styles.button, { backgroundColor: BRAND_GREEN }]}>
          <Feather name="activity" size={21} color="#081009" />
          <Text style={styles.buttonText}>{isRestDay ? 'Rest Day' : 'Record Workout'}</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => router.push({
          pathname: '/(app)/training-plan',
          params: { selectedWeek: String(nextWorkout?.week_number ?? 1) },
        })}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.heading}>
          <Feather name="arrow-right-circle" size={25} color={BRAND_GREEN} />
          <Text style={[styles.title, { color: colors.text }]}>UP NEXT</Text>
        </View>
        <Text style={[styles.description, { color: colors.text }]}>{nextDescription}</Text>
      </TouchableOpacity>

      {/* POPULAR WORKOUTS ROW FOR TRAINING PLAN USERS */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>POPULAR WORKOUTS</Text>
      <View style={styles.workoutRow}>
        {popularWorkouts.map((workout) => (
          <TouchableOpacity
            key={workout.subtitle}
            style={[styles.workoutCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => openPopularWorkoutSetup(workout)}
          >
            <Feather name={workout.icon} size={30} color={BRAND_GREEN} />
            <Text style={[styles.workoutTitle, { color: colors.text }]}>{workout.title}</Text>
            <Text style={[styles.workoutSubtitle, { color: colors.textSecondary }]}>{workout.subtitle}</Text>
            <View style={styles.exploreButton}><Text style={styles.exploreText}>EXPLORE</Text></View>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, marginBottom: 14, borderRadius: 28, backgroundColor: '#242627', borderWidth: 1.25, borderColor: '#65686A' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, color: '#F2F2F2', fontSize: 20, fontWeight: '800' },
  description: { color: '#E0E2E1', fontSize: 17, lineHeight: 24, marginVertical: 15 },
  button: { width: '88%', alignSelf: 'center', minHeight: 51, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 18, backgroundColor: Colors.primary },
  buttonText: { color: '#081009', fontSize: 17, fontWeight: '800' },
  sectionTitle: { color: '#F2F2F2', fontSize: 21, fontWeight: '800', marginBottom: 12, marginTop: 6 },
  workoutRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginBottom: 14 },
  workoutCard: { width: '48.5%', minHeight: 122, padding: 13, borderRadius: 22, backgroundColor: '#242627', borderWidth: 1.25, borderColor: '#65686A' },
  workoutTitle: { color: '#F7F7F7', fontSize: 17, fontWeight: '800', marginTop: 12 },
  workoutSubtitle: { color: '#E0E2E1', fontSize: 15, marginTop: 3 },
  exploreButton: { display: 'none' },
  exploreText: { color: '#DFF7E3', fontSize: 13, fontWeight: '800' },
});
