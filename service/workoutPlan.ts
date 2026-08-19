import { workoutPlanAPI } from "./api";

export interface CurrentWorkoutSegment {
  segment_order: number;
  segment_type: string;
  repeats: number;
  rep_distance: number | null;
  duration: number | null;
  target_pace: string | null;
  pace_unit: string;
  rest_duration: number | null;
  notes: string;
}

export interface CurrentWorkout {
  week_number: number;
  display_order: number;
  workout_date: string;
  weekday: string;
  workout_type: string;
  title: string;
  duration: number | null;
  distance: number | null;
  target_pace: string | null;
  pace_unit: string;
  zone: string;
  warmup: number | null;
  cooldown: number | null;
  notes: string;
  priority: number;
  segments: CurrentWorkoutSegment[];
}

export interface CurrentWorkoutPlan {
  id: number;
  assessment: number;
  template_name: string;
  training_plan: string;
  selected_template: { id: number; name: string; range: string };
  start_date: string;
  running_days: number;
  selected_weekdays: string[];
  preferred_long_run_day: string;
  target_pace: string | null;
  pace_unit: string;
  weeks: Array<{ week_number: number; workouts: CurrentWorkout[] }>;
}

export const workoutPlanService = {
  async getCurrent(): Promise<CurrentWorkoutPlan> {
    const response = await workoutPlanAPI.getCurrent();
    return response.data as CurrentWorkoutPlan;
  },
  async endCurrent(): Promise<void> {
    await workoutPlanAPI.endCurrent();
  },
};
