import { Alert } from '@/components/ThemedAlert';
import { BlurTargetView } from 'expo-blur';
import { router, Stack, useGlobalSearchParams, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { BackHandler, Platform, View } from 'react-native';
import ActiveRunBanner from '../../components/navigation/ActiveRunBanner';
import GlobalBottomNav, { isPrimaryTabPath } from '../../components/navigation/GlobalBottomNav';
import TabZoomTransition from '../../components/navigation/TabZoomTransition';
import {
  getActivityLaunchOrigin,
  getDashboardLaunchOrigin,
  getTabLaunchOrigin,
} from '../../components/navigation/dashboardLaunchTransition';
import { ActiveRunProvider, useActiveRun } from '../../contexts/ActiveRunContext';

const nestedStackRouteNames = new Set(['custom-workout']);

function AppLayoutContent() {
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams();
  const hasDashboardLaunchOrigin = Boolean(getDashboardLaunchOrigin(globalParams));
  const showBottomNav = isPrimaryTabPath(pathname);
  const activeRun = useActiveRun();
  const blurTargetRef = useRef<View | null>(null);
  const isIOS = Platform.OS === 'ios';
  const backNavigationPending = useRef(false);

  useEffect(() => {
    backNavigationPending.current = false;
  }, [pathname]);

  useEffect(() => {
    if (!showBottomNav) return;

    const handleBackPress = () => {
      if (backNavigationPending.current) return true;

      if (pathname.replace('/(app)', '') !== '/dashboard') {
        backNavigationPending.current = true;
        if (hasDashboardLaunchOrigin && router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(app)/dashboard');
        }
        return true;
      }

      Alert.alert('Exit App', 'Are you sure you want to exit the app?', [
        { text: 'Cancel', onPress: () => null, style: 'cancel' },
        { text: 'Exit', onPress: () => BackHandler.exitApp(), style: 'destructive' },
      ]);
      return true;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => backHandler.remove();
  }, [hasDashboardLaunchOrigin, pathname, showBottomNav]);

  const renderScreen = ({
    route,
    children,
  }: {
    route: { key: string; name: string; params?: object };
    children: React.ReactElement;
  }) => {
    const launchOrigin = getDashboardLaunchOrigin(route.params)
      ?? getTabLaunchOrigin(route.params)
      ?? getActivityLaunchOrigin(route.params);
    return (
      <TabZoomTransition
        key={route.key}
        launchOrigin={launchOrigin}
        animate={Boolean(launchOrigin) || (route.name !== 'screens/map' && !nestedStackRouteNames.has(route.name))}
      >
        {children}
      </TabZoomTransition>
    );
  };

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
      <Stack.Screen name="social" options={{ animation: 'none' }} />
      <Stack.Screen name="run" />
      <Stack.Screen name="profile/edit" />
      <Stack.Screen name="profile/subscription" />
      <Stack.Screen name="questionnaire" options={{ headerShown: false }} />
      <Stack.Screen name="plan-confirmation" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="plan-recommendation" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="training-plan" options={{ headerShown: false, animation: 'none' }} />
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
          <Stack.Screen name="screens/map" options={{ gestureEnabled: !activeRun?.active }} />
          <Stack.Screen name="workout-recovery" options={{
            headerShown: false,
            presentation: 'formSheet',
            sheetAllowedDetents: [0.5],
            sheetGrabberVisible: true,
            sheetCornerRadius: 26,
            contentStyle: { backgroundColor: '#F7F9F7' },
            animation: 'slide_from_bottom',
          }} />
          <Stack.Screen name="home" />
          <Stack.Screen name="history" />
          <Stack.Screen name="social" options={{ animation: 'none' }} />
          <Stack.Screen name="run" options={{ gestureEnabled: !activeRun?.active }} />
          <Stack.Screen name="questionnaire" options={{ headerShown: false }} />
          <Stack.Screen name="plan-confirmation" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="plan-recommendation" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="training-plan" options={{ headerShown: false, animation: 'none' }} />
          <Stack.Screen name="calendar" options={{ headerShown: false }} />
          <Stack.Screen name="activity/index" options={{ headerShown: false, animation: 'none' }} />
          <Stack.Screen name="profile" options={{ animation: 'none' }} />
          <Stack.Screen name="activity/[id]" />
          <Stack.Screen name="custom-workout" options={{ headerShown: false }} />
          <Stack.Screen name="workout-setup" options={{ headerShown: false }} />
        </Stack>
      </BlurTargetView>
      <ActiveRunBanner bottomOffset={showBottomNav ? 88 : 16} />
      {showBottomNav && <GlobalBottomNav blurTarget={blurTargetRef} />}
    </View>
  );
}

export default function AppLayout() {
  return (
    <ActiveRunProvider>
      <AppLayoutContent />
    </ActiveRunProvider>
  );
}

const styles = {
  container: { flex: 1 },
  blurTarget: { flex: 1 },
  subScreenContainer: { paddingBottom: 0 },
};
