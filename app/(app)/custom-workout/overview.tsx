import { Feather } from "@expo/vector-icons";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollTimePicker } from "../../../components/ScrollTimePicker";
import { Colors } from "../../../constants/theme";
import { customWorkoutAPI } from "../../../service/customWorkout";
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
  if (!step.distance || step.distance === "0" || step.distance.trim() === "") return 0;
  const value = Number.parseFloat(step.distance) || 0;
  if (value <= 0) return 0;
  const unit = normalizeUnit(step.unit);
  if (unit === "m") return value / 1000;
  if (unit === "mi") return value * 1.609344;
  return value;
};

const estimatedStepSeconds = (step: WorkoutStep) => {
  const declaredTime = seconds(step.duration || "00:00:00");
  if (declaredTime > 0) return declaredTime;
  const paceSec = parsePaceToSeconds(step.pace);
  const distNum = Number.parseFloat(step.distance) || 0;
  if (!paceSec || distNum <= 0) return 0;
  const unit = normalizeUnit(step.unit);
  if (unit === "m") {
    return (distNum / 1000) * paceSec;
  }
  return distNum * paceSec;
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

const hasDistance = (step: WorkoutStep) =>
  Boolean(step.distance && step.distance.trim() !== "" && step.distance !== "0" && step.distance !== "0.00");

const hasDuration = (step: WorkoutStep) =>
  Boolean(step.duration && step.duration.trim() !== "" && step.duration !== "00:00:00" && seconds(step.duration) > 0);

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

const hasText = (value?: string) => Boolean(value?.trim());
const isEmptyStep = (step: WorkoutStep) =>
  !hasText(step.distance) &&
  !hasText(step.pace) &&
  (!hasText(step.duration) || seconds(step.duration) === 0);

function StepCard({
  step,
  color,
  selected,
  index,
  editable = true,
  onSelect,
  onRepeat,
  onMoreOptions,
}: {
  step: WorkoutStep;
  color: string;
  selected?: boolean;
  index?: number;
  editable?: boolean;
  onSelect?: () => void;
  onRepeat?: () => void;
  onMoreOptions?: () => void;
  // Keep optional props for compatibility
  repeat?: boolean;
  number?: number;
  setLabel?: string;
  onDelete?: () => void;
  onSkipLastRest?: (skipLast: boolean) => void;
}) {
  const isRepeated = (step.repeat || 1) > 1 || Boolean(step.groupId);

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
        title={step.title || "Running"}
        color={color}
        onPress={openStep}
      />
    );
  }

  const displayStepTime = stepTimeText(step);
  const dist = hasDistance(step) ? distanceText(step) : null;
  const paceStr = hasPace(step) ? `Pace · ${step.pace} min/km` : null;

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
        {/* Left Side: 2 Data Items (Title & Distance + Pace) */}
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

        {/* Right Side: Corner Set (if repeated), Est Time, Time Value + Three Dots */}
        <View style={styles.stepRightColumn}>
          {isRepeated ? (
            <TouchableOpacity
              disabled={!editable}
              onPress={(e) => {
                e.stopPropagation();
                onRepeat?.();
              }}
              style={styles.cornerSetBadge}
              activeOpacity={editable ? 0.7 : 1}
            >
              <Text style={styles.cornerSetText}>
                {step.repeat || 1} {step.repeat === 1 ? "Set" : "Sets"}
              </Text>
              {editable ? (
                <Feather name="chevron-down" size={12} color="#30D158" style={{ marginLeft: 3 }} />
              ) : null}
            </TouchableOpacity>
          ) : null}

          <View style={styles.timeWithDotsRow}>
            <View style={styles.estTimeBox}>
              <Text style={styles.estTimeLabel}>Est Time</Text>
              <Text style={styles.estTimeValue}>
                {displayStepTime || "--:--"}
              </Text>
            </View>

            {editable && onMoreOptions ? (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onMoreOptions();
                }}
                style={styles.cardThreeDotsBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Feather name="more-horizontal" size={20} color="#8E8E93" />
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
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={styles.emptyCard}
    >
      <View style={[styles.colorBar, { backgroundColor: color }]} />
      <View style={styles.stepContent}>
        <View style={styles.stepLeftColumn}>
          <Text style={styles.stepTitle}>{title}</Text>
          <Text style={styles.emptySubtext}>Tap to configure {title.toLowerCase()}</Text>
        </View>
        <View style={styles.stepRightColumn}>
          <Feather
            name="plus-circle"
            size={20}
            color={Colors.primaryLight}
          />
        </View>
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
              color={skipLastRest && repeatCount === 1 ? "#8E8E93" : "#30D158"}
            />
            <Text
              style={[
                styles.restTitle,
                skipLastRest && repeatCount === 1 && { color: "#8E8E93" },
              ]}
            >
              Recovery Rest
            </Text>
          </View>

          {editable && (
            <View style={styles.restActions}>
              <TouchableOpacity
                onPress={onPress}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="edit-2" size={14} color="#8E8E93" />
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
                skipLastRest && repeatCount === 1 && { color: "#8E8E93" },
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
              trackColor={{ false: "#3A3A3C", true: "rgba(48, 209, 88, 0.4)" }}
              thumbColor={skipLastRest ? "#30D158" : "#8E8E93"}
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
  const {
    workout,
    isSaving,
    setTitle,
    setWorkoutDate,
    setNotes,
    reset,
    addEmptyRun,
    addRepeatRun,
    addRunAfter,
    removeWarmUp,
    removeRun,
    removeCooldown,
    duplicateRunGroup,
    updateRun,
    updateRunRepeat,
    updateRunRest,
    updateRunSkipRest,
    updateRunSkipLastRest,
    updateGroupRepeat,
    saveWorkout,
  } = useCustomWorkout();

  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [isEditing, setIsEditing] = useState<boolean>(!workout.id || mode === "edit");

  useEffect(() => {
    if (mode === "edit" || !workout.id) {
      setIsEditing(true);
    } else {
      setIsEditing(false);
    }
  }, [mode, workout.id]);

  const [selectedRun, setSelectedRun] = useState<number | null>(
    workout.runs.length ? 0 : null,
  );
  const [repeatRun, setRepeatRun] = useState<number | null>(null);
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [tempTitle, setTempTitle] = useState(workout.title || "Custom Workout");
  const [tempNotes, setTempNotes] = useState(workout.notes || "");

  // 3-dot Action Menu and DatePicker states
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

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
      title: currentStep.title || "Running",
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
      groupId: existingGroupId,
      groupRepeat: 1,
      notes: "",
    });
  };

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

  const onDateChange = async (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (event.type === "dismissed" || !selectedDate) return;
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
      { groupId?: string; items: { step: WorkoutStep; index: number }[] }[]
    >((groups, step, index) => {
      const isRepeat =
        Boolean(step.groupId) ||
        (step.repeat != null && step.repeat > 1) ||
        Boolean(step.rest && step.rest !== "00:00:00");

      const resolvedGroupId =
        step.groupId || (isRepeat ? `run-group-${step.id || index}` : undefined);

      const stepWithGroup = resolvedGroupId ? { ...step, groupId: resolvedGroupId } : step;

      const previous = groups[groups.length - 1];
      if (resolvedGroupId && previous?.groupId === resolvedGroupId) {
        previous.items.push({ step: stepWithGroup, index });
      } else {
        groups.push({
          groupId: resolvedGroupId,
          items: [{ step: stepWithGroup, index }],
        });
      }
      return groups;
    }, []);
  }, [workout.runs]);

  const getGroupStats = (items: { step: WorkoutStep; index: number }[]) => {
    const totalGroupRunSeconds = items.reduce(
      (sum, { step }) => sum + estimatedStepSeconds(step) * (step.repeat || 1),
      0
    );
    const totalGroupRestSeconds = items.reduce(
      (sum, { step }) => sum + estimatedRestSeconds(step),
      0
    );
    const totalGroupSeconds = totalGroupRunSeconds + totalGroupRestSeconds;
    const totalGroupDistance = items.reduce(
      (sum, { step }) => sum + distanceInKm(step) * (step.repeat || 1),
      0
    );

    return {
      totalGroupRunSeconds,
      totalGroupSeconds,
      totalGroupDistance,
    };
  };

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerCircleBtn}
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={20} color="#FFFFFF" />
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
          <Text style={styles.headerTitle} numberOfLines={1}>
            {workout.title || "Run Workout"}
          </Text>
          {isEditing ? (
            <Feather name="edit-2" size={13} color={Colors.primaryLight} style={{ marginLeft: 6 }} />
          ) : null}
        </TouchableOpacity>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            onPress={() => setShowActionMenu(true)}
            style={styles.headerCircleBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="More options"
          >
            <Feather name="more-horizontal" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          {isEditing ? (
            <TouchableOpacity
              onPress={handleSave}
              disabled={isSaving}
              style={styles.saveHeaderButton}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#30D158" />
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
              <Feather name="edit-2" size={13} color={Colors.primaryLight} />
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
        {/* Workout Date Banner */}
        <View style={styles.dateBanner}>
          <Feather name="calendar" size={16} color={Colors.primaryLight} />
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

        {/* 1. Warm Up */}
        {workout.warmUp ? (
          <StepCard
            step={workout.warmUp}
            color="#FF375F"
            editable={isEditing}
            onSelect={() => router.push("/custom-workout?step=warmup")}
            onMoreOptions={() =>
              setCardMenu({
                type: "warmup",
                title: workout.warmUp?.title || "Warm Up",
              })
            }
          />
        ) : isEditing ? (
          <EmptyStepCard
            title="Warm Up"
            color="#FF375F"
            onPress={() => router.push("/custom-workout?step=warmup")}
          />
        ) : null}

        {/* 2. Run Steps & Repeat Groups */}
        {runGroups.length ? (
          runGroups.map((group) => {
            if (group.groupId) {
              return (
                <View key={group.groupId} style={styles.groupBox}>
                  {group.items.map(({ step, index }) => (
                    <View key={`${step.title}-${index}`}>
                      <StepCard
                        step={step}
                        color="#0A84FF"
                        index={index}
                        editable={isEditing}
                        selected={selectedRun === index}
                        onSelect={() => {
                          setSelectedRun(index);
                          router.push(
                            `/custom-workout/running-declaration?index=${index}`
                          );
                        }}
                        onRepeat={() => setRepeatRun(index)}
                        onMoreOptions={() =>
                          setCardMenu({
                            type: "run",
                            index,
                            title: step.title || `Run ${index + 1}`,
                          })
                        }
                      />
                      <RestCard
                        duration={step.rest && step.rest !== "00:00:00" ? step.rest : "00:01:00"}
                        skipLastRest={step.skipLastRest ?? true}
                        repeatCount={step.repeat || 1}
                        editable={isEditing}
                        onPress={() => openRestModal(index)}
                        onDelete={() => deleteRestConfig(index)}
                        onToggleSkipLastRest={(val) => updateRunSkipLastRest(index, val)}
                      />
                    </View>
                  ))}
                </View>
              );
            }

            const singleStep = group.items[0].step;
            const singleIndex = group.items[0].index;

            return (
              <View key={`run-${singleIndex}`}>
                <StepCard
                  step={singleStep}
                  color="#0A84FF"
                  index={singleIndex}
                  editable={isEditing}
                  selected={selectedRun === singleIndex}
                  onSelect={() => {
                    setSelectedRun(singleIndex);
                    router.push(
                      `/custom-workout/running-declaration?index=${singleIndex}`
                    );
                  }}
                  onRepeat={() => setRepeatRun(singleIndex)}
                  onMoreOptions={() =>
                    setCardMenu({
                      type: "run",
                      index: singleIndex,
                      title: singleStep.title || "Running",
                    })
                  }
                />
                {singleStep.rest && singleStep.rest !== "00:00:00" ? (
                  <RestCard
                    duration={singleStep.rest}
                    skipLastRest={singleStep.skipLastRest ?? true}
                    repeatCount={singleStep.repeat || 1}
                    editable={isEditing}
                    onPress={() => openRestModal(singleIndex)}
                    onDelete={() => deleteRestConfig(singleIndex)}
                    onToggleSkipLastRest={(val) => updateRunSkipLastRest(singleIndex, val)}
                  />
                ) : null}
              </View>
            );
          })
        ) : isEditing ? (
          <EmptyStepCard
            title="Running"
            color="#0A84FF"
            onPress={() => {
              addEmptyRun();
              setSelectedRun(0);
            }}
          />
        ) : null}

        {/* 3. Cool Down */}
        {workout.cooldown ? (
          <StepCard
            step={workout.cooldown}
            color="#30D158"
            editable={isEditing}
            onSelect={() => router.push("/custom-workout/cooldown")}
            onMoreOptions={() =>
              setCardMenu({
                type: "cooldown",
                title: workout.cooldown?.title || "Cool Down",
              })
            }
          />
        ) : isEditing ? (
          <EmptyStepCard
            title="Cool Down"
            color="#30D158"
            onPress={() => router.push("/custom-workout/cooldown")}
          />
        ) : null}

        {/* Actions Row */}
        {isEditing ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionAdd}
              onPress={() => {
                const firstGroupIdx = workout.runs.findIndex((r) => Boolean(r.groupId));
                const newIndex = firstGroupIdx !== -1 ? firstGroupIdx : 0;
                addEmptyRun();
                setSelectedRun(newIndex);
              }}
              activeOpacity={0.85}
            >
              <Feather name="plus" size={18} color="#000000" />
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
              <Feather name="repeat" size={16} color={Colors.text} />
              <Text style={styles.actionRepeatText}>REPEAT RUN</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.viewModeActions}>
            <TouchableOpacity
              style={styles.startWorkoutButton}
              onPress={() => {
                const plan = buildWorkoutExecutionPlan(workout);
                router.push({
                  pathname: "/(app)/screens/map",
                  params: {
                    workoutTitle: workout.title || "Custom Workout",
                    workoutPlan: JSON.stringify(plan),
                  },
                });
              }}
              activeOpacity={0.85}
            >
              <Feather name="play" size={18} color="#000000" />
              <Text style={styles.startWorkoutButtonText}>START WORKOUT</Text>
            </TouchableOpacity>
          </View>
        )}
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
                placeholderTextColor={Colors.textMuted}
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
                      if (repeatRun !== null) updateRunRepeat(repeatRun, value);
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
                        color={Colors.primaryLight}
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
            <Text style={styles.modalTitle}>RECOVERY REST</Text>
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
                  trackColor={{ false: "#3A3A3C", true: Colors.primaryDark }}
                  thumbColor={tempSkipLastRest ? Colors.primaryLight : "#BBBBBB"}
                />
              </View>

              <TouchableOpacity
                style={styles.modalSaveButton}
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
                <Feather name="x" size={20} color={Colors.textSecondary} />
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
                  <Feather name="chevron-right" size={16} color={Colors.textMuted} />
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
                <Feather name="chevron-right" size={16} color={Colors.textMuted} />
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
                <Feather name="x" size={20} color={Colors.textSecondary} />
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
                <Feather name="chevron-right" size={16} color={Colors.textMuted} />
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
                <Feather name="chevron-right" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            )}

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
              <Feather name="chevron-right" size={16} color={Colors.textMuted} />
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
                <Feather name="calendar" size={18} color={Colors.primaryLight} />
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
              <Feather name="chevron-right" size={16} color={Colors.textMuted} />
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
                <Feather name="chevron-right" size={16} color={Colors.textMuted} />
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
              <Feather name="chevron-right" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Native DateTimePicker for Scheduling */}
      {showDatePicker && (
        <DateTimePicker
          value={workout.workoutDate ? new Date(workout.workoutDate) : new Date()}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: "#000",
    borderBottomWidth: 1,
    borderBottomColor: "#1C1C1E",
  },
  headerIcon: { width: 44 },
  headerCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1C1C1E",
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
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    maxWidth: "80%",
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
    backgroundColor: "#1C1C1E",
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
    color: "#30D158",
    fontSize: 16,
    fontWeight: "700",
  },
  done: { color: "#30D158", fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  editHeaderButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#222224",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primaryDark,
  },
  editHeaderText: {
    color: Colors.primaryLight,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  body: { flex: 1, backgroundColor: "#0A0A0C" },
  bodyContent: { paddingHorizontal: 16, paddingBottom: 40 },
  dateBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#1C1C1E",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2C2C2E",
  },
  dateText: { color: Colors.text, fontSize: 14, fontWeight: "600", flex: 1, marginLeft: 8 },
  dateChangeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#2C2C2E",
    borderRadius: 8,
  },
  dateChangeText: { color: Colors.primaryLight, fontSize: 12, fontWeight: "700" },
  statsCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginTop: 14,
    paddingVertical: 16,
    backgroundColor: "#1C1C1E",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2C2C2E",
  },
  statBox: { alignItems: "center", flex: 1 },
  statDivider: { width: 1, height: 28, backgroundColor: "#2C2C2E" },
  statLabel: { color: Colors.textSecondary, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  statValue: { color: Colors.text, fontSize: 17, fontWeight: "800", marginTop: 4 },
  stepsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 22,
    marginBottom: 12,
  },
  stepsTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  reorderBtnText: {
    color: "#30D158",
    fontSize: 15,
    fontWeight: "600",
  },
  stepCard: {
    flexDirection: "row",
    backgroundColor: "#1C1C1E",
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#28282B",
  },
  selectedCard: { borderColor: Colors.primary },
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
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  stepDistance: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
    marginTop: 4,
  },
  stepDistanceMuted: {
    color: "#8E8E93",
    fontSize: 14,
    fontWeight: "500",
    marginTop: 4,
  },
  stepPace: {
    color: "#8E8E93",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 3,
  },
  stepNotes: {
    color: Colors.textMuted,
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
    alignSelf: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(48, 209, 88, 0.12)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(48, 209, 88, 0.35)",
    marginBottom: 6,
  },
  cornerSetText: {
    color: "#30D158",
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
    color: "#8E8E93",
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
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
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
    backgroundColor: "#161618",
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#28282B",
    borderStyle: "dashed",
  },
  emptySubtext: { color: Colors.textMuted, fontSize: 13, marginTop: 4 },
  restCard: {
    flexDirection: "row",
    backgroundColor: "#18181A",
    borderRadius: 14,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#262628",
  },
  restCardSkipped: {
    opacity: 0.65,
    borderColor: "#222224",
  },
  restBar: {
    width: 5,
    marginVertical: 8,
    marginLeft: 6,
    borderRadius: 3,
    backgroundColor: "#30D158",
  },
  restBarSkipped: { backgroundColor: "#3A3A3C" },
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
  restTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
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
    color: "#30D158",
    fontSize: 15,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  restCountText: { color: "#8E8E93", fontSize: 12, fontWeight: "500" },
  skipRestBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#222224",
    paddingLeft: 8,
    paddingRight: 4,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333336",
    gap: 2,
  },
  skipRestBadgeActive: {
    backgroundColor: "rgba(48, 209, 88, 0.12)",
    borderColor: "rgba(48, 209, 88, 0.35)",
  },
  skipRestBadgeInactive: {
    backgroundColor: "#1C1C1E",
    borderColor: "#28282A",
  },
  skipRestLabel: {
    color: "#8E8E93",
    fontSize: 11,
    fontWeight: "600",
  },
  skipRestLabelActive: {
    color: "#30D158",
  },
  groupBox: {
    padding: 12,
    backgroundColor: "#121214",
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#28282C",
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
    color: "#8E8E93",
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
  groupTitle: { color: Colors.primaryLight, fontSize: 13, fontWeight: "700" },
  groupTimeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: "#222224",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Colors.primaryDark,
  },
  groupTimeText: {
    color: Colors.primaryLight,
    fontSize: 11,
    fontWeight: "700",
  },
  groupTotalTimeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "#1C1C1E",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#333336",
  },
  groupTotalTimeText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: "600",
  },
  groupDistBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "#1C1C1E",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#333336",
  },
  groupDistText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: "600",
  },
  groupRepeat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#222224",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primaryDark,
  },
  setSection: {
    marginBottom: 6,
  },
  groupCycleHeader: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginVertical: 4,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 6,
  },
  groupCycleText: {
    color: Colors.textSecondary,
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
    backgroundColor: "#2C2C2E",
  },
  setLabelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "#222224",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#333336",
  },
  setLabelText: {
    color: Colors.primaryLight,
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
    backgroundColor: Colors.primary,
    borderRadius: 12,
  },
  actionAddText: { color: "#000000", fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  actionRepeat: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#2A2A2D",
    borderWidth: 1,
    borderColor: "#3E3E42",
    borderRadius: 12,
  },
  actionDisabled: { opacity: 0.5 },
  actionRepeatText: { color: Colors.text, fontSize: 14, fontWeight: "700" },
  viewModeActions: {
    marginTop: 18,
    marginBottom: 10,
  },
  startWorkoutButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
  },
  startWorkoutButtonText: {
    color: "#000000",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.75)",
  },
  modal: {
    overflow: "hidden",
    backgroundColor: "#222224",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#333336",
  },
  modalTitle: {
    padding: 18,
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    borderBottomWidth: 1,
    borderBottomColor: "#2C2C2E",
  },
  inputLabel: { color: Colors.text, fontSize: 14, fontWeight: "500", marginBottom: 8 },
  modalInput: {
    minHeight: 48,
    paddingHorizontal: 14,
    color: Colors.text,
    backgroundColor: "#2A2A2D",
    borderWidth: 1,
    borderColor: "#3E3E42",
    borderRadius: 10,
    fontSize: 15,
  },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#2C2C2E",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#3A3A3C",
  },
  presetChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  presetChipText: { color: Colors.text, fontSize: 13, fontWeight: "600" },
  presetChipTextActive: { color: "#000000", fontWeight: "800" },
  skipRestRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#2C2C2E",
  },
  skipRestTitle: { color: Colors.text, fontSize: 15, fontWeight: "600" },
  skipRestSubtitle: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  modalSaveButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
    backgroundColor: Colors.primary,
    borderRadius: 10,
  },
  modalSaveText: { color: "#000000", fontSize: 14, fontWeight: "800" },
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
    borderTopColor: "#2C2C2E",
  },
  optionText: { color: Colors.text, fontSize: 16 },
  /* 3-Dot Action Menu Bottom Sheet Styles */
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "flex-end",
  },
  menuSheet: {
    backgroundColor: "#1C1C1E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: "#2C2C2E",
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#3A3A3C",
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
    borderBottomColor: "#2C2C2E",
  },
  menuSheetTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  menuSheetSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: "500",
  },
  menuCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2A2A2D",
    alignItems: "center",
    justifyContent: "center",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#262629",
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
    color: Colors.text,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  menuItemSubtext: {
    color: Colors.textMuted,
    fontSize: 12,
  },
});
