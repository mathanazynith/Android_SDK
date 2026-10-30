import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
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
    fetchWorkoutPlan,
    reset,
  } = useQuestionnaire();
  const didRequestWorkoutPlan = useRef(false);
  const noPlanAlertShown = useRef(false);

  const restartAssessment = useCallback(async () => {
    try {
      await reset();
      router.replace('/(app)/questionnaire');
    } catch (error) {
      console.error('[PlanRecommendation] Failed to restart assessment:', error);
      Alert.alert(
        'Unable to restart assessment',
        'We could not clear the saved assessment data. Please try again.',
      );
    }
  }, [reset]);

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

  useEffect(() => {
    if (
      !assessmentId
      || !isComplete
      || !isWorkoutPlanLoaded
      || isWorkoutPlanLoading
      || workoutPlan
      || workoutPlanError
      || noPlanAlertShown.current
    ) {
      return;
    }

    noPlanAlertShown.current = true;
    Alert.alert(
      'Plan currently not available',
      'Plan currently not available for these entered values.',
      [{ text: 'OK', onPress: () => { void restartAssessment(); } }],
      { cancelable: false },
    );
  }, [
    assessmentId,
    isComplete,
    isWorkoutPlanLoaded,
    isWorkoutPlanLoading,
    restartAssessment,
    workoutPlan,
    workoutPlanError,
  ]);

  if (!assessmentId || !isComplete) return null;

  if (isAssessmentResultLoading || isWorkoutPlanLoading || !isWorkoutPlanLoaded) {
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
            paddingBottom: Math.max(112, insets.bottom + 100),
          },
        ]}
      >
        <View style={styles.topBar}>
          <View style={[styles.stepBadge, { borderColor: colors.border }]}>
            <Feather name="check" size={16} color={colors.primary} />
            <Text style={[styles.stepText, { color: colors.textSecondary }]}>Assessment Complete</Text>
          </View>
        </View>

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
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom + 8), backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: colors.primary }]}
          onPress={() => {
            if (!workoutPlan) {
              Alert.alert('Plan currently not available');
              return;
            }
            router.replace('/(app)/running-plan');
          }}
          accessibilityRole="button"
        >
          <Text style={[styles.saveButtonText, { color: colors.primaryText }]}>Save Your Plan</Text>
        </TouchableOpacity>
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
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12 },
  saveButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  saveButtonText: { fontSize: 16, fontWeight: '800' },
});
