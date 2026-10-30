import { Alert } from '@/components/ThemedAlert';
import { BlurTargetView } from 'expo-blur';
import { Stack, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { BackHandler, Platform, View } from 'react-native';
import GlobalBottomNav, { isPrimaryTabPath } from '../../components/navigation/GlobalBottomNav';
import TabZoomTransition from '../../components/navigation/TabZoomTransition';

export default function AppLayout() {
  const pathname = usePathname();
  const showBottomNav = isPrimaryTabPath(pathname);
  const blurTargetRef = useRef<View | null>(null);
  const isIOS = Platform.OS === 'ios';

  useEffect(() => {
    if (!showBottomNav) return;

    const handleBackPress = () => {
      Alert.alert('Exit App', 'Are you sure you want to close the app?', [
        { text: 'Cancel', onPress: () => null, style: 'cancel' },
        { text: 'OK', onPress: () => BackHandler.exitApp() },
      ]);
      return true;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => backHandler.remove();
  }, [showBottomNav]);

  const renderScreen = ({ route, children }: { route: { key: string; name: string }; children: React.ReactElement }) =>
    route.name === 'profile'
      ? children
      : <TabZoomTransition key={route.key}>{children}</TabZoomTransition>;

  const stackContent = (
    <Stack
      screenOptions={{ headerShown: false, animation: 'none' }}
      screenLayout={renderScreen}
    >
      <Stack.Screen name="dashboard" options={{ animation: 'none' }} />
      <Stack.Screen name="stats" options={{ animation: 'none' }} />
      <Stack.Screen name="screens/weather-details" />
      <Stack.Screen name="home" />
      <Stack.Screen name="history" />
      <Stack.Screen name="run" />
      <Stack.Screen name="profile/edit" />
      <Stack.Screen name="profile/subscription" />
      <Stack.Screen name="questionnaire" options={{ headerShown: false }} />
      <Stack.Screen name="plan-recommendation" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="training-plan" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="training-plan/workout-details" options={{ headerShown: false, presentation: 'card', animation: 'slide_from_right' }} />
      <Stack.Screen name="calendar" options={{ headerShown: false }} />
      <Stack.Screen name="activity/index" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="profile" options={{ animation: 'none' }} />
      <Stack.Screen name="activity/[id]" />
      <Stack.Screen name="custom-workout" options={{ headerShown: false }} />
      <Stack.Screen name="workout-setup" options={{ headerShown: false }} />
    </Stack>
  );

  return (
    <View style={[styles.container, !showBottomNav && styles.subScreenContainer]}>
      <BlurTargetView ref={blurTargetRef} style={styles.blurTarget}>
        <Stack
          screenOptions={{ headerShown: false, animation: 'none' }}
          screenLayout={renderScreen}
        >
          <Stack.Screen name="dashboard" options={{ animation: 'none' }} />
          <Stack.Screen name="stats" options={{ animation: 'none' }} />
          <Stack.Screen name="screens/weather-details" />
          <Stack.Screen name="home" />
          <Stack.Screen name="history" />
          <Stack.Screen name="run" />
          <Stack.Screen name="questionnaire" options={{ headerShown: false }} />
          <Stack.Screen name="plan-recommendation" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="training-plan" options={{ headerShown: false, animation: 'none' }} />
          <Stack.Screen name="training-plan/workout-details" options={{ headerShown: false, presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="calendar" options={{ headerShown: false }} />
          <Stack.Screen name="activity/index" options={{ headerShown: false, animation: 'none' }} />
          <Stack.Screen name="profile" options={{ animation: 'none' }} />
          <Stack.Screen name="activity/[id]" />
          <Stack.Screen name="custom-workout" options={{ headerShown: false }} />
      <Stack.Screen name="workout-setup" options={{ headerShown: false }} />
        </Stack>
      </BlurTargetView>
      {showBottomNav && <GlobalBottomNav blurTarget={blurTargetRef} />}
    </View>
  );
}

const styles = {
  container: { flex: 1 },
  blurTarget: { flex: 1 },
  subScreenContainer: { paddingBottom: 0 },
};
