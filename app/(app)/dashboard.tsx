import { Alert } from '@/components/ThemedAlert';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DashboardText from '../../components/common/DashboardText';
import { RunningLoader } from '../../components/common/RunningLoader';
import MotionEntrance from '../../components/MotionEntrance';
import NotificationBell from '../../components/NotificationBell';
import SettingsMenu from '../../components/SettingsMenu';
import { useNotifications } from '../../contexts/NotificationContext';
import { useQuestionnaire } from '../../contexts/QuestionnaireContext';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../service/auth';
import { customWorkoutAPI, type UserWorkoutResponse } from '../../service/customWorkout';
import { getFcmToken } from '../../service/fcmService';
import { registerNotificationDevice } from '../../service/notificationService';
import { clearActiveRunJournal, flushActiveRunJournal, readActiveRunJournal } from '../../src/services/activeRunJournal';
import { activityAPI, type BackendActivity } from '../../src/services/activityApi';
import {
  clearBackgroundLocationSession,
  getBackgroundLocationSession,
  isBackgroundLocationTrackingStarted,
} from '../../src/services/backgroundLocationTask';
import { offlineWorkoutQueue } from '../../src/services/offlineWorkoutQueue';
import {
  listPendingWorkoutRecoveries,
  savePendingWorkoutRecovery,
} from '../../src/services/pendingWorkoutRecoveries';
import { calculateDistanceMeters } from '../../src/utils/distance';
import { isAssessmentProfileComplete } from '../../utils/profileEligibility';
import { useResponsive } from '../../utils/responsive';
import DashboardActivePlan from './DashboardActivePlan';
import DashboardNoPlan from './DashboardNoPlan';

const NOTIFICATION_PERMISSION_DELAY_MS = 1_000;
const WORKOUT_CHECKPOINT_STALE_AFTER_MS = 30_000;

type RecoverableWorkout = {
  id: string;
  runId: string;
  distanceMeters: number;
  elapsedSeconds: number;
};

const formatRecoveryDuration = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `00:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

interface WeekDayStatus {
  dayName: string;
  dayNumber: number;
  isToday: boolean;
  hasRun: boolean;
}

interface WeeklyStats {
  distanceKm: number;
  runsCount: number;
  durationMinutes: number;
  days: WeekDayStatus[];
}

function calculateWeeklySummary(activities: BackendActivity[]): WeeklyStats {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + distanceToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const mondayTime = monday.getTime();
  const sundayTime = sunday.getTime();

  let distanceMeters = 0;
  let durationSeconds = 0;
  let runsCount = 0;
  const runDatesSet = new Set<string>();

  activities.forEach((act) => {
    if (!act.start_time) return;
    const actDate = new Date(act.start_time);
    const actTime = actDate.getTime();
    if (actTime >= mondayTime && actTime <= sundayTime) {
      distanceMeters += act.distance || 0;
      durationSeconds += act.moving_time || act.elapsed_time || 0;
      runsCount += 1;
      const dateKey = `${actDate.getFullYear()}-${String(actDate.getMonth() + 1).padStart(2, '0')}-${String(actDate.getDate()).padStart(2, '0')}`;
      runDatesSet.add(dateKey);
    }
  });

  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const days: WeekDayStatus[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    const curKey = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
    days.push({
      dayName: dayLabels[i],
      dayNumber: cur.getDate(),
      isToday: curKey === todayKey,
      hasRun: runDatesSet.has(curKey),
    });
  }

  return {
    distanceKm: distanceMeters / 1000,
    runsCount,
    durationMinutes: Math.round(durationSeconds / 60),
    days,
  };
}

export default function DashboardScreen() {
  const { colors, isDark } = useTheme();
  const { spacing, fontSize } = useResponsive();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const userId = user?.id;
  const { unreadCount } = useNotifications();
  const {
    workoutPlan,
    workoutPlanError,
    isWorkoutPlanLoaded,
    isWorkoutPlanLoading,
    fetchWorkoutPlan,
  } = useQuestionnaire();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [offlinePendingCount, setOfflinePendingCount] = useState(0);
  const [isSyncingOffline, setIsSyncingOffline] = useState(false);
  const [recoverableWorkout, setRecoverableWorkout] = useState<RecoverableWorkout | null>(null);
  const [activities, setActivities] = useState<BackendActivity[]>([]);
  const [customWorkouts, setCustomWorkouts] = useState<UserWorkoutResponse[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const permissionRequestStarted = useRef(false);

  const fetchCustomWorkouts = useCallback(async () => {
    try {
      const response = await customWorkoutAPI.list();
      const list: UserWorkoutResponse[] = Array.isArray(response.data)
        ? response.data
        : ((response.data as any)?.results || []);
      setCustomWorkouts(list.filter((w) => w.is_custom !== false && w.plan == null));
    } catch (err) {
      console.warn('[Dashboard] Could not load custom workouts:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchCustomWorkouts();
    }, [fetchCustomWorkouts])
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.allSettled([
        fetchWorkoutPlan(true),
        fetchCustomWorkouts(),
        offlineWorkoutQueue.syncPending(),
        (async () => {
          const freshPage = await activityAPI.listPage(null, 30);
          if (freshPage?.activities) {
            setActivities(freshPage.activities);
          }
        })(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchWorkoutPlan, fetchCustomWorkouts]);

  useFocusEffect(
    useCallback(() => {
      let isCurrent = true;
      void (async () => {
        try {
          const cachedFirstPage = await activityAPI.getCachedFirstPage();
          if (cachedFirstPage?.activities && isCurrent) {
            setActivities(cachedFirstPage.activities);
          }
          const freshPage = await activityAPI.listPage(null, 30);
          if (freshPage?.activities && isCurrent) {
            setActivities(freshPage.activities);
          }
        } catch (err) {
          console.warn('[Dashboard] Could not load activities for weekly widget:', err);
        }
      })();
      return () => {
        isCurrent = false;
      };
    }, [])
  );

  const weeklyStats = useMemo(() => calculateWeeklySummary(activities), [activities]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const findRecoverableWorkout = async () => {
        try {
          let recoveries = await listPendingWorkoutRecoveries();
          if (!isActive) return;
          let recovery = recoveries.find((item) => (
            Boolean(item.session.runId)
            && (!item.session.userId || String(item.session.userId) === String(userId ?? ''))
          ));

          if (!recovery) {
            await flushActiveRunJournal();
            const [legacySession, legacyJournal, trackingStarted] = await Promise.all([
              getBackgroundLocationSession(),
              readActiveRunJournal(),
              isBackgroundLocationTrackingStarted(),
            ]);
            if (!isActive) return;
            const isStaleCheckpoint = legacySession?.updatedAt != null
              && Date.now() - legacySession.updatedAt >= WORKOUT_CHECKPOINT_STALE_AFTER_MS;
            if (
              legacySession?.active
              && legacySession.runId
              && legacyJournal?.active
              && legacyJournal.runId === legacySession.runId
              && !trackingStarted
              && (legacySession.recoveryReviewRequired || isStaleCheckpoint)
              && (!legacySession.userId || String(legacySession.userId) === String(userId ?? ''))
            ) {
              await savePendingWorkoutRecovery(legacySession, legacyJournal);
              await clearActiveRunJournal();
              await clearBackgroundLocationSession();
              recoveries = await listPendingWorkoutRecoveries();
              recovery = recoveries.find((item) => item.id === legacySession.runId);
            }
          }

          if (!isActive) return;
          if (!recovery) {
            setRecoverableWorkout(null);
            return;
          }
          const runId = recovery.session.runId;
          if (!runId) {
            setRecoverableWorkout(null);
            return;
          }
          const { session, journal } = recovery;
          const points = journal.points;
          const journalDistanceMeters = points.slice(1).reduce((total, point, index) => (
            total + calculateDistanceMeters(points[index], point)
          ), 0);
          const sessionDistanceMeters = Number.isFinite(session.distanceKm)
            ? Math.max(0, Number(session.distanceKm) * 1000)
            : journalDistanceMeters;
          setRecoverableWorkout({
            id: recovery.id,
            runId,
            distanceMeters: Math.max(sessionDistanceMeters, journalDistanceMeters),
            elapsedSeconds: Math.max(0, session.elapsedSeconds ?? 0),
          });
        } catch (error) {
          console.warn('[Dashboard] Could not inspect unfinished workout checkpoint', error);
          if (isActive) setRecoverableWorkout(null);
        }
      };

      void findRecoverableWorkout();
      return () => {
        isActive = false;
      };
    }, [userId])
  );

  useEffect(() => {
    const unsubscribe = offlineWorkoutQueue.subscribe((count) => {
      setOfflinePendingCount(count);
    });
    void offlineWorkoutQueue.syncPending();

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void offlineWorkoutQueue.syncPending();
      }
    });

    return () => {
      unsubscribe();
      appStateSub.remove();
    };
  }, []);

  useEffect(() => {
    void fetchWorkoutPlan();
  }, [fetchWorkoutPlan]);

  useFocusEffect(
    useCallback(() => {
      if (
        !user?.id ||
        !isWorkoutPlanLoaded ||
        isWorkoutPlanLoading ||
        permissionRequestStarted.current
      ) {
        return;
      }

      let isActive = true;
      const permissionTimer = setTimeout(() => {
        permissionRequestStarted.current = true;

        void getFcmToken()
          .then(async (token) => {
            if (!isActive || !token) return;
            await registerNotificationDevice(user.id, token);
          })
          .catch((error) => {
            console.warn('[Notifications] Dashboard device registration failed', error);
          });
      }, NOTIFICATION_PERMISSION_DELAY_MS);

      return () => {
        isActive = false;
        clearTimeout(permissionTimer);
      };
    }, [isWorkoutPlanLoaded, isWorkoutPlanLoading, user])
  );

  const canStartAssessment = isAssessmentProfileComplete(user);
  const firstName = user?.first_name?.trim();
  const fallbackName = user?.username?.trim() || user?.email?.split('@')[0]?.trim() || 'Runner';
  const userName = firstName || fallbackName.charAt(0).toUpperCase() + fallbackName.slice(1);

  const greetingTime = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    if (hour >= 17 && hour < 22) return 'Good evening';
    return 'Good night';
  }, []);

  const formattedToday = useMemo(() => {
    const now = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
  }, []);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const workouts = workoutPlan?.weeks.flatMap((week) => week.workouts) ?? [];
  const todayWorkout = workouts.find((workout) => workout.workout_date?.slice(0, 10) === todayKey) ?? null;
  const nextWorkout =
    workouts
      .filter((workout) => workout.workout_date.slice(0, 10) > todayKey)
      .sort((a, b) => a.workout_date.slice(0, 10).localeCompare(b.workout_date.slice(0, 10)))[0] ?? null;

  const todayCustomWorkouts = useMemo(() => {
    return customWorkouts.filter((w) => {
      if (!w.workout_date) return false;
      const cleanDate = w.workout_date.trim().slice(0, 10);
      return cleanDate === todayKey;
    });
  }, [customWorkouts, todayKey]);

  const todayCustomWorkout = todayCustomWorkouts[0] ?? null;

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
    if (option === 'Activities') router.push('/(app)/activity');
    if (option === 'Edit Profile') router.push('/(app)/profile/edit');
    if (option === 'Change Password' || option === 'Set Password') router.push('/(app)/screens/change-password');
    if (option === 'Notifications') router.push('/(app)/screens/notifications');
    if (option === 'Subscription') router.push('/(app)/profile/subscription');
    if (option === 'Logout') {
      Alert.alert('Logout', 'Are you sure you want to logout?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/welcome' as any);
          },
        },
      ]);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Bar with Branding & Actions */}
      <View
        style={[
          styles.topBar,
          {
            borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.border,
            minHeight: spacing(76) + insets.top,
            paddingHorizontal: spacing(20),
            paddingTop: insets.top + spacing(6),
          },
        ]}
      >
        <View style={styles.brandingGroup}>
          <View style={[styles.brandLogoBadge, { backgroundColor: `${BRAND_GREEN}22` }]}>
            <MaterialCommunityIcons name="run-fast" size={20} color={BRAND_GREEN} />
          </View>
          <View>
            <DashboardText style={[styles.brandTitle, { color: colors.text }]}>ZY-RUN</DashboardText>
            <DashboardText style={[styles.brandSubtitle, { color: colors.textSecondary }]}>
              Running Companion
            </DashboardText>
          </View>
        </View>

        <View style={styles.headerActions}>
          <NotificationBell
            onPress={() => router.push('/(app)/screens/notifications')}
            badgeCount={unreadCount ?? 0}
          />
          <TouchableOpacity
            style={[
              styles.headerButton,
              {
                width: spacing(42),
                height: spacing(42),
                borderRadius: spacing(21),
                backgroundColor: colors.surfaceRaised,
                borderColor: colors.border,
              },
            ]}
            onPress={() => setSettingsVisible(true)}
            accessibilityLabel="Open settings"
          >
            <Feather name="settings" size={spacing(20)} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: spacing(18), paddingBottom: spacing(118) },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={BRAND_GREEN}
            colors={[BRAND_GREEN]}
          />
        }
      >
        {/* Unfinished Workout Recovery Banner */}
        {recoverableWorkout ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Review unfinished workout"
            activeOpacity={0.85}
            onPress={() => router.push({
              pathname: '/(app)/screens/map',
              params: {
                recoveryReview: '1',
                recoveryId: recoverableWorkout.id,
                runId: recoverableWorkout.runId,
              },
            })}
            style={{
              minHeight: 76,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              marginBottom: spacing(14),
              paddingHorizontal: spacing(16),
              paddingVertical: spacing(12),
              borderRadius: 20,
              borderWidth: 1.5,
              borderColor: `${BRAND_GREEN}88`,
              backgroundColor: colors.surface,
            }}
          >
            <Feather name="corner-up-left" size={24} color={colors.text} />
            <View style={{ flex: 1 }}>
              <DashboardText style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>
                Unfinished workout found
              </DashboardText>
              <DashboardText style={{ color: colors.textSecondary, fontSize: 13, marginTop: 3 }}>
                {(recoverableWorkout.distanceMeters / 1000).toFixed(2)} km ·{' '}
                {formatRecoveryDuration(recoverableWorkout.elapsedSeconds)}
              </DashboardText>
            </View>
            <DashboardText style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>Review</DashboardText>
          </TouchableOpacity>
        ) : null}

        {/* 1. Welcoming Dynamic Greeting Card */}
        <MotionEntrance>
          <View
            style={[
              styles.greetingCard,
              {
                backgroundColor: colors.surface,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.border,
              },
            ]}
          >
            <View style={styles.greetingHeader}>
              <View style={styles.greetingTextColumn}>
                <DashboardText style={[styles.greetingTimeText, { color: colors.textSecondary }]}>
                  {greetingTime} 👋
                </DashboardText>
                <DashboardText
                  style={[styles.greetingNameText, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {userName}
                </DashboardText>
              </View>
              <View style={[styles.dayBadge, { backgroundColor: `${BRAND_GREEN}14` }]}>
                <Feather name="calendar" size={12} color={BRAND_GREEN} style={{ marginRight: 4 }} />
                <DashboardText style={[styles.dayBadgeText, { color: BRAND_GREEN }]}>
                  {formattedToday}
                </DashboardText>
              </View>
            </View>
            <DashboardText style={[styles.motivationText, { color: colors.textSecondary }]}>
              Every kilometer counts toward your goals. Let&apos;s get moving today! 👟
            </DashboardText>
          </View>
        </MotionEntrance>

        {/* 3. Quick Action Shortcuts Bar */}
        <MotionEntrance delay={45}>
          <View style={styles.quickShortcutsRow}>
            <TouchableOpacity
              style={[
                styles.quickShortcutPill,
                {
                  backgroundColor: colors.surface,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.border,
                },
              ]}
              onPress={() => router.push('/(app)/screens/map')}
              activeOpacity={0.8}
            >
              <View style={[styles.quickShortcutIcon, { backgroundColor: `${BRAND_GREEN}18` }]}>
                <Feather name="play" size={13} color={BRAND_GREEN} />
              </View>
              <DashboardText style={[styles.quickShortcutLabel, { color: colors.text }]}>
                Quick Run
              </DashboardText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.quickShortcutPill,
                {
                  backgroundColor: colors.surface,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.border,
                },
              ]}
              onPress={() => router.push('/(app)/custom-workout')}
              activeOpacity={0.8}
            >
              <View style={[styles.quickShortcutIcon, { backgroundColor: 'rgba(255, 149, 0, 0.18)' }]}>
                <Feather name="sliders" size={13} color="#FF9500" />
              </View>
              <DashboardText style={[styles.quickShortcutLabel, { color: colors.text }]}>
                Custom
              </DashboardText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.quickShortcutPill,
                {
                  backgroundColor: colors.surface,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.border,
                },
              ]}
              onPress={() => router.push('/(app)/training-plan')}
              activeOpacity={0.8}
            >
              <View style={[styles.quickShortcutIcon, { backgroundColor: 'rgba(10, 132, 255, 0.18)' }]}>
                <Feather name="calendar" size={13} color="#0A84FF" />
              </View>
              <DashboardText style={[styles.quickShortcutLabel, { color: colors.text }]}>
                Plan
              </DashboardText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.quickShortcutPill,
                {
                  backgroundColor: colors.surface,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.border,
                },
              ]}
              onPress={() => router.push('/(app)/stats')}
              activeOpacity={0.8}
            >
              <View style={[styles.quickShortcutIcon, { backgroundColor: 'rgba(175, 82, 222, 0.18)' }]}>
                <Feather name="bar-chart-2" size={13} color="#AF52DE" />
              </View>
              <DashboardText style={[styles.quickShortcutLabel, { color: colors.text }]}>
                Stats
              </DashboardText>
            </TouchableOpacity>
          </View>
        </MotionEntrance>

        {/* Offline Workouts Pending Sync Banner */}
        {offlinePendingCount > 0 && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={async () => {
              setIsSyncingOffline(true);
              const result = await offlineWorkoutQueue.syncPending();
              setIsSyncingOffline(false);
              if (result.synced > 0 && result.failed === 0) {
                Alert.alert('Sync Successful', `Successfully synced ${result.synced} workout(s) to your account.`);
              } else if (result.synced > 0 && result.failed > 0) {
                Alert.alert('Partial Sync', `Synced ${result.synced} workout(s), but ${result.failed} failed:\n\n${result.lastError}`);
              } else if (result.failed > 0) {
                Alert.alert(
                  'Sync Incomplete',
                  result.lastError || 'Could not connect to the server. Please check your internet connection and try again.',
                  [
                    { text: 'Retry Later', style: 'cancel' },
                    {
                      text: 'Discard Pending',
                      style: 'destructive',
                      onPress: () => {
                        Alert.alert(
                          'Discard Offline Workouts?',
                          'Are you sure you want to discard these unsynced test workouts? This cannot be undone.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Discard',
                              style: 'destructive',
                              onPress: () => void offlineWorkoutQueue.clear(),
                            },
                          ]
                        );
                      },
                    },
                  ]
                );
              }
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#1E293B',
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 12,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: '#38BDF8',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <Feather name="cloud-off" size={20} color="#38BDF8" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 14 }}>
                  {offlinePendingCount} {offlinePendingCount === 1 ? 'workout' : 'workouts'} saved offline
                </Text>
                <Text style={{ color: '#94A3B8', fontSize: 12 }}>
                  {isSyncingOffline ? 'Syncing to cloud...' : 'Tap to sync now or syncs automatically online'}
                </Text>
              </View>
            </View>
            {isSyncingOffline ? (
              <ActivityIndicator size="small" color="#38BDF8" />
            ) : (
              <Feather name="refresh-cw" size={16} color="#38BDF8" />
            )}
          </TouchableOpacity>
        )}

        {/* Offline Network Mode Notice Banner */}
        {Boolean(workoutPlanError) && (
          <View
            style={[
              styles.offlineModeBanner,
              {
                backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB',
                borderColor: isDark ? 'rgba(245, 158, 11, 0.32)' : '#FDE68A',
              },
            ]}
          >
            <View style={styles.offlineModeLeft}>
              <View style={[styles.offlineModeIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.18)' }]}>
                <Feather name="wifi-off" size={15} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <DashboardText style={[styles.offlineModeTitle, { color: isDark ? '#FDE68A' : '#92400E' }]}>
                  Offline Mode · GPS Tracking Active
                </DashboardText>
                <DashboardText style={[styles.offlineModeDesc, { color: isDark ? '#D6D3D1' : '#B45309' }]}>
                  You can record runs offline. All workouts save securely on device and sync when back online.
                </DashboardText>
              </View>
            </View>
            <TouchableOpacity
              style={[
                styles.offlineModeRetryBtn,
                { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.22)' : 'rgba(245, 158, 11, 0.15)' },
              ]}
              onPress={() => {
                void fetchWorkoutPlan(true);
                void fetchCustomWorkouts();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.75}
            >
              <Feather name="refresh-cw" size={12} color="#D97706" />
              <DashboardText style={[styles.offlineModeRetryText, { color: '#D97706' }]}>
                Retry
              </DashboardText>
            </TouchableOpacity>
          </View>
        )}

        {/* 4. Active Plan vs No Plan vs Loading State */}
        <MotionEntrance delay={60}>
          {workoutPlan ? (
            <DashboardActivePlan
              plan={workoutPlan}
              todayWorkout={todayWorkout}
              nextWorkout={nextWorkout}
              scheduledCustomWorkout={todayCustomWorkout}
              scheduledCustomWorkouts={todayCustomWorkouts}
            />
          ) : isWorkoutPlanLoading && !workoutPlanError ? (
            <View
              style={[
                styles.loadingCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <RunningLoader size={36} label="Loading your dashboard..." />
            </View>
          ) : (
            <DashboardNoPlan
              canStartAssessment={canStartAssessment}
              onStartAssessment={startAssessment}
              scheduledCustomWorkout={todayCustomWorkout}
              scheduledCustomWorkouts={todayCustomWorkouts}
            />
          )}
        </MotionEntrance>
      </ScrollView>

      <SettingsMenu
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        onSelect={handleSettingsOption}
        hasPassword={user?.hasPassword ?? null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E0F' },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brandingGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  brandLogoBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  brandSubtitle: {
    fontSize: 11,
    fontWeight: '600',
  },
  headerButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
  content: { paddingHorizontal: 18, paddingBottom: 118 },
  greetingCard: {
    padding: 16,
    marginBottom: 14,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  greetingHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  greetingTextColumn: {
    flex: 1,
    marginRight: 10,
  },
  greetingTimeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  greetingNameText: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 1,
  },
  dayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  dayBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  motivationText: {
    fontSize: 12,
    lineHeight: 17,
  },
  weeklyCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.25,
    marginBottom: 14,
    gap: 12,
  },
  weeklyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weeklyTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  weeklyIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weeklyLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  weeklyRunsSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  weeklyDistanceBox: {
    alignItems: 'flex-end',
  },
  weeklyDistanceNum: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  weeklyDistanceUnit: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: -2,
  },
  streakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  streakPill: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 14,
    minWidth: 40,
    gap: 4,
  },
  streakPillToday: {
    borderWidth: 1,
    borderColor: BRAND_GREEN,
  },
  streakPillHasRun: {
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
  },
  streakDayName: {
    fontSize: 11,
    fontWeight: '600',
  },
  streakDotCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakDotHasRun: {
    backgroundColor: BRAND_GREEN,
  },
  streakDotToday: {
    backgroundColor: 'rgba(48, 209, 88, 0.25)',
  },
  streakDayNum: {
    fontSize: 11,
    fontWeight: '600',
  },
  quickShortcutsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  quickShortcutPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  quickShortcutIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickShortcutLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#0B0E0F' },
  centerText: { color: '#F7F7F7', textAlign: 'center', marginTop: 14 },
  retry: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  offlineContainer: { gap: 16 },
  recordButton: {
    width: '100%',
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 20,
    backgroundColor: BRAND_GREEN,
    shadowColor: BRAND_GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  recordText: {
    color: '#081009',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  offlineModeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    gap: 10,
  },
  offlineModeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  offlineModeIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineModeTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  offlineModeDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  offlineModeRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  offlineModeRetryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  loadingCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
