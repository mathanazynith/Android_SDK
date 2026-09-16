import { timeStringToSeconds, type UserWorkoutResponse } from "../../service/customWorkout";

export interface WorkoutStepInput {
  id?: number;
  title?: string;
  stepType?: "Warmup" | "Run" | "Cooldown" | string;
  inputType?: "DURATION" | "DISTANCE" | string;
  duration?: string;
  distance?: string;
  unit?: string;
  pace?: string;
  repeat?: number;
  rest?: string;
  skipLastRest?: boolean;
  skipRest?: boolean;
  notes?: string;
  groupId?: string;
  groupRepeat?: number;
}

export interface WorkoutStateInput {
  id?: number | null;
  title?: string;
  workoutDate?: string | null;
  notes?: string;
  isCustom?: boolean;
  warmUp?: WorkoutStepInput | null;
  runs?: WorkoutStepInput[];
  cooldown?: WorkoutStepInput | null;
}

export interface WorkoutExecutionStep {
  id: string;
  title: string;
  stepType: "Warmup" | "Run" | "Rest" | "Cooldown";
  setNumber?: number;
  totalSets?: number;
  targetType: "DURATION" | "DISTANCE" | "OPEN";
  targetDurationSeconds?: number;
  targetDistanceMeters?: number;
  targetPace?: string;
  unit?: string;
  notes?: string;
  targetText?: string;
}

export const parseFlexibleSeconds = (str?: string): number => {
  if (!str || !str.trim()) return 0;
  const direct = timeStringToSeconds(str);
  if (direct != null && direct > 0) return direct;
  const minMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:min|m\b)/i);
  if (minMatch) return Math.round(parseFloat(minMatch[1]) * 60);
  const secMatch = str.match(/(\d+)\s*(?:sec|s\b)/i);
  if (secMatch) return parseInt(secMatch[1], 10);
  return 0;
};

export const parseMetersFromDistance = (distStr?: string, unitStr?: string): number | undefined => {
  if (!distStr || !distStr.trim()) return undefined;
  const num = parseFloat(distStr);
  if (isNaN(num) || num <= 0) return undefined;

  const rawLower = distStr.toLowerCase();
  if (rawLower.includes("m") && !rawLower.includes("km") && !rawLower.includes("mi")) {
    return Math.round(num);
  }
  const lowerUnit = (unitStr || (rawLower.includes("mi") ? "mi" : "km")).toLowerCase();
  if (lowerUnit.includes("mi")) {
    return Math.round(num * 1609.344);
  }
  if (lowerUnit.includes("m") && !lowerUnit.includes("km")) {
    return Math.round(num);
  }
  return Math.round(num * 1000);
};

export function buildPlanFromWorkoutState(workout: WorkoutStateInput): WorkoutExecutionStep[] {
  const steps: WorkoutExecutionStep[] = [];
  let stepIndex = 1;

  // 1. Warm Up
  if (workout.warmUp) {
    const durSec = timeStringToSeconds(workout.warmUp.duration) || 0;
    const distMeters = parseMetersFromDistance(workout.warmUp.distance, workout.warmUp.unit);
    const isDist = workout.warmUp.inputType === "DISTANCE" && Boolean(distMeters);

    steps.push({
      id: `step-${stepIndex++}-warmup`,
      title: workout.warmUp.title || "Warm Up",
      stepType: "Warmup",
      targetType: isDist ? "DISTANCE" : durSec > 0 ? "DURATION" : "OPEN",
      targetDurationSeconds: durSec > 0 ? durSec : undefined,
      targetDistanceMeters: distMeters,
      targetPace: workout.warmUp.pace || undefined,
      unit: workout.warmUp.unit || "Kilometers (km)",
      notes: workout.warmUp.notes || "",
    });
  }

  // 2. Runs & Repeats
  const runs = workout.runs || [];
  for (let rIdx = 0; rIdx < runs.length; rIdx++) {
    const run = runs[rIdx];
    const totalSets = Math.max(1, Math.min(40, run.repeat || 1));
    const durSec = timeStringToSeconds(run.duration) || 0;
    const distMeters = parseMetersFromDistance(run.distance, run.unit);
    const isDist = run.inputType === "DISTANCE" && Boolean(distMeters);
    const restSec = timeStringToSeconds(run.rest) || 0;
    const hasRest = !run.skipRest && restSec > 0;
    const skipLastRest = run.skipLastRest ?? true;

    for (let set = 1; set <= totalSets; set++) {
      steps.push({
        id: `step-${stepIndex++}-run-${rIdx + 1}-set-${set}`,
        title: totalSets > 1 ? `${run.title || "Running"} (Set ${set}/${totalSets})` : run.title || "Running",
        stepType: "Run",
        setNumber: set,
        totalSets,
        targetType: isDist ? "DISTANCE" : durSec > 0 ? "DURATION" : "OPEN",
        targetDurationSeconds: durSec > 0 ? durSec : undefined,
        targetDistanceMeters: distMeters,
        targetPace: run.pace || undefined,
        unit: run.unit || "Kilometers (km)",
        notes: run.notes || "",
      });

      // Insert recovery rest if configured
      const isLastSetOfRun = set === totalSets;
      if (hasRest && (!isLastSetOfRun || !skipLastRest)) {
        steps.push({
          id: `step-${stepIndex++}-rest-${rIdx + 1}-set-${set}`,
          title: totalSets > 1 ? `Recovery Rest (${set}/${totalSets})` : "Recovery Rest",
          stepType: "Rest",
          setNumber: set,
          totalSets,
          targetType: "DURATION",
          targetDurationSeconds: restSec,
          unit: "Seconds",
        });
      }
    }
  }

  // 3. Cool Down
  if (workout.cooldown) {
    const durSec = timeStringToSeconds(workout.cooldown.duration) || 0;
    const distMeters = parseMetersFromDistance(workout.cooldown.distance, workout.cooldown.unit);
    const isDist = workout.cooldown.inputType === "DISTANCE" && Boolean(distMeters);

    steps.push({
      id: `step-${stepIndex++}-cooldown`,
      title: workout.cooldown.title || "Cool Down",
      stepType: "Cooldown",
      targetType: isDist ? "DISTANCE" : durSec > 0 ? "DURATION" : "OPEN",
      targetDurationSeconds: durSec > 0 ? durSec : undefined,
      targetDistanceMeters: distMeters,
      targetPace: workout.cooldown.pace || undefined,
      unit: workout.cooldown.unit || "Kilometers (km)",
      notes: workout.cooldown.notes || "",
    });
  }

  return steps;
}

export function buildPlanFromUserWorkout(workout: UserWorkoutResponse): WorkoutExecutionStep[] {
  const steps: WorkoutExecutionStep[] = [];
  let stepIndex = 1;

  const sortedSegments = [...(workout.segments || [])].sort(
    (a, b) => a.segment_order - b.segment_order
  );

  for (const seg of sortedSegments) {
    const totalSets = Math.max(1, seg.repeats || 1);
    const durSec = seg.duration || 0;
    let distMeters = seg.distance || seg.rep_distance || undefined;
    if (distMeters == null && seg.display_distance != null && seg.display_distance > 0) {
      const u = (seg.distance_unit || "km").toLowerCase();
      if (u.includes("mi")) distMeters = Math.round(seg.display_distance * 1609.344);
      else if (u === "m") distMeters = Math.round(seg.display_distance);
      else distMeters = Math.round(seg.display_distance * 1000);
    }
    const isDist = seg.input_type === "DISTANCE" && Boolean(distMeters && distMeters > 0);
    const restSec = seg.rest_duration || 0;
    const hasRest = restSec > 0;
    const skipLastRest = seg.skip_last_rest ?? true;

    for (let set = 1; set <= totalSets; set++) {
      const title =
        seg.segment_type === "Warmup"
          ? "Warm Up"
          : seg.segment_type === "Cooldown"
          ? "Cool Down"
          : totalSets > 1
          ? `Running (Set ${set}/${totalSets})`
          : "Running";

      steps.push({
        id: `step-${stepIndex++}-${seg.segment_type.toLowerCase()}-${seg.id || set}`,
        title,
        stepType: seg.segment_type,
        setNumber: set,
        totalSets,
        targetType: isDist ? "DISTANCE" : durSec > 0 ? "DURATION" : "OPEN",
        targetDurationSeconds: durSec > 0 ? durSec : undefined,
        targetDistanceMeters: distMeters,
        targetPace: seg.pace || seg.target_pace || undefined,
        unit: seg.distance_unit || "km",
        notes: seg.notes || "",
      });

      const isLastSet = set === totalSets;
      if (seg.segment_type === "Run" && hasRest && (!isLastSet || !skipLastRest)) {
        steps.push({
          id: `step-${stepIndex++}-rest-${seg.id || set}`,
          title: totalSets > 1 ? `Recovery Rest (${set}/${totalSets})` : "Recovery Rest",
          stepType: "Rest",
          setNumber: set,
          totalSets,
          targetType: "DURATION",
          targetDurationSeconds: restSec,
          unit: "Seconds",
        });
      }
    }
  }

  return steps;
}

export function buildPlanFromPlanSegments(
  segments: any[],
  workoutTitle: string = "Running"
): WorkoutExecutionStep[] {
  const steps: WorkoutExecutionStep[] = [];
  let stepIndex = 1;

  for (const seg of segments) {
    const rawType = String(seg.type || seg.segment_type || "run").toLowerCase();
    const isWarmup = rawType.includes("warmup");
    const isCooldown = rawType.includes("cooldown");
    const isRest = rawType.includes("rest");
    const stepType: "Warmup" | "Run" | "Rest" | "Cooldown" = isWarmup
      ? "Warmup"
      : isCooldown
      ? "Cooldown"
      : isRest
      ? "Rest"
      : "Run";

    const totalSets = Math.max(1, Math.min(40, seg.repeats || 1));
    const durSec = typeof seg.duration === "number" ? seg.duration : parseFlexibleSeconds(seg.duration);
    const distMeters =
      typeof seg.rep_distance === "number"
        ? seg.rep_distance
        : typeof seg.distance === "number"
        ? seg.distance
        : parseMetersFromDistance(seg.distance || seg.rep_distance, "km");
    const isDist = Boolean(distMeters && distMeters > 0);
    const restSec =
      typeof seg.rest_duration === "number"
        ? seg.rest_duration
        : parseFlexibleSeconds(seg.rest);

    for (let set = 1; set <= totalSets; set++) {
      const stepTitle = isWarmup
        ? "Warm Up"
        : isCooldown
        ? "Cool Down"
        : totalSets > 1
        ? `${seg.notes || workoutTitle || "Run"} (Set ${set}/${totalSets})`
        : seg.notes || workoutTitle || "Run";

      steps.push({
        id: `step-${stepIndex++}-${stepType.toLowerCase()}-set-${set}`,
        title: stepTitle,
        stepType,
        setNumber: set,
        totalSets,
        targetType: isDist ? "DISTANCE" : durSec > 0 ? "DURATION" : "OPEN",
        targetDurationSeconds: durSec > 0 ? durSec : undefined,
        targetDistanceMeters: distMeters,
        targetPace: seg.pace || seg.target_pace || undefined,
        notes: seg.notes || "",
      });

      // Insert recovery rest between repeats if applicable
      if (restSec > 0 && set < totalSets && !isWarmup && !isCooldown) {
        steps.push({
          id: `step-${stepIndex++}-rest-set-${set}`,
          title: `Recovery Rest (${set}/${totalSets})`,
          stepType: "Rest",
          setNumber: set,
          totalSets,
          targetType: "DURATION",
          targetDurationSeconds: restSec,
          unit: "Seconds",
        });
      }
    }
  }

  return steps;
}

export function buildWorkoutExecutionPlan(workout: WorkoutStateInput | UserWorkoutResponse): WorkoutExecutionStep[] {
  if ("runs" in workout && Array.isArray((workout as any).runs)) {
    return buildPlanFromWorkoutState(workout as WorkoutStateInput);
  }
  if ("segments" in workout && Array.isArray((workout as any).segments)) {
    return buildPlanFromUserWorkout(workout as UserWorkoutResponse);
  }
  return [];
}

export function formatStepTarget(step?: WorkoutExecutionStep | null): string {
  if (!step) return "";
  if (step.targetType === "DURATION" && step.targetDurationSeconds) {
    const mins = Math.floor(step.targetDurationSeconds / 60);
    const secs = step.targetDurationSeconds % 60;
    if (mins > 0 && secs > 0) return `${mins}m ${secs}s`;
    if (mins > 0) return `${mins} min`;
    return `${secs} sec`;
  }
  if (step.targetType === "DISTANCE" && step.targetDistanceMeters) {
    const km = (step.targetDistanceMeters / 1000).toFixed(2);
    return `${km} km`;
  }
  return "Open target";
}

export function getStepSpeechCue(step: WorkoutExecutionStep): string {
  const targetText = formatStepTarget(step);
  const paceText = step.targetPace ? ` at ${step.targetPace}` : "";

  if (step.stepType === "Warmup") {
    return `Starting Warm Up. Target: ${targetText}.`;
  }
  if (step.stepType === "Run") {
    if (step.totalSets && step.totalSets > 1) {
      return `Starting Run, set ${step.setNumber} of ${step.totalSets}. Target: ${targetText}${paceText}.`;
    }
    return `Starting Run. Target: ${targetText}${paceText}.`;
  }
  if (step.stepType === "Rest") {
    return `Recovery Rest for ${targetText}. Catch your breath.`;
  }
  if (step.stepType === "Cooldown") {
    return `Starting Cool Down. Target: ${targetText}.`;
  }
  return `Starting ${step.title}.`;
}
