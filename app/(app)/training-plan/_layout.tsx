import { Stack } from 'expo-router';

export default function TrainingPlanLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, animation: 'none' }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="workout-details"
        options={{ headerShown: false, presentation: 'card', animation: 'simple_push' }}
      />
    </Stack>
  );
}