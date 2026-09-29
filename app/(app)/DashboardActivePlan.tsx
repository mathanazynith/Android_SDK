import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/theme';
import type { CurrentWorkout } from '../../service/workoutPlan';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';

type DashboardActivePlanProps = {
  todayWorkout: CurrentWorkout | null;
  nextWorkout: CurrentWorkout | null;
};

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

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => router.push({ pathname: '/(app)/screens/map', params: { workoutTitle: todayWorkout?.title || 'Current Workout' } })}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.heading}>
          <Feather name={isRestDay ? 'moon' : 'activity'} size={25} color={BRAND_GREEN} />
          <Text style={[styles.title, { color: colors.text }]}>TODAY&apos;S WORKOUT</Text>
        </View>
        <Text style={[styles.description, { color: colors.text }]}>{todayDescription}</Text>
        <View style={[styles.button, { backgroundColor: BRAND_GREEN }]}>
          <Feather name="activity" size={21} color="#081009" />
          <Text style={styles.buttonText}>Record Workout</Text>
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

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.heading}>
          <Feather name="flag" size={25} color={BRAND_GREEN} />
          <Text style={[styles.title, { color: colors.text }]}>TARGET (RACE)</Text>
        </View>
        <Text style={[styles.emptyTarget, { color: colors.textSecondary }]}>No target or race information is available.</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, marginBottom: 14, borderRadius: 28, backgroundColor: '#242627', borderWidth: 1.25, borderColor: '#65686A' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, color: '#F2F2F2', fontSize: 20, fontWeight: '800' },
  description: { color: '#E0E2E1', fontSize: 17, lineHeight: 24, marginVertical: 15 },
  button: { minHeight: 51, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 18, backgroundColor: Colors.primary },
  buttonText: { color: '#081009', fontSize: 17, fontWeight: '800' },
  emptyTarget: { color: '#AEB0B2', fontSize: 16, marginTop: 15 },
});
