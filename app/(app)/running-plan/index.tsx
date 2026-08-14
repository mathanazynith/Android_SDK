import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuestionnaire } from '../../../contexts/QuestionnaireContext';

export default function RunningPlanScreen() {
  const { assessmentResult, isAssessmentResultLoading, fetchAssessmentResult, workoutPlan, workoutPlanError, isWorkoutPlanLoading, fetchWorkoutPlan } = useQuestionnaire();
  useEffect(() => { fetchAssessmentResult(); fetchWorkoutPlan(); }, [fetchAssessmentResult, fetchWorkoutPlan]);

  const recommendation = assessmentResult?.recommendation;
  const planName = workoutPlan?.training_plan || workoutPlan?.template_name || '';
  const duration = workoutPlan?.weeks.length ? `${workoutPlan.weeks.length} weeks` : '';
  const loading = (isAssessmentResultLoading || isWorkoutPlanLoading) && !workoutPlan;

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#2BD64F" /><Text style={styles.loadingText}>Loading your running plan...</Text></View>;
  if (!workoutPlan) return <View style={styles.center}><Text style={styles.error}>{workoutPlanError || 'No training plan is available.'}</Text><TouchableOpacity style={styles.retry} onPress={() => fetchWorkoutPlan(true)}><Text style={styles.retryText}>Retry</Text></TouchableOpacity></View>;

  return <ScrollView style={styles.container} contentContainerStyle={styles.content}>
    <View style={styles.topSection}><View style={styles.checkBadge}><Text style={styles.check}>✓</Text></View><Text style={styles.planTitle}>{planName}</Text></View>
    <View style={styles.valuesRow}>
      <ValueCard label="Readiness" value={recommendation?.readiness_level || ''} />
      <ValueCard label="Risk Level" value={recommendation?.risk_level || ''} />
      <ValueCard label="Duration" value={duration} />
    </View>
    {recommendation?.reason ? <View style={styles.reasonCard}><Text style={styles.reasonTitle}>Why this plan</Text><Text style={styles.reasonText}>{recommendation.reason}</Text></View> : null}
    <View style={styles.buttonArea}><TouchableOpacity style={styles.calendarButton} onPress={() => router.push('/(app)/calendar')}><Text style={styles.calendarButtonText}>View Training Calendar</Text></TouchableOpacity></View>
  </ScrollView>;
}

function ValueCard({ label, value }: { label: string; value: string }) {
  return <View style={styles.valueCard}><Text style={styles.valueLabel}>{label}</Text><Text style={styles.valueText}>{value || '—'}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06090B' }, content: { paddingBottom: 120 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#06090B' }, loadingText: { marginTop: 12, color: '#fff' }, error: { color: '#fff', fontSize: 16, marginBottom: 12, textAlign: 'center' }, retry: { backgroundColor: '#2BD64F', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 }, retryText: { color: '#091200', fontWeight: '700' }, topSection: { alignItems: 'center', paddingTop: 28, paddingBottom: 12 }, checkBadge: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#2BD64F', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }, check: { fontSize: 36, color: '#fff' }, planTitle: { color: '#fff', fontSize: 28, fontWeight: '700', marginBottom: 6 }, valuesRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, marginTop: 8 }, valueCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 12, marginHorizontal: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' }, valueLabel: { color: '#AEB0B2', fontSize: 13, marginBottom: 6 }, valueText: { color: '#fff', fontSize: 16, fontWeight: '700' }, reasonCard: { marginTop: 12, marginHorizontal: 18, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' }, reasonTitle: { color: '#fff', fontWeight: '700', marginBottom: 8 }, reasonText: { color: '#AEB0B2' }, buttonArea: { paddingHorizontal: 18, marginTop: 8 }, calendarButton: { backgroundColor: '#0B0D0E', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }, calendarButtonText: { color: '#2BD64F', fontWeight: '700', fontSize: 16 },
});
