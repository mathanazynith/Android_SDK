import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="profile/edit" />
      <Stack.Screen 
        name="questionnaire" 
        options={{ 
          headerShown: true,
          title: "Questionnaire",
          headerBackVisible: false,
        }} 
      />
    </Stack>
  );
}