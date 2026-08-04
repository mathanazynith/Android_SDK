import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useQuestionnaire } from '../../../contexts/QuestionnaireContext';

interface ScheduledRun {
  day: string;
  runType: string;
  distance: string;
  duration: string;
  pace: string;
  description: string;
}

interface RunningEvent {
  id: string;
  name: string;
  date: string;
  distance: string;
  type: string;
  location: string;
  time: string;
  registered: boolean;
}

interface RunningPlan {
  planName: string;
  planType: string;
  weeklyDays: number;
  totalWeeks: number;
  schedule: ScheduledRun[];
  events: RunningEvent[];
  summary: {
    totalWeeklyDistance: string;
    longRunDay: string;
    averagePace: string;
  };
}

const normalizeScheduledRun = (item: any): ScheduledRun => ({
  day: item?.day ?? item?.name ?? 'Day',
  runType: item?.runType ?? item?.type ?? item?.workout ?? item?.activity ?? 'Easy Run',
  distance: item?.distance ?? item?.duration ?? item?.target ?? 'TBD',
  duration: item?.duration ?? item?.time ?? item?.durationText ?? 'TBD',
  pace: item?.pace ?? item?.speed ?? item?.targetPace ?? 'TBD',
  description: item?.description ?? item?.details ?? item?.note ?? 'Keep moving and stay consistent.',
});

const normalizeRunningEvent = (item: any): RunningEvent => ({
  id: String(item?.id ?? item?.event_id ?? item?.name ?? Math.random()),
  name: item?.name ?? item?.title ?? 'Local Running Event',
  date: item?.date ?? item?.event_date ?? 'TBD',
  distance: item?.distance ?? item?.event_distance ?? item?.type ?? 'TBD',
  type: item?.type ?? item?.event_type ?? 'Run',
  location: item?.location ?? item?.venue ?? 'Nearby Location',
  time: item?.time ?? item?.start_time ?? 'TBD',
  registered: Boolean(item?.registered ?? item?.is_registered ?? false),
});

const extractBackendPlan = (assessmentResult: any): any => {
  const recommendation = assessmentResult?.recommendation;
  if (__DEV__ && recommendation == null) {
    console.warn(
      '[RunningPlanScreen] assessmentResult.recommendation is missing. Expected recommendation.recommended_plan and recommendation.reason.',
      assessmentResult
    );
  }
  return (
    assessmentResult?.assessment?.running_plan ??
    assessmentResult?.running_plan ??
    recommendation?.recommended_plan ??
    null
  );
};

const extractBackendSchedule = (plan: any, week: number): ScheduledRun[] | null => {
  // NOTE: The current recommendation payload may only include recommended_plan metadata and not a day-by-day schedule.
  // If the backend returns only plan metadata, schedule extraction will fail and the UI should not silently fall back.
  if (!plan) return null;

  const scheduleCandidates = [
    plan?.schedule,
    plan?.weekly_schedule,
    plan?.weeklySchedule,
    plan?.daily_runs,
    plan?.dailyRuns,
    plan?.runs,
    plan?.workouts,
    plan?.days,
    plan?.plan,
    plan,
  ];

  const scheduleArray = scheduleCandidates.find((candidate) => Array.isArray(candidate));
  if (Array.isArray(scheduleArray)) {
    if (scheduleArray.length === 0) return null;

    const weekMatches = scheduleArray.filter((item) => {
      const weekValue = item?.week ?? item?.week_number ?? item?.weekNo ?? item?.weekIndex;
      return weekValue === week;
    });

    if (weekMatches.length > 0) {
      return weekMatches.map(normalizeScheduledRun);
    }

    if (Array.isArray(scheduleArray[0])) {
      const weekList = scheduleArray[week - 1] ?? scheduleArray[week] ?? scheduleArray[0];
      if (Array.isArray(weekList)) {
        return weekList.map(normalizeScheduledRun);
      }
    }

    if (typeof scheduleArray[0] === 'object' && scheduleArray[0] !== null && scheduleArray[0]?.day) {
      return scheduleArray.map(normalizeScheduledRun);
    }
  }

  const scheduleObject = scheduleCandidates.find((candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate));
  if (scheduleObject && typeof scheduleObject === 'object') {
    const weekKey = Object.keys(scheduleObject).find((key) => {
      const normalizedKey = String(key).toLowerCase();
      return normalizedKey.includes(`week${week}`) || normalizedKey.includes(`week_${week}`) || normalizedKey === String(week) || normalizedKey === `w${week}`;
    });

    const weekSchedule = weekKey ? scheduleObject[weekKey] : null;
    if (Array.isArray(weekSchedule)) {
      return weekSchedule.map(normalizeScheduledRun);
    }

    if (weekSchedule && typeof weekSchedule === 'object') {
      return Object.values(weekSchedule).map(normalizeScheduledRun);
    }
  }

  return null;
};

const extractBackendEvents = (assessmentResult: any): RunningEvent[] | null => {
  const events =
    assessmentResult?.assessment?.recommended_events ??
    assessmentResult?.recommended_events ??
    assessmentResult?.assessment?.events ??
    assessmentResult?.events ??
    null;

  if (!Array.isArray(events)) return null;
  return events.map(normalizeRunningEvent);
};

export default function RunningPlanScreen() {
  const { assessmentResult, isAssessmentResultLoading, fetchAssessmentResult } = useQuestionnaire();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<RunningPlan | null>(null);

  useEffect(() => {
    const backendPlan = extractBackendPlan(assessmentResult);
    const backendSchedule = extractBackendSchedule(backendPlan, 1);
    const backendEvents = extractBackendEvents(assessmentResult);

    if (!assessmentResult?.recommendation) {
      if (__DEV__) {
        console.warn(
          '[RunningPlanScreen] assessmentResult.recommendation is missing. Running plan may not be available from backend response.',
          assessmentResult
        );
      }
    }

    if (backendPlan && backendSchedule && backendSchedule.length > 0) {
      const weeklyDays = Number(backendPlan?.weekly_days ?? backendPlan?.weeklyDays ?? backendPlan?.days_per_week ?? 0);
      const totalWeeks = Number(backendPlan?.duration_weeks ?? backendPlan?.total_weeks ?? backendPlan?.weeks?.length ?? 0);
      const longRunDay = backendSchedule.find((run) => String(run.runType).toLowerCase().includes('long'))?.day ?? '';

      setPlan({
        planName: String(backendPlan?.name ?? backendPlan?.title ?? 'Recommended Running Plan'),
        planType: String(backendPlan?.type ?? backendPlan?.planType ?? 'recommended'),
        weeklyDays: weeklyDays || 0,
        totalWeeks: totalWeeks || 0,
        schedule: backendSchedule,
        events: backendEvents ?? [],
        summary: {
          totalWeeklyDistance: String(backendPlan?.totalWeeklyDistance ?? backendPlan?.summary?.totalWeeklyDistance ?? 'TBD'),
          longRunDay,
          averagePace: String(backendPlan?.averagePace ?? backendPlan?.summary?.averagePace ?? 'TBD'),
        },
      });
    } else {
      setPlan(null);
    }

    setLoading(false);
  }, [assessmentResult]);

  const acceptPlan = () => {
    Alert.alert(
      'Plan Created!',
      'Your running plan has been generated. You can view it anytime from your dashboard.',
      [{ text: 'Go to Dashboard', onPress: () => router.replace('/(app)/dashboard') }]
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Generating your running plan...</Text>
      </View>
    );
  }

  const handleRetry = async () => {
    setLoading(true);
    await fetchAssessmentResult();
    setLoading(false);
  };

  if (!plan) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to generate plan</Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🏃 Your Running Plan</Text>
        <Text style={styles.planType}>{plan.planName}</Text>
        <Text style={styles.planDetails}>
          {plan.weeklyDays} days/week • {plan.totalWeeks} weeks
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Weekly Schedule</Text>
        {plan.schedule.map((run: ScheduledRun, index: number) => (
          <View key={index} style={styles.scheduleCard}>
            <View style={styles.scheduleHeader}>
              <Text style={styles.dayName}>{run.day}</Text>
              {run.runType === 'Long Run' && (
                <View style={styles.longRunChip}>
                  <Text style={styles.longRunChipText}>🏃 Long Run</Text>
                </View>
              )}
            </View>
            <Text style={styles.runType}>{run.runType}</Text>
            <Text style={styles.runInfo}>{run.distance} • {run.duration}</Text>
            <Text style={styles.runPace}>Pace: {run.pace}</Text>
            <Text style={styles.runDescription}>{run.description}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Upcoming Events</Text>
        {plan.events.map((event: RunningEvent, index: number) => (
          <View key={index} style={styles.eventCard}>
            <Text style={styles.eventName}>{event.name}</Text>
            <Text style={styles.eventDetails}>📅 {event.date} • {event.time}</Text>
            <Text style={styles.eventDetails}>📍 {event.location}</Text>
            <Text style={styles.eventDetails}>🏁 {event.distance}</Text>
            <TouchableOpacity style={styles.registerButton}>
              <Text style={styles.registerButtonText}>Register</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.acceptButton} onPress={acceptPlan}>
        <Text style={styles.acceptButtonText}>Accept & Go to Dashboard</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#ff4444',
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    marginTop: 16,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  planType: {
    fontSize: 18,
    color: '#007AFF',
    fontWeight: '600',
    marginTop: 4,
  },
  planDetails: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  scheduleCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  scheduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dayName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  longRunChip: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  longRunChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  runType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  runInfo: {
    fontSize: 14,
    color: '#333',
    marginTop: 4,
  },
  runPace: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  runDescription: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
    fontStyle: 'italic',
  },
  eventCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B6B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  eventName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  eventDetails: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  registerButton: {
    backgroundColor: '#28a745',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  registerButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  acceptButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    margin: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});