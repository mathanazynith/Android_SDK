import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollTimePicker } from "../../components/ScrollTimePicker";
import { BRAND_GREEN, useTheme } from "../../contexts/ThemeContext";
import {
  PRESET_WORKOUTS,
  PresetWorkout,
  buildPlanFromPreset,
} from "../../src/constants/presetWorkouts";
import {
  formatSecondsToPace,
  parsePaceToSeconds,
} from "../../src/utils/workoutCalculations";
import {
  WorkoutExecutionStep,
  buildPlanFromPlanSegments,
} from "../../src/utils/workoutPlanBuilder";

const PACE_DIFF_MIN_SEC = 30; // Minimum 30 seconds difference required between faster and slower pace

const REST_PRESETS = [
  { label: "30s", value: "00:00:30" },
  { label: "1 min", value: "00:01:00" },
  { label: "1m 30s", value: "00:01:30" },
  { label: "2 min", value: "00:02:00" },
  { label: "3 min", value: "00:03:00" },
  { label: "5 min", value: "00:05:00" },
];

export default function WorkoutSetupScreen() {
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams<{
    presetId?: string;
    workoutTitle?: string;
    workoutType?: string;
    targetPace?: string;
    fasterPace?: string;
    slowerPace?: string;
    duration?: string;
    distance?: string;
    repeats?: string;
    repDistance?: string;
    restDuration?: string;
    planSegments?: string;
    workoutDbId?: string;
  }>();

  // Match preset if provided
  const matchedPreset = useMemo<PresetWorkout | undefined>(() => {
    if (params.presetId) {
      return PRESET_WORKOUTS.find((p) => p.id === params.presetId);
    }
    if (params.workoutTitle) {
      const lower = params.workoutTitle.toLowerCase();
      if (lower.includes("10 x 400") || lower.includes("400m")) {
        return PRESET_WORKOUTS.find((p) => p.id === "preset-interval-10x400");
      }
      if (lower.includes("70 min") || lower.includes("70-minute") || lower.includes("long run")) {
        return PRESET_WORKOUTS.find((p) => p.id === "preset-long-run-70");
      }
      if (lower.includes("30 min") || lower.includes("30-minute") || lower.includes("easy run")) {
        return PRESET_WORKOUTS.find((p) => p.id === "preset-easy-run-30");
      }
      if (lower.includes("20 min") || lower.includes("20-minute") || lower.includes("tempo")) {
        return PRESET_WORKOUTS.find((p) => p.id === "preset-tempo-run-20");
      }
    }
    return undefined;
  }, [params.presetId, params.workoutTitle]);

  const title =
    params.workoutTitle ||
    matchedPreset?.title ||
    "Structured Workout";

  const isInterval =
    matchedPreset?.workoutType === "Interval" ||
    title.toLowerCase().includes("interval") ||
    Boolean(params.repeats && Number(params.repeats) > 1);

  // Default pace ranges
  const initialFasterPace =
    params.fasterPace ||
    (params.targetPace ? params.targetPace.replace(/[^0-9:]/g, "") : null) ||
    matchedPreset?.defaultFasterPace ||
    (isInterval ? "4:30" : "6:30");

  const initialSlowerPace =
    params.slowerPace ||
    matchedPreset?.defaultSlowerPace ||
    (isInterval ? "5:30" : "7:30");

  const [fasterPaceSec, setFasterPaceSec] = useState<number>(() => {
    const sec = parsePaceToSeconds(initialFasterPace);
    return sec && sec > 0 ? sec : 270; // 4:30
  });

  const [slowerPaceSec, setSlowerPaceSec] = useState<number>(() => {
    const sec = parsePaceToSeconds(initialSlowerPace);
    const fSec = parsePaceToSeconds(initialFasterPace) || 270;
    const baseSlower = sec && sec > 0 ? sec : 330; // 5:30
    // Guarantee slower pace is at least 30 seconds slower than faster pace
    return Math.max(baseSlower, fSec + PACE_DIFF_MIN_SEC);
  });

  // Recovery enabled/disabled toggle:
  // When disabled, hides the recovery card completely!
  // When enabled, recovery card is shown and editable!
  const [enableRecovery, setEnableRecovery] = useState<boolean>(true);

  // Recovery Rest duration in seconds (default: 180s = 3:00 min)
  const initialRestSeconds =
    Number(params.restDuration) ||
    matchedPreset?.restDurationSeconds ||
    180;
  const [restSeconds, setRestSeconds] = useState<number>(initialRestSeconds);

  const [skipLastRecovery, setSkipLastRecovery] = useState<boolean>(
    matchedPreset?.skipLastRest ?? true
  );

  // Rest Modal State
  const [isRestModalVisible, setIsRestModalVisible] = useState<boolean>(false);
  const [tempRestDurationStr, setTempRestDurationStr] = useState<string>("00:03:00");
  const [tempSkipLastRecovery, setTempSkipLastRecovery] = useState<boolean>(true);

  // Stepper handlers (5 second increments)
  // Enforces: Faster and Slower pace can NEVER be the same, difference must be >= 30 seconds
  const isFasterPaceAtMax = fasterPaceSec >= slowerPaceSec - PACE_DIFF_MIN_SEC;
  const isSlowerPaceAtMin = slowerPaceSec <= fasterPaceSec + PACE_DIFF_MIN_SEC;

  const adjustFasterPace = (deltaSeconds: number) => {
    setFasterPaceSec((prev) => {
      const next = prev + deltaSeconds;
      if (next < 120) return 120; // 2:00/km minimum
      const maxAllowed = slowerPaceSec - PACE_DIFF_MIN_SEC;
      return next <= maxAllowed ? next : maxAllowed;
    });
  };

  const adjustSlowerPace = (deltaSeconds: number) => {
    setSlowerPaceSec((prev) => {
      const next = prev + deltaSeconds;
      const minAllowed = fasterPaceSec + PACE_DIFF_MIN_SEC;
      if (next < minAllowed) return minAllowed;
      return Math.min(900, next); // 15:00/km maximum
    });
  };

  const fasterPaceStr = formatSecondsToPace(fasterPaceSec, "km", false);
  const slowerPaceStr = formatSecondsToPace(slowerPaceSec, "km", false);

  // Calculate estimated time for an interval rep (e.g. 400m)
  const repDistanceMeters =
    Number(params.repDistance) ||
    matchedPreset?.repDistanceMeters ||
    400;

  const avgPaceSec = (fasterPaceSec + slowerPaceSec) / 2;
  const estimatedRepSeconds = Math.round((repDistanceMeters / 1000) * avgPaceSec);
  const estRepMin = Math.floor(estimatedRepSeconds / 60);
  const estRepSec = estimatedRepSeconds % 60;
  const estTimeDisplay = `${estRepMin}:${String(estRepSec).padStart(2, "0")}`;

  const repeatsCount =
    Number(params.repeats) ||
    matchedPreset?.repeats ||
    10;

  // Time conversion helpers
  const formatSecToTimeStr = (totalSec: number) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const formatSecToDisplayMin = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (s > 0) return `${m}:${String(s).padStart(2, "0")} min`;
    return `${m}:00 min`;
  };

  // Open & apply rest configuration modal
  const openRestModal = () => {
    setTempRestDurationStr(formatSecToTimeStr(restSeconds));
    setTempSkipLastRecovery(skipLastRecovery);
    setIsRestModalVisible(true);
  };

  const applyRestModal = () => {
    const parts = tempRestDurationStr.split(":").map(Number);
    const parsedSec = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    if (parsedSec > 0) {
      setRestSeconds(parsedSec);
    }
    setSkipLastRecovery(tempSkipLastRecovery);
    setIsRestModalVisible(false);
  };

  // Handle start workout
  const handleStartWorkout = () => {
    let executionPlan: WorkoutExecutionStep[] = [];

    // 1. If planned segments passed in params from training plan
    if (params.planSegments) {
      try {
        const parsedSegments = JSON.parse(params.planSegments);
        if (Array.isArray(parsedSegments) && parsedSegments.length > 0) {
          executionPlan = buildPlanFromPlanSegments(parsedSegments, title);
        }
      } catch (e) {
        console.warn("[WorkoutSetup] Could not parse planSegments:", e);
      }
    }

    // 2. If matched preset
    if (executionPlan.length === 0 && matchedPreset) {
      executionPlan = buildPlanFromPreset(
        matchedPreset,
        fasterPaceStr,
        slowerPaceStr,
        skipLastRecovery,
        restSeconds,
        !enableRecovery // if recovery is disabled, no rest steps are included
      );
    }

    // 3. Fallback single continuous run step
    if (executionPlan.length === 0) {
      const durationSec = params.duration
        ? Number(params.duration) * 60
        : 30 * 60;
      executionPlan = [
        {
          id: "step-1-run",
          title,
          stepType: "Run",
          setNumber: 1,
          totalSets: 1,
          targetType: "DURATION",
          targetDurationSeconds: durationSec,
          targetPace: `${fasterPaceStr} / km`,
          unit: "Minutes",
          notes: `Pace range: ${fasterPaceStr} - ${slowerPaceStr} /km`,
        },
      ];
    }

    // Navigate to map with execution plan
    router.push({
      pathname: "/(app)/screens/map",
      params: {
        workoutTitle: title,
        workoutPlan: JSON.stringify(executionPlan),
      },
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      {/* Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surfaceRaised }]}
          accessibilityLabel="Back"
        >
          <Feather name="chevron-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Workout Setup</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Workout Title & Subheading */}
        <View style={styles.titleSection}>
          <Text style={[styles.workoutTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.workoutSubtitle, { color: colors.textSecondary }]}>
            Set your estimated pace range before starting.
          </Text>
        </View>

        {isInterval ? (
          // Interval Workout Layout (Image 1 & 3)
          <View style={[styles.intervalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* Set Header with Recovery Toggle */}
            <View style={styles.setHeaderRow}>
              <Text style={[styles.setHeaderText, { color: colors.textTertiary }]}>
                Set 1 · x{repeatsCount}
              </Text>
              <View style={styles.recoverySwitchContainer}>
                <Text style={[styles.recoveryToggleLabel, { color: enableRecovery ? BRAND_GREEN : colors.textTertiary }]}>
                  {enableRecovery ? "Recovery: ON" : "Recovery: OFF"}
                </Text>
                <Switch
                  value={enableRecovery}
                  onValueChange={setEnableRecovery}
                  trackColor={{ false: colors.border, true: "rgba(34, 197, 94, 0.4)" }}
                  thumbColor={enableRecovery ? BRAND_GREEN : colors.iconSecondary}
                  style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                />
              </View>
            </View>

            {/* Run 1 Segment Card */}
            <View style={[styles.segmentCard, { backgroundColor: colors.surfaceRaised }]}>
              <View style={[styles.accentBar, { backgroundColor: "#0A84FF" }]} />
              <View style={styles.segmentInfo}>
                <Text style={[styles.segmentTitle, { color: colors.text }]}>Run 1</Text>
                <Text style={[styles.segmentMetric, { color: colors.textSecondary }]}>
                  {repDistanceMeters} m
                </Text>
              </View>
              <View style={styles.segmentRight}>
                <Text style={[styles.segmentEstLabel, { color: colors.textTertiary }]}>Est Time</Text>
                <Text style={[styles.segmentEstValue, { color: colors.text }]}>{estTimeDisplay}</Text>
              </View>
            </View>

            {/* ESTIMATED PACE RANGE Card */}
            <View style={[styles.paceRangeBox, { backgroundColor: isDark ? "#171A1E" : "#F1F5F9" }]}>
              <Text style={[styles.paceRangeLabel, { color: colors.textTertiary }]}>
                ESTIMATED PACE RANGE
              </Text>

              {/* Big Green Pace Range */}
              <Text style={[styles.paceRangeDisplay, { color: BRAND_GREEN }]}>
                {fasterPaceStr}–{slowerPaceStr} <Text style={styles.paceUnitText}>/km</Text>
              </Text>

              {/* Faster & Slower Pace Steppers */}
              <View style={styles.stepperRow}>
                {/* Faster pace control */}
                <View style={[styles.stepperCard, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.stepperLabel, { color: colors.textSecondary }]}>Faster pace</Text>
                  <Text style={[styles.stepperValue, { color: colors.text }]}>{fasterPaceStr}</Text>
                  <View style={styles.stepperButtonsRow}>
                    <TouchableOpacity
                      style={[styles.stepperBtn, { backgroundColor: "rgba(34, 197, 94, 0.15)" }]}
                      onPress={() => adjustFasterPace(-5)}
                      activeOpacity={0.7}
                      accessibilityLabel="Make faster pace 5 seconds faster"
                    >
                      <Feather name="minus" size={18} color={BRAND_GREEN} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.stepperBtn,
                        { backgroundColor: "rgba(34, 197, 94, 0.15)" },
                        isFasterPaceAtMax && { opacity: 0.35 },
                      ]}
                      onPress={() => adjustFasterPace(5)}
                      disabled={isFasterPaceAtMax}
                      activeOpacity={0.7}
                      accessibilityLabel="Make faster pace 5 seconds slower"
                    >
                      <Feather name="plus" size={18} color={BRAND_GREEN} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Slower pace control */}
                <View style={[styles.stepperCard, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.stepperLabel, { color: colors.textSecondary }]}>Slower pace</Text>
                  <Text style={[styles.stepperValue, { color: colors.text }]}>{slowerPaceStr}</Text>
                  <View style={styles.stepperButtonsRow}>
                    <TouchableOpacity
                      style={[
                        styles.stepperBtn,
                        { backgroundColor: "rgba(34, 197, 94, 0.15)" },
                        isSlowerPaceAtMin && { opacity: 0.35 },
                      ]}
                      onPress={() => adjustSlowerPace(-5)}
                      disabled={isSlowerPaceAtMin}
                      activeOpacity={0.7}
                      accessibilityLabel="Make slower pace 5 seconds faster"
                    >
                      <Feather name="minus" size={18} color={BRAND_GREEN} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.stepperBtn, { backgroundColor: "rgba(34, 197, 94, 0.15)" }]}
                      onPress={() => adjustSlowerPace(5)}
                      activeOpacity={0.7}
                      accessibilityLabel="Make slower pace 5 seconds slower"
                    >
                      <Feather name="plus" size={18} color={BRAND_GREEN} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <Text style={[styles.coachGuideText, { color: colors.textTertiary }]}>
                The workout coach will use this range to guide your running pace. (Min 30s spread enforced)
              </Text>
            </View>

            {/* Recover 1 Segment Card - Only shown when Recovery is enabled! */}
            {enableRecovery ? (
              <>
                <TouchableOpacity
                  style={[styles.segmentCard, styles.restCardInteractive, { backgroundColor: colors.surfaceRaised, marginTop: 14 }]}
                  onPress={openRestModal}
                  activeOpacity={0.82}
                  accessibilityLabel="Edit recovery rest duration"
                >
                  <View style={[styles.accentBar, { backgroundColor: "#30D158" }]} />
                  <View style={styles.segmentInfo}>
                    <View style={styles.restTitleWithEdit}>
                      <Feather name="coffee" size={15} color="#30D158" style={{ marginRight: 6 }} />
                      <Text style={[styles.segmentTitle, { color: colors.text }]}>Recover 1</Text>
                      <View style={styles.editBadge}>
                        <Feather name="edit-2" size={10} color={BRAND_GREEN} />
                        <Text style={styles.editBadgeText}>EDIT</Text>
                      </View>
                    </View>
                    <Text style={[styles.segmentMetric, { color: BRAND_GREEN, fontWeight: "700" }]}>
                      {formatSecToDisplayMin(restSeconds)}
                    </Text>
                  </View>
                  <View style={styles.segmentRight}>
                    <Text style={[styles.segmentEstLabel, { color: colors.textTertiary }]}>Est Distance</Text>
                    <Text style={[styles.segmentEstValue, { color: colors.text }]}>{repDistanceMeters} m</Text>
                  </View>
                </TouchableOpacity>
              </>
            ) : (
              <View style={[styles.recoveryDisabledBox, { backgroundColor: colors.surfaceRaised }]}>
                <Feather name="info" size={16} color={colors.textTertiary} style={{ marginRight: 8 }} />
                <Text style={[styles.recoveryDisabledText, { color: colors.textTertiary }]}>
                  Recovery rest is disabled. Intervals will run back-to-back.
                </Text>
              </View>
            )}
          </View>
        ) : (
          // Continuous Run Layout (Image 2)
          <View style={[styles.paceRangeBox, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
            <Text style={[styles.paceRangeLabel, { color: colors.textTertiary }]}>
              ESTIMATED PACE RANGE
            </Text>

            {/* Big Green Pace Range */}
            <Text style={[styles.paceRangeDisplay, { color: BRAND_GREEN }]}>
              {fasterPaceStr}–{slowerPaceStr} <Text style={styles.paceUnitText}>/km</Text>
            </Text>

            {/* Faster & Slower Pace Steppers */}
            <View style={styles.stepperRow}>
              <View style={[styles.stepperCard, { backgroundColor: colors.surfaceRaised }]}>
                <Text style={[styles.stepperLabel, { color: colors.textSecondary }]}>Faster pace</Text>
                <Text style={[styles.stepperValue, { color: colors.text }]}>{fasterPaceStr}</Text>
                <View style={styles.stepperButtonsRow}>
                  <TouchableOpacity
                    style={[styles.stepperBtn, { backgroundColor: "rgba(34, 197, 94, 0.15)" }]}
                    onPress={() => adjustFasterPace(-5)}
                    activeOpacity={0.7}
                    accessibilityLabel="Decrease faster pace"
                  >
                    <Feather name="minus" size={18} color={BRAND_GREEN} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.stepperBtn,
                      { backgroundColor: "rgba(34, 197, 94, 0.15)" },
                      isFasterPaceAtMax && { opacity: 0.35 },
                    ]}
                    onPress={() => adjustFasterPace(5)}
                    disabled={isFasterPaceAtMax}
                    activeOpacity={0.7}
                    accessibilityLabel="Increase faster pace"
                  >
                    <Feather name="plus" size={18} color={BRAND_GREEN} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={[styles.stepperCard, { backgroundColor: colors.surfaceRaised }]}>
                <Text style={[styles.stepperLabel, { color: colors.textSecondary }]}>Slower pace</Text>
                <Text style={[styles.stepperValue, { color: colors.text }]}>{slowerPaceStr}</Text>
                <View style={styles.stepperButtonsRow}>
                  <TouchableOpacity
                    style={[
                      styles.stepperBtn,
                      { backgroundColor: "rgba(34, 197, 94, 0.15)" },
                      isSlowerPaceAtMin && { opacity: 0.35 },
                    ]}
                    onPress={() => adjustSlowerPace(-5)}
                    disabled={isSlowerPaceAtMin}
                    activeOpacity={0.7}
                    accessibilityLabel="Decrease slower pace"
                  >
                    <Feather name="minus" size={18} color={BRAND_GREEN} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.stepperBtn, { backgroundColor: "rgba(34, 197, 94, 0.15)" }]}
                    onPress={() => adjustSlowerPace(5)}
                    activeOpacity={0.7}
                    accessibilityLabel="Increase slower pace"
                  >
                    <Feather name="plus" size={18} color={BRAND_GREEN} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <Text style={[styles.coachGuideText, { color: colors.textTertiary }]}>
              The workout coach will use this range to guide your running pace. (Min 30s spread enforced)
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Fixed Bottom Action Button */}
      <View style={[styles.bottomBar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[styles.startWorkoutButton, { backgroundColor: BRAND_GREEN }]}
          onPress={handleStartWorkout}
          activeOpacity={0.88}
        >
          <Feather name="play" size={20} color="#081009" style={{ marginRight: 6 }} />
          <Text style={styles.startWorkoutButtonText}>START WORKOUT</Text>
          <Feather name="arrow-right" size={20} color="#081009" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      </View>

      {/* RECOVERY REST EDIT MODAL (Similar to Custom Workout) */}
      <Modal
        visible={isRestModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsRestModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setIsRestModalVisible(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>RECOVERY REST</Text>
              <TouchableOpacity onPress={() => setIsRestModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalSectionLabel, { color: colors.textTertiary }]}>Quick Presets</Text>
              <View style={styles.presetChipsRow}>
                {REST_PRESETS.map((preset) => {
                  const isSelected = tempRestDurationStr === preset.value;
                  return (
                    <TouchableOpacity
                      key={preset.label}
                      style={[
                        styles.presetChip,
                        { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
                        isSelected && { backgroundColor: BRAND_GREEN, borderColor: BRAND_GREEN },
                      ]}
                      onPress={() => setTempRestDurationStr(preset.value)}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          { color: colors.text },
                          isSelected && { color: "#081009", fontWeight: "800" },
                        ]}
                      >
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.modalSectionLabel, { color: colors.textTertiary, marginTop: 16 }]}>
                Custom Rest Duration
              </Text>
              <ScrollTimePicker
                value={tempRestDurationStr}
                onChange={setTempRestDurationStr}
              />

              <View style={[styles.skipRestModalRow, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={[styles.toggleLabel, { color: colors.text }]}>Skip Last Recovery</Text>
                  <Text style={[styles.toggleSubtext, { color: colors.textTertiary }]}>
                    Omit rest after the 10th repeat
                  </Text>
                </View>
                <Switch
                  value={tempSkipLastRecovery}
                  onValueChange={setTempSkipLastRecovery}
                  trackColor={{ false: colors.border, true: BRAND_GREEN }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <TouchableOpacity
                style={[styles.modalApplyButton, { backgroundColor: BRAND_GREEN }]}
                onPress={applyRestModal}
              >
                <Text style={styles.modalApplyButtonText}>APPLY REST</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  titleSection: {
    marginTop: 8,
    marginBottom: 20,
  },
  workoutTitle: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  workoutSubtitle: {
    fontSize: 15,
    marginTop: 6,
    lineHeight: 22,
  },
  intervalCard: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.25,
  },
  setHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  setHeaderText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  recoverySwitchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  recoveryToggleLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  segmentCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    position: "relative",
    overflow: "hidden",
  },
  restSegmentCard: {
    borderWidth: 1,
    borderColor: "rgba(48, 209, 88, 0.3)",
  },
  restCardInteractive: {
    borderWidth: 1.25,
    borderColor: "rgba(34, 197, 94, 0.4)",
  },
  accentBar: {
    position: "absolute",
    left: 0,
    top: 10,
    bottom: 10,
    width: 4,
    borderRadius: 2,
  },
  segmentInfo: {
    flex: 1,
    marginLeft: 4,
  },
  restTitleWithEdit: {
    flexDirection: "row",
    alignItems: "center",
  },
  editBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  editBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: BRAND_GREEN,
    letterSpacing: 0.5,
  },
  segmentTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  segmentMetric: {
    fontSize: 14,
    marginTop: 3,
  },
  segmentRight: {
    alignItems: "flex-end",
  },
  segmentEstLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  segmentEstValue: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2,
  },
  paceRangeBox: {
    borderRadius: 20,
    padding: 18,
    marginTop: 14,
  },
  paceRangeLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  paceRangeDisplay: {
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  paceUnitText: {
    fontSize: 22,
    fontWeight: "700",
  },
  stepperRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  stepperCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
  },
  stepperLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  stepperValue: {
    fontSize: 22,
    fontWeight: "800",
    marginVertical: 8,
    fontVariant: ["tabular-nums"],
  },
  stepperButtonsRow: {
    flexDirection: "row",
    gap: 16,
  },
  stepperBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  coachGuideText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 14,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingHorizontal: 4,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  toggleSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  recoveryDisabledBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    marginTop: 14,
  },
  recoveryDisabledText: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  startWorkoutButton: {
    minHeight: 56,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  startWorkoutButtonText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#081009",
    letterSpacing: 0.5,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "85%",
    paddingBottom: 24,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  modalSectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  presetChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  skipRestModalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    marginVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalApplyButton: {
    minHeight: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  modalApplyButtonText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#081009",
    letterSpacing: 0.5,
  },
});
