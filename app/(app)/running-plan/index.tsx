import { Alert } from '@/components/ThemedAlert';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RunningLoader } from '../../../components/common/RunningLoader';
import MotionEntrance from '../../../components/MotionEntrance';
import { useQuestionnaire } from '../../../contexts/QuestionnaireContext';
import { useTheme } from '../../../contexts/ThemeContext';

export default function RunningPlanScreen() {
  const { colors } = useTheme();
  const { assessmentResult, isAssessmentResultLoading, fetchAssessmentResult, workoutPlan, workoutPlanError, isWorkoutPlanLoading, fetchWorkoutPlan, endWorkoutPlan } = useQuestionnaire();
  const [isEndingPlan, setIsEndingPlan] = useState(false);
  useEffect(() => { fetchAssessmentResult(); fetchWorkoutPlan(); }, [fetchAssessmentResult, fetchWorkoutPlan]);

  const recommendation = assessmentResult?.recommendation;
  const planName = workoutPlan?.training_plan || workoutPlan?.template_name || '';
  const duration = workoutPlan?.weeks.length ? `${workoutPlan.weeks.length} weeks` : '';
  const loading = (isAssessmentResultLoading || isWorkoutPlanLoading) && !workoutPlan;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <RunningLoader size={64} label="Loading your running plan..." />
      </View>
    );
  }
  if (!workoutPlan) return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={[styles.error, { color: colors.text }]}>{workoutPlanError || 'No training plan is available.'}</Text><TouchableOpacity style={[styles.retry, { backgroundColor: colors.primary }]} onPress={() => fetchWorkoutPlan(true)}><Text style={[styles.retryText, { color: colors.primaryText }]}>Retry</Text></TouchableOpacity></View>;

  const handleEndPlan = () => {
    Alert.alert(
      'End training plan?',
      'This will end your active training plan. You can create a new one by completing another assessment.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Plan',
          style: 'destructive',
          onPress: async () => {
            setIsEndingPlan(true);
            try {
              await endWorkoutPlan();
              router.replace('/(app)/dashboard');
            } catch {
              Alert.alert('Unable to end plan', 'Please try again.');
            } finally {
              setIsEndingPlan(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 118 }]}
      >
    <MotionEntrance>
    <View style={styles.topSection}><View style={[styles.checkBadge, { backgroundColor: colors.selected }]}><Text style={[styles.check, { color: colors.primary }]}>✓</Text></View><Text style={[styles.planTitle, { color: colors.text }]}>{planName}</Text></View>
    </MotionEntrance>
    <MotionEntrance delay={50}>
    <View style={styles.valuesRow}>
      <ValueCard label="Readiness" value={recommendation?.readiness_level || ''} />
      <ValueCard label="Risk Level" value={recommendation?.risk_level || ''} />
      <ValueCard label="Duration" value={duration} />
    </View>
    </MotionEntrance>
    <MotionEntrance delay={100}>
    {recommendation?.reason ? <View style={[styles.reasonCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.reasonTitle, { color: colors.text }]}>Why this plan</Text><Text style={[styles.reasonText, { color: colors.textSecondary }]}>{recommendation.reason}</Text></View> : null}
    </MotionEntrance>
    <MotionEntrance delay={140}>
    <View style={styles.buttonArea}>
      <TouchableOpacity style={[styles.calendarButton, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push('/(app)/calendar')}><Text style={[styles.calendarButtonText, { color: colors.primary }]}>View Training Calendar</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.endPlanButton, isEndingPlan && styles.endPlanButtonDisabled]} onPress={handleEndPlan} disabled={isEndingPlan}><Text style={styles.endPlanButtonText}>{isEndingPlan ? 'Ending Plan...' : 'End Plan'}</Text></TouchableOpacity>
    </View>
    </MotionEntrance>
      </ScrollView>
    </View>
  );
}

function ValueCard({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return <View style={[styles.valueCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.valueLabel, { color: colors.textSecondary }]}>{label}</Text><Text style={[styles.valueText, { color: colors.text }]}>{value || '—'}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, content: { paddingBottom: 24 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }, loadingText: { marginTop: 12, fontSize: 14 }, error: { fontSize: 14, marginBottom: 12, textAlign: 'center' }, retry: { borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 }, retryText: { fontWeight: '700' }, topSection: { alignItems: 'center', paddingTop: 22, paddingBottom: 10 }, checkBadge: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 10 }, check: { fontSize: 32 }, planTitle: { fontSize: 24, fontWeight: '700', marginBottom: 5 }, valuesRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 6 }, valueCard: { flex: 1, borderRadius: 12, padding: 10, marginHorizontal: 5, borderWidth: 1 }, valueLabel: { fontSize: 12, marginBottom: 5 }, valueText: { fontSize: 14, fontWeight: '700' }, reasonCard: { marginTop: 10, marginHorizontal: 16, borderRadius: 12, padding: 12, borderWidth: 1 }, reasonTitle: { fontWeight: '700', marginBottom: 6 }, reasonText: { fontSize: 13 }, buttonArea: { paddingHorizontal: 16, marginTop: 7 }, calendarButton: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1 }, calendarButtonText: { fontWeight: '700', fontSize: 14 }, endPlanButton: { marginTop: 10, backgroundColor: '#D32F2F', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }, endPlanButtonDisabled: { opacity: 0.6 }, endPlanButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
