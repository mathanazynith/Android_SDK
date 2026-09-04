import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../service/auth';
import SettingsMenu from '../../components/SettingsMenu';
import { useQuestionnaire } from '../../contexts/QuestionnaireContext';
import DashboardNoPlan from './DashboardNoPlan';
import DashboardActivePlan from './DashboardActivePlan';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';
import { useResponsive } from '../../utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// import { LocationService } from '../../src/services/locationService';
// import { getWeatherByLocation, type WeatherData } from '../../service/weather';

export default function DashboardScreen() {
  const { colors } = useTheme();
  const { spacing, fontSize } = useResponsive();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { workoutPlan, workoutPlanError, isWorkoutPlanLoading, fetchWorkoutPlan } = useQuestionnaire();
  const [settingsVisible, setSettingsVisible] = useState(false);
  // const [weather, setWeather] = useState<WeatherData | null>(null);
  // const [loadingWeather, setLoadingWeather] = useState(true);
  // const [weatherError, setWeatherError] = useState<string | null>(null);

  useEffect(() => {
    void fetchWorkoutPlan();
  }, [fetchWorkoutPlan]);

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
  const canStartAssessment = Boolean(
    user?.first_name && user?.last_name && user?.username && profile?.gender &&
    profile?.date_of_birth && profile?.height_cm && profile?.weight_kg,
  );
  const userName = user?.first_name?.trim() || user?.username?.trim() || 'Runner';
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
      <View style={[styles.topBar, { borderBottomColor: colors.border, minHeight: spacing(82) + insets.top, paddingHorizontal: spacing(28), paddingTop: insets.top + spacing(8) }]}>
        <Text style={[styles.pageTitle, { color: colors.text, fontSize: fontSize(28, 24, 30) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Dashboard</Text>
        <TouchableOpacity style={[styles.headerButton, { width: spacing(46), height: spacing(46), borderRadius: spacing(23), backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} onPress={() => setSettingsVisible(true)}><Feather name="settings" size={spacing(23)} color={colors.textSecondary} /></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: spacing(20), paddingBottom: spacing(118) }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.greeting, { minHeight: spacing(82), paddingHorizontal: spacing(18), paddingVertical: spacing(14), marginBottom: spacing(14), backgroundColor: colors.surface }]}>
          <Text style={[styles.greetingText, { color: colors.text, fontSize: fontSize(24, 20, 26) }]} numberOfLines={2}><Text>Hi </Text><Text style={[styles.name, { color: BRAND_GREEN }]}>{userName}</Text></Text>
              {/*
              <TouchableOpacity
                accessibilityLabel="Open current weather details"
                style={[styles.weather, { backgroundColor: colors.surface, borderColor: BRAND_GREEN }]}
                onPress={() => router.push('./screens/weather-details')}
              >
                {loadingWeather ? <ActivityIndicator size="small" color={BRAND_GREEN} /> : weather?.iconUrl ? <Image source={{ uri: weather.iconUrl }} style={{ width: spacing(24), height: spacing(24) }} /> : <Feather name={weatherIcon} size={spacing(24)} color={BRAND_GREEN} />}
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
        {workoutPlan ? <DashboardActivePlan todayWorkout={todayWorkout} nextWorkout={nextWorkout} /> : <DashboardNoPlan canStartAssessment={canStartAssessment} onStartAssessment={startAssessment} />}
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
});
