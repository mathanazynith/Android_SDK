import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { useQuestionnaire } from '../../../contexts/QuestionnaireContext';
import { Ionicons } from '@expo/vector-icons';

const RECOMMENDED_PLAN_KEYWORDS = ['5k', 'c25k', 'couch to 5k', 'beginner', 'starter'];

const getNumberValue = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const normalizeLabel = (value: unknown, fallback: string) => {
  if (value === undefined || value === null) return fallback;
  return String(value);
};

const getPlanType = (plan: any) => {
  if (!plan) return 'Recommended';
  return (
    normalizeLabel(plan?.category, '') ||
    normalizeLabel(plan?.type, '') ||
    normalizeLabel(plan?.slug, '') ||
    'Recommended'
  );
};

const getPlanDescription = (plan: any, reason?: string) => {
  if (plan?.description) return String(plan.description);
  if (reason) return String(reason);
  return 'This plan is based on your assessment results.';
};

const getDaysPerWeek = (assessmentResult: any, recommendedPlan: any) => {
  const value =
    recommendedPlan?.weekly_days ??
    recommendedPlan?.days_per_week ??
    recommendedPlan?.training_days_available ??
    assessmentResult?.computed_values?.TRAINING_DAYS_AVAILABLE?.value;
  return getNumberValue(value);
};

export default function CalendarScreen() {
  const { assessmentResult, isAssessmentResultLoading } = useQuestionnaire();

  const recommendation = assessmentResult?.recommendation;
  const recommendedPlan = recommendation?.recommended_plan;
  const recommendationReason = recommendation?.reason;

  const planName = normalizeLabel(
    recommendedPlan?.name ?? recommendedPlan?.title,
    'Recommended Plan'
  );
  const planType = getPlanType(recommendedPlan);
  const planDurationWeeks = getNumberValue(
    recommendedPlan?.duration_weeks ?? recommendedPlan?.total_weeks
  );
  const userDays = getDaysPerWeek(assessmentResult, recommendedPlan);
  const planDescription = getPlanDescription(recommendedPlan, recommendationReason);
  const isFiveKPlan = RECOMMENDED_PLAN_KEYWORDS.some((keyword) =>
    planName.toLowerCase().includes(keyword)
  );

  if (isAssessmentResultLoading || !recommendation) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#34C759" />
          <Text style={styles.loadingText}>Loading your recommended plan...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!recommendedPlan) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>No recommended plan was returned from the backend.</Text>
          <Text style={styles.errorSubtext}>
            Please try again later or contact support if the issue continues.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <Text style={styles.greetingText}>🏃 Your Running Plan</Text>
            <View style={styles.badge}>
              <Ionicons name="sparkles" size={14} color="#1A1A1A" />
              <Text style={styles.badgeText}>AI Coach</Text>
            </View>
          </View>

          <Text style={styles.pageTitle}>Recommended Plan</Text>
          <Text style={styles.planName}>{planName}</Text>
          <Text style={styles.planType}>{planType}</Text>
          <Text style={styles.planDescription}>{planDescription}</Text>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Days / Week</Text>
            <Text style={styles.summaryValue}>{userDays || '-'}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Duration</Text>
            <Text style={styles.summaryValue}>{planDurationWeeks ? `${planDurationWeeks} weeks` : '-'}</Text>
          </View>
          <View style={[styles.summaryCard, isFiveKPlan && styles.highlightCard]}>
            <Text style={styles.summaryLabel}>Plan Type</Text>
            <Text style={[styles.summaryValue, isFiveKPlan && styles.highlightText]}>{planType}</Text>
          </View>
        </View>

        <View style={styles.detailSection}>
          <Text style={styles.detailHeader}>Why this plan?</Text>
          <Text style={styles.detailText}>{planDescription}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('./training-plan')}>
            <Text style={styles.primaryButtonText}>View Training Plan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('./running-plan')}>
            <Text style={styles.secondaryButtonText}>View Running Plan</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 32,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F5F7FA',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    maxWidth: 320,
  },
  heroCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#34C759',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  badgeText: {
    color: '#1A1A1A',
    fontSize: 12,
    fontWeight: '700',
  },
  pageTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 18,
  },
  planName: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 12,
  },
  planType: {
    color: '#D1D1D6',
    fontSize: 14,
    marginTop: 6,
  },
  planDescription: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    marginTop: 14,
    lineHeight: 22,
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  highlightCard: {
    backgroundColor: '#FFF7E6',
  },
  summaryLabel: {
    color: '#8E8E93',
    fontSize: 12,
    marginBottom: 10,
    fontWeight: '600',
  },
  summaryValue: {
    color: '#1A1A1A',
    fontSize: 20,
    fontWeight: '800',
  },
  highlightText: {
    color: '#FF9500',
  },
  detailSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 20,
  },
  detailHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 10,
  },
  detailText: {
    fontSize: 14,
    color: '#4A4A4A',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'column',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#34C759',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#34C759',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '700',
  },
});
