import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RunningLoader } from '../../components/common/RunningLoader';
import { useQuestionnaire } from '../../contexts/QuestionnaireContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  changePlanAnswers,
  getWorkoutPlanGenerationActions,
  getWorkoutPlanGenerationState,
  retryPlanLookup,
  startNewPlanAssessment,
} from '../../src/utils/workoutPlanGeneration';

const textOrDash = (value: unknown) => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '—';
};

const getGoalLabel = (
  recommendation: Record<string, unknown>,
  questions: ReturnType<typeof useQuestionnaire>['questions'],
  answers: ReturnType<typeof useQuestionnaire>['allAnswers'],
) => {
  const recommendedGoal =
    recommendation.goal_name
    ?? recommendation.goal
    ?? recommendation.target_goal;
  if (typeof recommendedGoal === 'string' && recommendedGoal.trim()) {
    return recommendedGoal.trim();
  }

  const goalQuestion = questions.find((question) =>
    question.isGoalQuestion === true
    || (question.type === 'plan_selection' && /running goal|primary.*goal/i.test(question.question ?? ''))
    || /primary\s+running\s+goal|what\s+is\s+your\s+goal/i.test(`${question.question ?? ''} ${question.slug ?? ''}`),
  );
  if (!goalQuestion) return '—';

  const answerKey = String(goalQuestion.backendId ?? goalQuestion.id).replace(/\D/g, '');
  const answer = answers[answerKey];
  if (!answer) return '—';

  const selectedOption = goalQuestion.options?.find((option) =>
    String(option.id) === String(answer.value) || String(option.value) === String(answer.value),
  );
  const optionLabel = selectedOption?.label || selectedOption?.text;
  const distance = answer.customValues?.distance ?? answer.customValues?.targetDistance;
  const unit = answer.customValues?.unit;

  if (optionLabel && distance && unit) {
    return `${optionLabel} (${distance} ${unit})`;
  }
  if (
    optionLabel
    && selectedOption?.numeric_value
    && selectedOption.numeric_unit
    && !optionLabel.toLowerCase().includes(selectedOption.numeric_unit.toLowerCase())
  ) {
    return `${optionLabel} (${selectedOption.numeric_value} ${selectedOption.numeric_unit})`;
  }
  return textOrDash(optionLabel ?? answer.value);
};

export default function PlanRecommendationScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    assessmentId,
    isComplete,
    assessmentResult,
    isAssessmentResultLoading,
    fetchAssessmentResult,
    questions,
    allAnswers,
    workoutPlan,
    isWorkoutPlanLoaded,
    isWorkoutPlanLoading,
    workoutPlanError,
    isWorkoutPlanRetryable,
    fetchWorkoutPlan,
    goToPrevious,
    reset,
  } = useQuestionnaire();
  const didRequestWorkoutPlan = useRef(false);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const [isStartingOver, setIsStartingOver] = useState(false);
  const [navigationError, setNavigationError] = useState<string | null>(null);

  const restartAssessment = useCallback(async () => {
    setIsStartingOver(true);
    setNavigationError(null);
    try {
      await startNewPlanAssessment(
        reset,
        () => router.replace('/(app)/questionnaire'),
      );
    } catch (error) {
      console.error('[PlanRecommendation] Failed to restart assessment:', error);
      Alert.alert(
        'Unable to restart assessment',
        'We could not clear the saved assessment data. Please try again.',
      );
    } finally {
      setIsStartingOver(false);
    }
  }, [reset]);

  const handleChangeAnswers = useCallback(async () => {
    setIsNavigatingBack(true);
    setNavigationError(null);
    try {
      const returned = await changePlanAnswers(
        goToPrevious,
        () => router.replace('/(app)/questionnaire'),
      );
      if (!returned) {
        setNavigationError('Unable to return to your answers. Try again, or start a fresh assessment.');
      }
    } catch (error) {
      console.error('[PlanRecommendation] Failed to return to answers:', error);
      setNavigationError('Unable to return to your answers. Try again, or start a fresh assessment.');
    } finally {
      setIsNavigatingBack(false);
    }
  }, [goToPrevious]);

  const confirmStartOver = useCallback(() => {
    Alert.alert(
      'Start a new assessment?',
      'Your current answers will be cleared.',
      [
        { text: 'Keep my answers', style: 'cancel' },
        {
          text: 'Start over',
          style: 'destructive',
          onPress: () => { void restartAssessment(); },
        },
      ],
      { cancelable: true },
    );
  }, [restartAssessment]);

  useEffect(() => {
    if (!assessmentId || !isComplete) {
      router.replace('/(app)/questionnaire');
      return;
    }
    if (!assessmentResult && !isAssessmentResultLoading) void fetchAssessmentResult();
    if (
      !workoutPlan
      && !isWorkoutPlanLoaded
      && !isWorkoutPlanLoading
      && !didRequestWorkoutPlan.current
    ) {
      didRequestWorkoutPlan.current = true;
      void fetchWorkoutPlan(true);
      return;
    }
  }, [
    assessmentId,
    assessmentResult,
    fetchAssessmentResult,
    fetchWorkoutPlan,
    isAssessmentResultLoading,
    isComplete,
    isWorkoutPlanLoaded,
    isWorkoutPlanLoading,
    workoutPlan,
  ]);

  if (!assessmentId || !isComplete) return null;

  const planState = getWorkoutPlanGenerationState({
    isLoaded: isWorkoutPlanLoaded,
    isLoading: isWorkoutPlanLoading,
    hasPlan: Boolean(workoutPlan),
    error: workoutPlanError,
  });
  const actions = getWorkoutPlanGenerationActions(
    planState,
    isWorkoutPlanRetryable,
    Boolean(navigationError),
  );

  if (isAssessmentResultLoading || planState === 'loading') {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <RunningLoader size={56} label="Preparing your recommendation..." />
      </View>
    );
  }

  const rawRecommendation = assessmentResult?.recommendation;
  const recommendation: Record<string, unknown> =
    rawRecommendation && typeof rawRecommendation === 'object' ? rawRecommendation : {};
  const planTitle =
    workoutPlan?.training_plan
    || workoutPlan?.template_name
    || textOrDash(recommendation.recommended_plan);
  const goal = getGoalLabel(recommendation, questions, allAnswers);
  const overallScore =
    recommendation.overall_score
    ?? recommendation.score
    ?? assessmentResult?.overall_score
    ?? assessmentResult?.score;
  const readiness = recommendation.readiness_level;
  const risk = recommendation.risk_level;
  const status =
    recommendation.recommendation_status
    ?? recommendation.status
    ?? assessmentResult?.recommendation_status
    ?? 'Ready';
  const reason = recommendation.reason;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(18, insets.top + 8),
            paddingBottom: actions.includes('start_over')
              ? Math.max(230, insets.bottom + 210)
              : Math.max(140, insets.bottom + 120),
          },
        ]}
      >
        <View style={styles.topBar}>
          <View style={[styles.stepBadge, { borderColor: colors.border }]}>
            <Feather
              name={planState === 'no_match' || planState === 'error' ? 'alert-circle' : 'check'}
              size={16}
              color={planState === 'error' ? '#D32F2F' : colors.primary}
            />
            <Text style={[styles.stepText, { color: colors.textSecondary }]}>
              {planState === 'no_match'
                ? 'No Matching Plan'
                : planState === 'error'
                  ? 'Plan Request Failed'
                  : 'Assessment Complete'}
            </Text>
          </View>
        </View>

        {planState === 'no_match' || planState === 'error' ? (
          <View style={[styles.failureCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather
              name={planState === 'no_match' ? 'search' : 'alert-circle'}
              size={24}
              color={planState === 'no_match' ? colors.primary : '#D32F2F'}
            />
            <Text style={[styles.failureTitle, { color: colors.textPrimary }]}>
              {planState === 'no_match'
                ? 'No plan matches these selections'
                : 'We couldn’t load your plan'}
            </Text>
            <Text style={[styles.failureText, { color: colors.textSecondary }]}>
              {planState === 'no_match'
                ? 'Change your answers and try again, or start a fresh assessment.'
                : workoutPlanError || 'Check your connection and try again.'}
            </Text>
          </View>
        ) : (
          <>
            <View style={[styles.planHero, { backgroundColor: colors.selected, borderColor: colors.border }]}>
              <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>YOUR RECOMMENDED PLAN</Text>
              <Text style={[styles.planTitle, { color: colors.textPrimary }]}>{planTitle}</Text>
            </View>

            <View style={styles.twoColumnRow}>
              <SummaryCard label="Your Goal" value={goal} />
              <SummaryCard label="Overall Score" value={textOrDash(overallScore)} />
            </View>

            <View style={styles.twoColumnRow}>
              <SummaryCard
                label="Readiness Level"
                value={textOrDash(readiness)}
                accent={colors.primary}
              />
              <SummaryCard
                label="Risk Level"
                value={textOrDash(risk)}
                accent="#F87171"
              />
            </View>

            <View style={[styles.statusCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Recommendation Status</Text>
              <Text style={[styles.statusValue, { color: colors.primary }]}>{textOrDash(status)}</Text>
            </View>

            <Text style={[styles.reasonHeading, { color: colors.textPrimary }]}>Why this recommendation?</Text>
            <View style={[styles.reasonCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.reasonText, { color: colors.textSecondary }]}>
                {textOrDash(reason)}
              </Text>
            </View>
          </>
        )}
        {navigationError ? (
          <Text accessibilityRole="alert" style={styles.navigationError}>
            {navigationError}
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom + 8), backgroundColor: colors.background }]}>
        {actions.includes('confirm') ? (
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.primary }]}
            onPress={() => router.replace('/(app)/running-plan')}
            accessibilityRole="button"
          >
            <Text style={[styles.saveButtonText, { color: colors.primaryText }]}>Save Your Plan</Text>
          </TouchableOpacity>
        ) : null}
        {actions.includes('retry') ? (
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: colors.border }]}
            onPress={() => void retryPlanLookup(fetchWorkoutPlan)}
            disabled={isNavigatingBack || isStartingOver}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Try again</Text>
          </TouchableOpacity>
        ) : null}
        {actions.includes('change_answers') ? (
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: colors.border }]}
            onPress={() => void handleChangeAnswers()}
            disabled={isNavigatingBack || isStartingOver}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              {isNavigatingBack ? 'Returning to your answers…' : 'Change answers'}
            </Text>
          </TouchableOpacity>
        ) : null}
        {actions.includes('start_over') ? (
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: colors.border }]}
            onPress={confirmStartOver}
            disabled={isNavigatingBack || isStartingOver}
            accessibilityRole="button"
          >
            <Text style={[styles.startOverText, { color: '#D32F2F' }]}>
              {isStartingOver ? 'Starting over…' : 'Start over'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.summaryCard,
        {
          backgroundColor: colors.surface,
          borderColor: accent ?? colors.border,
        },
      ]}
    >
      <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.cardValue, accent ? { color: accent } : { color: colors.text }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 20, gap: 14 },
  topBar: { alignItems: 'flex-end', marginBottom: 2 },
  stepBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  stepText: { fontSize: 12, fontWeight: '600' },
  planHero: { alignItems: 'center', justifyContent: 'center', minHeight: 132, borderRadius: 18, borderWidth: 1, padding: 20 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.1, textAlign: 'center' },
  planTitle: { fontSize: 27, lineHeight: 34, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  twoColumnRow: { flexDirection: 'row', gap: 12 },
  summaryCard: { flex: 1, minWidth: 0, minHeight: 82, justifyContent: 'center', borderWidth: 1, borderRadius: 14, padding: 14, gap: 7 },
  cardLabel: { fontSize: 12, fontWeight: '500' },
  cardValue: { fontSize: 16, lineHeight: 21, fontWeight: '700' },
  statusCard: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
  statusValue: { fontSize: 17, fontWeight: '700' },
  reasonHeading: { fontSize: 15, fontWeight: '700', marginBottom: -6 },
  reasonCard: { borderWidth: 1, borderRadius: 14, padding: 16 },
  reasonText: { fontSize: 14, lineHeight: 21 },
  failureCard: { alignItems: 'center', borderWidth: 1, borderRadius: 18, padding: 22, gap: 12, marginTop: 8 },
  failureTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  failureText: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  navigationError: { color: '#D32F2F', textAlign: 'center', fontSize: 13 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, gap: 8 },
  saveButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  saveButtonText: { fontSize: 16, fontWeight: '800' },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontSize: 14, fontWeight: '700' },
  startOverText: { fontSize: 14, fontWeight: '700' },
});
