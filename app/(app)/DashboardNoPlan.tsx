import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/theme';

type DashboardNoPlanProps = {
  canStartAssessment: boolean;
  onStartAssessment: () => void;
};

const popularWorkouts = [
  { title: '30 MIN', subtitle: 'Easy Run', icon: 'activity' as const },
  { title: '70 MIN', subtitle: 'Long Run', icon: 'clock' as const },
  { title: '10 x 400m', subtitle: 'Interval Run', icon: 'target' as const },
  { title: '20 MIN', subtitle: 'Tempo Run', icon: 'trending-up' as const },
];

export default function DashboardNoPlan({ canStartAssessment, onStartAssessment }: DashboardNoPlanProps) {
  return (
    <>
      <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/(app)/custom-workout')}>
        <Feather name="edit-3" size={26} color={Colors.primary} />
        <Text style={styles.actionTitle}>CREATE CUSTOM WORKOUT</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>ONBOARDING ASSESSMENT</Text>
        <Text style={styles.description}>A new adventure begins! Start your comprehensive onboarding assessment now.</Text>
        <TouchableOpacity style={[styles.button, !canStartAssessment && styles.buttonDisabled]} onPress={onStartAssessment} disabled={!canStartAssessment}>
          <Feather name="play" size={21} color="#FFFFFF" />
          <Text style={styles.buttonText}>GET STARTED</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.recordButton} onPress={() => router.push('/(app)/screens/map')}>
        <Feather name="activity" size={24} color={Colors.primary} />
        <Text style={styles.recordText}>RECORD CURRENT WORKOUT</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>POPULAR WORKOUTS</Text>
      <View style={styles.workoutRow}>
        {popularWorkouts.map((workout) => (
          <TouchableOpacity key={workout.subtitle} style={styles.workoutCard} onPress={() => router.push('/(app)/screens/map')}>
            <Feather name={workout.icon} size={30} color={Colors.primary} />
            <Text style={styles.workoutTitle}>{workout.title}</Text>
            <Text style={styles.workoutSubtitle}>{workout.subtitle}</Text>
            <View style={styles.exploreButton}><Text style={styles.exploreText}>EXPLORE</Text></View>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  actionCard: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, marginBottom: 14, borderRadius: 24, backgroundColor: '#292C2D', borderWidth: 1.5, borderColor: '#65686A' },
  actionTitle: { flex: 1, color: '#F7F7F7', fontSize: 18, fontWeight: '800' },
  card: { padding: 20, marginBottom: 14, borderRadius: 28, backgroundColor: '#242627', borderWidth: 1.25, borderColor: '#65686A' },
  cardTitle: { color: '#8BD69A', fontSize: 21, fontWeight: '800' },
  description: { color: '#E0E2E1', fontSize: 16, lineHeight: 22, marginVertical: 14 },
  button: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 19, backgroundColor: '#303335', borderWidth: 1.5, borderColor: Colors.primary },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  recordButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 22, borderRadius: 22, backgroundColor: '#242627', borderWidth: 1.5, borderColor: Colors.primary },
  recordText: { color: '#B7E8C0', fontSize: 16, fontWeight: '800' },
  sectionTitle: { color: '#F2F2F2', fontSize: 21, fontWeight: '800', marginBottom: 12 },
  workoutRow: { flexDirection: 'row', gap: 10 },
  workoutCard: { flex: 1, minHeight: 190, padding: 13, borderRadius: 22, backgroundColor: '#242627', borderWidth: 1.25, borderColor: '#65686A' },
  workoutTitle: { color: '#F7F7F7', fontSize: 17, fontWeight: '800', marginTop: 18 },
  workoutSubtitle: { color: '#E0E2E1', fontSize: 15, marginTop: 3 },
  exploreButton: { marginTop: 'auto', minHeight: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#303335', borderWidth: 1.25, borderColor: '#7CCB88' },
  exploreText: { color: '#DFF7E3', fontSize: 13, fontWeight: '800' },
});
