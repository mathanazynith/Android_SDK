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
  repeat,
  number,
  setLabel,
  selected,
  index,
  editable = true,
  onSelect,
  onDelete,
  onRepeat,
  onSkipLastRest,
}: {
  step: WorkoutStep;
  color: string;
  repeat?: boolean;
  number?: number;
  setLabel?: string;
  selected?: boolean;
  index?: number;
  editable?: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
  onRepeat?: () => void;
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
        number={number}
        setLabel={setLabel}
        onPress={openStep}
        onDelete={onDelete}
      />
    );
  }

  const displayStepTime = stepTimeText(step);

  return (
    <TouchableOpacity
      activeOpacity={editable ? 0.88 : 1}
      onPress={openStep}
      style={[
        styles.stepCard,
        editable && selected && styles.selectedCard,
      ]}
    >
      <View style={[styles.colorBar, { backgroundColor: color }]} />
      <View style={styles.stepContent}>
        <View style={styles.titleRow}>
          <View style={styles.titleWithBadge}>
            {number ? (
              <View style={styles.numberBadge}>
                <Text style={styles.numberText}>{number}</Text>
              </View>
            ) : null}
            <Text style={styles.stepTitle} numberOfLines={1}>
              {step.title}
              {setLabel ? ` (${setLabel})` : ""}
            </Text>
          </View>

          <View style={styles.cardActions}>
            {isRepeated && onSkipLastRest ? (
              <View style={styles.restSwitch}>
                <Text style={styles.restSwitchLabel}>Skip last rest</Text>
                <Switch
                  value={step.skipLastRest ?? true}
                  onValueChange={onSkipLastRest}
                  disabled={!editable}
                  accessibilityLabel="Skip last rest"
                  trackColor={{ false: "#3A3A3C", true: Colors.primaryDark }}
                  thumbColor={(step.skipLastRest ?? true) ? Colors.primaryLight : "#BBBBBB"}
                />
              </View>
            ) : null}
            {repeat ? (
              editable && onRepeat ? (
                <TouchableOpacity onPress={onRepeat} style={styles.repeatBadge}>
                  <Text style={styles.repeatBadgeText}>
                    {step.repeat || 1} {step.repeat === 1 ? "Set" : "Sets"}
                  </Text>
                  <Feather
                    name="chevron-down"
                    size={14}
                    color={Colors.primaryLight}
                  />
                </TouchableOpacity>
              ) : (
                <View style={styles.repeatBadgeStatic}>
                  <Text style={styles.repeatBadgeText}>
                    {step.repeat || 1} {step.repeat === 1 ? "Set" : "Sets"}
                  </Text>
                </View>
              )
            ) : null}
            {editable && onDelete ? (
              <TouchableOpacity
                onPress={onDelete}
                accessibilityLabel={`Delete ${step.title}`}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="trash-2" size={17} color={Colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={styles.stepDetailsRow}>
          {hasDistance(step) && (
            <View style={styles.pillBadge}>
              <Feather name="compass" size={12} color={Colors.textSecondary} />
              <Text style={styles.pillText}>{distanceText(step)}</Text>
            </View>
          )}
          {displayStepTime ? (
            <View style={styles.pillBadge}>
              <Feather name="clock" size={12} color={Colors.textSecondary} />
              <Text style={styles.pillText}>
                {displayStepTime}
                {step.repeat && step.repeat > 1
                  ? ` (${displayTime(estimatedStepSeconds(step) * step.repeat)})`
                  : ""}
              </Text>
            </View>
          ) : null}
          {hasPace(step) && (
            <View style={[styles.pillBadge, { borderColor: Colors.primaryDark }]}>
              <Feather name="zap" size={12} color={Colors.primaryLight} />
              <Text style={[styles.pillText, { color: Colors.primaryLight }]}>
                {step.pace}
              </Text>
            </View>
          )}
        </View>

        {step.notes ? (
          <Text style={styles.stepNotes} numberOfLines={1}>
            📝 {step.notes}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function EmptyStepCard({
  title,
  color,
  number,
  setLabel,
  onPress,
  onDelete,
}: {
  title: string;
  color: string;
  number?: number;
  setLabel?: string;
  onPress: () => void;
  onDelete?: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={styles.emptyCard}
    >
      <View style={[styles.colorBar, { backgroundColor: color }]} />
      <View style={styles.emptyContent}>
        <View style={styles.titleRow}>
          <View style={styles.titleWithBadge}>
            {number ? (
              <View style={styles.numberBadge}>
                <Text style={styles.numberText}>{number}</Text>
              </View>
            ) : null}
            <Text style={styles.stepTitle}>
              {title}
              {setLabel ? ` (${setLabel})` : ""}
            </Text>
          </View>
          <View style={styles.cardActions}>
            {onDelete ? (
              <TouchableOpacity
                onPress={onDelete}
                accessibilityLabel={`Delete ${title}`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather
                  name="trash-2"
                  size={17}
                  color={Colors.textSecondary}
                />
              </TouchableOpacity>
            ) : null}
            <Feather
              name="plus-circle"
              size={18}
              color={Colors.primaryLight}
            />
          </View>
        </View>
        <Text style={styles.emptySubtext}>Tap to configure {title.toLowerCase()}</Text>
      </View>
    </TouchableOpacity>
  );
}

function RestCard({
  duration,
  skipLastRest,
  repeatCount = 1,
  editable = true,
  onPress,
  onDelete,
}: {
  duration: string;
  skipLastRest?: boolean;
  repeatCount?: number;
  editable?: boolean;
  onPress?: () => void;
  onDelete?: () => void;
}) {
  const restCount = skipLastRest ? Math.max(repeatCount - 1, 0) : repeatCount;
  const restSec = seconds(duration);
  const totalRestSec = restSec * restCount;

  return (
    <TouchableOpacity
      style={styles.restCard}
      onPress={editable ? onPress : undefined}
      activeOpacity={editable ? 0.85 : 1}
    >
      <View style={styles.restBar} />
      <View style={styles.restContent}>
        <View style={styles.restLeft}>
          <Feather
            name="coffee"
            size={15}
            color={Colors.primaryLight}
          />
          <Text style={styles.restTitle}>
            Recovery Rest
          </Text>
          <Text style={styles.restValue}>
            {duration}
          </Text>
          {repeatCount > 1 ? (
            <View style={styles.restCountBadge}>
              <Text style={styles.restCountText}>
                {restCount}x {restCount === 1 ? "rest" : "rests"} ({displayTime(totalRestSec)})
              </Text>
            </View>
          ) : null}
        </View>
        {editable ? (
          <View style={styles.restActions}>
            <TouchableOpacity
              onPress={onPress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="edit-2" size={15} color={Colors.textSecondary} />
            </TouchableOpacity>
            {onDelete ? (
              <TouchableOpacity
                onPress={onDelete}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="trash-2" size={15} color="#FF453A" />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
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
    removeWarmUp,
    removeRun,
    removeCooldown,
    duplicateRunGroup,
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

  // Recovery Rest Modal state
  const [restModalIndex, setRestModalIndex] = useState<number | null>(null);
  const [tempRestDuration, setTempRestDuration] = useState("00:01:00");

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
    setRestModalIndex(runIdx);
  };

  const saveRestConfig = () => {
    if (restModalIndex !== null) {
      const currentStep = workout.runs[restModalIndex];
      updateRunRest(
        restModalIndex,
        tempRestDuration,
        currentStep?.skipLastRest ?? true
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
          style={styles.headerIcon}
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={26} color={Colors.text} />
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
            {workout.title || "Custom Workout"}
          </Text>
          {isEditing ? (
            <Feather name="edit-2" size={14} color={Colors.primaryLight} style={{ marginLeft: 6 }} />
          ) : null}
        </TouchableOpacity>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            onPress={() => setShowActionMenu(true)}
            style={styles.headerMenuBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="More options"
          >
            <Feather name="more-horizontal" size={24} color={Colors.text} />
          </TouchableOpacity>

          {isEditing ? (
            <TouchableOpacity
              onPress={handleSave}
              disabled={isSaving}
              style={styles.saveHeaderButton}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={Colors.primaryLight} />
              ) : (
                <Text style={styles.done}>SAVE</Text>
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

        <Text style={styles.stepsTitle}>Workout Structure</Text>

        {/* 1. Warm Up */}
        {workout.warmUp ? (
          <StepCard
            step={workout.warmUp}
            color="#FF3B30"
            editable={isEditing}
            onSelect={() => router.push("/custom-workout?step=warmup")}
            onDelete={() => confirmDelete("Warm Up", removeWarmUp)}
          />
        ) : isEditing ? (
          <EmptyStepCard
            title="Warm Up"
            color="#FF3B30"
            onPress={() => router.push("/custom-workout?step=warmup")}
          />
        ) : null}

        {/* 2. Run Steps & Repeat Groups */}
        {runGroups.length ? (
          runGroups.map((group) => {
            if (group.groupId) {
              const groupStats = getGroupStats(group.items);

              return (
                <View key={group.groupId} style={styles.groupBox}>
                  <View style={styles.groupHeader}>
                    <View style={styles.groupTitleRow}>
                      <Feather name="repeat" size={16} color={Colors.primaryLight} />
                      <Text style={styles.groupTitle}>Repeat Group</Text>
                      <View style={styles.groupTimeBadge}>
                        <Feather name="clock" size={12} color={Colors.primaryLight} />
                        <Text style={styles.groupTimeText}>
                          {displayTime(groupStats.totalGroupRunSeconds)} run
                        </Text>
                      </View>
                      {groupStats.totalGroupSeconds > groupStats.totalGroupRunSeconds ? (
                        <View style={styles.groupTotalTimeBadge}>
                          <Text style={styles.groupTotalTimeText}>
                            Total {displayTime(groupStats.totalGroupSeconds)}
                          </Text>
                        </View>
                      ) : null}
                      {groupStats.totalGroupDistance > 0 ? (
                        <View style={styles.groupDistBadge}>
                          <Feather name="compass" size={12} color={Colors.textSecondary} />
                          <Text style={styles.groupDistText}>
                            {groupStats.totalGroupDistance.toFixed(2)} km
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  {group.items.map(({ step, index }, itemIdx) => (
                    <View key={`${step.title}-${index}`}>
                      <StepCard
                        step={step}
                        color="#0A84FF"
                        index={index}
                        number={index + 1}
                        setLabel={`Set ${itemIdx + 1}`}
                        repeat={true}
                        editable={isEditing}
                        selected={selectedRun === index}
                        onSelect={() => {
                          setSelectedRun(index);
                          router.push(
                            `/custom-workout/running-declaration?index=${index}`
                          );
                        }}
                        onRepeat={() => setRepeatRun(index)}
                        onSkipLastRest={(value) => updateRunSkipLastRest(index, value)}
                        onDelete={() =>
                          confirmDelete(step.title, () => {
                            removeRun(index);
                            setSelectedRun(null);
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
                  repeat={false}
                  editable={isEditing}
                  number={singleIndex + 1}
                  selected={selectedRun === singleIndex}
                  onSelect={() => {
                    setSelectedRun(singleIndex);
                    router.push(
                      `/custom-workout/running-declaration?index=${singleIndex}`
                    );
                  }}
                  onDelete={() =>
                    confirmDelete(singleStep.title, () => {
                      removeRun(singleIndex);
                      setSelectedRun(null);
                    })
                  }
                />
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
            onDelete={() => confirmDelete("Cool Down", removeCooldown)}
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
                router.push({
                  pathname: "/(app)/screens/map",
                  params: {
                    workoutTitle: workout.title || "Custom Workout",
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

              <Text style={[styles.inputLabel, { marginTop: 14 }]}>Notes</Text>
              <TextInput
                value={tempNotes}
                onChangeText={setTempNotes}
                placeholder="General notes for this workout"
                placeholderTextColor={Colors.textMuted}
                style={[styles.modalInput, { minHeight: 65, textAlignVertical: "top" }]}
                multiline
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
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    backgroundColor: "#000",
    borderBottomWidth: 1,
    borderBottomColor: "#222222",
  },
  headerIcon: { width: 44 },
  titleContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 18,
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
    paddingHorizontal: 8,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  done: { color: Colors.primaryLight, fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
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
  body: { flex: 1, backgroundColor: "#101010" },
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
  stepsTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 24,
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  stepCard: {
    flexDirection: "row",
    backgroundColor: "#1C1C1E",
    borderRadius: 14,
    marginBottom: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#2C2C2E",
  },
  selectedCard: { borderColor: Colors.primary },
  colorBar: { width: 5 },
  stepContent: { flex: 1, padding: 14 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  titleWithBadge: { flexDirection: "row", alignItems: "center", flex: 1 },
  numberBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#2A2A2D",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  numberText: { color: Colors.textSecondary, fontSize: 11, fontWeight: "700" },
  stepTitle: { color: Colors.text, fontSize: 16, fontWeight: "700", flex: 1 },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  restSwitch: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#262628",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333336",
    gap: 4,
  },
  restSwitchLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  repeatBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#2A2A2D",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primaryDark,
  },
  repeatBadgeText: { color: Colors.primaryLight, fontSize: 13, fontWeight: "700" },
  repeatBadgeStatic: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#2A2A2D",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#3E3E42",
  },
  stepDetailsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pillBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#262628",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333336",
  },
  pillText: { color: Colors.text, fontSize: 13, fontWeight: "600" },
  stepNotes: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 8,
    fontStyle: "italic",
  },
  emptyCard: {
    flexDirection: "row",
    backgroundColor: "#161618",
    borderRadius: 14,
    marginBottom: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#262628",
    borderStyle: "dashed",
  },
  emptyContent: { flex: 1, padding: 14 },
  emptySubtext: { color: Colors.textMuted, fontSize: 13 },
  restCard: {
    flexDirection: "row",
    backgroundColor: "#18181A",
    borderRadius: 12,
    marginBottom: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#262628",
  },
  restCardSkipped: {
    opacity: 0.6,
    borderColor: "#222224",
  },
  restBar: { width: 4, backgroundColor: "#636366" },
  restBarSkipped: { backgroundColor: "#3A3A3C" },
  restContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  restLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  restTitle: { color: Colors.textSecondary, fontSize: 13, fontWeight: "600" },
  restValue: { color: Colors.primaryLight, fontSize: 13, fontWeight: "700" },
  skipTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "#2C2C2E",
    borderRadius: 6,
  },
  skipTagText: { color: Colors.textMuted, fontSize: 10, fontWeight: "600" },
  restActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  addRestButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262628",
    borderStyle: "dashed",
  },
  addRestText: { color: Colors.primaryLight, fontSize: 12, fontWeight: "600" },
  groupBox: {
    padding: 12,
    backgroundColor: "#141416",
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#28282C",
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
  restCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "rgba(52, 199, 89, 0.15)",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(52, 199, 89, 0.3)",
    marginLeft: 6,
  },
  restCountText: {
    color: Colors.primaryLight,
    fontSize: 11,
    fontWeight: "700",
  },
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
