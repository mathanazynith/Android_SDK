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

export interface PathProcessorSnapshot {
  rawPointCount: number;
  optimizedPointCount: number;
  reductionPercent: number;
  points: RunningPathPoint[];
}
