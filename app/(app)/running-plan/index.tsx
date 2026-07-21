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
import { router, useLocalSearchParams } from 'expo-router';
import { useQuestionnaire } from '../../../contexts/QuestionnaireContext';
import { getAnswerValue } from '../../../service/questionnaire/questionnaireService';
 
interface RunningDay {
  day: string;
  dayIndex: number;
  selected: boolean;
  isLongRun: boolean;
}
 
interface ScheduledRun {
  day: string;
  runType: 'Easy Run' | 'Tempo Run' | 'Interval Run' | 'Long Run';
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
 
export default function RunningPlanScreen() {
  const { answers } = useQuestionnaire();
  const params = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<any>(null);
  const [selectedDays, setSelectedDays] = useState<RunningDay[]>([]);
  const [userDays, setUserDays] = useState<number>(3);
 
  useEffect(() => {
    generatePlan();
  }, []);
 
  const generatePlan = () => {
    try {
      // Parse params
      const days = JSON.parse(params.selectedDays as string || '[]');
      const daysNum = parseInt(params.userDays as string || '3');
      setSelectedDays(days);
      setUserDays(daysNum);
 
      // Get user data from questionnaire
      const hasRunBefore = getAnswerValue(answers, 'q1') === 'yes';
      const recentDistance = getAnswerValue(answers, 'q2');
      const recentTime = getAnswerValue(answers, 'q3');
      const eventDistance = getAnswerValue(answers, 'q6');
 
      // Determine if should start with 5K
      const shouldStartWith5K = !hasRunBefore || daysNum < 3;
 
      // Generate schedule
      const schedule: ScheduledRun[] = days.map((day: RunningDay) => {
        let runType: 'Easy Run' | 'Tempo Run' | 'Interval Run' | 'Long Run';
        let distance: string;
        let duration: string;
        let pace: string;
        let description: string;
 
        if (day.isLongRun) {
          runType = 'Long Run';
          distance = shouldStartWith5K ? '5K' : '10K';
          duration = shouldStartWith5K ? '30-40 min' : '60-75 min';
          pace = shouldStartWith5K ? '7:00/km' : '6:30/km';
          description = shouldStartWith5K
            ? 'Build endurance at a comfortable pace'
            : 'Focus on maintaining steady pace';
        } else {
          const types: ('Easy Run' | 'Tempo Run' | 'Interval Run')[] = ['Easy Run', 'Tempo Run', 'Interval Run'];
          const typeIndex = Math.floor(Math.random() * types.length);
          runType = types[typeIndex];
 
          if (runType === 'Easy Run') {
            distance = shouldStartWith5K ? '3K' : '5K';
            duration = '20-30 min';
            pace = '7:30/km';
            description = 'Recovery run, keep heart rate low';
          } else if (runType === 'Tempo Run') {
            distance = shouldStartWith5K ? '4K' : '6K';
            duration = '25-35 min';
            pace = '6:45/km';
            description = 'Moderate intensity, build stamina';
          } else {
            distance = shouldStartWith5K ? '3K' : '5K';
            duration = '20-25 min';
            pace = '6:15/km';
            description = 'High intensity intervals';
          }
        }
 
        return {
          day: day.day,
          runType,
          distance,
          duration,
          pace,
          description,
        };
      });
 
      // Generate mock events
      const events: RunningEvent[] = [
        {
          id: '1',
          name: shouldStartWith5K ? 'City 5K Fun Run' : 'Riverside 10K Challenge',
          date: '2024-12-15',
          distance: shouldStartWith5K ? '5K' : '10K',
          type: shouldStartWith5K ? '5K' : '10K',
          location: shouldStartWith5K ? 'Central Park, NY' : 'Riverside Trail, Boston',
          time: '8:00 AM',
          registered: false,
        },
        {
          id: '2',
          name: shouldStartWith5K ? 'Community 5K Run' : 'Half Marathon Prep',
          date: '2025-01-20',
          distance: shouldStartWith5K ? '5K' : '21.1K',
          type: shouldStartWith5K ? '5K' : 'Half Marathon',
          location: shouldStartWith5K ? 'Community Park, Austin' : 'Downtown Square, Chicago',
          time: '7:30 AM',
          registered: false,
        },
        {
          id: '3',
          name: 'Spring 5K Challenge',
          date: '2025-03-10',
          distance: '5K',
          type: '5K',
          location: 'Sunset Boulevard, LA',
          time: '8:30 AM',
          registered: false,
        },
      ];
 
      const planName = shouldStartWith5K ? 'Beginner 5K Plan' : 'Custom Running Plan';
 
      setPlan({
        planName,
        planType: shouldStartWith5K ? 'beginner_5k' : 'intermediate',
        weeklyDays: daysNum,
        totalWeeks: shouldStartWith5K ? 8 : 12,
        schedule,
        events,
        summary: {
          totalWeeklyDistance: shouldStartWith5K ? '15K' : '25K',
          longRunDay: days.find((d: RunningDay) => d.isLongRun)?.day || 'Sunday',
          averagePace: shouldStartWith5K ? '7:00/km' : '6:30/km',
        },
      });
 
      setLoading(false);
    } catch (error) {
      console.error('Error generating plan:', error);
      setLoading(false);
    }
  };
 
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
 
  if (!plan) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to generate plan</Text>
        <TouchableOpacity style={styles.retryButton} onPress={generatePlan}>
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
 