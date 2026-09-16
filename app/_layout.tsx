import { Stack, useRootNavigationState, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../service/auth';
import { QuestionnaireProvider } from '../contexts/QuestionnaireContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import '../src/services/backgroundLocationTask';
import { LIVE_TRACKING_ROUTE, LIVE_TRACKING_STOP_ACTION } from '../src/services/liveTrackingNotification';

function RootSurface({ children }: { children: ReactNode }) {
  const { isDark } = useTheme();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const handledNotificationIds = useRef(new Set<string>());

  useEffect(() => {
    if (!navigationState?.key) return;

    const openTrackingScreen = (response: Notifications.NotificationResponse) => {
      const responseId = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (handledNotificationIds.current.has(responseId)) return;
      handledNotificationIds.current.add(responseId);
      const data = response.notification.request.content.data as { screen?: string; trackingActive?: boolean };
      if (data.screen === LIVE_TRACKING_ROUTE && data.trackingActive) {
        router.replace({
          pathname: LIVE_TRACKING_ROUTE,
          params: response.actionIdentifier === LIVE_TRACKING_STOP_ACTION
            ? { notificationAction: LIVE_TRACKING_STOP_ACTION }
            : undefined,
        });
      }
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(openTrackingScreen);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openTrackingScreen(response);
    });

    return () => subscription.remove();
  }, [navigationState?.key, router]);

  return <>
    <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
    <>{children}</>
  </>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootSurface>
          <AuthProvider>
            <QuestionnaireProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="oauthredirect" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(app)" />
              </Stack>
            </QuestionnaireProvider>
          </AuthProvider>
        </RootSurface>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
