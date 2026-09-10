import { Stack, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Alert, BackHandler, View } from 'react-native';
import GlobalBottomNav, { isPrimaryTabPath } from '../../components/navigation/GlobalBottomNav';

export default function AppLayout() {
  const pathname = usePathname();
  const showBottomNav = isPrimaryTabPath(pathname);

  useEffect(() => {
    if (!showBottomNav) return;

    const handleBackPress = () => {
      Alert.alert('Exit App', 'Are you sure you want to close the app?', [
        { text: 'Cancel', onPress: () => null, style: 'cancel' },
        { text: 'OK', onPress: () => BackHandler.exitApp() },
      ]);
      return true;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => backHandler.remove();
  }, [showBottomNav]);

  return (
    <View style={[styles.container, !showBottomNav && styles.subScreenContainer]}>
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
      {showBottomNav && <GlobalBottomNav />}
    </View>
  );
}

const styles = {
  container: { flex: 1 },
  subScreenContainer: { paddingBottom: 0 },
};
