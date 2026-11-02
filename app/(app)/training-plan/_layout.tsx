import { Stack } from 'expo-router';
import TabZoomTransition from '../../../components/navigation/TabZoomTransition';

export default function TrainingPlanLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, animation: 'none' }}
      screenLayout={({ route, children }) => (
        <TabZoomTransition key={route.key}>{children}</TabZoomTransition>
      )}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="workout-details"
        options={{ headerShown: false, presentation: 'card', animation: 'simple_push' }}
      />
    </Stack>
  );
}