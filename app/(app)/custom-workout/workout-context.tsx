import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import {
  customWorkoutAPI,
  CustomWorkoutSegmentWritePayload,
  CustomWorkoutWritePayload,
  UserWorkoutResponse,
  CustomSegmentType,
  SegmentInputType,
  timeStringToSeconds,
  secondsToTimeString,
  cleanPaceString,
  canonicalDistanceUnit,
} from "../../../service/customWorkout";
import { getBackendErrorMessage } from "../../../service/api";

export type WorkoutStep = {
  id?: number;
  title: string;
  stepType?: CustomSegmentType;
  inputType?: SegmentInputType;
  duration: string; // "HH:MM:SS"
  distance: string; // "5.00"
  unit: string; // "Kilometers (km)" | "Miles (mi)" | "Meters (m)"
  pace: string; // "5:30"
  repeat: number; // 1 to 40
  rest: string; // "HH:MM:SS"
  skipLastRest: boolean;
  skipRest?: boolean;
  notes?: string;
  groupId?: string;
  groupRepeat?: number;
};

export type WorkoutState = {
  id: number | null;
  title: string;
  workoutDate: string | null; // "YYYY-MM-DD"
  notes: string;
  isCustom: boolean;
  warmUp: WorkoutStep | null;
  runs: WorkoutStep[];
  cooldown: WorkoutStep | null;
};

const getTodayDateString = () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const emptyWorkout: WorkoutState = {
  id: null,
  title: "Custom Workout",
  workoutDate: getTodayDateString(),
  notes: "",
  isCustom: true,
  warmUp: null,
  runs: [],
  cooldown: null,
};

interface CustomWorkoutContextType {
  workout: WorkoutState;
  isSaving: boolean;
  isLoading: boolean;
  error: string | null;
  setTitle: (title: string) => void;
  setWorkoutDate: (date: string | null) => void;
  setNotes: (notes: string) => void;
  setWarmUp: (step: WorkoutStep) => void;
  addRun: (step: WorkoutStep) => void;
  addEmptyRun: () => void;
  updateRun: (index: number, step: WorkoutStep) => void;
  addRunAfter: (index: number) => void;
  duplicateRunGroup: (index: number) => void;
  updateRunRepeat: (index: number, repeat: number) => void;
  updateRunSkipRest: (index: number, skipRest: boolean) => void;
  updateGroupRepeat: (groupId: string, repeat: number) => void;
  updateGroupSkipLastRest: (groupId: string, skipLastRest: boolean) => void;
  setCooldown: (step: WorkoutStep) => void;
  removeWarmUp: () => void;
  removeRun: (index: number) => void;
  removeCooldown: () => void;
  reset: () => void;
  saveWorkout: () => Promise<UserWorkoutResponse>;
  loadWorkout: (id: number) => Promise<void>;
  deleteWorkout: (id: number) => Promise<void>;
}

const WorkoutContext = createContext<CustomWorkoutContextType | null>(null);

export function CustomWorkoutProvider({ children }: { children: ReactNode }) {
  const [workout, setWorkout] = useState<WorkoutState>(emptyWorkout);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setWorkout({
      ...emptyWorkout,
      workoutDate: getTodayDateString(),
    });
    setError(null);
  }, []);

  const setTitle = useCallback((title: string) => {
    setWorkout((prev) => ({ ...prev, title }));
  }, []);

  const setWorkoutDate = useCallback((workoutDate: string | null) => {
    setWorkout((prev) => ({ ...prev, workoutDate }));
  }, []);

  const setNotes = useCallback((notes: string) => {
    setWorkout((prev) => ({ ...prev, notes }));
  }, []);

  const setWarmUp = useCallback((step: WorkoutStep) => {
    setWorkout((current) => ({
      ...current,
      warmUp: {
        ...step,
        stepType: "Warmup",
        title: step.title || "Warm Up",
      },
    }));
  }, []);

  const addRun = useCallback((step: WorkoutStep) => {
    setWorkout((current) => ({
      ...current,
      runs: [
        ...current.runs,
        {
          ...step,
          stepType: "Run",
          title: step.title || "Running",
        },
      ],
    }));
  }, []);

  const addEmptyRun = useCallback(() => {
    setWorkout((current) => ({
      ...current,
      runs: [
        ...current.runs,
        {
          title: "Running",
          stepType: "Run",
          inputType: "DURATION",
          duration: "",
          distance: "",
          unit: "Kilometers (km)",
          pace: "",
          repeat: 1,
          rest: "",
          skipLastRest: true,
          skipRest: false,
          notes: "",
        },
      ],
    }));
  }, []);

  const updateRun = useCallback((index: number, step: WorkoutStep) => {
    setWorkout((current) => ({
      ...current,
      runs: current.runs.map((existing, runIndex) =>
        runIndex === index
          ? { ...step, stepType: "Run", title: step.title || "Running" }
          : existing
      ),
    }));
  }, []);

  const addRunAfter = useCallback((index: number) => {
    setWorkout((current) => {
      const source = current.runs[index];
      if (!source) return current;
      const runs = [...current.runs];
      runs.splice(index + 1, 0, { ...source });
      return { ...current, runs };
    });
  }, []);

  const duplicateRunGroup = useCallback((index: number) => {
    setWorkout((current) => {
      const source = current.runs[index];
      if (!source) return current;
      const groupId = source.groupId || `run-group-${Date.now()}`;
      const groupedSource = {
        ...source,
        groupId,
        groupRepeat: source.groupRepeat || 1,
      };
      const duplicate = { ...groupedSource };
      const runs = current.runs.map((step, runIndex) =>
        runIndex === index ? groupedSource : step
      );
      runs.splice(index + 1, 0, duplicate);
      return { ...current, runs };
    });
  }, []);

  const updateRunRepeat = useCallback((index: number, repeat: number) => {
    setWorkout((current) => ({
      ...current,
      runs: current.runs.map((step, runIndex) =>
        runIndex === index ? { ...step, repeat: Math.max(1, Math.min(40, repeat)) } : step
      ),
    }));
  }, []);

  const updateRunSkipRest = useCallback((index: number, skipRest: boolean) => {
    setWorkout((current) => ({
      ...current,
      runs: current.runs.map((step, runIndex) =>
        runIndex === index ? { ...step, skipRest } : step
      ),
    }));
  }, []);

  const updateGroupRepeat = useCallback((groupId: string, repeat: number) => {
    setWorkout((current) => ({
      ...current,
      runs: current.runs.map((step) =>
        step.groupId === groupId
          ? { ...step, groupRepeat: Math.max(1, Math.min(40, repeat)) }
          : step
      ),
    }));
  }, []);

  const updateGroupSkipLastRest = useCallback((groupId: string, skipLastRest: boolean) => {
    setWorkout((current) => ({
      ...current,
      runs: current.runs.map((step) =>
        step.groupId === groupId ? { ...step, skipLastRest } : step
      ),
    }));
  }, []);

  const setCooldown = useCallback((step: WorkoutStep) => {
    setWorkout((current) => ({
      ...current,
      cooldown: {
        ...step,
        stepType: "Cooldown",
        title: step.title || "Cool Down",
      },
    }));
  }, []);

  const removeWarmUp = useCallback(() => {
    setWorkout((current) => ({ ...current, warmUp: null }));
  }, []);

  const removeRun = useCallback((index: number) => {
    setWorkout((current) => ({
      ...current,
      runs: current.runs.filter((_, runIndex) => runIndex !== index),
    }));
  }, []);

  const removeCooldown = useCallback(() => {
    setWorkout((current) => ({ ...current, cooldown: null }));
  }, []);

  // Converts the frontend state into DRF Serializer payload and saves to backend
  const saveWorkout = useCallback(async (): Promise<UserWorkoutResponse> => {
    try {
      setIsSaving(true);
      setError(null);

      if (!workout.runs || workout.runs.length === 0) {
        throw new Error("Workout must contain at least one Run segment.");
      }

      const segments: CustomWorkoutSegmentWritePayload[] = [];
      let order = 1;

      // 1. Warmup Segment (if present)
      if (workout.warmUp) {
        const durSec = timeStringToSeconds(workout.warmUp.duration);
        const distNum = workout.warmUp.distance ? parseFloat(workout.warmUp.distance) : null;
        const inputType: SegmentInputType =
          workout.warmUp.inputType || (distNum && !durSec ? "DISTANCE" : "DURATION");
        const distanceUnit = canonicalDistanceUnit(workout.warmUp.unit, "Warmup");

        segments.push({
          segment_order: order++,
          segment_type: "Warmup",
          input_type: inputType,
          duration: durSec,
          distance: distNum,
          distance_unit: distanceUnit,
          pace: cleanPaceString(workout.warmUp.pace),
          repeats: 1, // Warmup cannot repeat
          rest_duration: null, // Warmup cannot have rest
          skip_last_rest: true,
          notes: workout.warmUp.notes || "",
        });
      }

      // 2. Run Segments
      for (const run of workout.runs) {
        const durSec = timeStringToSeconds(run.duration);
        const distNum = run.distance ? parseFloat(run.distance) : null;
        const inputType: SegmentInputType =
          run.inputType || (distNum && !durSec ? "DISTANCE" : "DURATION");
        const distanceUnit = canonicalDistanceUnit(run.unit, "Run");
        const restSec = run.skipRest ? null : timeStringToSeconds(run.rest);

        segments.push({
          segment_order: order++,
          segment_type: "Run",
          input_type: inputType,
          duration: durSec,
          distance: distNum,
          distance_unit: distanceUnit,
          pace: cleanPaceString(run.pace),
          repeats: Math.max(1, Math.min(40, run.repeat || 1)),
          rest_duration: restSec,
          skip_last_rest: run.skipLastRest ?? true,
          notes: run.notes || "",
        });
      }

      // 3. Cooldown Segment (if present)
      if (workout.cooldown) {
        const durSec = timeStringToSeconds(workout.cooldown.duration);
        const distNum = workout.cooldown.distance ? parseFloat(workout.cooldown.distance) : null;
        const inputType: SegmentInputType =
          workout.cooldown.inputType || (distNum && !durSec ? "DISTANCE" : "DURATION");
        const distanceUnit = canonicalDistanceUnit(workout.cooldown.unit, "Cooldown");

        segments.push({
          segment_order: order++,
          segment_type: "Cooldown",
          input_type: inputType,
          duration: durSec,
          distance: distNum,
          distance_unit: distanceUnit,
          pace: cleanPaceString(workout.cooldown.pace),
          repeats: 1, // Cooldown cannot repeat
          rest_duration: null, // Cooldown cannot have rest
          skip_last_rest: true,
          notes: workout.cooldown.notes || "",
        });
      }

      const payload: CustomWorkoutWritePayload = {
        title: workout.title?.trim() || "Custom Workout",
        workout_date: workout.workoutDate || null,
        notes: workout.notes || "",
        segments,
      };

      let response;
      if (workout.id) {
        response = await customWorkoutAPI.update(workout.id, payload);
      } else {
        response = await customWorkoutAPI.create(payload);
      }

      return response.data;
    } catch (err: any) {
      const message = getBackendErrorMessage(err, "Failed to save custom workout.");
      setError(message);
      throw new Error(message);
    } finally {
      setIsSaving(false);
    }
  }, [workout]);

  // Load an existing workout from the backend for editing
  const loadWorkout = useCallback(async (id: number) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await customWorkoutAPI.get(id);
      const data = response.data;

      let loadedWarmUp: WorkoutStep | null = null;
      const loadedRuns: WorkoutStep[] = [];
      let loadedCooldown: WorkoutStep | null = null;

      const sortedSegments = [...(data.segments || [])].sort(
        (a, b) => a.segment_order - b.segment_order
      );

      for (const seg of sortedSegments) {
        const unitLabel =
          seg.distance_unit === "m"
            ? "Meters (m)"
            : seg.distance_unit === "mi"
            ? "Miles (mi)"
            : "Kilometers (km)";

        const step: WorkoutStep = {
          id: seg.id,
          title:
            seg.segment_type === "Warmup"
              ? "Warm Up"
              : seg.segment_type === "Cooldown"
              ? "Cool Down"
              : "Running",
          stepType: seg.segment_type,
          inputType: seg.input_type || "DURATION",
          duration: secondsToTimeString(seg.duration),
          distance: seg.distance != null ? String(seg.display_distance ?? seg.distance) : "",
          unit: unitLabel,
          pace: seg.pace || seg.target_pace || "",
          repeat: seg.repeats || 1,
          rest: secondsToTimeString(seg.rest_duration),
          skipLastRest: seg.skip_last_rest ?? true,
          skipRest: !seg.rest_duration,
          notes: seg.notes || "",
        };

        if (seg.segment_type === "Warmup" && !loadedWarmUp) {
          loadedWarmUp = step;
        } else if (seg.segment_type === "Cooldown" && !loadedCooldown) {
          loadedCooldown = step;
        } else {
          loadedRuns.push(step);
        }
      }

      setWorkout({
        id: data.id,
        title: data.title || "Custom Workout",
        workoutDate: data.workout_date,
        notes: data.notes || "",
        isCustom: data.is_custom ?? true,
        warmUp: loadedWarmUp,
        runs: loadedRuns,
        cooldown: loadedCooldown,
      });
    } catch (err: any) {
      const message = getBackendErrorMessage(err, "Failed to load workout.");
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteWorkout = useCallback(async (id: number) => {
    try {
      setIsLoading(true);
      setError(null);
      await customWorkoutAPI.delete(id);
      reset();
    } catch (err: any) {
      const message = getBackendErrorMessage(err, "Failed to delete workout.");
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, [reset]);

  return (
    <WorkoutContext.Provider
      value={{
        workout,
        isSaving,
        isLoading,
        error,
        setTitle,
        setWorkoutDate,
        setNotes,
        setWarmUp,
        addRun,
        addEmptyRun,
        updateRun,
        addRunAfter,
        duplicateRunGroup,
        updateRunRepeat,
        updateRunSkipRest,
        updateGroupRepeat,
        updateGroupSkipLastRest,
        setCooldown,
        removeWarmUp,
        removeRun,
        removeCooldown,
        reset,
        saveWorkout,
        loadWorkout,
        deleteWorkout,
      }}
    >
      {children}
    </WorkoutContext.Provider>
  );
}

export function useCustomWorkout() {
  const context = useContext(WorkoutContext);
  if (!context) {
    throw new Error(
      "useCustomWorkout must be used inside CustomWorkoutProvider"
    );
  }
  return context;
}
