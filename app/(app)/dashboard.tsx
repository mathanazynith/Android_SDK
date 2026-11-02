import { Alert } from '@/components/ThemedAlert';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { offlineWorkoutQueue } from '../../src/services/offlineWorkoutQueue';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MotionEntrance from '../../components/MotionEntrance';
import { RunningLoader } from '../../components/common/RunningLoader';
import NotificationBell from '../../components/NotificationBell';
import SettingsMenu from '../../components/SettingsMenu';
import { useNotifications } from '../../contexts/NotificationContext';
import { useQuestionnaire } from '../../contexts/QuestionnaireContext';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../service/auth';
import { getFcmToken } from '../../service/fcmService';
import { registerNotificationDevice } from '../../service/notificationService';
import { isAssessmentProfileComplete } from '../../utils/profileEligibility';
import { useResponsive } from '../../utils/responsive';
import DashboardActivePlan from './DashboardActivePlan';
import DashboardNoPlan from './DashboardNoPlan';
// import { LocationService } from '../../src/services/locationService';
// import { getWeatherByLocation, type WeatherData } from '../../service/weather';

const NOTIFICATION_PERMISSION_DELAY_MS = 1_000;

export default function DashboardScreen() {
  const { colors } = useTheme();
  const { spacing, fontSize } = useResponsive();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
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
  const permissionRequestStarted = useRef(false);

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
  // const [weather, setWeather] = useState<WeatherData | null>(null);
  // const [loadingWeather, setLoadingWeather] = useState(true);
  // const [weatherError, setWeatherError] = useState<string | null>(null);

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
    }, [isWorkoutPlanLoaded, isWorkoutPlanLoading, user]),
  );

  // useEffect(() => {
  //   let isActive = true;

  //   const fetchWeatherData = async () => {
  //     try {
  //       setLoadingWeather(true);
  //       setWeatherError(null);

  //       const hasPermission = await LocationService.requestForegroundPermissions();
  //       if (!hasPermission) {
  //         throw new Error('Location permission is required for weather');
  //       }

  //       const location = await LocationService.getCurrentLocation();
  //       const weatherData = await getWeatherByLocation(location.latitude, location.longitude);

  //       if (isActive) setWeather(weatherData);
  //     } catch (error) {
  //       console.error('Failed to fetch weather:', error);
  //       if (isActive) setWeatherError('Weather unavailable');
  //     } finally {
  //       if (isActive) setLoadingWeather(false);
  //     }
  //   };

  //   void fetchWeatherData();
  //   return () => {
  //     isActive = false;
  //   };
  // }, []);

  const profile = user?.profile;
  const canStartAssessment = isAssessmentProfileComplete(user);
  const userName = user?.username?.trim() || user?.email?.split('@')[0]?.trim() || 'Runner';
  // const parsedTemperature = weather?.temperature == null ? null : Number(weather.temperature);
  // const weatherTemperature = parsedTemperature != null && Number.isFinite(parsedTemperature)
  //   ? `${Math.round(parsedTemperature)}°C`
  //   : '--';
  // const humidityValue = weather?.humidity ?? weather?.relativeHumidity;
  // const parsedHumidity = humidityValue == null ? null : Number(humidityValue);
  // const weatherHumidity = parsedHumidity != null && Number.isFinite(parsedHumidity)
  //   ? `${Math.round(parsedHumidity)}%%`
  //   : '--';
  // const weatherCondition = weather?.condition?.toLowerCase() ?? '';
  // const weatherIcon = weatherCondition.includes('rain') || weatherCondition.includes('drizzle')
  //   ? 'cloud-rain'
  //   : weatherCondition.includes('storm') || weatherCondition.includes('thunder')
  //     ? 'cloud-lightning'
  //     : weatherCondition.includes('cloud') || weatherCondition.includes('overcast')
  //       ? 'cloud'
  //       : 'sun';
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
    if (option === 'Change Password' || option === 'Set Password') router.push('/(app)/screens/change-password');
    if (option === 'Notifications') router.push('/(app)/screens/notifications');
    if (option === 'Subscription') router.push('/(app)/profile/subscription');
    if (option === 'Logout') {
      Alert.alert('Logout', 'Are you sure you want to logout?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: async () => { await logout(); router.replace('/(auth)/login'); } },
      ]);
    }
  };



  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border, minHeight: spacing(82) + insets.top, paddingHorizontal: spacing(28), paddingTop: insets.top + spacing(8) }]}>
        <Text style={[styles.pageTitle, { color: colors.text, fontSize: fontSize(28, 24, 30) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Dashboard</Text>
        <View style={styles.headerActions}>
          <NotificationBell
            onPress={() => router.push('/(app)/screens/notifications')}
            badgeCount={unreadCount ?? 0}
          />
          <TouchableOpacity style={[styles.headerButton, { width: spacing(46), height: spacing(46), borderRadius: spacing(23), backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} onPress={() => setSettingsVisible(true)}><Feather name="settings" size={spacing(23)} color={colors.textSecondary} /></TouchableOpacity>
        </View>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: spacing(20), paddingBottom: spacing(118) }]} showsVerticalScrollIndicator={false}>
        <MotionEntrance>
          <View style={[styles.greeting, { minHeight: spacing(82), paddingHorizontal: spacing(18), paddingVertical: spacing(14), marginBottom: spacing(14), backgroundColor: colors.surface }]}>
            <Text style={[styles.greetingText, { color: colors.text, fontSize: fontSize(24, 20, 26) }]} numberOfLines={2}><Text>Hi </Text><Text style={[styles.name, { color: BRAND_GREEN }]}>{userName}</Text></Text>
              {/*
              <TouchableOpacity
                accessibilityLabel="Open current weather details"
                style={[styles.weather, { backgroundColor: colors.surface, borderColor: BRAND_GREEN }]}
                onPress={() => router.push('./screens/weather-details')}
              >
                {loadingWeather ? <RunningLoader size={22} fillColor={BRAND_GREEN} /> : weather?.iconUrl ? <Image source={{ uri: weather.iconUrl }} style={{ width: spacing(24), height: spacing(24) }} /> : <Feather name={weatherIcon} size={spacing(24)} color={BRAND_GREEN} />}
                <View>
                  <Text style={[styles.weatherValue, { color: colors.text }]} numberOfLines={1}>{weather?.city || weather?.locationName || 'Current location'}</Text>
                  <Text style={[styles.weatherValue, { color: colors.textSecondary }]}>{weatherTemperature}</Text>
                  <View style={styles.weatherHumidity}>
                    <Feather name="droplet" size={spacing(11)} color={colors.textSecondary} />
                    <Text style={[styles.weatherValue, { color: colors.textSecondary }]}>{weatherHumidity}</Text>
                  </View>
                  {weatherError ? <Text style={[styles.weatherStatus, { color: colors.textTertiary }]}>{weatherError}</Text> : null}
                </View>
              </TouchableOpacity>
              */}
          </View>
        </MotionEntrance>
        {offlinePendingCount > 0 && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={async () => {
              setIsSyncingOffline(true);
              await offlineWorkoutQueue.syncPending();
              setIsSyncingOffline(false);
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
        <MotionEntrance delay={55}>
          {workoutPlan ? (
            <DashboardActivePlan todayWorkout={todayWorkout} nextWorkout={nextWorkout} />
          ) : workoutPlanError ? (
            <View style={styles.offlineContainer}>
              <TouchableOpacity
                style={[styles.recordButton, { backgroundColor: BRAND_GREEN }]}
                onPress={() => router.push('/(app)/screens/map')}
                activeOpacity={0.85}
              >
                <Feather name="play" size={24} color="#081009" />
                <Text style={styles.recordText}>Record Workout</Text>
              </TouchableOpacity>

              <View style={[styles.offlineCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Feather name="wifi-off" size={28} color="#FFB020" style={{ marginBottom: 8 }} />
                <Text style={[styles.offlineTitle, { color: colors.text }]}>
                  Network connection error
                </Text>
                <Text style={[styles.offlineSubtext, { color: colors.textSecondary }]}>
                  {workoutPlanError || 'Could not connect to the internet. You can still record workouts offline.'}
                </Text>
                <TouchableOpacity
                  style={[styles.retryBtn, { backgroundColor: BRAND_GREEN }]}
                  onPress={() => void fetchWorkoutPlan(true)}
                  activeOpacity={0.85}
                >
                  <Feather name="refresh-cw" size={16} color="#081009" />
                  <Text style={styles.retryBtnText}>Try again</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : isWorkoutPlanLoading ? (
            <View style={styles.offlineContainer}>
              <TouchableOpacity
                style={[styles.recordButton, { backgroundColor: BRAND_GREEN }]}
                onPress={() => router.push('/(app)/screens/map')}
                activeOpacity={0.85}
              >
                <Feather name="play" size={24} color="#081009" />
                <Text style={styles.recordText}>Record Workout</Text>
              </TouchableOpacity>
              <View style={[styles.offlineCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <RunningLoader size={36} label="Loading your dashboard..." />
              </View>
            </View>
          ) : (
            <DashboardNoPlan canStartAssessment={canStartAssessment} onStartAssessment={startAssessment} />
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
  topBar: { minHeight: 82, paddingHorizontal: 28, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#282B2D' },
  pageTitle: { color: '#F7F7F7', fontSize: 28, fontWeight: '700', fontStyle: 'italic' },
  headerButton: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#25282A', borderWidth: 1, borderColor: '#55595B' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  content: { paddingHorizontal: 20, paddingBottom: 118 },
  greeting: { minHeight: 82, paddingHorizontal: 18, paddingVertical: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#050607', borderRadius: 22 },
  greetingText: { color: '#F7F7F7', fontSize: 24, fontWeight: '700', flex: 1, marginRight: 10 },
  name: { color: '#88C99A' },
  weather: { minHeight: 64, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1.5, flexShrink: 0 },
  weatherLabel: { color: '#DDE2DE', fontSize: 12, fontWeight: '700' },
  weatherValue: { color: '#DDE2DE', fontSize: 11, lineHeight: 14 },
  // weatherHumidity: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  // weatherStatus: { fontSize: 9, lineHeight: 12 },
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
  offlineCard: {
    borderRadius: 22,
    borderWidth: 1.25,
    padding: 22,
    alignItems: 'center',
  },
  offlineTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  offlineSubtext: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryBtnText: {
    color: '#081009',
    fontSize: 14,
    fontWeight: '700',
  },
});
