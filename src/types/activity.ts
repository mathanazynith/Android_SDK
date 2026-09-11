export const SPLIT_DISTANCE_METERS = 250;

export interface ActivitySplit {
  split_number: number;
  distance_m: number;
  time_s: number;
  pace_s_per_km: number;
}

export interface ActivitySegmentSplits {
  id?: string | number;
  sequence: number;
  type: string;
  planned_distance_m?: number;
  completed_distance_m?: number;
  actual_time_s?: number;
  actual_pace_s_per_km?: number;
  splits: ActivitySplit[];
  recovery?: ActivitySegmentSplits;
  gps_points?: {
    latitude: number;
    longitude: number;
    timestamp?: string;
    is_extra_distance?: boolean;
  }[];
}

export interface ActivityExtraSplits {
  id?: string | number;
  type: 'EXTRA';
  distance_m?: number;
  actual_time_s?: number;
  actual_pace_s_per_km?: number;
  splits: ActivitySplit[];
}