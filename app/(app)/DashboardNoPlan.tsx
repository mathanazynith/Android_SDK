import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/theme';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';

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
  const { colors } = useTheme();
  const openCustomWorkout = () => router.push('/(app)/questionnaire');

  return (
    <>
      <View style={[styles.card, styles.customWorkoutCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.heading}>
          {/* <Feather name="edit-3" size={25} color={BRAND_GREEN} /> */}
          <Text style={[styles.cardTitle, { color: BRAND_GREEN }]}>Custom Workout</Text>
        </View>
        <View style={styles.infoList}>
          <View style={styles.infoLine}>
            {/* <Feather name="check-circle" size={16} color={BRAND_GREEN} /> */}
            <Text style={[styles.infoText , { color: colors.text }]}>Flexible setup for personalized daily running routines.</Text>
          </View>
        </View>
        <TouchableOpacity style={[styles.button, { backgroundColor: BRAND_GREEN }]} onPress={openCustomWorkout} activeOpacity={0.85}>
          <Feather name="plus-circle" size={20} color="#000000" />
          <Text style={[styles.buttonText, { color: "#000000" }]}>Create Custom Workout</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: BRAND_GREEN }]}>Screening Quiz</Text>
        <Text style={[styles.description, { color: colors.text }]}>A new adventure begins!</Text>
        <TouchableOpacity style={[styles.button, { backgroundColor: BRAND_GREEN }, !canStartAssessment && styles.buttonDisabled]} onPress={onStartAssessment} disabled={!canStartAssessment}>
          <Feather name="trending-up" size={21} color="#081009" />
          <Text style={styles.buttonText}>Get Started</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.recordButton, { backgroundColor: BRAND_GREEN }]} onPress={() => router.push('/(app)/screens/map')}>
        <Feather name="play" size={24} color="#081009" />
        <Text style={styles.recordText}>Record Workout</Text>
      </TouchableOpacity>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>POPULAR WORKOUTS</Text>
      <View style={styles.workoutRow}>
        {popularWorkouts.map((workout) => (
          <TouchableOpacity key={workout.subtitle} style={[styles.workoutCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push('/(app)/screens/map')}>
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
  customWorkoutCard: { padding: 20 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10, },
  cardTitle: { flex: 1, color: '#8BD69A', fontSize: 20, fontWeight: '800' },
  infoList: { gap: 10, marginVertical: 16 },
  infoLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 ,fontWeight: 'bold'},
  infoText: { flex: 1, fontSize: 14, lineHeight: 20 },
  description: { color: '#E0E2E1', fontSize: 16, lineHeight: 22, marginVertical: 14 },
  button: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 19, backgroundColor: Colors.primary },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#081009', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  recordButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 22, borderRadius: 22, backgroundColor: Colors.primary },
  recordText: { color: '#081009', fontSize: 16, fontWeight: '800' },
  sectionTitle: { color: '#F2F2F2', fontSize: 21, fontWeight: '800', marginBottom: 12 },
  workoutRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  workoutCard: { width: '48.5%', minHeight: 122, padding: 13, borderRadius: 22, backgroundColor: '#242627', borderWidth: 1.25, borderColor: '#65686A' },
  workoutTitle: { color: '#F7F7F7', fontSize: 17, fontWeight: '800', marginTop: 12 },
  workoutSubtitle: { color: '#E0E2E1', fontSize: 15, marginTop: 3 },
  exploreButton: { display: 'none' },
  exploreText: { color: '#DFF7E3', fontSize: 13, fontWeight: '800' },
});
