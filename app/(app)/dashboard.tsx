import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../service/auth';
import SettingsMenu from '../../components/SettingsMenu';
import { useQuestionnaire } from '../../contexts/QuestionnaireContext';
import GlobalBottomNav from '../../components/navigation/GlobalBottomNav';
import DashboardNoPlan from './DashboardNoPlan';
import DashboardActivePlan from './DashboardActivePlan';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';

export default function DashboardScreen() {
  const { colors } = useTheme();
  const { user, logout } = useAuth();
  const { workoutPlan, workoutPlanError, isWorkoutPlanLoading, fetchWorkoutPlan } = useQuestionnaire();
  const [settingsVisible, setSettingsVisible] = useState(false);

  useEffect(() => {
    void fetchWorkoutPlan();
  }, [fetchWorkoutPlan]);

  const profile = user?.profile;
  const canStartAssessment = Boolean(
    user?.first_name && user?.last_name && user?.username && profile?.gender &&
    profile?.date_of_birth && profile?.height_cm && profile?.weight_kg,
  );
  const userName = user?.first_name?.trim() || user?.username?.trim() || 'Runner';
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const workouts = workoutPlan?.weeks.flatMap((week) => week.workouts) ?? [];
  const todayWorkout = workouts.find((workout) => workout.workout_date === todayKey) ?? null;
  const nextWorkout = workouts
    .filter((workout) => workout.workout_date > todayKey)
    .sort((a, b) => a.workout_date.localeCompare(b.workout_date))[0] ?? null;

  const startAssessment = () => {
    if (!canStartAssessment) {
      Alert.alert('Complete Your Profile', 'Please complete your profile before starting the assessment.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Go to Profile', onPress: () => router.push('/(app)/profile/edit') },
      ]);
      return;
    }
    router.push('/(app)/questionnaire');
  };

  const handleSettingsOption = (option: string) => {
    setSettingsVisible(false);
    if (option === 'Edit Profile') router.push('/(app)/profile/edit');
    if (option === 'Change Password') router.push('/(app)/screens/change-password');
    if (option === 'Notifications') router.push('/(app)/screens/notifications');
    if (option === 'Plan') router.push('/(app)/training-plan');
    if (option === 'Logout') {
      Alert.alert('Logout', 'Are you sure you want to logout?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: async () => { await logout(); router.replace('/(auth)/login'); } },
      ]);
    }
  };

  if (isWorkoutPlanLoading && !workoutPlan) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={BRAND_GREEN} /><Text style={[styles.centerText, { color: colors.text }]}>Loading your dashboard...</Text></View>;
  }

  if (workoutPlanError && !workoutPlan) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><Feather name="alert-circle" size={32} color="#FFB020" /><Text style={[styles.centerText, { color: colors.text }]}>{workoutPlanError}</Text><TouchableOpacity style={[styles.retry, { backgroundColor: BRAND_GREEN }]} onPress={() => void fetchWorkoutPlan(true)}><Text style={[styles.retryText, { color: colors.background }]}>Try again</Text></TouchableOpacity></View>;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <Text style={[styles.pageTitle, { color: colors.text }]}>Dashboard</Text>
        <TouchableOpacity style={[styles.headerButton, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} onPress={() => setSettingsVisible(true)}><Feather name="settings" size={23} color={colors.textSecondary} /></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.greeting, { backgroundColor: colors.surface }]}>
          <Text style={[styles.greetingText, { color: colors.text }]}>Welcome <Text style={[styles.name, { color: BRAND_GREEN }]}>{userName}</Text></Text>
          <TouchableOpacity style={[styles.weather, { borderColor: BRAND_GREEN }]} onPress={() => router.push('./screens/weather-details')}>
            <Feather name="cloud" size={24} color={BRAND_GREEN} />
            <View>
              <Text style={[styles.weatherLabel, { color: colors.text }]}>Weather</Text>
              <Text style={[styles.weatherValue, { color: colors.textSecondary }]}>Chennai</Text>
              <Text style={[styles.weatherValue, { color: colors.textSecondary }]}>28 C</Text>
            </View>
          </TouchableOpacity>
        </View>
        {workoutPlan ? <DashboardActivePlan todayWorkout={todayWorkout} nextWorkout={nextWorkout} /> : <DashboardNoPlan canStartAssessment={canStartAssessment} onStartAssessment={startAssessment} />}
      </ScrollView>
      <GlobalBottomNav />
      <SettingsMenu visible={settingsVisible} onClose={() => setSettingsVisible(false)} onSelect={handleSettingsOption} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E0F' },
  topBar: { minHeight: 82, paddingHorizontal: 28, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#282B2D' },
  pageTitle: { color: '#F7F7F7', fontSize: 28, fontWeight: '700', fontStyle: 'italic' },
  headerButton: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#25282A', borderWidth: 1, borderColor: '#55595B' },
  content: { paddingHorizontal: 20, paddingBottom: 118 },
  greeting: { minHeight: 82, paddingHorizontal: 18, paddingVertical: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#050607', borderRadius: 22 },
  greetingText: { color: '#F7F7F7', fontSize: 24, fontWeight: '700' },
  name: { color: '#88C99A' },
  weather: { minHeight: 64, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1.5 },
  weatherLabel: { color: '#DDE2DE', fontSize: 12, fontWeight: '700' },
  weatherValue: { color: '#DDE2DE', fontSize: 11, lineHeight: 14 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#0B0E0F' },
  centerText: { color: '#F7F7F7', textAlign: 'center', marginTop: 14 },
  retry: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
});
