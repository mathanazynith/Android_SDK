import { Stack } from 'expo-router';
import TabZoomTransition from '../../components/navigation/TabZoomTransition';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, animation: 'none' }}
      screenLayout={({ route, children }) => (
        route.name === 'welcome' || route.name === 'login' || route.name === 'signup'
          ? children
          : <TabZoomTransition key={route.key}>{children}</TabZoomTransition>
      )}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen
        name="login"
        options={({ route }) => {
          const switchDirection = (route.params as { authSwitchDirection?: string } | undefined)?.authSwitchDirection;
          return {
            presentation: 'modal',
            animation: switchDirection === 'left' ? 'slide_from_left' : 'slide_from_bottom',
            gestureEnabled: true,
            gestureDirection: 'vertical',
          };
        }}
      />
      <Stack.Screen
        name="signup"
        options={({ route }) => {
          const switchDirection = (route.params as { authSwitchDirection?: string } | undefined)?.authSwitchDirection;
          return {
            animation: switchDirection === 'right' ? 'slide_from_right' : 'simple_push',
          };
        }}
      />
      <Stack.Screen name="verify-otp" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="legal-policy" options={{ presentation: "modal" }} />
    </Stack>
  );
}
