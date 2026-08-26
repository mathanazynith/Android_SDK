import { Stack } from 'expo-router';
import { CustomWorkoutProvider } from './workout-context';

export default function CustomWorkoutLayout() {
  return <CustomWorkoutProvider><Stack screenOptions={{ headerShown: false }} /></CustomWorkoutProvider>;
}