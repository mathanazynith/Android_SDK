import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="profile/edit" />
      <Stack.Screen 
        name="questionnaire" 
        options={{ 
          headerShown: false,
        }} 
      />
      <Stack.Screen 
        name="training-plan" 
        options={{ 
          headerShown: false,
        }} 
      />
      <Stack.Screen 
        name="calendar" 
        options={{ 
          headerShown: false,
        }} 
      />
    </Stack>
  );
}
