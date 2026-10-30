import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/theme';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';
import DashboardText from '../../components/common/DashboardText';

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
  const { colors, isDark } = useTheme();
  const openCustomWorkout = () => router.push('/(app)/questionnaire');

  const openWorkoutSetup = (workout: typeof popularWorkouts[0]) => {
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
      <View style={[styles.card, styles.customWorkoutCard, {
        backgroundColor: colors.surface,
        borderColor: isDark ? '#3A3A3A' : colors.border,
      }]}>
        <View style={styles.heading}>
          {/* <Feather name="edit-3" size={25} color={BRAND_GREEN} /> */}
          <DashboardText style={[styles.cardTitle, { color: BRAND_GREEN }]}>Custom Workout</DashboardText>
        </View>
        <View style={styles.infoList}>
          <View style={styles.infoLine}>
            {/* <Feather name="check-circle" size={16} color={BRAND_GREEN} /> */}
            <DashboardText style={[styles.infoText , { color: colors.text }]}>Flexible setup for personalized daily running routines.</DashboardText>
          </View>
        </View>
      <TouchableOpacity style={styles.button} onPress={() => router.push('/(app)/custom-workout')}>
          <Feather name="edit-3" size={26} color={Colors.primary} style={styles.buttonIcon} />
          <DashboardText style={[styles.buttonText, styles.customWorkoutButtonText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>CREATE CUSTOM WORKOUT</DashboardText>
      </TouchableOpacity>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <DashboardText style={[styles.cardTitle, { color: BRAND_GREEN }]}>Get Plan Assessment</DashboardText>
        <DashboardText style={[styles.description, { color: colors.text }]}>A new adventure begins!</DashboardText>
        <TouchableOpacity
          style={[styles.planButton, { backgroundColor: colors.primary }, !canStartAssessment && styles.buttonDisabled]}
          onPress={onStartAssessment}
          accessibilityHint={canStartAssessment
            ? 'Starts the assessment to create your running plan.'
            : 'Prompts you to complete your profile before starting the assessment.'}
          activeOpacity={0.85}
        >
          <View style={styles.planIconTile}>
            <MaterialCommunityIcons name="run" size={22} color="#ECFDF5" />
          </View>
          <DashboardText style={[styles.buttonText, styles.planButtonText, { color: colors.primaryText }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Get Plan</DashboardText>
          <Feather name="arrow-right" size={21} color={colors.primaryText} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.recordButton, { backgroundColor: BRAND_GREEN }]} onPress={() => router.push('/(app)/screens/map')}>
        <Feather name="play" size={24} color="#081009" />
        <DashboardText style={styles.recordText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Record Workout</DashboardText>
      </TouchableOpacity>

      <DashboardText style={[styles.sectionTitle, { color: colors.text }]}>POPULAR WORKOUTS</DashboardText>
      <View style={styles.workoutRow}>
        {popularWorkouts.map((workout) => (
          <TouchableOpacity
            key={workout.subtitle}
            style={[styles.workoutCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => openWorkoutSetup(workout)}
          >
            <Feather name={workout.icon} size={30} color={BRAND_GREEN} />
            <DashboardText style={[styles.workoutTitle, { color: colors.text }]}>{workout.title}</DashboardText>
            <DashboardText style={[styles.workoutSubtitle, { color: colors.textSecondary }]}>{workout.subtitle}</DashboardText>
            <View style={styles.exploreButton}><DashboardText style={styles.exploreText}>EXPLORE</DashboardText></View>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, marginBottom: 14, borderRadius: 28, backgroundColor: '#242627', borderWidth: 1.25, borderColor: '#65686A' },
  customWorkoutCard: { padding: 20, borderRadius: 16, borderWidth: 1 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10, },
  cardTitle: { flex: 1, color: '#8BD69A', fontSize: 20, fontWeight: '800' },
  infoList: { gap: 10, marginVertical: 16 },
  infoLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 ,fontWeight: 'bold'},
  infoText: { flex: 1, fontSize: 14, lineHeight: 20 },
  description: { color: '#E0E2E1', fontSize: 16, lineHeight: 22, marginVertical: 14 },
  button: { width: '100%', alignSelf: 'center', minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: Colors.primary, position: 'relative' },
  buttonIcon: { position: 'absolute', left: 14 },
  customWorkoutButtonText: { flex: 1, marginHorizontal: 42 },
  planButton: { width: '100%', alignSelf: 'center', minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderRadius: 16 },
  planIconTile: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#15803D' },
  planButtonText: { flex: 1, textAlign: 'left' },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { flexShrink: 1, color: '#081009', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  recordButton: { width: '100%', alignSelf: 'center', minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 22, borderRadius: 22, backgroundColor: Colors.primary },
  recordText: { flexShrink: 1, color: '#081009', fontSize: 16, fontWeight: '800' },
  sectionTitle: { color: '#F2F2F2', fontSize: 21, fontWeight: '800', marginBottom: 12 },
  workoutRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  workoutCard: { width: '48.5%', minHeight: 122, padding: 13, borderRadius: 22, backgroundColor: '#242627', borderWidth: 1.25, borderColor: '#65686A' },
  workoutTitle: { color: '#F7F7F7', fontSize: 17, fontWeight: '800', marginTop: 12 },
  workoutSubtitle: { color: '#E0E2E1', fontSize: 15, marginTop: 3 },
  exploreButton: { display: 'none' },
  exploreText: { color: '#DFF7E3', fontSize: 13, fontWeight: '800' },
});
