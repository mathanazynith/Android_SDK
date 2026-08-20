export type WorkoutSegmentType =
  | 'Warmup'
  | 'Run'
  | 'Rest'
  | 'Cooldown';

export type WorkoutEngineState =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'stopped';

export interface BackendWorkoutSegment {
  segment_order: number;
  segment_type: string;
  repeats: number;
  rep_distance: number | null;
  duration: number | null;
  target_pace: string | null;
  pace_unit: string | null;
  rest_duration: number | null;
  notes?: string | null;
}

export interface BackendWorkout {
  week_number: number;
  display_order: number;
  workout_date: string;
  weekday: string;
  workout_type: string;
  title: string;
  duration: number | null;
  distance: number | null;
  target_pace: string | null;
  pace_unit: string | null;
  zone: string | null;
  warmup: number | null;
  cooldown: number | null;
  notes?: string | null;
  priority?: number;
  segments: BackendWorkoutSegment[];
}

export interface WorkoutPlan {
  id: number;
  assessment: number;
  template_name: string;
  training_plan: string;
  weeks: {
    week_number: number;
    workouts: BackendWorkout[];
  }[];
}

export interface WorkoutLap {
  id: string;

  segmentOrder: number;

  segmentType: WorkoutSegmentType;

  repeatNumber: number;

  totalRepeats: number;

  targetDistanceMeters: number | null;

  targetDurationSeconds: number | null;

  targetPace: string | null;

  startTimestamp: number;

  endTimestamp: number | null;

  completed: boolean;

  distanceMeters: number;

  durationSeconds: number;

  startGpsSequence: number | null;

  endGpsSequence: number | null;
}

export interface ActiveWorkoutSegment {
  segmentOrder: number;

  segmentType: WorkoutSegmentType;

  repeatNumber: number;

  totalRepeats: number;

  targetDistanceMeters: number | null;

  targetDurationSeconds: number | null;

  targetPace: string | null;

  paceUnit?: string | null;

  restDurationSeconds: number | null;

  notes?: string | null;
}

export interface WorkoutEngineSnapshot {
  state: WorkoutEngineState;

  currentSegment: ActiveWorkoutSegment | null;

  currentLap: WorkoutLap | null;

  completedLaps: WorkoutLap[];

  totalLaps: number;

  currentSegmentDistanceMeters: number;

  currentSegmentDurationSeconds: number;

  overallDistanceMeters: number;

  overallDurationSeconds: number;
}
