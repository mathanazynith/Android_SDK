import api, { getBackendErrorMessage } from "./api";

export type CustomSegmentType = "Warmup" | "Run" | "Cooldown";
export type SegmentInputType = "DURATION" | "DISTANCE";
export type DistanceUnit = "km" | "mi" | "m" | "mile";

export interface CustomWorkoutSegmentWritePayload {
  segment_order: number;
  segment_type: CustomSegmentType;
  input_type?: SegmentInputType;
  duration?: number | null;
  distance?: number | null;
  distance_unit?: DistanceUnit | null;
  pace?: string | null;
  repeats?: number;
  rest_duration?: number | null;
  skip_last_rest?: boolean;
  notes?: string;
}

export interface CustomWorkoutWritePayload {
  id?: number;
  title: string;
  workout_date?: string | null;
  notes?: string;
  segments: CustomWorkoutSegmentWritePayload[];
}

export interface UserWorkoutSegmentResponse {
  id: number;
  segment_order: number;
  segment_type: CustomSegmentType;
  input_type: SegmentInputType;
  duration: number | null;
  rep_distance: number | null;
  distance: number | null;
  display_distance: number | null;
  distance_unit: string;
  target_pace: string | null;
  pace_unit: string;
  pace: string | null;
  repeats: number;
  rest_duration: number | null;
  skip_last_rest: boolean;
  notes: string;
}

export interface UserWorkoutResponse {
  id: number;
  plan: number | null;
  template_workout: number | null;
  is_custom: boolean;
  week_number: number | null;
  display_order: number;
  workout_date: string | null;
  weekday: string | null;
  workout_type: string;
  title: string;
  duration: number | null;
  distance: number | null;
  display_distance: number | null;
  distance_unit: string;
  target_pace: string | null;
  pace: string | null;
  pace_unit: string;
  zone: string;
  notes: string;
  priority: number;
  segments: UserWorkoutSegmentResponse[];
}

export const customWorkoutAPI = {
  list: () => api.get<UserWorkoutResponse[]>("/workouts/"),
  get: (id: number) => api.get<UserWorkoutResponse>(`/workouts/${id}/`),
  create: (data: CustomWorkoutWritePayload) => api.post<UserWorkoutResponse>("/workouts/", data),
  update: (id: number, data: CustomWorkoutWritePayload) => api.put<UserWorkoutResponse>(`/workouts/${id}/`, data),
  delete: (id: number) => api.delete(`/workouts/${id}/`),
  duplicate: (id: number) => api.post<UserWorkoutResponse>(`/workouts/${id}/duplicate/`),
  schedule: (id: number, workout_date: string) => api.post<UserWorkoutResponse>(`/workouts/${id}/schedule/`, { workout_date }),
  unschedule: (id: number) => api.post<UserWorkoutResponse>(`/workouts/${id}/unschedule/`),
};

// Utilities for conversion between frontend state and backend serializer format
export const timeStringToSeconds = (timeStr?: string | null): number | null => {
  if (!timeStr) return null;
  const parts = timeStr.trim().split(":").map(Number);
  if (parts.length === 3) {
    const total = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    return total > 0 ? total : null;
  }
  if (parts.length === 2) {
    const total = (parts[0] || 0) * 60 + (parts[1] || 0);
    return total > 0 ? total : null;
  }
  const numeric = Number(timeStr);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

export const secondsToTimeString = (sec?: number | null): string => {
  if (!sec || sec <= 0) return "00:00:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export const cleanPaceString = (paceStr?: string | null): string | null => {
  if (!paceStr) return null;
  const match = paceStr.match(/(\d+)\s*:\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return `${match[1]}:${match[2].padStart(2, "0")}`;
};

export const canonicalDistanceUnit = (
  unitStr?: string | null,
  stepType: CustomSegmentType = "Run"
): DistanceUnit => {
  if (!unitStr) return "km";
  const lower = unitStr.toLowerCase();
  if (lower.includes("meter") || lower === "m") {
    // Warmup and Cooldown are forbidden to use meters in backend serializer
    return stepType === "Run" ? "m" : "km";
  }
  if (lower.includes("mile") || lower === "mi") {
    return "mi";
  }
  return "km";
};

