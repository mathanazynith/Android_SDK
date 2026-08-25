import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/theme';
import type { CurrentWorkout } from '../../service/workoutPlan';

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
  const isRestDay = todayWorkout?.workout_type === 'Rest' || todayWorkout?.workout_type === 'Rest Day';
  const todayDescription = todayWorkout
    ? [todayWorkout.title, detailsFor(todayWorkout), todayWorkout.notes].filter(Boolean).join('\n')
    : 'No workout is scheduled for today.';
  const nextDescription = nextWorkout
    ? [nextWorkout.title, detailsFor(nextWorkout), nextWorkout.notes].filter(Boolean).join('\n')
    : 'No upcoming workout is available.';

  return (
    <>
      <View style={styles.card}>
        <View style={styles.heading}>
          <Feather name={isRestDay ? 'moon' : 'activity'} size={25} color={Colors.primary} />
          <Text style={styles.title}>TODAY&apos;S WORKOUT</Text>
        </View>
        <Text style={styles.description}>{todayDescription}</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.push({ pathname: '/(app)/screens/map', params: { workoutTitle: todayWorkout?.title || 'Current Workout' } })}>
          <Feather name="activity" size={21} color="#081009" />
          <Text style={styles.buttonText}>Record Workout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.heading}>
          <Feather name="arrow-right-circle" size={25} color={Colors.primary} />
          <Text style={styles.title}>UP NEXT</Text>
        </View>
        <Text style={styles.description}>{nextDescription}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.heading}>
          <Feather name="flag" size={25} color={Colors.primary} />
          <Text style={styles.title}>TARGET (RACE)</Text>
        </View>
        <Text style={styles.emptyTarget}>No target or race information is available.</Text>
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
