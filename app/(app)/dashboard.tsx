// app/(app)/dashboard.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../service/auth';
import { GradientHeader } from '../../components/GradientHeader';
import { AppCard } from '../../components/AppCard';
import { StatCard } from '../../components/StatCard';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import NotificationBell from '../../components/NotificationBell';
import SettingsMenu from '../../components/SettingsMenu';
import { storage } from '../../service/storage';
import { Feather } from '@expo/vector-icons';

interface WorkoutDay {
  day: string;
  workout: string;
  distance: string;
  intensity: 'Easy' | 'Hard' | 'Medium';
  icon: string;
  color: string;
}

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [savedPlan, setSavedPlan] = useState<any>(null);
  const [hasSavedPlan, setHasSavedPlan] = useState(false);

  useEffect(() => {
    loadSavedPlan();
  }, []);

  const loadSavedPlan = async () => {
    try {
      const planData = await storage.getItem(storage.KEYS.TRAINING_PLAN);
      if (planData) {
        const parsed = JSON.parse(planData);
        setSavedPlan(parsed);
        setHasSavedPlan(true);
      } else {
        setHasSavedPlan(false);
        setSavedPlan(null);
      }
    } catch (error) {
      console.error("Error loading saved plan:", error);
      setHasSavedPlan(false);
    }
  };

  const fullName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  // Get today's workout from saved plan
  const getTodayWorkout = () => {
    if (!savedPlan || !savedPlan.weeklyWorkouts) return null;
    
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = days[new Date().getDay()];
    
    const todayWorkout = savedPlan.weeklyWorkouts.find((w: WorkoutDay) => w.day === today);
    return todayWorkout;
  };

  const todayWorkout = getTodayWorkout();
  const isRestDay = todayWorkout?.workout === 'Rest' || todayWorkout?.workout === 'Rest Day';

  const quickActions = [
    { label: 'Start Run', icon: '▶️', route: '/(app)/run' },
    { label: 'Training Plan', icon: '📋', route: '/(app)/training-plan' },
    { label: 'History', icon: '📊', route: '/(app)/history' },
    { label: 'Achievements', icon: '🏆', route: '/(app)/achievements' },
  ];

  const handleSettingsOption = (option: string) => {
    setSettingsVisible(false);
    switch (option) {
      case 'Edit Profile':
        router.push('/(app)/profile/edit');
        break;
      case 'Change Password':
        router.push('/(app)/screens/change-password');
        break;
      case 'Notifications':
        router.push('/(app)/screens/notifications');
        break;
      case 'Logout':
        Alert.alert('Logout', 'Are you sure you want to logout?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Logout',
            style: 'destructive',
            onPress: async () => {
              await logout();
              router.replace('/(auth)/login');
            },
          },
        ]);
        break;
      default:
        break;
    }
  };

  return (
    <View style={styles.container}>
      <GradientHeader
        title="Dashboard"
        subtitle={`${getGreeting()}, ${fullName || 'User'}`}
        rightIcon={
          <View style={styles.headerIcons}>
            <NotificationBell onPress={() => router.push('/(app)/attendance')} />
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => setSettingsVisible(true)}
            >
              <Text style={styles.settingsIcon}>⚙️</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Stats Row */}
        <View style={styles.statsRow}>
          <StatCard
            title="Distance Today"
            value={todayWorkout && !isRestDay ? todayWorkout.distance : '0 km'}
            icon={<Text>🏃</Text>}
          />
          <StatCard
            title="This Week"
            value={savedPlan ? `${savedPlan.weeklyWorkouts?.filter((w: WorkoutDay) => w.workout !== 'Rest' && w.workout !== 'Rest Day').length || 0} runs` : 'N/A'}
            icon={<Text>📅</Text>}
          />
        </View>
        <View style={styles.statsRow}>
          <StatCard
            title="Plan Type"
            value={savedPlan?.isFiveKPlan ? '5K Plan' : savedPlan?.isBeginner ? 'Beginner' : 'Custom'}
            icon={<Text>📋</Text>}
          />
          <StatCard
            title="Week"
            value={savedPlan ? `Week ${savedPlan.selectedWeek || 1}` : 'N/A'}
            icon={<Text>📊</Text>}
          />
        </View>

        {/* Today's Workout - NEW */}
        {hasSavedPlan && todayWorkout && (
          <AppCard variant="elevated" padding={Spacing.md} style={styles.todayWorkoutCard}>
            <View style={styles.todayWorkoutHeader}>
              <Text style={styles.sectionTitle}>Today's Workout</Text>
              <Text style={styles.todayDay}>{todayWorkout.day}</Text>
            </View>
            {isRestDay ? (
              <View style={styles.restDayContainer}>
                <Text style={styles.restDayEmoji}>🧘</Text>
                <Text style={styles.restDayText}>Rest Day - Active Recovery</Text>
                <Text style={styles.restDaySubtext}>Take a well-deserved break!</Text>
              </View>
            ) : (
              <View style={styles.workoutPreview}>
                <View style={styles.workoutPreviewHeader}>
                  <Text style={styles.workoutPreviewName}>{todayWorkout.workout}</Text>
                  <View style={[styles.intensityBadge, { backgroundColor: todayWorkout.color }]}>
                    <Text style={styles.intensityBadgeText}>{todayWorkout.intensity}</Text>
                  </View>
                </View>
                <View style={styles.workoutPreviewDetails}>
                  <Text style={styles.workoutPreviewDistance}>{todayWorkout.distance}</Text>
                  <Text style={styles.workoutPreviewIcon}>{todayWorkout.icon}</Text>
                </View>
              </View>
            )}
            <TouchableOpacity
              style={styles.viewPlanButton}
              onPress={() => router.push('/(app)/training-plan')}
            >
              <Text style={styles.viewPlanButtonText}>View Full Plan</Text>
              <Feather name="arrow-right" size={16} color="#1A1A1A" />
            </TouchableOpacity>
          </AppCard>
        )}

        {/* No Plan Message */}
        {!hasSavedPlan && (
          <AppCard variant="elevated" padding={Spacing.md} style={styles.noPlanCard}>
            <Text style={styles.noPlanEmoji}>📋</Text>
            <Text style={styles.noPlanTitle}>No Training Plan Yet</Text>
            <Text style={styles.noPlanSubtext}>
              Complete the questionnaire to generate your personalized training plan.
            </Text>
            <TouchableOpacity
              style={styles.generatePlanButton}
              onPress={() => router.push('/(app)/questionnaire')}
            >
              <Text style={styles.generatePlanButtonText}>Generate Plan</Text>
            </TouchableOpacity>
          </AppCard>
        )}

        {/* Quick Actions */}
        <AppCard variant="elevated" padding={Spacing.md} style={styles.quickActionsCard}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsContainer}>
            {quickActions.map((action, index) => (
              <TouchableOpacity
                key={index}
                style={styles.circularAction}
                onPress={() => {
                  if (action.route) {
                    router.push(action.route as any);
                  } else {
                    Alert.alert('Coming Soon', 'This feature is being developed.');
                  }
                }}
              >
                <View style={styles.circularIcon}>
                  <Text style={styles.circularIconText}>{action.icon}</Text>
                </View>
                <Text style={styles.circularLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </AppCard>

        <View style={styles.profileLink}>
          <PrimaryButton
            title="View Full Profile"
            onPress={() => router.push('/(app)/profile')}
            variant="outline"
          />
        </View>
      </ScrollView>

      <SettingsMenu
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        onSelect={handleSettingsOption}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  settingsButton: { padding: Spacing.xs },
  settingsIcon: { fontSize: 22, color: Colors.text },
  statsRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  quickActionsCard: { marginBottom: Spacing.md },
  sectionTitle: { ...Typography.h4, color: Colors.text, marginBottom: Spacing.md },
  quickActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
  },
  circularAction: { alignItems: 'center', gap: Spacing.xs, width: 70 },
  circularIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  circularIconText: { fontSize: 24 },
  circularLabel: { ...Typography.caption, color: Colors.textSecondary, textAlign: 'center' },
  profileLink: { marginTop: Spacing.md, marginBottom: Spacing.xl },

  // Today's Workout Styles
  todayWorkoutCard: {
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: '#34C759',
  },
  todayWorkoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  todayDay: {
    ...Typography.body,
    fontWeight: '700',
    color: '#34C759',
  },
  workoutPreview: {
    paddingVertical: Spacing.sm,
  },
  workoutPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  workoutPreviewName: {
    ...Typography.h4,
    color: Colors.text,
    fontWeight: '600',
  },
  intensityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
  },
  intensityBadgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  workoutPreviewDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 4,
  },
  workoutPreviewDistance: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  workoutPreviewIcon: {
    fontSize: 20,
  },
  restDayContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  restDayEmoji: {
    fontSize: 32,
    marginBottom: 4,
  },
  restDayText: {
    ...Typography.h4,
    color: Colors.text,
    fontWeight: '500',
  },
  restDaySubtext: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  viewPlanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: '#34C75920',
    borderRadius: BorderRadius.md,
  },
  viewPlanButtonText: {
    ...Typography.body,
    color: '#1A1A1A',
    fontWeight: '600',
  },

  // No Plan Styles
  noPlanCard: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    marginBottom: Spacing.md,
  },
  noPlanEmoji: {
    fontSize: 48,
    marginBottom: Spacing.sm,
  },
  noPlanTitle: {
    ...Typography.h3,
    color: Colors.text,
    fontWeight: '600',
  },
  noPlanSubtext: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  generatePlanButton: {
    backgroundColor: '#34C759',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
  },
  generatePlanButtonText: {
    ...Typography.body,
    color: '#1A1A1A',
    fontWeight: '600',
  },
});