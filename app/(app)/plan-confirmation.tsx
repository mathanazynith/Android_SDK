import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RunningLoader } from '../../components/common/RunningLoader';
import { useQuestionnaire } from '../../contexts/QuestionnaireContext';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';
import type { CurrentWorkout } from '../../service/workoutPlan';

const formatPlanDate = (date: string | undefined) => {
  if (!date) return 'Not set';
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return date;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const getFirstWorkout = (weeks: { workouts: CurrentWorkout[] }[]) => {
  const workouts = weeks
    .flatMap((week) => week.workouts)
    .sort((a, b) => a.workout_date.localeCompare(b.workout_date));
  return workouts.find((workout) => !/rest/i.test(`${workout.workout_type} ${workout.title}`))
    ?? workouts[0];
};

export default function PlanConfirmationScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    assessmentId,
    isComplete,
    assessmentResult,
    fetchAssessmentResult,
    workoutPlan,
    workoutPlanError,
    isWorkoutPlanLoaded,
    isWorkoutPlanLoading,
    fetchWorkoutPlan,
    goToPrevious,
    isLoading,
  } = useQuestionnaire();
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const cancelInProgress = useRef(false);

  useEffect(() => {
    if (!assessmentId || !isComplete) {
      router.replace('/(app)/questionnaire');
      return;
    }

    if (!assessmentResult) void fetchAssessmentResult();
    if (!workoutPlan && !isWorkoutPlanLoading && !isWorkoutPlanLoaded) {
      void fetchWorkoutPlan(true);
    }
  }, [
    assessmentId,
    assessmentResult,
    fetchAssessmentResult,
    fetchWorkoutPlan,
    isComplete,
    isWorkoutPlanLoaded,
    isWorkoutPlanLoading,
    workoutPlan,
  ]);

  const handleCancel = useCallback(async () => {
    if (cancelInProgress.current) return;
    cancelInProgress.current = true;
    setIsCancelling(true);
    setCancelError(null);
    try {
      const returnedToAssessment = await goToPrevious();
      if (!returnedToAssessment) {
        setCancelError('Unable to return to the assessment. Please try again.');
        return;
      }
      router.replace('/(app)/questionnaire');
    } finally {
      cancelInProgress.current = false;
      setIsCancelling(false);
    }
  }, [goToPrevious]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        void handleCancel();
        return true;
      });
      return () => subscription.remove();
    }, [handleCancel]),
  );

  if (!assessmentId || !isComplete) return null;

  const isLoadingPlan = !isWorkoutPlanLoaded || isWorkoutPlanLoading;
  const firstWorkout = workoutPlan ? getFirstWorkout(workoutPlan.weeks) : undefined;
  const planName = workoutPlan?.training_plan || workoutPlan?.template_name || 'Personalized running plan';
  const schedule = workoutPlan?.selected_weekdays?.length
    ? workoutPlan.selected_weekdays.join(', ')
    : workoutPlan?.running_days
      ? `${workoutPlan.running_days} days per week`
      : 'Not set';
  const recommendation = assessmentResult?.recommendation;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: Math.max(16, insets.top + 8) }]}>
        <View style={[styles.headerIcon, { backgroundColor: colors.selected }]}>
          <Feather name="check-circle" size={30} color={BRAND_GREEN} />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Your plan is ready</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Review your personalized training plan. Confirm to continue, or cancel to return to your assessment and make changes.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {isLoadingPlan ? (
          <RunningLoader size={48} label="Loading your plan..." />
        ) : workoutPlan ? (
          <>
            <View style={[styles.planCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.planLabel, { color: colors.textSecondary }]}>YOUR TRAINING PLAN</Text>
              <Text style={[styles.planName, { color: colors.text }]}>{planName}</Text>
              <View style={styles.summaryGrid}>
                <SummaryItem label="Duration" value={`${workoutPlan.weeks.length} weeks`} />
                <SummaryItem label="Weekly schedule" value={schedule} />
                <SummaryItem label="Start date" value={formatPlanDate(workoutPlan.start_date)} />
                <SummaryItem
                  label="First workout"
                  value={firstWorkout?.title || firstWorkout?.workout_type || 'Not set'}
                />
              </View>
            </View>

            {recommendation?.reason ? (
              <View style={[styles.reasonCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.reasonTitle, { color: colors.text }]}>Why this plan</Text>
                <Text style={[styles.reasonText, { color: colors.textSecondary }]}>{recommendation.reason}</Text>
              </View>
            ) : null}
          </>
        ) : (
          <View style={[styles.errorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="alert-circle" size={22} color="#D32F2F" />
            <Text style={[styles.errorText, { color: colors.text }]}>
              {workoutPlanError || 'Your training plan is not available yet. Try loading it again.'}
            </Text>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: colors.primary }]}
              onPress={() => void fetchWorkoutPlan(true)}
              disabled={isWorkoutPlanLoading}
              accessibilityRole="button"
            >
              <Text style={[styles.retryText, { color: colors.primaryText }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {cancelError ? (
          <Text accessibilityRole="alert" style={styles.cancelError}>{cancelError}</Text>
        ) : null}
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
        <TouchableOpacity
          style={[styles.confirmButton, (!workoutPlan || isLoadingPlan || isCancelling) && styles.disabledButton]}
          onPress={() => router.replace('/(app)/running-plan')}
          disabled={!workoutPlan || isLoadingPlan || isCancelling}
          accessibilityRole="button"
        >
          {isCancelling ? <ActivityIndicator color="#081009" /> : <Text style={styles.confirmText}>Confirm</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.cancelButton, { borderColor: colors.border }]}
          onPress={() => void handleCancel()}
          disabled={isCancelling || isLoading}
          accessibilityRole="button"
        >
          {isCancelling ? (
            <ActivityIndicator color={colors.textSecondary} />
          ) : (
            <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.summaryItem}>
      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 16 },
  headerIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 8 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
  planCard: { borderWidth: 1, borderRadius: 20, padding: 18 },
  planLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  planName: { fontSize: 21, fontWeight: '800', marginTop: 6, marginBottom: 18 },
  summaryGrid: { gap: 16 },
  summaryItem: { gap: 4 },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 16, fontWeight: '600' },
  reasonCard: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 14 },
  reasonTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  reasonText: { fontSize: 14, lineHeight: 21 },
  errorCard: { alignItems: 'center', borderWidth: 1, borderRadius: 16, padding: 18, gap: 12 },
  errorText: { textAlign: 'center', fontSize: 14, lineHeight: 20 },
  retryButton: { borderRadius: 12, paddingVertical: 11, paddingHorizontal: 24 },
  retryText: { fontWeight: '700' },
  cancelError: { color: '#D32F2F', textAlign: 'center', marginTop: 12 },
  actions: { paddingHorizontal: 20, gap: 10 },
  confirmButton: { minHeight: 52, borderRadius: 16, backgroundColor: BRAND_GREEN, alignItems: 'center', justifyContent: 'center' },
  confirmText: { color: '#081009', fontSize: 16, fontWeight: '800' },
  cancelButton: { minHeight: 50, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, fontWeight: '700' },
  disabledButton: { opacity: 0.5 },
});
