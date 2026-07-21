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
          headerStyle: {
            backgroundColor: '#1A1A1A',
          },
          headerTintColor: '#34C759',
          headerTitleStyle: {
            fontWeight: '600',
            fontSize: 18,
            color: '#34C759',
          },
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
          headerShown: true,
          title: "Calendar",
          headerStyle: {
            backgroundColor: '#1A1A1A',
          },
          headerTintColor: '#34C759',
          headerTitleStyle: {
            fontWeight: '600',
            fontSize: 18,
            color: '#34C759',
          },
        }} 
      />
    </Stack>
  );
}