import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
      <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="home" />
      <Stack.Screen name="history" />
      <Stack.Screen name="run" />
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
      <Stack.Screen
        name="activity"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen name="activity/[id]" />
      <Stack.Screen
        name="running-tracker"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
