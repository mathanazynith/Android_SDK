import { Alert } from '@/components/ThemedAlert';
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BenchmarkBadgeIcon from "../../../components/BenchmarkBadgeIcon";
import ThemedCalendarPicker from "../../../components/common/ThemedCalendarPicker";
import { RunningLoader } from "../../../components/common/RunningLoader";
import MotionEntrance from "../../../components/MotionEntrance";
import { ScrollTimePicker } from "../../../components/ScrollTimePicker";
import { useTheme, type ThemeColors } from "../../../contexts/ThemeContext";
import { clearCachedAssignedRoute, customWorkoutAPI, getCachedAssignedRoute, type SuggestedRoute } from "../../../service/customWorkout";
import { BenchmarkStore } from "../../../src/services/benchmarkStore";
import {
    normalizeUnit,
    parsePaceToSeconds,
} from "../../../src/utils/workoutCalculations";
import { buildWorkoutExecutionPlan } from "../../../src/utils/workoutPlanBuilder";
import {
    useCustomWorkout,
    type WorkoutStep,
} from "./workout-context";

const seconds = (value: string) => {
  if (!value) return 0;
  const parts = value.split(":").map(Number);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
};

const distanceInKm = (step: WorkoutStep) => {
  if (step.distance && step.distance.trim() !== "") {
    const raw = step.distance.replace(",", ".");
    const value = Number.parseFloat(raw) || 0;
    if (value > 0) {
      const unit = normalizeUnit(step.unit);
      if (unit === "m") return value / 1000;
      if (unit === "mi") return value * 1.609344;
      return value;
    }
  }
  const stepSec = seconds(step.duration || "00:00:00");
  if (stepSec > 0) {
    const defaultPace = step.stepType === "Warmup" ? 400 : step.stepType === "Cooldown" ? 500 : 300;
    const paceSec = parsePaceToSeconds(step.pace) || defaultPace;
    return stepSec / paceSec;
  }
  return 0;
};

const estimatedStepSeconds = (step: WorkoutStep) => {
  const declaredTime = seconds(step.duration || "00:00:00");
  if (declaredTime > 0) return declaredTime;
  const defaultPace = step.stepType === "Warmup" ? 400 : step.stepType === "Cooldown" ? 500 : 300;
  const paceSec = parsePaceToSeconds(step.pace) || defaultPace;
  const raw = step.distance ? step.distance.replace(",", ".") : "";
  const distNum = Number.parseFloat(raw) || 0;
  if (!paceSec || distNum <= 0) return 0;
  const unit = normalizeUnit(step.unit);
  let distInKm = distNum;
  if (unit === "m") {
    distInKm = distNum / 1000;
  } else if (unit === "mi") {
    distInKm = distNum * 1.609344;
  }
  return Math.round(distInKm * paceSec);
};

const estimatedRestSeconds = (step: WorkoutStep) => {
  const isRepeated = (step.repeat || 1) > 1 || Boolean(step.groupId);
  if (!isRepeated) return 0;
  const restSec = seconds(step.rest || "00:01:00");
  const repeatCount = step.repeat || 1;
  const restCount = (step.skipLastRest ?? true) ? Math.max(repeatCount - 1, 0) : repeatCount;
  return restSec * restCount;
};

const displayTime = (value: number) => {
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = Math.round(value % 60);
  if (h > 0 && m > 0) {
    return `${h}h ${m}min`;
  }
  if (h > 0) {
    return `${h}h`;
  }
  if (m > 0 && s > 0) {
    return `${m}min ${s}s`;
  }
  if (m > 0) {
    return `${m}min`;
  }
  return `${s}s`;
};

const hasDistance = (step: WorkoutStep) => {
  if (!step.distance) return false;
  const raw = step.distance.replace(",", ".");
  return (Number.parseFloat(raw) || 0) > 0;
};

const hasDuration = (step: WorkoutStep) =>
  seconds(step.duration || "00:00:00") > 0;

const hasPace = (step: WorkoutStep) =>
  Boolean(step.pace && step.pace.trim() !== "");

const distanceText = (step: WorkoutStep) => {
  if (!hasDistance(step)) return "";
  const unit = normalizeUnit(step.unit);
  return `${step.distance} ${unit}`;
};

const stepTimeText = (step: WorkoutStep) => {
  if (hasDuration(step)) return step.duration;
  const est = estimatedStepSeconds(step);
  return est > 0 ? displayTime(est) : "";
};

const isEmptyStep = (step: WorkoutStep) =>
  !hasDistance(step) && !hasDuration(step) && !hasPace(step);

const routeDistanceText = (route: SuggestedRoute) =>
  `${(Number(route.distance || 0) / 1000).toFixed(2)} km`;

function getStepCategory(step: WorkoutStep): "warmup" | "run" | "cooldown" {
  const typeLower = String(step.stepType || "").toLowerCase();
  const titleLower = String(step.title || "").toLowerCase();
  if (typeLower === "warmup" || titleLower.includes("warm")) {
    return "warmup";
  }
  if (typeLower === "cooldown" || titleLower.includes("cool")) {
    return "cooldown";
  }
  return "run";
}

function getStepColor(step: WorkoutStep, defaultColor = "#30D158"): string {
  const cat = getStepCategory(step);
  if (cat === "warmup") return "#FF5722";
  if (cat === "cooldown") return "#0A84FF";
  return defaultColor;
}

function StepSilhouette({
  type,
  size = 22,
  color,
}: {
  type: "warmup" | "run" | "cooldown";
  size?: number;
  color: string;
}) {
  if (type === "warmup") {
    return (
      <MaterialCommunityIcons
        name="human-handsup"
        size={size}
        color={color}
      />
    );
  }
  if (type === "run") {
    return (
      <MaterialCommunityIcons
        name="run-fast"
        size={size}
        color={color}
      />
    );
  }
  return (
    <MaterialCommunityIcons
      name="walk"
      size={size}
      color={color}
    />
  );
}

function StepSuggestionBox({
  title,
  color,
  onPress,
}: {
  title: string;
  color: string;
  onPress: () => void;
  type?: "warmup" | "run" | "cooldown";
  subtitle?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity
      activeOpacity={0.76}
      onPress={onPress}
      style={[
        styles.suggestionBox,
        {
          borderColor: `${color}45`,
          backgroundColor: `${color}0E`,
        },
      ]}
    >
      <Text style={[styles.suggestionTitle, { color }]} numberOfLines={1}>
        {title}
      </Text>
      {/* <View
        style={[
          styles.suggestionActionBadge,
          { backgroundColor: `${color}22` },
        ]}
      >
        <Feather name="plus" size={11} color={color} style={{ marginRight: 3 }} />
        <Text style={[styles.suggestionActionText, { color }]}>Add</Text>
      </View> */}
    </TouchableOpacity>
  );
}

function StepCard({
  step,
  color,
  selected,
  index,
  editable = true,
  onSelect,
  onRepeat,
  onMoreOptions,
  onDelete,
}: {
  step: WorkoutStep;
  color: string;
  selected?: boolean;
  index?: number;
  editable?: boolean;
  onSelect?: () => void;
  onRepeat?: () => void;
  onMoreOptions?: () => void;
  onDelete?: () => void;
  repeat?: boolean;
  number?: number;
  setLabel?: string;
  onSkipLastRest?: (skipLast: boolean) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const openStep = () => {
    if (!editable) return;
    if (onSelect) {
      onSelect();
    } else {
      router.push(
        step.title === "Warm Up" || step.stepType === "Warmup"
          ? "/custom-workout?step=warmup"
          : step.title === "Cool Down" || step.stepType === "Cooldown"
            ? "/custom-workout/cooldown"
            : `/custom-workout/running-declaration?index=${index}`,
      );
    }
  };

  if (isEmptyStep(step)) {
    if (!editable) return null;
    return (
      <EmptyStepCard
        title={step.title || "Run"}
        color={color}
        onPress={openStep}
      />
    );
  }

  // Step Distance, Pace, and Duration display (consistent across Warmup, Run, Cooldown)
  let dist = hasDistance(step) ? distanceText(step) : null;
  let paceStr = hasPace(step) ? `Pace · ${step.pace} min/km` : null;
  let displayStepTime = stepTimeText(step);

  const stepSec = estimatedStepSeconds(step);
  const stepDistKm = distanceInKm(step);

  // If pace is missing, but duration & distance exist:
  if (!paceStr && stepSec > 0 && stepDistKm > 0) {
    const paceSec = Math.round(stepSec / stepDistKm);
    const m = Math.floor(paceSec / 60);
    const s = paceSec % 60;
    paceStr = `Pace · ${m}:${String(s).padStart(2, "0")} min/km`;
  }

  // If distance is missing, but duration exists:
  if (!dist && stepSec > 0) {
    const paceSec = (hasPace(step) ? parsePaceToSeconds(step.pace) : null) || (step.stepType === "Warmup" ? 400 : step.stepType === "Cooldown" ? 500 : 300);
    const km = stepSec / (paceSec || 300);
    dist = `${km.toFixed(2)} km`;
    if (!paceStr) {
      const m = Math.floor(paceSec / 60);
      const s = paceSec % 60;
      paceStr = `Pace · ${m}:${String(s).padStart(2, "0")} min/km`;
    }
  }

  // If duration is missing, but distance exists:
  if ((!displayStepTime || displayStepTime === "--:--") && stepDistKm > 0) {
    const paceSec = (hasPace(step) ? parsePaceToSeconds(step.pace) : null) || (step.stepType === "Warmup" ? 400 : step.stepType === "Cooldown" ? 500 : 300);
    displayStepTime = displayTime(Math.round(stepDistKm * (paceSec || 300)));
    if (!paceStr) {
      const m = Math.floor(paceSec / 60);
      const s = paceSec % 60;
      paceStr = `Pace · ${m}:${String(s).padStart(2, "0")} min/km`;
    }
  }

  const category = getStepCategory(step);

  return (
    <TouchableOpacity
      activeOpacity={editable ? 0.88 : 1}
      onPress={openStep}
      style={[
        styles.stepCard,
        editable && selected && styles.selectedCard,
      ]}
    >
      {/* Vertical Rounded Color Bar */}
      <View style={[styles.colorBar, { backgroundColor: color }]} />

      <View style={styles.stepContent}>
        {/* Left Side: Silhouette Badge + Title & Distance + Pace */}
        <View style={styles.stepHeaderRow}>
          <View
            style={[
              styles.cardSilhouetteBadge,
              { backgroundColor: `${color}18` },
            ]}
          >
            <StepSilhouette type={category} size={18} color={color} />
          </View>
          <View style={styles.stepLeftColumn}>
            <Text style={styles.stepTitle} numberOfLines={1}>
              {step.title}
            </Text>

            {dist ? (
              <Text style={styles.stepDistance}>{dist}</Text>
            ) : (
              <Text style={styles.stepDistanceMuted}>-- km</Text>
            )}

            {paceStr ? (
              <Text style={styles.stepPace} numberOfLines={1}>
                {paceStr}
              </Text>
            ) : null}

            {step.notes ? (
              <Text style={styles.stepNotes} numberOfLines={1}>
                📝 {step.notes}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Right Side: Est Time + Direct Delete / Three Dots */}
        <View style={styles.stepRightColumn}>
          <View style={styles.timeWithDotsRow}>
            <View style={styles.estTimeBox}>
              <Text style={styles.estTimeLabel}>Est Time</Text>
              <Text style={styles.estTimeValue}>
                {displayStepTime || "--:--"}
              </Text>
            </View>

            {editable && onDelete ? (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                style={styles.cardDeleteBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Delete step"
              >
                <Feather name="trash-2" size={17} color="#FF453A" />
              </TouchableOpacity>
            ) : editable && onMoreOptions ? (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onMoreOptions();
                }}
                style={styles.cardThreeDotsBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="More options"
              >
                <Feather name="more-horizontal" size={20} color={colors.iconSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function EmptyStepCard({
  title,
  color,
  onPress,
}: {
  title: string;
  color: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const category: "warmup" | "run" | "cooldown" =
    title.toLowerCase().includes("warm")
      ? "warmup"
      : title.toLowerCase().includes("cool")
        ? "cooldown"
        : "run";

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={styles.emptyCard}
    >
      <View style={[styles.colorBar, { backgroundColor: color }]} />
      <View style={styles.stepContent}>
        <View style={styles.stepHeaderRow}>
          <View style={[styles.cardSilhouetteBadge, { backgroundColor: `${color}18` }]}>
            <StepSilhouette type={category} size={18} color={color} />
          </View>
          <View style={styles.stepLeftColumn}>
            <Text style={styles.stepTitle}>{title}</Text>
            <Text style={styles.emptySubtext}>Tap to configure {title.toLowerCase()}</Text>
          </View>
        </View>
        <View style={styles.stepRightColumn}>
          <Feather
            name="plus-circle"
            size={20}
            color={colors.primary}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function AddRecoveryCard({
  onPress,
}: {
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity
      style={styles.addRecoveryCard}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityLabel="Add recovery rest"
    >
      <View style={styles.addRecoveryLeft}>
        <View style={styles.addRecoveryIconCircle}>
          <Feather name="coffee" size={15} color="#8E8E93" />
        </View>
        <View>
          <Text style={styles.addRecoveryTitle}>Recovery</Text>
          <Text style={styles.addRecoverySubtitle}>Tap to add recovery rest</Text>
        </View>
      </View>
      <View style={styles.addRecoveryActionBadge}>
        <Feather name="plus" size={12} color="#8E8E93" style={{ marginRight: 4 }} />
        <Text style={styles.addRecoveryActionText}>Add</Text>
      </View>
    </TouchableOpacity>
  );
}

function RestCard({
  duration,
  skipLastRest = true,
  repeatCount = 1,
  editable = true,
  onPress,
  onDelete,
  onToggleSkipLastRest,
}: {
  duration: string;
  skipLastRest?: boolean;
  repeatCount?: number;
  editable?: boolean;
  onPress?: () => void;
  onDelete?: () => void;
  onToggleSkipLastRest?: (skip: boolean) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const restCount = skipLastRest ? Math.max(repeatCount - 1, 0) : repeatCount;
  const restSec = seconds(duration);
  const totalRestSec = restSec * restCount;

  return (
    <TouchableOpacity
      style={[
        styles.restCard,
        skipLastRest && repeatCount === 1 && styles.restCardSkipped,
      ]}
      onPress={editable ? onPress : undefined}
      activeOpacity={editable ? 0.85 : 1}
    >
      {/* Rounded Left Vertical Stripe */}
      <View
        style={[
          styles.restBar,
          skipLastRest && repeatCount === 1 && styles.restBarSkipped,
        ]}
      />

      <View style={styles.restCardBody}>
        {/* Row 1: Title on Left, Actions on Right */}
        <View style={styles.restCardTopRow}>
          <View style={styles.restTitleBox}>
            <Feather
              name="coffee"
              size={15}
              color={skipLastRest && repeatCount === 1 ? colors.iconSecondary : "#8E8E93"}
            />
            <Text
              style={[
                styles.restTitle,
                skipLastRest && repeatCount === 1 && { color: colors.textTertiary },
              ]}
            >
              Recovery
            </Text>
          </View>

          {editable && (
            <View style={styles.restActions}>
              <TouchableOpacity
                onPress={onPress}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="edit-2" size={14} color={colors.iconSecondary} />
              </TouchableOpacity>
              {onDelete ? (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Feather name="trash-2" size={14} color="#FF453A" />
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        </View>

        {/* Row 2: Duration and Repeat details on Left, Skip Last toggle on Right */}
        <View style={styles.restCardBottomRow}>
          <View style={styles.restDurationBox}>
            <Text
              style={[
                styles.restValue,
                skipLastRest && repeatCount === 1 && { color: colors.textTertiary },
              ]}
            >
              {duration}
            </Text>
            {repeatCount > 1 ? (
              <Text style={styles.restCountText}>
                {restCount}x rests ({displayTime(totalRestSec)})
              </Text>
            ) : null}
          </View>

          {/* Skip Last Recovery Toggle */}
          <TouchableOpacity
            disabled={!editable}
            style={[
              styles.skipRestBadge,
              skipLastRest ? styles.skipRestBadgeActive : styles.skipRestBadgeInactive,
            ]}
            onPress={(e) => {
              e.stopPropagation();
              onToggleSkipLastRest?.(!skipLastRest);
            }}
            activeOpacity={editable ? 0.7 : 1}
          >
            <Text style={[styles.skipRestLabel, skipLastRest && styles.skipRestLabelActive]}>
              Skip last
            </Text>
            <Switch
              value={skipLastRest}
              onValueChange={(val: boolean) => onToggleSkipLastRest?.(val)}
              disabled={!editable}
              trackColor={{ false: colors.border, true: "rgba(142, 142, 147, 0.4)" }}
              thumbColor={skipLastRest ? "#8E8E93" : colors.iconSecondary}
              style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }], marginHorizontal: -4 }}
            />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const restPresets = [
  { label: "30s", value: "00:00:30" },
  { label: "1:00", value: "00:01:00" },
  { label: "1:30", value: "00:01:30" },
  { label: "2:00", value: "00:02:00" },
  { label: "3:00", value: "00:03:00" },
  { label: "5:00", value: "00:05:00" },
];

export default function CustomWorkoutOverview() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    workout,
    setWarmUp,
    addRun,
    setCooldown,
    isSaving,
    setTitle,
    setWorkoutDate,
    setNotes,
    reset,
    addRepeatRun,
    removeWarmUp,
    removeRun,
    removeCooldown,
    updateRun,
    updateRunRepeat,
    updateRunRest,
    updateRunSkipLastRest,
    updateGroupRepeat,
    saveWorkout,
  } = useCustomWorkout();

  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [isEditing, setIsEditing] = useState<boolean>(!workout.id || mode === "edit");
  const [prevEditKey, setPrevEditKey] = useState(`${workout.id}-${mode}`);
  const currentEditKey = `${workout.id}-${mode}`;
  if (prevEditKey !== currentEditKey) {
    setPrevEditKey(currentEditKey);
    setIsEditing(!workout.id || mode === "edit");
  }

  const [selectedRun, setSelectedRun] = useState<number | null>(
    workout.runs.length ? 0 : null,
  );
  const [repeatRun, setRepeatRun] = useState<number | null>(null);
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [tempTitle, setTempTitle] = useState(workout.title || "");
  const [tempNotes, setTempNotes] = useState(workout.notes || "");

  // 3-dot Action Menu and DatePicker states
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isBenchmark, setIsBenchmark] = useState(() => workout.isBenchmark ?? false);
  const [prevBenchmarkId, setPrevBenchmarkId] = useState(workout.id);
  if (prevBenchmarkId !== workout.id) {
    setPrevBenchmarkId(workout.id);
    setIsBenchmark(workout.isBenchmark ?? false);
  }
  const [assignedRoute, setAssignedRoute] = useState<SuggestedRoute | null>(null);
  const [isRemovingRoute, setIsRemovingRoute] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      if (!workout.id || isEditing) {
        setAssignedRoute(null);
        return undefined;
      }
      const workoutId = workout.id;

      void customWorkoutAPI.get(workoutId).then(({ data }) => {
        if (!cancelled) {
          setAssignedRoute(data.assigned_route || data.assignedRoute || data.route || getCachedAssignedRoute(workoutId));
        }
      }).catch(() => {
        if (!cancelled) setAssignedRoute(null);
      });

      return () => {
        cancelled = true;
      };
    }, [isEditing, workout.id]),
  );

  const handleRemoveRoute = () => {
    if (!workout.id || isRemovingRoute) return;
    const workoutId = workout.id;
    Alert.alert("Remove route?", "This route will no longer be assigned to this workout.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setIsRemovingRoute(true);
          try {
            await customWorkoutAPI.removeRoute(workoutId);
            clearCachedAssignedRoute(workoutId);
            setAssignedRoute(null);
          } catch (error) {
            Alert.alert("Could not remove route", error instanceof Error ? error.message : "Please try again.");
          } finally {
            setIsRemovingRoute(false);
          }
        },
      },
    ]);
  };

  useEffect(() => {
    let active = true;
    if (workout.id && workout.isBenchmark === undefined) {
      BenchmarkStore.isBenchmark(workout.id).then((local) => {
        if (active) {
          setIsBenchmark(local);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [workout.id, workout.isBenchmark]);

  const handleToggleBenchmark = async () => {
    const nextState = !isBenchmark;
    setIsBenchmark(nextState);
    setShowActionMenu(false);

    if (workout.id) {
      try {
        await customWorkoutAPI.setBenchmark(workout.id, nextState);
      } catch (err) {
        console.warn("Could not save is_benchmark on server:", err);
      }
      await BenchmarkStore.setBenchmark(workout.id, nextState);
    }

    Alert.alert(
      nextState ? "Marked as Benchmark" : "Benchmark Removed",
      nextState
        ? `"${workout.title || "Workout"}" is now set as a Benchmark Workout in Statistics.`
        : `"${workout.title || "Workout"}" removed from Benchmark Workouts in Statistics.`
    );
  };

  // Individual Card 3-Dot Action Menu state
  const [cardMenu, setCardMenu] = useState<{
    type: "warmup" | "run" | "cooldown";
    index?: number;
    title: string;
  } | null>(null);

  // Recovery Rest Modal state
  const [restModalIndex, setRestModalIndex] = useState<number | null>(null);
  const [tempRestDuration, setTempRestDuration] = useState("00:01:00");
  const [tempSkipLastRest, setTempSkipLastRest] = useState(true);

  const resetRepeatToDefault = (index: number) => {
    const currentStep = workout.runs[index];
    if (!currentStep) return;
    const existingGroupId = currentStep.groupId || `run-group-${Date.now()}`;
    updateRun(index, {
      ...currentStep,
      title: currentStep.title || "Run",
      stepType: "Run",
      inputType: "DURATION",
      duration: "00:00:00",
      distance: "0.00",
      unit: "Kilometers (km)",
      pace: "",
      repeat: 1,
      rest: "00:01:00",
      skipLastRest: true,
      skipRest: false,
      groupId: existingGroupId,
      groupRepeat: 1,
      notes: "",
    });
  };

  const handleAddWarmup = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setWarmUp({
      title: "Warm Up",
      stepType: "Warmup",
      inputType: "DURATION",
      duration: "00:00:00",
      distance: "0.00",
      unit: "Kilometers (km)",
      pace: "",
      repeat: 1,
      rest: "",
      skipLastRest: true,
      notes: "",
    });
  }, [setWarmUp]);

  const handleAddRun = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    addRun({
      title: "Run",
      stepType: "Run",
      inputType: "DISTANCE",
      duration: "00:00:00",
      distance: "0.00",
      unit: "Kilometers (km)",
      pace: "",
      repeat: 1,
      rest: "",
      skipLastRest: true,
      notes: "",
    });
  }, [addRun]);

  const handleAddCooldown = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setCooldown({
      title: "Cool Down",
      stepType: "Cooldown",
      inputType: "DURATION",
      duration: "00:00:00",
      distance: "0.00",
      unit: "Kilometers (km)",
      pace: "",
      repeat: 1,
      rest: "",
      skipLastRest: true,
      notes: "",
    });
  }, [setCooldown]);

  const confirmDelete = (label: string, onDelete: () => void) =>
    Alert.alert(
      `Delete ${label}?`,
      "This step will be removed from the workout.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: onDelete },
      ],
    );

  const handleDuplicate = async () => {
    setShowActionMenu(false);
    if (workout.id) {
      try {
        await customWorkoutAPI.duplicate(workout.id);
        Alert.alert("Duplicated", "Workout duplicated successfully.");
      } catch (err: any) {
        Alert.alert("Error", err?.message || "Failed to duplicate workout.");
      }
    } else {
      Alert.alert("Save First", "Please save your workout before duplicating.");
    }
  };

  const handleUnschedule = async () => {
    setShowActionMenu(false);
    if (workout.id) {
      try {
        await customWorkoutAPI.unschedule(workout.id);
      } catch (err: any) {
        console.warn("Unschedule API error:", err);
      }
    }
    setWorkoutDate(null);
    Alert.alert("Unscheduled", "Workout date removed.");
  };

  const onDateChange = async (selectedDate: Date) => {
    setShowDatePicker(false);
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const day = String(selectedDate.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;

    if (workout.id) {
      try {
        await customWorkoutAPI.schedule(workout.id, dateStr);
      } catch (err: any) {
        console.warn("Schedule API error:", err);
      }
    }
    setWorkoutDate(dateStr);
    Alert.alert("Scheduled", `Workout scheduled for ${dateStr}.`);
  };

  const handleDeleteCurrentWorkout = () => {
    setShowActionMenu(false);
    Alert.alert(
      "Delete Workout?",
      `Are you sure you want to delete "${workout.title || "Custom Workout"}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (workout.id) {
              try {
                await customWorkoutAPI.delete(workout.id);
              } catch (err: any) {
                console.warn("Delete API error:", err);
              }
            }
            reset();
            router.replace("/(app)/custom-workout/cards");
          },
        },
      ]
    );
  };

  const steps = [workout.warmUp, ...workout.runs, workout.cooldown].filter(
    Boolean,
  ) as WorkoutStep[];

  const totalSeconds = useMemo(() => {
    return steps.reduce((total, step) => {
      return (
        total +
        (estimatedStepSeconds(step) * (step.repeat || 1) + estimatedRestSeconds(step))
      );
    }, 0);
  }, [steps]);

  const totalDistance = useMemo(() => {
    return steps.reduce(
      (total, step) =>
        total + distanceInKm(step) * (step.repeat || 1),
      0,
    );
  }, [steps]);

  const runGroups = useMemo(() => {
    return workout.runs.reduce<
      {
        isGroup: boolean;
        groupId?: string;
        groupRepeat?: number;
        items: { step: WorkoutStep; index: number }[];
      }[]
    >((groups, step, index) => {
      // Step is part of repeat group ONLY if it has an explicit groupId or repeat > 1
      const isRepeatGroup =
        Boolean(step.groupId) || (step.repeat != null && step.repeat > 1);

      if (isRepeatGroup) {
        const resolvedGroupId = step.groupId || `run-group-${step.id ?? index}`;
        const stepWithGroup = { ...step, groupId: resolvedGroupId };

        const previous = groups[groups.length - 1];
        if (previous && previous.isGroup && previous.groupId === resolvedGroupId) {
          previous.items.push({ step: stepWithGroup, index });
        } else {
          groups.push({
            isGroup: true,
            groupId: resolvedGroupId,
            groupRepeat: step.groupRepeat || step.repeat || 2,
            items: [{ step: stepWithGroup, index }],
          });
        }
      } else {
        // Single card (NOT in a repeat group)
        groups.push({
          isGroup: false,
          items: [{ step, index }],
        });
      }
      return groups;
    }, []);
  }, [workout.runs]);

  const handleSave = async () => {
    if (!workout.runs.length) {
      Alert.alert(
        "Add a run step",
        "A custom workout must include at least one running step.",
      );
      return;
    }

    try {
      await saveWorkout();
      setIsEditing(false);
      Alert.alert("Saved", "Your workout has been saved successfully.");
    } catch (err: any) {
      Alert.alert("Failed to Save", err?.message || "Could not save custom workout.");
    }
  };

  const saveTitleAndNotes = () => {
    setTitle(tempTitle.trim() || "Custom Workout");
    setNotes(tempNotes.trim());
    setShowTitleModal(false);
  };

  const openRestModal = (runIdx: number) => {
    const targetStep = workout.runs[runIdx];
    const initialRest =
      targetStep?.rest && targetStep.rest !== "00:00:00"
        ? targetStep.rest
        : "00:01:00";
    setTempRestDuration(initialRest);
    setTempSkipLastRest(targetStep?.skipLastRest ?? true);
    setRestModalIndex(runIdx);
  };

  const saveRestConfig = () => {
    if (restModalIndex !== null) {
      updateRunRest(
        restModalIndex,
        tempRestDuration,
        tempSkipLastRest
      );
    }
    setRestModalIndex(null);
  };

  const deleteRestConfig = (runIdx: number) => {
    updateRunRest(runIdx, "", true);
    if (restModalIndex === runIdx) setRestModalIndex(null);
  };

  const handleHeaderBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(app)/custom-workout/cards");
    }
  }, []);

  useEffect(() => {
    const onBackPress = () => {
      handleHeaderBack();
      return true;
    };
    const backHandler = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => backHandler.remove();
  }, [handleHeaderBack]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleHeaderBack}
          style={styles.headerCircleBtn}
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={20} color={colors.icon} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.titleContainer}
          disabled={!isEditing}
          onPress={() => {
            if (!isEditing) return;
            setTempTitle(workout.title);
            setTempNotes(workout.notes);
            setShowTitleModal(true);
          }}
          activeOpacity={isEditing ? 0.7 : 1}
        >
          <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 1, flexWrap: "wrap", justifyContent: "center" }}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {workout.title || "Custom Workout"}
            </Text>
            {isBenchmark ? (
              <View style={styles.benchmarkHeaderBadge}>
                <Feather name="trending-up" size={10} color="#30D158" />
                <Text style={styles.benchmarkHeaderBadgeText}>BENCHMARK</Text>
              </View>
            ) : null}
          </View>
          {isEditing ? (
            <Feather name="edit-2" size={13} color={colors.primary} style={{ marginLeft: 6 }} />
          ) : null}
        </TouchableOpacity>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            onPress={() => setShowActionMenu(true)}
            style={styles.headerCircleBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="More options"
          >
            <Feather name="more-horizontal" size={20} color={colors.icon} />
          </TouchableOpacity>

          {isEditing ? (
            <TouchableOpacity
              onPress={handleSave}
              disabled={isSaving}
              style={styles.saveHeaderButton}
            >
              {isSaving ? (
                <RunningLoader size={18} fillColor={colors.primary} />
              ) : (
                <Text style={styles.headerSaveText}>Save</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => setIsEditing(true)}
              style={styles.editHeaderButton}
              activeOpacity={0.8}
            >
              <Feather name="edit-2" size={13} color={colors.primary} />
              <Text style={styles.editHeaderText}>EDIT</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <MotionEntrance>
        {/* Workout Date Banner */}
        <View style={styles.dateBanner}>
          <Feather name="calendar" size={16} color={colors.primary} />
          <Text style={styles.dateText}>
            Date: {workout.workoutDate || "Unscheduled"}
          </Text>
          {isEditing && (
            <TouchableOpacity
              style={styles.dateChangeBtn}
              onPress={() => {
                const today = new Date().toISOString().split("T")[0];
                setWorkoutDate(workout.workoutDate ? null : today);
              }}
            >
              <Text style={styles.dateChangeText}>
                {workout.workoutDate ? "Clear Date" : "Schedule Today"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Stats Overview */}
        <View style={styles.statsCard}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>EST. DURATION</Text>
            <Text style={styles.statValue}>{displayTime(totalSeconds)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>EST. DISTANCE</Text>
            <Text style={styles.statValue}>{totalDistance.toFixed(2)} km</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>TOTAL STEPS</Text>
            <Text style={styles.statValue}>{steps.length}</Text>
          </View>
        </View>

        {/* Steps Section Header: Steps + Reorder */}
        <View style={styles.stepsSectionHeader}>
          <Text style={styles.stepsTitle}>Steps</Text>
          <TouchableOpacity
            onPress={() => {
              Alert.alert("Reorder Steps", "Drag and drop step reordering will be available in an upcoming update.");
            }}
          >
            <Text style={styles.reorderBtnText}>Reorder</Text>
          </TouchableOpacity>
        </View>

        {/* UPPER SUGGESTIONS ROW: All unadded step boxes ALWAYS remain in the upper section! */}
        {isEditing && (!workout.warmUp || workout.runs.length === 0 || !workout.cooldown) && (
          <View style={styles.suggestionsRow}>
            {!workout.warmUp && (
              <StepSuggestionBox
                title="Warm Up"
                color="#FF5722"
                onPress={handleAddWarmup}
              />
            )}
            {workout.runs.length === 0 && (
              <StepSuggestionBox
                title="Run"
                color="#30D158"
                onPress={handleAddRun}
              />
            )}
            {!workout.cooldown && (
              <StepSuggestionBox
                title="Cool Down"
                color="#0A84FF"
                onPress={handleAddCooldown}
              />
            )}
          </View>
        )}

        {/* 1. Warm Up: Full StepCard if added */}
        {workout.warmUp ? (
          <StepCard
            step={workout.warmUp}
            color="#FF5722"
            editable={isEditing}
            onSelect={() => router.push("/custom-workout?step=warmup")}
            onDelete={() => confirmDelete("Warm Up", removeWarmUp)}
          />
        ) : null}

        {/* 2. Run Steps & Repeat Groups */}
        {workout.runs.length > 0
          ? runGroups.map((group, groupIdx) => {
              if (group.isGroup && group.groupId) {
                const groupRepeat =
                  group.items[0]?.step?.groupRepeat ||
                  group.items[0]?.step?.repeat ||
                  2;
                const firstIndex = group.items[0]?.index ?? 0;

                return (
                  <View key={group.groupId || `group-${groupIdx}`} style={styles.groupBox}>
                    {/* Small set dropdown on the left */}
                    <TouchableOpacity
                      disabled={!isEditing}
                      onPress={() => setRepeatRun(firstIndex)}
                      style={styles.cornerSetBadge}
                      activeOpacity={isEditing ? 0.7 : 1}
                    >
                      <Text style={styles.cornerSetText}>
                        {groupRepeat} {groupRepeat === 1 ? "Set" : "Sets"}
                      </Text>
                      {isEditing ? (
                        <Feather name="chevron-down" size={12} color="#30D158" style={{ marginLeft: 3 }} />
                      ) : null}
                    </TouchableOpacity>

                    {group.items.map(({ step, index }) => (
                      <View key={`${step.title}-${index}`}>
                        <StepCard
                          step={step}
                          color={getStepColor(step)}
                          index={index}
                          editable={isEditing}
                          selected={selectedRun === index}
                          onSelect={() => {
                            setSelectedRun(index);
                            router.push(
                              `/custom-workout/running-declaration?index=${index}`
                            );
                          }}
                          onDelete={() =>
                            confirmDelete(step.title || "Run Step", () => removeRun(index))
                          }
                        />
                        {step.rest && step.rest !== "00:00:00" ? (
                          <RestCard
                            duration={step.rest}
                            skipLastRest={step.skipLastRest ?? true}
                            repeatCount={step.repeat || 1}
                            editable={isEditing}
                            onPress={() => openRestModal(index)}
                            onDelete={() => deleteRestConfig(index)}
                            onToggleSkipLastRest={(val) => updateRunSkipLastRest(index, val)}
                          />
                        ) : isEditing ? (
                          <AddRecoveryCard onPress={() => openRestModal(index)} />
                        ) : null}
                      </View>
                    ))}
                  </View>
                );
              }

              const singleStep = group.items[0].step;
              const singleIndex = group.items[0].index;

              return (
                <View key={`single-run-${singleIndex}`}>
                  <StepCard
                    step={singleStep}
                    color={getStepColor(singleStep)}
                    index={singleIndex}
                    editable={isEditing}
                    selected={selectedRun === singleIndex}
                    onSelect={() => {
                      setSelectedRun(singleIndex);
                      router.push(
                        `/custom-workout/running-declaration?index=${singleIndex}`
                      );
                    }}
                    onDelete={() =>
                      confirmDelete(singleStep.title || "Run Step", () => removeRun(singleIndex))
                    }
                  />
                </View>
              );
            })
          : null}

        {/* 3. Cool Down: Full StepCard if added */}
        {workout.cooldown ? (
          <StepCard
            step={workout.cooldown}
            color="#0A84FF"
            editable={isEditing}
            onSelect={() => router.push("/custom-workout/cooldown")}
            onDelete={() => confirmDelete("Cool Down", removeCooldown)}
          />
        ) : null}

        {/* Actions Row */}
        {isEditing ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionAdd}
              onPress={() => {
                router.push("/custom-workout/running-declaration");
              }}
              activeOpacity={0.85}
            >
              <Feather name="plus" size={18} color={colors.primaryText} />
              <Text style={styles.actionAddText}>ADD RUN STEP</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRepeat}
              onPress={() => {
                addRepeatRun();
                setSelectedRun(workout.runs.length);
              }}
              activeOpacity={0.85}
            >
              <Feather name="repeat" size={16} color={colors.icon} />
              <Text style={styles.actionRepeatText}>ADD REPEAT</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.viewModeActions}>
            {workout.id ? (
              assignedRoute ? (
                <View style={styles.assignedRouteCard}>
                  <View style={styles.assignedRouteInfo}>
                    <Feather name="check-circle" size={22} color="#39B800" />
                    <View>
                      <Text style={styles.assignedRouteLabel}>Route assigned</Text>
                      <Text style={styles.assignedRouteDistance}>{routeDistanceText(assignedRoute)}</Text>
                    </View>
                  </View>
                  <View style={styles.assignedRouteActions}>
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: "/custom-workout/route-detail", params: { route: JSON.stringify(assignedRoute) } })}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.viewRouteText}>View route</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleRemoveRoute} disabled={isRemovingRoute} activeOpacity={0.85}>
                      {isRemovingRoute ? <RunningLoader size={18} fillColor="#FF453A" /> : <Text style={styles.removeRouteText}>Unassign</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null
            ) : null}
            {workout.id ? (
              <TouchableOpacity
                style={styles.suggestedRoutesButton}
                onPress={() => router.push({ pathname: "/custom-workout/suggested-routes", params: { workoutId: String(workout.id) } })}
                activeOpacity={0.85}
              >
                <Feather name="map" size={22} color="#39B800" />
                <Text style={styles.suggestedRoutesButtonText}>Suggested Routes</Text>
                <Feather name="chevron-right" size={24} color="#39B800" />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.startWorkoutButton}
              onPress={() => {
                const plan = buildWorkoutExecutionPlan(workout);
                router.push({
                  pathname: "/(app)/screens/map",
                  params: {
                    workoutTitle: workout.title || "Custom Workout",
                    workoutPlan: JSON.stringify(plan),
                    ...(assignedRoute ? { assignedRoute: JSON.stringify(assignedRoute) } : {}),
                  },
                });
              }}
              activeOpacity={0.85}
            >
              <Feather name="play" size={18} color={colors.primaryText} />
              <Text style={styles.startWorkoutButtonText}>START WORKOUT</Text>
            </TouchableOpacity>
          </View>
        )}
        </MotionEntrance>
      </ScrollView>

      {/* Title & Notes Edit Modal */}
      <Modal
        visible={showTitleModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTitleModal(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setShowTitleModal(false)}
        >
          <Pressable
            style={styles.modal}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.modalTitle}>EDIT WORKOUT INFO</Text>
            <View style={{ padding: 20 }}>
              <Text style={styles.inputLabel}>Workout Name</Text>
              <TextInput
                value={tempTitle}
                onChangeText={setTempTitle}
                placeholder="e.g. 5K Tempo Run"
                placeholderTextColor={colors.placeholder}
                style={styles.modalInput}
              />
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={saveTitleAndNotes}
              >
                <Text style={styles.modalSaveText}>SAVE</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Repeat Count Modal */}
      <Modal
        visible={repeatRun !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRepeatRun(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setRepeatRun(null)}>
          <Pressable
            style={styles.modal}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.modalTitle}>NUMBER OF SETS</Text>
            <ScrollView style={styles.repeatScroll}>
              {Array.from({ length: 40 }, (_, index) => index + 1).map(
                (value) => (
                  <TouchableOpacity
                    key={value}
                    style={styles.option}
                    onPress={() => {
                      if (repeatRun !== null) {
                        const targetStep = workout.runs[repeatRun];
                        if (targetStep?.groupId) {
                          workout.runs.forEach((s, idx) => {
                            if (s.groupId === targetStep.groupId) {
                              updateRunRepeat(idx, value);
                            }
                          });
                          updateGroupRepeat(targetStep.groupId, value);
                        } else {
                          updateRunRepeat(repeatRun, value);
                        }
                      }
                      setRepeatRun(null);
                    }}
                  >
                    <Text style={styles.optionText}>
                      {value} {value === 1 ? "Set" : "Sets"}
                    </Text>
                    {repeatRun !== null &&
                    workout.runs[repeatRun]?.repeat === value ? (
                      <Feather
                        name="check"
                        size={20}
                        color={colors.primary}
                      />
                    ) : null}
                  </TouchableOpacity>
                ),
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Configure Recovery Rest Modal */}
      <Modal
        visible={restModalIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRestModalIndex(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setRestModalIndex(null)}>
          <Pressable
            style={[styles.modal, { maxHeight: "85%" }]}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.modalTitle}>RECOVERY</Text>
            <ScrollView style={{ padding: 20 }}>
              <Text style={styles.inputLabel}>Quick Presets</Text>
              <View style={styles.presetRow}>
                {restPresets.map((preset) => (
                  <TouchableOpacity
                    key={preset.label}
                    style={[
                      styles.presetChip,
                      tempRestDuration === preset.value && styles.presetChipActive,
                    ]}
                    onPress={() => setTempRestDuration(preset.value)}
                  >
                    <Text
                      style={[
                        styles.presetChipText,
                        tempRestDuration === preset.value &&
                          styles.presetChipTextActive,
                      ]}
                    >
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.inputLabel, { marginTop: 14 }]}>
                Custom Rest Duration
              </Text>
              <ScrollTimePicker
                value={tempRestDuration}
                onChange={setTempRestDuration}
                accentColor="#8E8E93"
              />

              <View style={styles.skipRestRow}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.skipRestTitle}>Skip Last Recovery</Text>
                  <Text style={styles.skipRestSubtitle}>
                    Omit rest after the final repeat set
                  </Text>
                </View>
                <Switch
                  value={tempSkipLastRest}
                  onValueChange={setTempSkipLastRest}
                  trackColor={{ false: colors.border, true: "rgba(142, 142, 147, 0.4)" }}
                  thumbColor={tempSkipLastRest ? "#8E8E93" : colors.iconSecondary}
                />
              </View>

              <TouchableOpacity
                style={[styles.modalSaveButton, { backgroundColor: "#8E8E93" }]}
                onPress={saveRestConfig}
              >
                <Text style={styles.modalSaveText}>APPLY REST</Text>
              </TouchableOpacity>

              {restModalIndex !== null &&
              workout.runs[restModalIndex]?.rest &&
              workout.runs[restModalIndex]?.rest !== "00:00:00" ? (
                <TouchableOpacity
                  style={styles.deleteRestButton}
                  onPress={() => deleteRestConfig(restModalIndex)}
                >
                  <Feather name="trash-2" size={15} color="#FF453A" />
                  <Text style={styles.deleteRestText}>Remove Rest</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Individual Card 3-Dot Action Menu Bottom Sheet */}
      <Modal
        visible={cardMenu !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCardMenu(null)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setCardMenu(null)}>
          <Pressable style={styles.menuSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.menuHandle} />
            <View style={styles.menuHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuSheetTitle} numberOfLines={1}>
                  {cardMenu?.title}
                </Text>
                <Text style={styles.menuSheetSubtitle}>Step Options</Text>
              </View>
              <TouchableOpacity
                onPress={() => setCardMenu(null)}
                style={styles.menuCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={20} color={colors.iconSecondary} />
              </TouchableOpacity>
            </View>

            {/* Option 1: Reset repeat to default (Repeated runs only) */}
            {cardMenu?.type === "run" &&
              cardMenu.index !== undefined &&
              isEditing &&
              ((workout.runs[cardMenu.index]?.repeat || 1) > 1 || Boolean(workout.runs[cardMenu.index]?.groupId)) && (
                <TouchableOpacity
                  style={styles.menuItem}
                  activeOpacity={0.7}
                  onPress={() => {
                    const idx = cardMenu.index!;
                    setCardMenu(null);
                    resetRepeatToDefault(idx);
                  }}
                >
                  <View style={[styles.menuItemIcon, { backgroundColor: "rgba(255, 159, 10, 0.15)" }]}>
                    <Feather name="rotate-ccw" size={18} color="#FF9F0A" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuItemText}>Reset to default</Text>
                    <Text style={styles.menuItemSubtext}>Reset to 1 Set · 1.00 km default values</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.iconSecondary} />
                </TouchableOpacity>
              )}

            {/* Option 2: Delete Step */}
            {isEditing && (
              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemDestructive]}
                activeOpacity={0.7}
                onPress={() => {
                  const menu = cardMenu;
                  setCardMenu(null);
                  if (!menu) return;
                  if (menu.type === "warmup") {
                    confirmDelete("Warm Up", removeWarmUp);
                  } else if (menu.type === "cooldown") {
                    confirmDelete("Cool Down", removeCooldown);
                  } else if (menu.index !== undefined) {
                    confirmDelete(menu.title, () => {
                      removeRun(menu.index!);
                      setSelectedRun(null);
                    });
                  }
                }}
              >
                <View style={[styles.menuItemIcon, { backgroundColor: "rgba(255, 69, 58, 0.15)" }]}>
                  <Feather name="trash-2" size={18} color="#FF453A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuItemText, { color: "#FF453A" }]}>Delete Step</Text>
                  <Text style={styles.menuItemSubtext}>Remove this step from workout</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.iconSecondary} />
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Three-Dot Action Menu Bottom Sheet */}
      <Modal
        visible={showActionMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActionMenu(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setShowActionMenu(false)}>
          <Pressable style={styles.menuSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.menuHandle} />
            <View style={styles.menuHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuSheetTitle} numberOfLines={1}>
                  {workout.title || "Custom Workout"}
                </Text>
                {workout.workoutDate ? (
                  <Text style={styles.menuSheetSubtitle}>
                    📅 Scheduled for {workout.workoutDate}
                  </Text>
                ) : (
                  <Text style={styles.menuSheetSubtitle}>Not currently scheduled</Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => setShowActionMenu(false)}
                style={styles.menuCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={20} color={colors.iconSecondary} />
              </TouchableOpacity>
            </View>

            {/* Menu Option 0: Edit Workout / View Mode */}
            {!isEditing ? (
              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => {
                  setShowActionMenu(false);
                  setIsEditing(true);
                }}
              >
                <View style={[styles.menuItemIcon, { backgroundColor: "rgba(255, 214, 10, 0.15)" }]}>
                  <Feather name="edit-3" size={18} color="#FFD60A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>Edit Workout</Text>
                  <Text style={styles.menuItemSubtext}>Modify steps, sets, and workout details</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.iconSecondary} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => {
                  setShowActionMenu(false);
                  setIsEditing(false);
                }}
              >
                <View style={[styles.menuItemIcon, { backgroundColor: "rgba(10, 132, 255, 0.15)" }]}>
                  <Feather name="eye" size={18} color="#0A84FF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>View Only Mode</Text>
                  <Text style={styles.menuItemSubtext}>Exit editing mode</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.iconSecondary} />
              </TouchableOpacity>
            )}

            {/* Menu Option: Benchmark Workout Toggle */}
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={handleToggleBenchmark}
            >
              <View
                style={[
                  styles.menuItemIcon,
                  {
                    backgroundColor: isBenchmark
                      ? "rgba(48, 209, 88, 0.15)"
                      : "rgba(255, 214, 10, 0.15)",
                  },
                ]}
              >
                <BenchmarkBadgeIcon
                  size={18}
                  color={isBenchmark ? "#30D158" : "#FFD60A"}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemText}>
                  {isBenchmark ? "Remove from Benchmark" : "Make as Benchmark"}
                </Text>
                <Text style={styles.menuItemSubtext}>
                  {isBenchmark
                    ? "Currently included in Statistics Benchmark tests"
                    : "Add as a standardized test in Statistics"}
                </Text>
              </View>
              {isBenchmark ? (
                <Feather name="check" size={18} color="#30D158" />
              ) : (
                <Feather name="chevron-right" size={16} color={colors.iconSecondary} />
              )}
            </TouchableOpacity>

            {/* Menu Option 1: Duplicate */}
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={handleDuplicate}
            >
              <View style={[styles.menuItemIcon, { backgroundColor: "rgba(10, 132, 255, 0.15)" }]}>
                <Feather name="copy" size={18} color="#0A84FF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemText}>Duplicate</Text>
                <Text style={styles.menuItemSubtext}>Create a copy of this workout</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.iconSecondary} />
            </TouchableOpacity>

            {/* Menu Option 2: Schedule / Reschedule */}
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                setShowActionMenu(false);
                setShowDatePicker(true);
              }}
            >
              <View style={[styles.menuItemIcon, { backgroundColor: "rgba(52, 199, 89, 0.15)" }]}>
                <Feather name="calendar" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemText}>
                  {workout.workoutDate ? "Reschedule Date" : "Schedule Workout"}
                </Text>
                <Text style={styles.menuItemSubtext}>
                  {workout.workoutDate
                    ? `Change date from ${workout.workoutDate}`
                    : "Assign a date for this workout"}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.iconSecondary} />
            </TouchableOpacity>

            {/* Menu Option 3: Unschedule (if scheduled) */}
            {workout.workoutDate ? (
              <TouchableOpacity
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={handleUnschedule}
              >
                <View style={[styles.menuItemIcon, { backgroundColor: "rgba(255, 159, 10, 0.15)" }]}>
                  <Feather name="slash" size={18} color="#FF9F0A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuItemText, { color: "#FF9F0A" }]}>Unschedule</Text>
                  <Text style={styles.menuItemSubtext}>Remove date from this workout</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.iconSecondary} />
              </TouchableOpacity>
            ) : null}

            {/* Menu Option 4: Delete */}
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDestructive]}
              activeOpacity={0.7}
              onPress={handleDeleteCurrentWorkout}
            >
              <View style={[styles.menuItemIcon, { backgroundColor: "rgba(255, 69, 58, 0.15)" }]}>
                <Feather name="trash-2" size={18} color="#FF453A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuItemText, { color: "#FF453A" }]}>Delete</Text>
                <Text style={styles.menuItemSubtext}>Permanently delete this workout</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.iconSecondary} />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {showDatePicker && (
        <ThemedCalendarPicker
          value={workout.workoutDate ? new Date(workout.workoutDate) : new Date()}
          title="Schedule workout"
          onCancel={() => setShowDatePicker(false)}
          onConfirm={(selectedDate) => { void onDateChange(selectedDate); }}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerIcon: { width: 44 },
  headerCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  titleContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "700",
    maxWidth: "80%",
  },
  benchmarkHeaderBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(48, 209, 88, 0.15)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    marginLeft: 8,
    gap: 4,
  },
  benchmarkHeaderBadgeText: {
    color: "#30D158",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerMenuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  saveHeaderButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSaveText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  done: { color: colors.primary, fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  editHeaderButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editHeaderText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  body: { flex: 1, backgroundColor: colors.background },
  bodyContent: { paddingHorizontal: 16, paddingBottom: 40 },
  dateBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateText: { color: colors.textPrimary, fontSize: 14, fontWeight: "600", flex: 1, marginLeft: 8 },
  dateChangeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 8,
  },
  dateChangeText: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  statsCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginTop: 14,
    paddingVertical: 16,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statBox: { alignItems: "center", flex: 1 },
  statDivider: { width: 1, height: 28, backgroundColor: colors.divider },
  statLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  statValue: { color: colors.textPrimary, fontSize: 17, fontWeight: "800", marginTop: 4 },
  stepsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 22,
    marginBottom: 12,
  },
  stepsTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  reorderBtnText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  // Step Suggestion Row & Rectangles
  suggestionsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    marginBottom: 14,
    width: "100%",
  },
  suggestionBox: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 9,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  suggestionIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  suggestionTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  suggestionActionBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 2,
  },
  suggestionActionText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // Silhouette badge on StepCard
  cardSilhouetteBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 2,
  },
  stepHeaderRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  stepCard: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedCard: { borderColor: colors.primary },
  colorBar: {
    width: 5,
    marginVertical: 10,
    marginLeft: 6,
    borderRadius: 3,
  },
  stepContent: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  stepLeftColumn: {
    flex: 1,
    marginRight: 10,
  },
  stepTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  stepDistance: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "500",
    marginTop: 4,
  },
  stepDistanceMuted: {
    color: colors.textTertiary,
    fontSize: 14,
    fontWeight: "500",
    marginTop: 4,
  },
  stepPace: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: "500",
    marginTop: 3,
  },
  stepNotes: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
    fontStyle: "italic",
  },
  stepRightColumn: {
    alignItems: "flex-end",
    alignSelf: "flex-start",
    paddingTop: 2,
  },
  cornerSetBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.selected,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: 8,
  },
  cornerSetText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  timeWithDotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  estTimeBox: {
    alignItems: "flex-end",
  },
  estTimeLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "500",
    textAlign: "right",
  },
  timeValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  estTimeValue: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  cardDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 69, 58, 0.12)",
    marginLeft: 6,
  },
  groupSetCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(48, 209, 88, 0.08)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(48, 209, 88, 0.22)",
  },
  groupSetCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  groupSetIconWrapper: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(48, 209, 88, 0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  groupSetTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#30D158",
    letterSpacing: 0.5,
  },
  groupSetSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
    fontWeight: "500",
  },
  groupSetDropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(48, 209, 88, 0.18)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#30D158",
  },
  groupSetDropdownText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#30D158",
  },
  cardThreeDotsBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  emptyCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  emptySubtext: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  addRecoveryCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(142, 142, 147, 0.08)",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(142, 142, 147, 0.35)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  addRecoveryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  addRecoveryIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(142, 142, 147, 0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  addRecoveryTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  addRecoverySubtitle: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: 1,
    fontWeight: "500",
  },
  addRecoveryActionBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(142, 142, 147, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  addRecoveryActionText: {
    color: "#8E8E93",
    fontSize: 12,
    fontWeight: "700",
  },
  restCard: {
    flexDirection: "row",
    backgroundColor: colors.surfaceRaised,
    borderRadius: 14,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  restCardSkipped: {
    opacity: 0.65,
    borderColor: colors.border,
  },
  restBar: {
    width: 5,
    marginVertical: 8,
    marginLeft: 6,
    borderRadius: 3,
    backgroundColor: "#8E8E93",
  },
  restBarSkipped: { backgroundColor: colors.border },
  restCardBody: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: "space-between",
  },
  restCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  restTitleBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  restTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  restActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  restCardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  restDurationBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  restValue: {
    color: "#8E8E93",
    fontSize: 15,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  restCountText: { color: colors.textSecondary, fontSize: 12, fontWeight: "500" },
  skipRestBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    paddingLeft: 8,
    paddingRight: 4,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  skipRestBadgeActive: {
    backgroundColor: "rgba(142, 142, 147, 0.15)",
    borderColor: "rgba(142, 142, 147, 0.4)",
  },
  skipRestBadgeInactive: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  skipRestLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "600",
  },
  skipRestLabelActive: {
    color: "#8E8E93",
  },
  groupBox: {
    padding: 12,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupSetHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  groupSetHeaderText: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  groupTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    flex: 1,
    marginRight: 8,
  },
  groupTitle: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  groupTimeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  groupTimeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "700",
  },
  groupTotalTimeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.surface,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupTotalTimeText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: "600",
  },
  groupDistBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.surface,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupDistText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: "600",
  },
  groupRepeat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  setSection: {
    marginBottom: 6,
  },
  groupCycleHeader: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginVertical: 4,
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderRadius: 6,
  },
  groupCycleText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  setDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 8,
    paddingHorizontal: 4,
    gap: 10,
  },
  setLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.divider,
  },
  setLabelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  setLabelText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  actionAdd: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 12,
  },
  actionAddText: { color: colors.primaryText, fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  actionRepeat: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  actionDisabled: { opacity: 0.5 },
  actionRepeatText: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  viewModeActions: {
    flexDirection: "column",
    marginTop: 18,
    marginBottom: 10,
  },
  assignedRouteCard: {
    minHeight: 74,
    borderRadius: 18,
    backgroundColor: colors.card,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  assignedRouteInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  assignedRouteLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  assignedRouteDistance: { color: colors.textSecondary, fontSize: 15, marginTop: 3 },
  assignedRouteActions: { alignItems: "flex-end", gap: 8 },
  viewRouteText: { color: "#39B800", fontSize: 15, fontWeight: "800" },
  removeRouteText: { color: "#FF453A", fontSize: 15, fontWeight: "800" },
  suggestedRoutesButton: {
    minHeight: 64,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#39B800",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    marginBottom: 18,
    gap: 14,
  },
  suggestedRoutesButtonText: {
    flex: 1,
    color: "#39B800",
    fontSize: 18,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  startWorkoutButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
  },
  startWorkoutButtonText: {
    color: colors.primaryText,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.overlay,
  },
  modal: {
    overflow: "hidden",
    backgroundColor: colors.modalBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    padding: 18,
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  inputLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: "500", marginBottom: 8 },
  modalInput: {
    minHeight: 48,
    paddingHorizontal: 14,
    color: colors.inputText,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    fontSize: 15,
  },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetChipActive: {
    backgroundColor: "rgba(142, 142, 147, 0.2)",
    borderColor: "#8E8E93",
  },
  presetChipText: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  presetChipTextActive: { color: "#8E8E93", fontWeight: "800" },
  skipRestRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  skipRestTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  skipRestSubtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  modalSaveButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
    backgroundColor: colors.primary,
    borderRadius: 10,
  },
  modalSaveText: { color: colors.primaryText, fontSize: 14, fontWeight: "800" },
  deleteRestButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
  },
  deleteRestText: { color: "#FF453A", fontSize: 13, fontWeight: "700" },
  repeatScroll: { maxHeight: 380 },
  option: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  optionText: { color: colors.textPrimary, fontSize: 16 },
  /* 3-Dot Action Menu Bottom Sheet Styles */
  menuOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end",
  },
  menuSheet: {
    backgroundColor: colors.modalBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textTertiary,
    alignSelf: "center",
    marginBottom: 16,
  },
  menuHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuSheetTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  menuSheetSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "500",
  },
  menuCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemDestructive: {
    borderBottomWidth: 0,
    marginTop: 4,
  },
  menuItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  menuItemText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  menuItemSubtext: {
    color: colors.textSecondary,
    fontSize: 12,
  },
});
