import { Stack } from 'expo-router';
import TabZoomTransition from '../../components/navigation/TabZoomTransition';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, animation: 'none' }}
      screenLayout={({ route, children }) => (
        <TabZoomTransition key={route.key}>{children}</TabZoomTransition>
      )}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="verify-otp" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="legal-policy" options={{ presentation: "modal" }} />
    </Stack>
  );
}
