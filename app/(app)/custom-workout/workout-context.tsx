import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { getBackendErrorMessage } from "../../../service/api";
import {
    canonicalDistanceUnit,
    cleanPaceString,
    CustomSegmentType,
    customWorkoutAPI,
    CustomWorkoutSegmentWritePayload,
    CustomWorkoutWritePayload,
    secondsToTimeString,
    SegmentInputType,
    timeStringToSeconds,
    UserWorkoutResponse,
} from "../../../service/customWorkout";
import { getUnitFullLabel, normalizeUnit } from "../../../src/utils/workoutCalculations";

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

const createDefaultWorkout = (): WorkoutState => ({
  id: null,
  title: "Custom Workout",
  workoutDate: getTodayDateString(),
  notes: "",
  isCustom: true,
  warmUp: null,
  runs: [
    {
      title: "Running",
      stepType: "Run",
      inputType: "DURATION",
      duration: "00:10:00",
      distance: "2.00",
      unit: "Kilometers (km)",
      pace: "05:00 /km",
      repeat: 1,
      rest: "",
      skipLastRest: true,
      skipRest: false,
      notes: "",
    },
    {
      title: "Running",
      stepType: "Run",
      inputType: "DURATION",
      duration: "00:05:00",
      distance: "1.00",
      unit: "Kilometers (km)",
      pace: "05:00 /km",
      repeat: 1,
      rest: "00:01:00",
      skipLastRest: true,
      skipRest: false,
      groupId: `run-group-${Date.now()}`,
      groupRepeat: 1,
      notes: "",
    },
  ],
  cooldown: null,
});

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
  addRepeatRun: () => void;
  updateRun: (index: number, step: WorkoutStep) => void;
  addRunAfter: (index: number) => void;
  duplicateRunGroup: (index: number) => void;
  updateRunRepeat: (index: number, repeat: number) => void;
  updateRunRest: (index: number, rest: string, skipLastRest?: boolean) => void;
  updateRunSkipRest: (index: number, skipRest: boolean) => void;
  updateRunSkipLastRest: (index: number, skipLastRest: boolean) => void;
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
  const [workout, setWorkout] = useState<WorkoutState>(createDefaultWorkout);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setWorkout(createDefaultWorkout());
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
    setWorkout((current) => {
      const newStep: WorkoutStep = {
        title: "Running",
        stepType: "Run",
        inputType: "DURATION",
        duration: "00:10:00",
        distance: "2.00",
        unit: "Kilometers (km)",
        pace: "05:00 /km",
        repeat: 1,
        rest: "",
        skipLastRest: true,
        skipRest: false,
        notes: "",
      };
      const firstGroupIdx = current.runs.findIndex((r) => Boolean(r.groupId));
      const insertIndex = firstGroupIdx !== -1 ? firstGroupIdx : 0;
      const runs = [...current.runs];
      runs.splice(insertIndex, 0, newStep);
      return {
        ...current,
        runs,
      };
    });
  }, []);

  const addRepeatRun = useCallback(() => {
    setWorkout((current) => {
      const existingGroup = current.runs.find((r) => Boolean(r.groupId));
      const groupId = existingGroup?.groupId || `run-group-${Date.now()}`;

      const newRepeatStep: WorkoutStep = {
        title: "Running",
        stepType: "Run",
        inputType: "DURATION",
        duration: "00:05:00",
        distance: "1.00",
        unit: "Kilometers (km)",
        pace: "05:00 /km",
        repeat: 1,
        rest: "00:01:00",
        skipLastRest: true,
        skipRest: false,
        groupId,
        groupRepeat: 1,
        notes: "",
      };

      return {
        ...current,
        runs: [...current.runs, newRepeatStep],
      };
    });
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

  const updateRunRest = useCallback((index: number, rest: string, skipLastRest = true) => {
    setWorkout((current) => ({
      ...current,
      runs: current.runs.map((step, runIndex) =>
        runIndex === index
          ? {
              ...step,
              rest,
              skipRest: !rest || rest === "00:00:00" ? true : (step.skipRest ?? false),
              skipLastRest,
            }
          : step
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

  const updateRunSkipLastRest = useCallback((index: number, skipLastRest: boolean) => {
    setWorkout((current) => ({
      ...current,
      runs: current.runs.map((step, runIndex) =>
        runIndex === index ? { ...step, skipLastRest } : step
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
        const isTimeBased =
          workout.warmUp.inputType === "DURATION" ||
          (!workout.warmUp.distance && !!workout.warmUp.duration);
        const durSec = isTimeBased
          ? timeStringToSeconds(workout.warmUp.duration)
          : null;
        const distNum =
          !isTimeBased && workout.warmUp.distance
            ? parseFloat(workout.warmUp.distance)
            : null;
        const distanceUnit = isTimeBased
          ? null
          : canonicalDistanceUnit(workout.warmUp.unit, "Warmup");

        segments.push({
          segment_order: order++,
          segment_type: "Warmup",
          input_type: isTimeBased ? "DURATION" : "DISTANCE",
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
          repeats: Math.max(
            1,
            Math.min(40, (run.repeat || 1) * (run.groupRepeat || 1))
          ),
          rest_duration: restSec,
          skip_last_rest: run.skipLastRest ?? true,
          notes: run.groupId
            ? run.notes
              ? `${run.notes} [group:${run.groupId}]`
              : `[group:${run.groupId}]`
            : run.notes || "",
        });
      }

      // 3. Cooldown Segment (if present)
      if (workout.cooldown) {
        const isTimeBased =
          workout.cooldown.inputType === "DURATION" ||
          (!workout.cooldown.distance && !!workout.cooldown.duration);
        const durSec = isTimeBased
          ? timeStringToSeconds(workout.cooldown.duration)
          : null;
        const distNum =
          !isTimeBased && workout.cooldown.distance
            ? parseFloat(workout.cooldown.distance)
            : null;
        const distanceUnit = isTimeBased
          ? null
          : canonicalDistanceUnit(workout.cooldown.unit, "Cooldown");

        segments.push({
          segment_order: order++,
          segment_type: "Cooldown",
          input_type: isTimeBased ? "DURATION" : "DISTANCE",
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

      if (response?.data?.id) {
        setWorkout((prev) => ({
          ...prev,
          id: response.data.id,
        }));
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
        const unitType = normalizeUnit(seg.distance_unit);
        const unitLabel = getUnitFullLabel(unitType);

        let loadedDistance = "";
        if (seg.display_distance != null && Number(seg.display_distance) > 0) {
          loadedDistance = String(seg.display_distance);
        } else if (seg.rep_distance != null && seg.rep_distance > 0) {
          if (unitType === "m") loadedDistance = String(seg.rep_distance);
          else if (unitType === "mi") loadedDistance = (seg.rep_distance / 1609.344).toFixed(2);
          else loadedDistance = (seg.rep_distance / 1000).toFixed(2);
        } else if (seg.distance != null && seg.distance > 0) {
          if (unitType === "m") loadedDistance = String(seg.distance);
          else if (unitType === "mi") loadedDistance = (seg.distance / 1609.344).toFixed(2);
          else loadedDistance = (seg.distance / 1000).toFixed(2);
        }

        let cleanNotes = seg.notes || "";
        let loadedGroupId: string | undefined = undefined;
        const groupMatch = cleanNotes.match(/\[group:([^\]]+)\]/);
        if (groupMatch) {
          loadedGroupId = groupMatch[1];
          cleanNotes = cleanNotes.replace(/\[group:[^\]]+\]/, "").trim();
        }

        // Auto-detect repeat group if segment has repeats > 1 or rest > 0
        const isRepeatGroupItem =
          Boolean(loadedGroupId) ||
          (seg.repeats != null && seg.repeats > 1) ||
          (seg.rest_duration != null && seg.rest_duration > 0);

        if (isRepeatGroupItem && !loadedGroupId) {
          loadedGroupId = `run-group-${seg.id || seg.segment_order}`;
        }

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
          distance: loadedDistance,
          unit: unitLabel,
          pace: seg.pace || seg.target_pace || "",
          repeat: seg.repeats || 1,
          rest: secondsToTimeString(seg.rest_duration),
          skipLastRest: seg.skip_last_rest ?? true,
          skipRest: !seg.rest_duration,
          notes: cleanNotes,
          groupId: loadedGroupId,
          groupRepeat: 1,
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
        addRepeatRun,
        updateRun,
        addRunAfter,
        duplicateRunGroup,
        updateRunRepeat,
        updateRunRest,
        updateRunSkipRest,
        updateRunSkipLastRest,
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
