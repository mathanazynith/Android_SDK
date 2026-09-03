export type PathType = 'STRAIGHT' | 'CURVE' | 'TURN';

export interface RunningCoordinate {
  latitude: number;
  longitude: number;
}

export interface RawGpsPayload {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  timestamp?: number | string | Date;
}

export interface RunningGpsPoint extends RunningCoordinate {
  sequence: number;
  point_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
  path_type?: PathType;
  heading_change?: number;
}

export interface RunningPathPoint extends RunningGpsPoint {
  path_type: PathType;
  heading_change: number;
}

export interface RunSessionStartPayload {
  user_id: string;
  started_at: string;
  run_id?: string;
}

export interface RunSessionStartResponse {
  success: boolean;
  run_id: string;
}

export interface RunStopPayload {
  run_id: string;
  ended_at: string;
  final_sequence: number;
}

export interface UploadBatchPayload {
  run_id: string;
  points: RunningPathPoint[];
}

export interface ActivityGpsPointPayload {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: string;
}

export interface ActivitySubmissionPayload {
  gps_points: ActivityGpsPointPayload[];
  start_time: string;
  end_time: string;
  activity_type: 'RUN' | 'WALK';
  /** Canonical SDK-measured total. The backend must not re-count GPS jitter. */
  distance: number;
  distance_meters: number;
  workout_distance_meters: number;
  additional_distance_meters: number;
  total_distance_meters: number;
  laps?: ActivityLapPayload[];
}

export interface ActivityLapPayload {
  segment_order: number;
  segment_type: 'Warmup' | 'Run' | 'Rest' | 'Cooldown';
  repeat_number: number;
  total_repeats: number;
  distance_meters: number;
  duration_seconds: number;
  pace_seconds_per_km: number | null;
  completed: boolean;
}

export interface PathProcessorSnapshot {
  rawPointCount: number;
  optimizedPointCount: number;
  reductionPercent: number;
  points: RunningPathPoint[];
}
