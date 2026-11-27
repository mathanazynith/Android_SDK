import { Alert } from '@/components/ThemedAlert';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import WorkoutModal from '../calendar/components/WorkoutModal';
import type { WorkoutDetail } from '../calendar/components/types';

const isWorkoutDetail = (value: unknown): value is WorkoutDetail => {
  if (!value || typeof value !== 'object') return false;
  const workout = value as Record<string, unknown>;
  return typeof workout.id === 'string'
    && typeof workout.title === 'string'
    && typeof workout.workoutType === 'string'
    && Array.isArray(workout.steps)
    && Array.isArray(workout.segments);
};

export default function TrainingPlanWorkoutDetailsScreen() {
  const { colors } = useTheme();
  const { workout: workoutParam } = useLocalSearchParams<{ workout?: string }>();
  const hasShownInvalidAlert = useRef(false);

  const workout = useMemo(() => {
    if (typeof workoutParam !== 'string') return null;
    try {
      const parsed: unknown = JSON.parse(workoutParam);
      return isWorkoutDetail(parsed) ? parsed : null;
    } catch (error) {
      console.warn('[TrainingPlan] Unable to parse workout details route data:', error);
      return null;
    }
  }, [workoutParam]);

  useEffect(() => {
    if (workout || hasShownInvalidAlert.current) return;
    hasShownInvalidAlert.current = true;
    Alert.alert('Workout unavailable', 'This workout could not be opened.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  }, [workout]);

  if (!workout) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <WorkoutModal
      visible
      workout={workout}
      onClose={() => router.back()}
      presentation="page"
    />
  );
}
