import type { WorkoutExecutionStep } from "../utils/workoutPlanBuilder";
import { parsePaceToSeconds } from "../utils/workoutCalculations";

export interface PresetWorkout {
  id: string;
  title: string;
  subtitle: string;
  badge: "INTERVAL" | "LONG RUN" | "EASY RUN" | "TEMPO" | "PRESET";
  category: string;
  workoutType: "Interval" | "Long Run" | "Easy Run" | "Tempo Run";
  icon: "target" | "clock" | "activity" | "trending-up";
  durationMinutes?: number;
  distanceMeters?: number;
  repeats?: number;
  repDistanceMeters?: number;
  repDurationSeconds?: number;
  restDurationSeconds?: number;
  skipLastRest?: boolean;
  defaultFasterPace: string;
  defaultSlowerPace: string;
  paceUnit: "km" | "mi";
  description: string;
}

export const PRESET_WORKOUTS: PresetWorkout[] = [
  {
    id: "preset-interval-10x400",
    title: "10 x 400 m Interval Run",
    subtitle: "Interval Run",
    badge: "INTERVAL",
    category: "Speed & VO2 Max",
    workoutType: "Interval",
    icon: "target",
    repeats: 10,
    repDistanceMeters: 400,
    restDurationSeconds: 180, // 3 min recovery
    skipLastRest: true,
    defaultFasterPace: "4:30",
    defaultSlowerPace: "5:30",
    paceUnit: "km",
    description: "High-intensity intervals designed to sharpen speed, running economy, and aerobic power.",
  },
  {
    id: "preset-long-run-70",
    title: "70-Minute Long Run",
    subtitle: "Long Run",
    badge: "LONG RUN",
    category: "Endurance & Stamina",
    workoutType: "Long Run",
    icon: "clock",
    durationMinutes: 70,
    defaultFasterPace: "7:00",
    defaultSlowerPace: "8:00",
    paceUnit: "km",
    description: "Aerobic endurance builder. Stay relaxed within your comfortable conversational zone.",
  },
  {
    id: "preset-easy-run-30",
    title: "30-Minute Easy Run",
    subtitle: "Easy Run",
    badge: "EASY RUN",
    category: "Aerobic Recovery",
    workoutType: "Easy Run",
    icon: "activity",
    durationMinutes: 30,
    defaultFasterPace: "6:30",
    defaultSlowerPace: "7:30",
    paceUnit: "km",
    description: "Gentle aerobic conditioning to stimulate recovery, blood flow, and base fitness.",
  },
  {
    id: "preset-tempo-run-20",
    title: "20-Minute Tempo Run",
    subtitle: "Tempo Run",
    badge: "TEMPO",
    category: "Lactate Threshold",
    workoutType: "Tempo Run",
    icon: "trending-up",
    durationMinutes: 30, // 5 min warmup + 20 min tempo + 5 min cooldown
    defaultFasterPace: "5:00",
    defaultSlowerPace: "5:45",
    paceUnit: "km",
    description: "Sustained comfortably hard effort just below lactate threshold to boost stamina.",
  },
];

/**
 * Build a structured WorkoutExecutionStep array from a preset workout
 * with customized user pace range and skip last rest setting.
 */
export function buildPlanFromPreset(
  preset: PresetWorkout,
  customFasterPace?: string,
  customSlowerPace?: string,
  skipLastRestOverride?: boolean,
  customRestSec?: number,
  disableRecovery?: boolean
): WorkoutExecutionStep[] {
  const steps: WorkoutExecutionStep[] = [];
  const targetPace = customFasterPace || preset.defaultFasterPace;
  const skipRest = skipLastRestOverride ?? preset.skipLastRest ?? true;

  if (preset.id === "preset-interval-10x400") {
    const totalSets = preset.repeats || 10;
    const repMeters = preset.repDistanceMeters || 400;
    const restSec = customRestSec ?? preset.restDurationSeconds ?? 180;
    let stepIndex = 1;

    for (let set = 1; set <= totalSets; set++) {
      steps.push({
        id: `preset-step-${stepIndex++}-run-${set}`,
        title: `Run ${set} (${repMeters} m)`,
        stepType: "Run",
        setNumber: set,
        totalSets,
        targetType: "DISTANCE",
        targetDistanceMeters: repMeters,
        targetPace: `${targetPace} / km`,
        unit: "Meters (m)",
        notes: `Set ${set} of ${totalSets} at ${targetPace} /km`,
      });

      const isLastSet = set === totalSets;
      if (!disableRecovery && (!isLastSet || !skipRest)) {
        steps.push({
          id: `preset-step-${stepIndex++}-rest-${set}`,
          title: `Recover ${set}`,
          stepType: "Rest",
          setNumber: set,
          totalSets,
          targetType: "DURATION",
          targetDurationSeconds: restSec,
          unit: "Seconds",
          notes: "Catch your breath and jog lightly or walk.",
        });
      }
    }
    return steps;
  }

  if (preset.id === "preset-tempo-run-20") {
    return [
      {
        id: "tempo-warmup",
        title: "Warm Up",
        stepType: "Warmup",
        targetType: "DURATION",
        targetDurationSeconds: 5 * 60,
        unit: "Minutes",
        notes: "Easy jogging to prepare muscles and elevate heart rate.",
      },
      {
        id: "tempo-main",
        title: "Tempo Run",
        stepType: "Run",
        setNumber: 1,
        totalSets: 1,
        targetType: "DURATION",
        targetDurationSeconds: 20 * 60,
        targetPace: `${targetPace} / km`,
        unit: "Minutes",
        notes: "Comfortably hard threshold effort.",
      },
      {
        id: "tempo-cooldown",
        title: "Cool Down",
        stepType: "Cooldown",
        targetType: "DURATION",
        targetDurationSeconds: 5 * 60,
        unit: "Minutes",
        notes: "Slow recovery jog to bring heart rate back to baseline.",
      },
    ];
  }

  // Continuous run (Long Run or Easy Run)
  const durationSec = (preset.durationMinutes || 30) * 60;
  return [
    {
      id: `preset-run-${preset.id}`,
      title: preset.title,
      stepType: "Run",
      setNumber: 1,
      totalSets: 1,
      targetType: "DURATION",
      targetDurationSeconds: durationSec,
      targetPace: `${targetPace} / km`,
      unit: "Minutes",
      notes: preset.description,
    },
  ];
}

