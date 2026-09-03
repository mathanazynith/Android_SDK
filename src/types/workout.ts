export type WorkoutSegmentType = 'Warmup' | 'Run' | 'Rest' | 'Cooldown';

export type WorkoutEngineState =
  | 'idle'
  | 'running'
  | 'waiting'
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
  title: string;
  duration: number | null;
  distance: number | null;
  target_pace: string | null;
  pace_unit: string | null;
  notes?: string | null;
  segments: BackendWorkoutSegment[];
}

export interface ActiveWorkoutSegment {
  segmentOrder: number;
  segmentType: WorkoutSegmentType;
  repeatNumber: number;
  totalRepeats: number;
  targetDistanceMeters: number | null;
  targetDurationSeconds: number | null;
  targetPace: string | null;
  paceUnit: string | null;
  notes?: string | null;
}

export interface WorkoutLap extends ActiveWorkoutSegment {
  startedAt: number;
  completedAt: number | null;
  distanceMeters: number;
  elapsedSeconds: number;
  completed: boolean;
}

export interface WorkoutEngineSnapshot {
  state: WorkoutEngineState;
  currentSegment: ActiveWorkoutSegment | null;
  currentLap: WorkoutLap | null;
  completedLaps: WorkoutLap[];
  totalLaps: number;
}
