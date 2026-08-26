import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState, useMemo } from "react";
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
import { Colors } from "../../../constants/theme";
import { useCustomWorkout, type WorkoutStep } from "./workout-context";

const seconds = (value: string) => {
  const parts = value.split(":").map(Number);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
};

const distanceInKm = (step: WorkoutStep) => {
  const value = Number.parseFloat(step.distance) || 0;
  if (step.unit.includes("Meters") || step.unit === "m") return value / 1000;
  if (step.unit.includes("Miles") || step.unit === "mi") return value * 1.60934;
  return value;
};

const paceInSeconds = (pace: string) => {
  const match = pace.match(/(\d+)\s*:\s*(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
};

const estimatedStepSeconds = (step: WorkoutStep) => {
  const declaredTime = seconds(step.duration || "00:00:00");
  if (declaredTime) return declaredTime;
  const pace = paceInSeconds(step.pace);
  return pace && step.distance
    ? pace * (distanceInKm(step) / (step.unit.includes("Miles") || step.unit === "mi" ? 1.60934 : 1))
    : 0;
};

const estimatedRestSeconds = (step: WorkoutStep) =>
  (step.skipRest ? 0 : seconds(step.rest || "00:00:00")) *
  (step.skipLastRest ? Math.max(step.repeat - 1, 0) : step.repeat);

const displayTime = (value: number) => {
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = Math.round(value % 60);
  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  return `${m}m ${s}s`;
};

const distanceText = (step: WorkoutStep) => {
  if (!step.distance) return "Time Based";
  const unit = step.unit.includes("Miles") || step.unit === "mi" ? "mi" : step.unit.includes("Meters") || step.unit === "m" ? "m" : "km";
  return `${step.distance} ${unit}`;
};

const stepTime = (step: WorkoutStep) =>
  step.duration && step.duration !== "00:00:00"
    ? step.duration
    : step.pace && step.distance
      ? "Auto-calculated"
      : "Open Duration";

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
  selected,
  index,
  onSelect,
  onDelete,
  onRepeat,
  onSkipRest,
}: {
  step: WorkoutStep;
  color: string;
  repeat?: boolean;
  number?: number;
  selected?: boolean;
  index?: number;
  onSelect?: () => void;
  onDelete: () => void;
  onRepeat?: () => void;
  onSkipRest?: (value: boolean) => void;
}) {
  const openStep = () => {
    onSelect?.();
    router.push(
      step.title === "Warm Up" || step.stepType === "Warmup"
        ? "/custom-workout?step=warmup"
        : step.title === "Cool Down" || step.stepType === "Cooldown"
          ? "/custom-workout/cooldown"
          : `/custom-workout/running-declaration?index=${index}`,
    );
  };

  if (isEmptyStep(step))
    return (
      <EmptyStepCard
        title={step.title || "Running"}
        color={color}
        onPress={openStep}
        onDelete={onDelete}
      />
    );

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={openStep}
      style={[
        styles.stepCard,
        selected && styles.selectedCard,
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
            </Text>
          </View>

          <View style={styles.cardActions}>
            {step.rest && onSkipRest ? (
              <View style={styles.restSwitch}>
                <Text style={styles.restSwitchLabel}>Skip rest</Text>
                <Switch
                  value={step.skipRest ?? false}
                  onValueChange={onSkipRest}
                  accessibilityLabel="Skip rest"
                  trackColor={{ false: "#3A3A3C", true: Colors.primaryDark }}
                  thumbColor={step.skipRest ? Colors.primaryLight : "#BBBBBB"}
                />
              </View>
            ) : null}
            {repeat && onRepeat ? (
              <TouchableOpacity onPress={onRepeat} style={styles.repeatBadge}>
                <Text style={styles.repeatBadgeText}>{step.repeat}x</Text>
                <Feather
                  name="chevron-down"
                  size={14}
                  color={Colors.primaryLight}
                />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={onDelete}
              accessibilityLabel={`Delete ${step.title}`}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="trash-2" size={17} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.stepDetailsRow}>
          <View style={styles.pillBadge}>
            <Feather name="compass" size={12} color={Colors.textSecondary} />
            <Text style={styles.pillText}>{distanceText(step)}</Text>
          </View>
          <View style={styles.pillBadge}>
            <Feather name="clock" size={12} color={Colors.textSecondary} />
            <Text style={styles.pillText}>{stepTime(step)}</Text>
          </View>
          {step.pace ? (
            <View style={[styles.pillBadge, { borderColor: Colors.primaryDark }]}>
              <Feather name="zap" size={12} color={Colors.primaryLight} />
              <Text style={[styles.pillText, { color: Colors.primaryLight }]}>
                {step.pace}
              </Text>
            </View>
          ) : null}
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
  onPress,
  onDelete,
}: {
  title: string;
  color: string;
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
          <Text style={styles.stepTitle}>{title}</Text>
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

function RestCard({ duration }: { duration: string }) {
  return (
    <View style={styles.restCard}>
      <View style={styles.restBar} />
      <View style={styles.restContent}>
        <Feather name="coffee" size={15} color={Colors.textSecondary} />
        <Text style={styles.restTitle}>Recovery Rest</Text>
        <Text style={styles.restValue}>{duration}</Text>
      </View>
    </View>
  );
}

export default function CustomWorkoutOverview() {
  const {
    workout,
    isSaving,
    setTitle,
    setWorkoutDate,
    setNotes,
    reset,
    addEmptyRun,
    removeWarmUp,
    removeRun,
    removeCooldown,
    duplicateRunGroup,
    updateRunRepeat,
    updateRunSkipRest,
    updateGroupRepeat,
    updateGroupSkipLastRest,
    saveWorkout,
  } = useCustomWorkout();

  const [selectedRun, setSelectedRun] = useState<number | null>(
    workout.runs.length ? 0 : null,
  );
  const [repeatRun, setRepeatRun] = useState<number | null>(null);
  const [repeatGroup, setRepeatGroup] = useState<string | null>(null);
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [tempTitle, setTempTitle] = useState(workout.title || "Custom Workout");
  const [tempNotes, setTempNotes] = useState(workout.notes || "");

  const confirmDelete = (label: string, onDelete: () => void) =>
    Alert.alert(
      `Delete ${label}?`,
      "This step will be removed from the workout.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: onDelete },
      ],
    );

  const steps = [workout.warmUp, ...workout.runs, workout.cooldown].filter(
    Boolean,
  ) as WorkoutStep[];

  const totalSeconds = useMemo(() => {
    return steps.reduce((total, step) => {
      const groupRepeat = step.groupRepeat || 1;
      return (
        total +
        (estimatedStepSeconds(step) * step.repeat + estimatedRestSeconds(step)) *
          groupRepeat
      );
    }, 0);
  }, [steps]);

  const totalDistance = useMemo(() => {
    return steps.reduce(
      (total, step) =>
        total + distanceInKm(step) * step.repeat * (step.groupRepeat || 1),
      0,
    );
  }, [steps]);

  const runGroups = workout.runs.reduce<
    { groupId?: string; items: { step: WorkoutStep; index: number }[] }[]
  >((groups, step, index) => {
    const previous = groups[groups.length - 1];
    if (step.groupId && previous?.groupId === step.groupId)
      previous.items.push({ step, index });
    else groups.push({ groupId: step.groupId, items: [{ step, index }] });
    return groups;
  }, []);

  const handleSave = async () => {
    if (!workout.runs || workout.runs.length === 0) {
      Alert.alert(
        "Run step required",
        "A custom workout must contain at least one Running step before saving."
      );
      return;
    }

    try {
      const saved = await saveWorkout();
      Alert.alert(
        "Workout Saved! 🎉",
        `"${saved.title || workout.title}" has been saved successfully.`,
        [
          {
            text: "Done",
            onPress: () => {
              reset();
              router.back();
            },
          },
        ]
      );
    } catch (err: any) {
      Alert.alert("Failed to Save", err?.message || "Could not save custom workout.");
    }
  };

  const saveTitleAndNotes = () => {
    setTitle(tempTitle.trim() || "Custom Workout");
    setNotes(tempNotes.trim());
    setShowTitleModal(false);
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
          onPress={() => {
            setTempTitle(workout.title);
            setTempNotes(workout.notes);
            setShowTitleModal(true);
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.headerTitle} numberOfLines={1}>
            {workout.title || "Custom Workout"}
          </Text>
          <Feather name="edit-2" size={14} color={Colors.primaryLight} style={{ marginLeft: 6 }} />
        </TouchableOpacity>

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
            onSelect={() => router.push("/custom-workout?step=warmup")}
            onDelete={() => confirmDelete("Warm Up", removeWarmUp)}
          />
        ) : (
          <EmptyStepCard
            title="Warm Up"
            color="#FF3B30"
            onPress={() => router.push("/custom-workout?step=warmup")}
          />
        )}

        {/* 2. Run Steps & Repeat Groups */}
        {runGroups.length ? (
          runGroups.map((group) =>
            group.groupId ? (
              <View key={group.groupId} style={styles.groupBox}>
                <View style={styles.groupHeader}>
                  <View style={styles.groupTitleRow}>
                    <Feather name="repeat" size={16} color={Colors.primaryLight} />
                    <Text style={styles.groupTitle}>Repeat Group</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.groupRepeat}
                    onPress={() => setRepeatGroup(group.groupId || null)}
                  >
                    <Text style={styles.repeatBadgeText}>
                      {group.items[0].step.groupRepeat || 1}x
                    </Text>
                    <Feather
                      name="chevron-down"
                      size={14}
                      color={Colors.primaryLight}
                    />
                  </TouchableOpacity>
                </View>
                {group.items.map(({ step, index }) => (
                  <View key={`${step.title}-${index}`}>
                    <StepCard
                      step={step}
                      color="#0A84FF"
                      index={index}
                      number={index + 1}
                      selected={selectedRun === index}
                      onSelect={() => setSelectedRun(index)}
                      onSkipRest={(value) => updateRunSkipRest(index, value)}
                      onDelete={() =>
                        confirmDelete(step.title, () => {
                          removeRun(index);
                          setSelectedRun(null);
                        })
                      }
                    />
                    {step.rest && !step.skipRest ? (
                      <RestCard duration={step.rest} />
                    ) : null}
                  </View>
                ))}
              </View>
            ) : (
              <View key={`run-${group.items[0].index}`}>
                <StepCard
                  step={group.items[0].step}
                  color="#0A84FF"
                  index={group.items[0].index}
                  repeat
                  number={group.items[0].index + 1}
                  selected={selectedRun === group.items[0].index}
                  onSelect={() => setSelectedRun(group.items[0].index)}
                  onRepeat={() => setRepeatRun(group.items[0].index)}
                  onSkipRest={(value) =>
                    updateRunSkipRest(group.items[0].index, value)
                  }
                  onDelete={() =>
                    confirmDelete(group.items[0].step.title, () => {
                      removeRun(group.items[0].index);
                      setSelectedRun(null);
                    })
                  }
                />
                {group.items[0].step.rest && !group.items[0].step.skipRest ? (
                  <RestCard duration={group.items[0].step.rest} />
                ) : null}
              </View>
            ),
          )
        ) : (
          <EmptyStepCard
            title="Running"
            color="#0A84FF"
            onPress={() => router.push("/custom-workout/running-declaration")}
          />
        )}

        {/* 3. Cool Down */}
        {workout.cooldown ? (
          <StepCard
            step={workout.cooldown}
            color="#30D158"
            onSelect={() => router.push("/custom-workout/cooldown")}
            onDelete={() => confirmDelete("Cool Down", removeCooldown)}
          />
        ) : (
          <EmptyStepCard
            title="Cool Down"
            color="#30D158"
            onPress={() => router.push("/custom-workout/cooldown")}
          />
        )}

        {/* Actions Row */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionAdd}
            onPress={() => addEmptyRun()}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={18} color="#000000" />
            <Text style={styles.actionAddText}>ADD RUN STEP</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionRepeat,
              selectedRun === null && styles.actionDisabled,
            ]}
            onPress={() => {
              if (selectedRun === null) {
                Alert.alert(
                  "Select a running step",
                  "Tap a Running step card first to repeat it.",
                );
                return;
              }
              duplicateRunGroup(selectedRun);
              setSelectedRun(selectedRun + 1);
            }}
            activeOpacity={0.85}
          >
            <Feather name="repeat" size={17} color={Colors.text} />
            <Text style={styles.actionRepeatText}>REPEAT RUN</Text>
          </TouchableOpacity>
        </View>
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
            <Text style={styles.modalTitle}>REPEAT COUNT</Text>
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
                    <Text style={styles.optionText}>{value} times</Text>
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

      {/* Repeat Group Modal */}
      <Modal
        visible={repeatGroup !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRepeatGroup(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setRepeatGroup(null)}>
          <Pressable
            style={styles.modal}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.modalTitle}>REPEAT GROUP COUNT</Text>
            <ScrollView style={styles.repeatScroll}>
              {Array.from({ length: 40 }, (_, index) => index + 1).map(
                (value) => (
                  <TouchableOpacity
                    key={value}
                    style={styles.option}
                    onPress={() => {
                      if (repeatGroup) updateGroupRepeat(repeatGroup, value);
                      setRepeatGroup(null);
                    }}
                  >
                    <Text style={styles.optionText}>{value} times</Text>
                    {repeatGroup &&
                    workout.runs.find((step) => step.groupId === repeatGroup)
                      ?.groupRepeat === value ? (
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
  saveHeaderButton: {
    minWidth: 50,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  done: { color: Colors.primaryLight, fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  body: { flex: 1 },
  bodyContent: { padding: 18, paddingBottom: 40 },
  dateBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1C1C1E",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2C2C2E",
  },
  dateText: { color: Colors.text, fontSize: 14, fontWeight: "500", flex: 1, marginLeft: 8 },
  dateChangeBtn: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: "#2A2A2D", borderRadius: 8 },
  dateChangeText: { color: Colors.primaryLight, fontSize: 12, fontWeight: "700" },
  statsCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#1C1C1E",
    paddingVertical: 18,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#2C2C2E",
  },
  statBox: { alignItems: "center", flex: 1 },
  statDivider: { width: 1, height: 32, backgroundColor: "#333336" },
  statLabel: { color: Colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 4 },
  statValue: { color: Colors.text, fontSize: 18, fontWeight: "800" },
  stepsTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  groupBox: {
    marginBottom: 14,
    padding: 12,
    backgroundColor: "#161618",
    borderWidth: 1,
    borderColor: "#2C2C2E",
    borderRadius: 14,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  groupTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  groupTitle: { color: Colors.text, fontSize: 15, fontWeight: "700" },
  groupRepeat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#2A2A2D",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stepCard: {
    minHeight: 88,
    flexDirection: "row",
    marginBottom: 12,
    overflow: "hidden",
    backgroundColor: "#1C1C1E",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2C2C2E",
  },
  selectedCard: { borderColor: Colors.primary, backgroundColor: "#222225" },
  emptyCard: {
    minHeight: 70,
    flexDirection: "row",
    marginBottom: 12,
    overflow: "hidden",
    backgroundColor: "#161618",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2A2A2D",
    borderStyle: "dashed",
  },
  emptyContent: { padding: 14, flex: 1, justifyContent: "center" },
  emptySubtext: { color: Colors.textMuted, fontSize: 13, marginTop: 4 },
  colorBar: { width: 6 },
  stepContent: { padding: 14, flex: 1 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleWithBadge: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  numberBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#2C2C2E",
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { color: Colors.textSecondary, fontSize: 11, fontWeight: "700" },
  stepTitle: { color: Colors.text, fontSize: 16, fontWeight: "600", flex: 1 },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  restSwitch: { flexDirection: "row", alignItems: "center", gap: 4 },
  restSwitchLabel: { color: Colors.textSecondary, fontSize: 11 },
  repeatBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#2A2A2D",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  repeatBadgeText: {
    color: Colors.primaryLight,
    fontSize: 13,
    fontWeight: "700",
  },
  stepDetailsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  pillBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#262629",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333336",
  },
  pillText: { color: Colors.text, fontSize: 12, fontWeight: "500" },
  stepNotes: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 8,
    fontStyle: "italic",
  },
  restCard: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    marginLeft: 16,
    overflow: "hidden",
    backgroundColor: "#161618",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262629",
  },
  restBar: { width: 4, height: "100%", backgroundColor: "#555558" },
  restContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    flex: 1,
  },
  restTitle: { color: Colors.textSecondary, fontSize: 13, fontWeight: "500" },
  restValue: {
    color: Colors.primaryLight,
    fontSize: 13,
    fontWeight: "700",
    marginLeft: "auto",
  },
  actions: { flexDirection: "row", gap: 12, marginTop: 16 },
  actionAdd: {
    flex: 1.2,
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
  inputLabel: { color: Colors.text, fontSize: 14, fontWeight: "500", marginBottom: 6 },
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
  modalSaveButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
    backgroundColor: Colors.primary,
    borderRadius: 10,
  },
  modalSaveText: { color: "#000000", fontSize: 14, fontWeight: "800" },
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
});
