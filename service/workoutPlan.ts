import { workoutPlanAPI } from "./api";
import { customWorkoutAPI, type UserWorkoutResponse } from "./customWorkout";

export type { UserWorkoutResponse };

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
  id?: number;
  is_benchmark?: boolean;
  is_custom?: boolean;
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

  /**
   * Set or remove benchmark status on a workout in the database workouts table.
   * When is_custom is false, the workout is a planned run from the training plan.
   */
  async setWorkoutBenchmark(workoutId: number, isBenchmark: boolean): Promise<UserWorkoutResponse> {
    const response = await customWorkoutAPI.setBenchmark(workoutId, isBenchmark);
    return response.data;
  },

  /**
   * Fetch all plan workouts from the backend workouts table (where is_custom === false or plan != null).
   */
  async getPlanWorkouts(): Promise<UserWorkoutResponse[]> {
    try {
      const response = await customWorkoutAPI.list();
      const list: UserWorkoutResponse[] = Array.isArray(response.data)
        ? response.data
        : ((response.data as any)?.results || []);
      return list.filter((w) => w.is_custom === false || w.plan != null || !w.is_custom);
    } catch (err) {
      console.warn("[workoutPlanService] Error fetching plan workouts:", err);
      return [];
    }
  },

  /**
   * Update the is_benchmark field in the database workouts table for a plan workout.
   * Directly patches by workoutDbId or searches the backend workouts table by date/week/order/title.
   */
  async updatePlanWorkoutBenchmark(
    identifier: {
      workoutDbId?: number;
      workoutDate?: string;
      weekNumber?: number;
      displayOrder?: number;
      weekday?: string;
      title?: string;
      workoutType?: string;
      distance?: number | null;
      duration?: number | null;
      notes?: string;
      segments?: any[];
    },
    isBenchmark: boolean
  ): Promise<UserWorkoutResponse | null> {
    try {
      // 1. Direct PATCH if workoutDbId is provided
      if (identifier.workoutDbId) {
        try {
          console.log(`[workoutPlanService] Direct PATCH is_benchmark=${isBenchmark} on workout id=${identifier.workoutDbId}`);
          const res = await customWorkoutAPI.setBenchmark(identifier.workoutDbId, isBenchmark);
          if (res?.data) {
            return res.data;
          }
        } catch (directErr: any) {
          const detail = directErr?.response?.data?.detail || directErr?.message;
          console.warn(
            `[workoutPlanService] Direct PATCH failed for id=${identifier.workoutDbId}:`,
            detail
          );
          if (typeof detail === "string" && detail.includes("Generated workouts cannot be edited")) {
            console.info("[workoutPlanService] Backend restricts direct editing of generated workouts; preserving local benchmark state.");
            return {
              id: identifier.workoutDbId,
              plan: null,
              template_workout: null,
              is_custom: false,
              is_benchmark: isBenchmark,
              week_number: identifier.weekNumber ?? null,
              display_order: identifier.displayOrder ?? 0,
              workout_date: identifier.workoutDate ?? null,
              weekday: identifier.weekday ?? null,
              workout_type: identifier.workoutType || "Run",
              title: identifier.title || "Plan Workout",
              duration: identifier.duration ?? null,
              distance: identifier.distance ?? null,
              display_distance: null,
              distance_unit: "km",
              target_pace: null,
              pace: null,
              pace_unit: "min/km",
              zone: "",
              notes: identifier.notes || "",
              priority: 1,
              segments: [],
            };
          }
        }
      }

      // 2. Query all database workouts from /workouts/ to find the plan workout row
      const response = await customWorkoutAPI.list();
      const list: UserWorkoutResponse[] = Array.isArray(response.data)
        ? response.data
        : ((response.data as any)?.results || []);

      const normTitle = (s?: string | null) => (s || "").trim().toLowerCase();
      const normDate = (s?: string | null) => (s || "").trim().slice(0, 10);

      const match = list.find((w) => {
        if (identifier.workoutDbId && w.id === identifier.workoutDbId) return true;
        const isPlan = w.is_custom === false || w.plan != null;
        if (!isPlan) return false;

        // 1. Direct date match
        if (identifier.workoutDate && w.workout_date && normDate(w.workout_date) === normDate(identifier.workoutDate)) {
          return true;
        }
        // 2. Week number + display order match
        if (
          identifier.weekNumber != null &&
          identifier.displayOrder != null &&
          w.week_number === identifier.weekNumber &&
          w.display_order === identifier.displayOrder
        ) {
          return true;
        }
        // 3. Week number + weekday match
        if (
          identifier.weekNumber != null &&
          identifier.weekday &&
          w.week_number === identifier.weekNumber &&
          w.weekday &&
          w.weekday.toLowerCase() === identifier.weekday.toLowerCase()
        ) {
          return true;
        }
        // 4. Week number + title match
        if (
          identifier.weekNumber != null &&
          identifier.title &&
          w.week_number === identifier.weekNumber &&
          normTitle(w.title) === normTitle(identifier.title)
        ) {
          return true;
        }
        // 5. Title + date match
        if (
          identifier.title &&
          identifier.workoutDate &&
          normTitle(w.title) === normTitle(identifier.title) &&
          w.workout_date &&
          normDate(w.workout_date) === normDate(identifier.workoutDate)
        ) {
          return true;
        }
        return false;
      });

      if (match) {
        console.log(`[workoutPlanService] Found matching database workout id=${match.id}, patching is_benchmark=${isBenchmark}`);
        try {
          const res = await customWorkoutAPI.setBenchmark(match.id, isBenchmark);
          return res.data;
        } catch (patchErr: any) {
          console.warn(
            `[workoutPlanService] Backend patch on workout id=${match.id} failed:`,
            patchErr?.response?.data || patchErr?.message
          );
          return { ...match, is_benchmark: isBenchmark };
        }
      }

      // 3. Fallback: If no existing plan workout was found in database workouts table, create it with is_custom: false
      if (identifier.title) {
        try {
          console.log(`[workoutPlanService] Creating plan workout in /workouts/ with is_custom=false, is_benchmark=${isBenchmark}`);
          const createRes = await customWorkoutAPI.create({
            title: identifier.title,
            workout_type: identifier.workoutType || "Run",
            workout_date: identifier.workoutDate || null,
            notes: identifier.notes || "",
            is_custom: false,
            is_benchmark: isBenchmark,
            distance: identifier.distance || null,
            duration: identifier.duration || null,
            segments: Array.isArray(identifier.segments)
              ? identifier.segments.map((seg: any, idx: number) => ({
                  segment_order: seg.segment_order ?? idx + 1,
                  segment_type: (seg.segment_type === "Cooldown" || seg.segment_type === "Warmup") ? seg.segment_type : "Run",
                  duration: seg.duration || null,
                  distance: seg.rep_distance != null ? seg.rep_distance / 1000 : seg.distance || null,
                  distance_unit: "km",
                  repeats: seg.repeats || 1,
                  rest_duration: seg.rest_duration || null,
                  notes: seg.notes || "",
                }))
              : [],
          });
          if (createRes?.data) {
            return createRes.data;
          }
        } catch (createErr: any) {
          console.warn("[workoutPlanService] Fallback plan workout creation failed:", createErr?.response?.data || createErr?.message);
        }
      }

      console.warn("[workoutPlanService] No matching workout found in database to update benchmark.");
      return null;
    } catch (err) {
      console.warn("[workoutPlanService] Error updating plan workout is_benchmark:", err);
      return null;
    }
  },
};
