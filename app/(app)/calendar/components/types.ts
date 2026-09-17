import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type WorkoutIconName = ComponentProps<typeof Ionicons>['name'];

export interface WorkoutSegment {
  order: number;
  type: string;
  repeats: number;
  distance: string;
  duration: string;
  pace: string;
  rest: string;
  notes: string;
}

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
  segments: WorkoutSegment[];
  rawDate?: string;
  weekNumber?: number;
  displayOrder?: number;
  isBenchmark?: boolean;
  benchmarkTitle?: string;
  benchmarkType?: '1k' | '5k' | 'cooper' | 'custom' | 'plan';
  customWorkoutId?: number;
  workoutDbId?: number;
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
