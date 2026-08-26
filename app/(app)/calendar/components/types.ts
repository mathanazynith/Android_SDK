import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

export type WorkoutIconName = ComponentProps<typeof Ionicons>['name'];

export interface WorkoutDetail {
  id: string;
  day: string;
  date: string;
  title: string;
  workoutType: string;
  iconName: WorkoutIconName;
  accentColor: string;
  isRest?: boolean;
  description: string;
  instructions: string;
  warmUp: string;
  steps: string[];
  coolDown: string;
  estimatedDuration: string;
  estimatedCalories: string;
  targetPace: string;
  heartRateZone: string;
  distance: string;
  notes: string;
}

export interface RunningPlanWeek {
  id: string;
  label: string;
  dateRange: string;
  statusText: string;
  workouts: WorkoutDetail[];
}

export interface RunningPlanData {
  name: string;
  focus: string;
  totalWeeks: number;
  weeks: RunningPlanWeek[];
}

const calendarTypes = {};
export default calendarTypes;
