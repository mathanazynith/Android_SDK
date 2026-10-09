import { Stack } from 'expo-router';
import TabZoomTransition from '../../components/navigation/TabZoomTransition';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, animation: 'none' }}
      screenLayout={({ route, children }) => (
        route.name === 'login' || route.name === 'signup'
          ? children
          : <TabZoomTransition key={route.key}>{children}</TabZoomTransition>
      )}
    >
      <Stack.Screen name="login" options={{ animation: 'simple_push' }} />
      <Stack.Screen name="signup" options={{ animation: 'simple_push' }} />
      <Stack.Screen name="verify-otp" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="legal-policy" options={{ presentation: "modal" }} />
    </Stack>
  );
}
