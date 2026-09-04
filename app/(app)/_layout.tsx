import { Stack } from 'expo-router';
import { View } from 'react-native';
import GlobalBottomNav from '../../components/navigation/GlobalBottomNav';

export default function AppLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, animation: 'fade', animationDuration: 1 }}>
      <Stack.Screen name="dashboard"  />
      <Stack.Screen name="attendance"  />
      <Stack.Screen name="screens/weather-details" />
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
      <Stack.Screen
        name="custom-workout"
        options={{
          headerShown: false,
        }}
      />
      </Stack>
      <GlobalBottomNav />
    </View>
  );
}
