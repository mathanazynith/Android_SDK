import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../service/auth';
import { Colors, Spacing } from '../../constants/theme';
import NotificationBell from '../../components/NotificationBell';
import SettingsMenu from '../../components/SettingsMenu';
import { storage } from '../../service/storage';

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

  useEffect(() => { loadSavedPlan(); }, []);

  const loadSavedPlan = async () => {
    try {
      const planData = await storage.getItem(storage.KEYS.TRAINING_PLAN);
      if (planData) {
        setSavedPlan(JSON.parse(planData));
        setHasSavedPlan(true);
      } else {
        setHasSavedPlan(false);
        setSavedPlan(null);
      }
    } catch (error) {
      console.error('Error loading saved plan:', error);
      setHasSavedPlan(false);
    }
  };

  const isProfileComplete = () => {
    const profile = user?.profile;
    return !!(user?.first_name && user?.last_name && user?.username && profile?.gender && profile?.date_of_birth && profile?.height_cm && profile?.weight_kg);
  };

  const getTodayWorkout = () => {
    if (!savedPlan || !savedPlan.weeklyWorkouts) return null;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return savedPlan.weeklyWorkouts.find((w: WorkoutDay) => w.day === days[new Date().getDay()]);
  };

  const handleGetPlan = () => {
    if (hasSavedPlan) {
      router.push('/questionnaire');
      return;
    }
    if (!isProfileComplete()) {
      Alert.alert('Complete Your Profile', 'Please complete your profile before generating a training plan. This includes adding your gender, date of birth, height, and weight.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Go to Profile', onPress: () => router.push('/(app)/profile/edit') },
      ]);
      return;
    }
    router.push('/(app)/questionnaire');
  };

  const handleSettingsOption = (option: string) => {
    setSettingsVisible(false);
    switch (option) {
      case 'Edit Profile': router.push('/(app)/profile/edit'); break;
      case 'Change Password': router.push('/(app)/screens/change-password'); break;
      case 'Notifications': router.push('/(app)/screens/notifications'); break;
      case 'Logout':
        Alert.alert('Logout', 'Are you sure you want to logout?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Logout', style: 'destructive', onPress: async () => { await logout(); router.replace('/(auth)/login'); } },
        ]);
        break;
    }
  };

  const quickActions = [
    { label: 'Start Run', icon: '▶️', route: '/(app)/run' },
    { label: 'Get My Plan', icon: '📋', route: null },
    { label: 'History', icon: '📊', route: '/(app)/history' },
    { label: 'Achievements', icon: '🏆', route: '/(app)/achievements' },
  ];
  const todayWorkout = getTodayWorkout();
  const isRestDay = todayWorkout?.workout === 'Rest' || todayWorkout?.workout === 'Rest Day';
  const completedProfile = isProfileComplete();
  const scheduledRuns = savedPlan?.weeklyWorkouts?.filter((w: WorkoutDay) => w.workout !== 'Rest' && w.workout !== 'Rest Day').length || 0;
  const planLabel = hasSavedPlan ? 'View My Plan' : !completedProfile ? 'Complete Profile First' : 'Get My Plan';

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.pageTitle}>Dashboard</Text>
        <View style={styles.headerIcons}>
          <NotificationBell onPress={() => router.push('/(app)/attendance')} />
          <TouchableOpacity accessibilityLabel="Open settings" style={styles.settingsButton} onPress={() => setSettingsVisible(true)}>
            <Feather name="settings" size={23} color="#D8D8D8" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Welcome</Text>
          <Text style={styles.welcomeEmail}>{user?.email || 'Your running journey starts here'}</Text>
        </View>

        <View style={[styles.card, styles.statusCard]}>
          <View>
            <Text style={styles.cardTitle}>Account Status</Text>
            <Text style={styles.cardSubtitle}>{user?.email ? 'Email Verified' : 'Account ready'}</Text>
            <View style={styles.activeRow}><Feather name="check" size={21} color="#2BD64F" /><Text style={styles.activeText}>Active</Text></View>
          </View>
          <View style={styles.statusIcon}><Feather name="check" size={40} color="#0D2512" /></View>
        </View>

        <View style={styles.card}>
          <Text style={styles.assessmentTitle}>Health Assessment</Text>
          <Text style={styles.assessmentDescription}>Complete your personalized{`\n`}health assessment</Text>
          <TouchableOpacity style={[styles.primaryCta, !completedProfile && styles.primaryCtaDisabled]} onPress={handleGetPlan} disabled={!completedProfile && !hasSavedPlan}>
            <Feather name="clipboard" size={22} color="#FFFFFF" /><Text style={styles.primaryCtaText}>Start Assessment</Text>
          </TouchableOpacity>
          {!completedProfile && <TouchableOpacity onPress={() => router.push('/(app)/profile/edit')} style={styles.completeProfileLink}><Text style={styles.completeProfileText}>Complete your profile to continue</Text></TouchableOpacity>}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Training Plan</Text>
          <Text style={styles.planDescription}>
            {hasSavedPlan && todayWorkout
              ? (isRestDay ? 'Today is an active recovery day.' : `${todayWorkout.workout} · ${todayWorkout.distance}`)
              : 'Answer a few questions and generate\nyour personalized running plan.'}
          </Text>
          <TouchableOpacity style={styles.primaryCta} onPress={hasSavedPlan ? () => router.push('/(app)/training-plan') : handleGetPlan}>
            <Feather name={hasSavedPlan ? 'eye' : 'activity'} size={22} color="#FFFFFF" /><Text style={styles.primaryCtaText}>{planLabel}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}><Text style={styles.statLabel}>Distance Today</Text><Text style={styles.statValue}>{todayWorkout && !isRestDay ? todayWorkout.distance : '0 km'}</Text></View>
          <View style={styles.statCard}><Text style={styles.statLabel}>This Week</Text><Text style={styles.statValue}>{savedPlan ? `${scheduledRuns} runs` : 'N/A'}</Text></View>
        </View>

        <View style={styles.quickActionsCard}>
          <Text style={styles.cardTitle}>Quick Actions</Text>
          <View style={styles.quickActionsContainer}>
            {quickActions.map((action) => (
              <TouchableOpacity key={action.label} style={styles.circularAction} onPress={() => {
                if (action.label === 'Get My Plan') handleGetPlan();
                else if (action.route) router.push(action.route as any);
              }}>
                <View style={[styles.circularIcon, action.label === 'Get My Plan' && styles.circularIconHighlight]}><Text style={styles.circularIconText}>{action.icon}</Text></View>
                <Text style={[styles.circularLabel, action.label === 'Get My Plan' && styles.circularLabelHighlight]}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.profileLink} onPress={() => router.push('/(app)/profile')}>
          <Feather name="user" size={18} color={Colors.primary} /><Text style={styles.profileLinkText}>View Full Profile</Text>
        </TouchableOpacity>
      </ScrollView>

      <SettingsMenu visible={settingsVisible} onClose={() => setSettingsVisible(false)} onSelect={handleSettingsOption} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E0F' },
  topBar: { minHeight: 178, paddingHorizontal: 35, paddingTop: 56, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#282B2D' },
  pageTitle: { color: '#F7F7F7', fontSize: 42, fontWeight: '700', letterSpacing: -1 },
  headerIcons: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  settingsButton: { marginTop: 2, padding: Spacing.xs },
  scrollContent: { paddingHorizontal: 35, paddingBottom: 44 },
  welcomeSection: { paddingTop: 35, paddingBottom: 30 },
  welcomeTitle: { color: '#F7F7F7', fontSize: 30, lineHeight: 38, fontWeight: '700' },
  welcomeEmail: { color: '#ADAFB1', fontSize: 22, marginTop: 4 },
  card: { backgroundColor: '#242627', borderWidth: 1.25, borderColor: '#65686A', borderRadius: 39, padding: 29, marginBottom: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.22, shadowRadius: 18, elevation: 5 },
  statusCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: '#F2F2F2', fontSize: 24, fontWeight: '700' },
  cardSubtitle: { color: '#AEB0B2', fontSize: 22, marginTop: 7 },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 },
  activeText: { color: '#2BD64F', fontSize: 22, fontWeight: '700' },
  statusIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#2BD64F', alignItems: 'center', justifyContent: 'center' },
  assessmentTitle: { color: '#079DFF', fontSize: 25, fontWeight: '700' },
  assessmentDescription: { color: '#079DFF', fontSize: 23, lineHeight: 31, textAlign: 'center', marginVertical: 29 },
  primaryCta: { minHeight: 76, borderRadius: 21, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 13, backgroundColor: '#2CBD08' },
  primaryCtaDisabled: { backgroundColor: '#4B6248' },
  primaryCtaText: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  completeProfileLink: { alignItems: 'center', paddingTop: 14 },
  completeProfileText: { color: '#AEB0B2', fontSize: 14 },
  planDescription: { color: '#F0F0F0', fontSize: 22, lineHeight: 30, marginTop: 25, marginBottom: 25 },
  statsRow: { flexDirection: 'row', gap: 16, marginBottom: 30 },
  statCard: { flex: 1, minHeight: 128, borderRadius: 28, backgroundColor: '#242627', borderWidth: 1.25, borderColor: '#65686A', padding: 19, justifyContent: 'center' },
  statLabel: { color: '#ADAFB1', fontSize: 14, marginBottom: 7 },
  statValue: { color: '#F7F7F7', fontSize: 25, fontWeight: '700' },
  quickActionsCard: { backgroundColor: '#242627', borderWidth: 1.25, borderColor: '#65686A', borderRadius: 30, padding: 22, marginBottom: 24 },
  quickActionsContainer: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap', marginTop: 18 },
  circularAction: { alignItems: 'center', gap: Spacing.xs, width: 70 },
  circularIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.surfaceLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary + '40' },
  circularIconHighlight: { backgroundColor: Colors.primary + '20', borderColor: Colors.primary, borderWidth: 2 },
  circularIconText: { fontSize: 24 },
  circularLabel: { color: Colors.textSecondary, textAlign: 'center', fontSize: 12 },
  circularLabelHighlight: { color: Colors.primary, fontWeight: '600' },
  profileLink: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: Colors.primary, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  profileLinkText: { color: Colors.primary, fontSize: 16, fontWeight: '700' },
});
