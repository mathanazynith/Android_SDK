import { Alert } from '@/components/ThemedAlert';
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollTimePicker } from "../../../components/ScrollTimePicker";
import { Colors } from "../../../constants/theme";
import { secondsToTimeString, timeStringToSeconds } from "../../../service/customWorkout";
import {
  formatSecondsToPace,
  getMaxDistanceForUnit,
  getPaceUnitLabel,
  getUnitFullLabel,
  getUnitLabel,
  normalizeUnit,
  parsePaceToSeconds,
  sanitizeDistanceInput,
  type DistanceUnitType,
} from "../../../src/utils/workoutCalculations";
import { useCustomWorkout } from "./workout-context";

type StepTargetType = "duration" | "distance";

const unitOptions: { label: string; value: DistanceUnitType }[] = [
  { label: "Kilometers (km)", value: "km" },
  { label: "Meters (m)", value: "m" },
  { label: "Miles (mi)", value: "mi" },
];

const targetTypeOptions: { label: string; value: StepTargetType; description: string; icon: "clock" | "navigation" }[] = [
  {
    label: "Duration",
    value: "duration",
    description: "Set step target by running time",
    icon: "clock",
  },
  {
    label: "Distance",
    value: "distance",
    description: "Set step target by distance (km, m, mi)",
    icon: "navigation",
  },
];

const PACE_DIFF_MIN_SEC = 15; // Minimum difference between fastest and lowest pace

const parseExistingPaces = (paceStr?: string | null) => {
  if (!paceStr) return { faster: 270, slower: 330 }; // Default: 4:30 and 5:30
  if (paceStr.includes("-")) {
    const parts = paceStr.split("-");
    const s1 = parsePaceToSeconds(parts[0]?.trim());
    const s2 = parsePaceToSeconds(parts[1]?.trim());
    if (s1 && s2) {
      return {
        faster: Math.min(s1, s2),
        slower: Math.max(s1, s2),
      };
    }
  }
  const single = parsePaceToSeconds(paceStr);
  if (single) {
    return {
      faster: Math.max(120, single - 15),
      slower: Math.min(900, single + 15),
    };
  }
  return { faster: 270, slower: 330 };
};

export default function RunningDeclaration() {
  const { index } = useLocalSearchParams<{ index?: string }>();
  const { workout, addRun, updateRun } = useCustomWorkout();
  const runIndex = Number(index);
  const existing =
    Number.isInteger(runIndex) && runIndex >= 0
      ? workout.runs[runIndex]
      : undefined;

  // Step Title
  const [title, setTitle] = useState(existing?.title || "Running");

  // Step Target Type: 'duration' or 'distance'
  const initialType: StepTargetType =
    existing?.inputType === "DISTANCE" || (!existing?.duration && !!existing?.distance)
      ? "distance"
      : "duration";
  const [stepType, setStepType] = useState<StepTargetType>(initialType);
  const [typeDropdownVisible, setTypeDropdownVisible] = useState(false);

  // Unit
  const [unit, setUnit] = useState<DistanceUnitType>(normalizeUnit(existing?.unit));
  const [unitModalVisible, setUnitModalVisible] = useState(false);

  // Duration State (Default 30 mins if blank)
  const [durationString, setDurationString] = useState<string>(
    existing?.duration && existing.duration !== "00:00:00"
      ? existing.duration
      : "00:30:00"
  );

  // Distance State (text box with auto 10m minimum for meters)
  const initialDistance = () => {
    const raw = existing?.distance || "";
    const normUnit = normalizeUnit(existing?.unit);
    if (normUnit === "m") {
      const n = parseFloat(raw.replace(",", "."));
      if (!raw.trim() || isNaN(n) || n < 10) {
        return "10";
      }
    }
    return raw;
  };
  const [distance, setDistance] = useState<string>(initialDistance);
  const meterClampTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (meterClampTimeoutRef.current) {
        clearTimeout(meterClampTimeoutRef.current);
      }
    };
  }, []);

  // Distance input change handler: automatically auto-corrects to 10 if below 10 for meters
  const handleDistanceChange = (text: string) => {
    if (meterClampTimeoutRef.current) {
      clearTimeout(meterClampTimeoutRef.current);
    }

    const sanitized = sanitizeDistanceInput(text, unit);
    setDistance(sanitized);

    // Only apply minimum 10 rule if unit is meters (m)
    if (unit === "m") {
      const num = parseFloat(sanitized.replace(",", "."));
      if (sanitized.trim() !== "" && !isNaN(num) && num < 10) {
        meterClampTimeoutRef.current = setTimeout(() => {
          setDistance("10");
        }, 750);
      }
    }
  };

  const handleDistanceBlur = () => {
    if (meterClampTimeoutRef.current) {
      clearTimeout(meterClampTimeoutRef.current);
    }
    if (unit === "m") {
      const num = parseFloat(distance.replace(",", "."));
      if (!distance.trim() || isNaN(num) || num < 10) {
        setDistance("10");
      }
    }
  };

  // Pace Steppers State: Fastest Pace & Lowest Pace
  const initialPaces = parseExistingPaces(existing?.pace);
  const [fasterPaceSec, setFasterPaceSec] = useState<number>(initialPaces.faster);
  const [slowerPaceSec, setSlowerPaceSec] = useState<number>(initialPaces.slower);

  // Notes
  const [notes, setNotes] = useState(existing?.notes || "");

  // Pace Stepper handlers (5-second increments)
  const isFasterPaceAtMax = fasterPaceSec >= slowerPaceSec - PACE_DIFF_MIN_SEC;
  const isSlowerPaceAtMin = slowerPaceSec <= fasterPaceSec + PACE_DIFF_MIN_SEC;

  const adjustFasterPace = (deltaSeconds: number) => {
    setFasterPaceSec((prev) => {
      const next = prev + deltaSeconds;
      if (next < 120) return 120; // 2:00 /km minimum
      const maxAllowed = slowerPaceSec - PACE_DIFF_MIN_SEC;
      return next <= maxAllowed ? next : maxAllowed;
    });
  };

  const adjustSlowerPace = (deltaSeconds: number) => {
    setSlowerPaceSec((prev) => {
      const next = prev + deltaSeconds;
      const minAllowed = fasterPaceSec + PACE_DIFF_MIN_SEC;
      if (next < minAllowed) return minAllowed;
      return Math.min(900, next); // 15:00 /km maximum
    });
  };

  const fasterPaceStr = formatSecondsToPace(fasterPaceSec, unit, false);
  const slowerPaceStr = formatSecondsToPace(slowerPaceSec, unit, false);
  const paceUnitLabel = getPaceUnitLabel(unit);

  // Median Pace: average of fastest and lowest pace
  const medianPaceSec = Math.round((fasterPaceSec + slowerPaceSec) / 2);
  const medianPaceStr = formatSecondsToPace(medianPaceSec, unit, true);

  // Selection handler for unit
  const selectUnit = (selected: DistanceUnitType) => {
    setUnit(selected);
    setUnitModalVisible(false);

    if (selected === "m") {
      const sanitized = sanitizeDistanceInput(distance, selected);
      const num = parseFloat(sanitized.replace(",", "."));
      // If chosen unit is meter: keep if above 10; otherwise fill least number as 10
      if (!sanitized.trim() || isNaN(num) || num < 10) {
        setDistance("10");
      } else {
        setDistance(sanitized);
      }
    } else {
      setDistance((prev) => sanitizeDistanceInput(prev, selected));
    }
  };

  // Selection handler for Target Type
  const selectTargetType = (type: StepTargetType) => {
    setStepType(type);
    setTypeDropdownVisible(false);
    if (type === "distance" && unit === "m") {
      const num = parseFloat(distance.replace(",", "."));
      if (!distance.trim() || isNaN(num) || num < 10) {
        setDistance("10");
      }
    }
  };

  // Calculations using the Median Pace
  const distNum = Number.parseFloat(distance.replace(",", ".")) || 0;
  const durSeconds = timeStringToSeconds(durationString) ?? 0;

  // 1. If Duration is chosen -> calculate Distance
  const calculatedDistanceInfo = useMemo(() => {
    if (durSeconds <= 0 || medianPaceSec <= 0) {
      return { value: 0, text: "--" };
    }
    if (unit === "m") {
      // Median pace is per km, so (durSeconds / medianPaceSec) * 1000 meters
      const val = Math.round((durSeconds / medianPaceSec) * 1000);
      return { value: val, text: `${val} m` };
    }
    // km or mi
    const val = parseFloat((durSeconds / medianPaceSec).toFixed(2));
    return { value: val, text: `${val.toFixed(2)} ${getUnitLabel(unit)}` };
  }, [durSeconds, medianPaceSec, unit]);

  // 2. If Distance is chosen -> calculate Duration
  const calculatedDurationInfo = useMemo(() => {
    if (distNum <= 0 || medianPaceSec <= 0) {
      return { seconds: 0, text: "--:--" };
    }
    let sec = 0;
    if (unit === "m") {
      // Distance is in meters, pace is per km
      sec = Math.round((distNum / 1000) * medianPaceSec);
    } else {
      // Distance is in km or mi
      sec = Math.round(distNum * medianPaceSec);
    }
    return {
      seconds: sec,
      text: secondsToTimeString(sec),
    };
  }, [distNum, medianPaceSec, unit]);

  const saveStep = () => {
    if (!title.trim()) {
      return Alert.alert("Step title required", "Enter a name for this running step.");
    }

    let effectiveDistance = distance;
    if (stepType === "distance") {
      if (unit === "m") {
        const num = parseFloat(distance.replace(",", "."));
        if (!distance.trim() || isNaN(num) || num < 10) {
          effectiveDistance = "10";
          setDistance("10");
        }
      }
      const distCheck = Number.parseFloat(effectiveDistance.replace(",", ".")) || 0;
      if (distCheck <= 0) {
        return Alert.alert("Distance required", "Please enter a valid running distance.");
      }
      const maxDistance = getMaxDistanceForUnit(unit);
      if (distCheck > maxDistance) {
        return Alert.alert(
          "Distance limit exceeded",
          `Running distance cannot exceed ${maxDistance} ${getUnitLabel(unit)}.`
        );
      }
    } else {
      if (durSeconds <= 0) {
        return Alert.alert("Duration required", "Please select a valid running duration.");
      }
    }

    const finalDuration =
      stepType === "duration"
        ? durationString
        : secondsToTimeString(calculatedDurationInfo.seconds);

    const finalDistance =
      stepType === "distance"
        ? effectiveDistance
        : unit === "m"
        ? String(calculatedDistanceInfo.value)
        : calculatedDistanceInfo.value.toFixed(2);

    const finalPace = `${fasterPaceStr} - ${slowerPaceStr}`;

    const step = {
      title: title.trim(),
      stepType: "Run" as const,
      inputType: stepType === "duration" ? ("DURATION" as const) : ("DISTANCE" as const),
      duration: finalDuration,
      distance: finalDistance,
      unit: getUnitFullLabel(unit),
      pace: finalPace,
      repeat: existing?.repeat || 1,
      rest: existing?.rest || "",
      skipLastRest: existing?.skipLastRest ?? true,
      skipRest: existing?.skipRest ?? !existing?.rest,
      notes: notes.trim(),
    };

    if (existing) {
      updateRun(runIndex, step);
      router.back();
    } else {
      addRun(step);
      router.replace("/custom-workout/overview");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.headerIcon}
            accessibilityLabel="Go back"
          >
            <Feather name="arrow-left" size={26} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerBadge}>RUNNING</Text>
            <Text style={styles.headerTitle}>Configure Step</Text>
          </View>
          <TouchableOpacity onPress={saveStep} style={styles.doneHeader}>
            <Text style={styles.doneText}>DONE</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Step Title Input */}
          {/* <View style={styles.titleSection}>
            <Text style={styles.label}>STEP TITLE</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Running, Speed Interval, Tempo"
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
            />
          </View> */}

          {/* 1. TYPE DROPDOWN (Duration / Distance) */}
          <Text style={styles.sectionLabel}>TARGET TYPE</Text>
          <View style={styles.section}>
            {/* <Text style={styles.label}>Type Dropdown</Text> */}
            {/* <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => setTypeDropdownVisible(true)}
              activeOpacity={0.8}
            >
              <View style={styles.dropdownLeft}>
                <View style={styles.dropdownIconCircle}>
                  <Feather
                    name={stepType === "duration" ? "clock" : "navigation"}
                    size={18}
                    color={Colors.primary}
                  />
                </View>
                <View>
                  <Text style={styles.dropdownTitle}>
                    {stepType === "duration" ? "Duration" : "Distance"}
                  </Text>
                  <Text style={styles.dropdownSubtitle}>
                    {stepType === "duration"
                      ? "Control step by time (scroller)"
                      : "Control step by distance (text box)"}
                  </Text>
                </View>
              </View>
              <Feather name="chevron-down" size={20} color={Colors.textSecondary} />
            </TouchableOpacity> */}

            {/* Quick Segmented Toggle */}
            <View style={styles.segmentedRow}>
              <TouchableOpacity
                style={[
                  styles.segmentOption,
                  stepType === "duration" && styles.segmentOptionActive,
                ]}
                onPress={() => selectTargetType("duration")}
              >
                <Feather
                  name="clock"
                  size={15}
                  color={stepType === "duration" ? Colors.background : Colors.textSecondary}
                />
                <Text
                  style={[
                    styles.segmentOptionText,
                    stepType === "duration" && styles.segmentOptionTextActive,
                  ]}
                >
                  Duration
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.segmentOption,
                  stepType === "distance" && styles.segmentOptionActive,
                ]}
                onPress={() => selectTargetType("distance")}
              >
                <Feather
                  name="navigation"
                  size={15}
                  color={stepType === "distance" ? Colors.background : Colors.textSecondary}
                />
                <Text
                  style={[
                    styles.segmentOptionText,
                    stepType === "distance" && styles.segmentOptionTextActive,
                  ]}
                >
                  Distance
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 2. CONDITIONAL TARGET INPUT (Duration Scroller OR Distance Text Box) */}
          <Text style={styles.sectionLabel}>
            {stepType === "duration" ? "RUN DURATION" : "RUN DISTANCE"}
          </Text>
          <View style={styles.section}>
            {stepType === "duration" ? (
              // Option A: Duration -> Shows Time Scroller
              <View>
                <Text style={styles.label}>Select Duration (HH:MM:SS)</Text>
                <ScrollTimePicker
                  value={durationString}
                  allowEmpty={false}
                  onChange={(val) => setDurationString(val)}
                />
              </View>
            ) : (
              // Option B: Distance -> Shows Text Box with Unit Selector
              <View>
                <Text style={styles.label}>
                  Enter Distance ({getUnitLabel(unit)})
                </Text>
                <View style={styles.row}>
                  <TextInput
                    value={distance}
                    onChangeText={handleDistanceChange}
                    onBlur={handleDistanceBlur}
                    onSubmitEditing={handleDistanceBlur}
                    placeholder={unit === "m" ? "10" : "e.g. 1.00"}
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="decimal-pad"
                    style={[styles.input, styles.flex]}
                  />
                  <TouchableOpacity
                    style={styles.unitButton}
                    onPress={() => setUnitModalVisible(true)}
                  >
                    <Text style={styles.unitText}>{getUnitLabel(unit)}</Text>
                    <Feather
                      name="chevron-down"
                      size={18}
                      color={Colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                {/* Meter Validation Notice */}
                {unit === "m" && (
                  <Text style={styles.inputHelper}>
                    Minimum distance for meters is 10 m (automatically adjusted).
                  </Text>
                )}
                {unit !== "m" && (
                  <Text style={styles.inputHelper}>
                    Maximum distance: {getMaxDistanceForUnit(unit)} {getUnitLabel(unit)}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* 3. PACE SECTION: TWO PACES (Fastest Pace & Lowest Pace) */}
          <Text style={styles.sectionLabel}>TARGET PACE RANGE</Text>
          <View style={styles.section}>
            <View style={styles.paceHeaderRow}>
              <Text style={styles.paceRangeDisplay}>
                {fasterPaceStr}–{slowerPaceStr}{" "}
                <Text style={styles.paceUnitText}>{paceUnitLabel}</Text>
              </Text>
              <View style={styles.medianBadge}>
                <Text style={styles.medianBadgeText}>
                  Median: {medianPaceStr}
                </Text>
              </View>
            </View>

            {/* Stepper Cards */}
            <View style={styles.stepperRow}>
              {/* Fastest Pace Card */}
              <View style={styles.stepperCard}>
                <Text style={styles.stepperLabel}>Fastest pace</Text>
                <Text style={styles.stepperValue}>{fasterPaceStr}</Text>
                <View style={styles.stepperButtonsRow}>
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => adjustFasterPace(-5)}
                    activeOpacity={0.7}
                    accessibilityLabel="Decrease fastest pace"
                  >
                    <Feather name="minus" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.stepperBtn,
                      isFasterPaceAtMax && styles.stepperBtnDisabled,
                    ]}
                    onPress={() => adjustFasterPace(5)}
                    disabled={isFasterPaceAtMax}
                    activeOpacity={0.7}
                    accessibilityLabel="Increase fastest pace"
                  >
                    <Feather name="plus" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Lowest Pace Card */}
              <View style={styles.stepperCard}>
                <Text style={styles.stepperLabel}>Lowest pace</Text>
                <Text style={styles.stepperValue}>{slowerPaceStr}</Text>
                <View style={styles.stepperButtonsRow}>
                  <TouchableOpacity
                    style={[
                      styles.stepperBtn,
                      isSlowerPaceAtMin && styles.stepperBtnDisabled,
                    ]}
                    onPress={() => adjustSlowerPace(-5)}
                    disabled={isSlowerPaceAtMin}
                    activeOpacity={0.7}
                    accessibilityLabel="Decrease lowest pace"
                  >
                    <Feather name="minus" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => adjustSlowerPace(5)}
                    activeOpacity={0.7}
                    accessibilityLabel="Increase lowest pace"
                  >
                    <Feather name="plus" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <Text style={styles.helper}>
              Adjust in 5-second increments. The median pace ({medianPaceStr}) will calculate your {stepType === "duration" ? "distance" : "duration"}.
            </Text>
          </View>

          {/* 4. CALCULATED VALUES DISPLAY CARD */}
          <Text style={styles.sectionLabel}>
            {stepType === "duration" ? "CALCULATED DISTANCE" : "CALCULATED DURATION"}
          </Text>
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <View style={styles.resultIconCircle}>
                <Feather
                  name={stepType === "duration" ? "map-pin" : "clock"}
                  size={18}
                  color={Colors.primary}
                />
              </View>
              <View style={styles.flex}>
                <Text style={styles.resultTitle}>
                  {stepType === "duration" ? "Estimated Distance" : "Estimated Duration"}
                </Text>
                <Text style={styles.resultSubtitle}>
                  Computed from {stepType === "duration" ? durationString : `${distance || "0"} ${getUnitLabel(unit)}`} at median pace {medianPaceStr}
                </Text>
              </View>
            </View>

            <View style={styles.resultValueContainer}>
              <Text style={styles.resultBigValue}>
                {stepType === "duration"
                  ? calculatedDistanceInfo.text
                  : calculatedDurationInfo.text}
              </Text>
              <Text style={styles.resultValueSubtext}>
                {stepType === "duration"
                  ? `approx. ${calculatedDistanceInfo.text}`
                  : `approx. ${calculatedDurationInfo.text}`}
              </Text>
            </View>
          </View>

          {/* Save Button */}
          {/* <TouchableOpacity
            style={styles.saveButton}
            onPress={saveStep}
            activeOpacity={0.85}
          >
            <Text style={styles.saveText}>SAVE RUNNING STEP</Text>
            <Feather name="check" size={20} color={Colors.background} />
          </TouchableOpacity> */}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Target Type Dropdown Modal */}
      <Modal
        visible={typeDropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTypeDropdownVisible(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setTypeDropdownVisible(false)}
        >
          <Pressable
            style={styles.modal}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.modalTitle}>SELECT TARGET TYPE</Text>
            {targetTypeOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={styles.option}
                onPress={() => selectTargetType(option.value)}
              >
                <View style={styles.optionLeft}>
                  <Feather
                    name={option.icon}
                    size={20}
                    color={stepType === option.value ? Colors.primary : Colors.textSecondary}
                  />
                  <View>
                    <Text style={styles.optionText}>{option.label}</Text>
                    <Text style={styles.optionDescription}>
                      {option.description}
                    </Text>
                  </View>
                </View>
                {stepType === option.value && (
                  <Feather name="check" size={21} color={Colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Unit Modal */}
      <Modal
        visible={unitModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUnitModalVisible(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setUnitModalVisible(false)}
        >
          <Pressable
            style={styles.modal}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.modalTitle}>DISTANCE UNIT</Text>
            {unitOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={styles.option}
                onPress={() => selectUnit(option.value)}
              >
                <Text style={styles.optionText}>{option.label}</Text>
                {unit === option.value && (
                  <Feather name="check" size={21} color={Colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, backgroundColor: "#101010" },
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
  headerIcon: { width: 55 },
  headerCenter: { alignItems: "center" },
  headerBadge: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  headerTitle: { color: Colors.text, fontSize: 20, fontWeight: "700" },
  doneHeader: { minWidth: 55, alignItems: "flex-end" },
  doneText: { color: Colors.primary, fontSize: 14, fontWeight: "800" },
  content: { paddingBottom: 40 },
  titleSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionLabel: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  section: {
    padding: 16,
    backgroundColor: "#1C1C1E",
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2C2C2E",
  },
  label: { marginBottom: 8, color: Colors.text, fontSize: 14, fontWeight: "600" },
  input: {
    minHeight: 50,
    paddingHorizontal: 16,
    color: Colors.text,
    backgroundColor: "#2A2A2D",
    borderWidth: 1,
    borderColor: "#3E3E42",
    borderRadius: 10,
    fontSize: 16,
  },
  notesInput: { minHeight: 75, textAlignVertical: "top", paddingTop: 10 },
  row: { flexDirection: "row", gap: 10 },
  flex: { flex: 1 },
  inputHelper: { color: Colors.textMuted, fontSize: 12, marginTop: 6 },
  errorText: { color: "#EF4444", fontWeight: "600" },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  warningText: {
    color: "#EF4444",
    fontSize: 12,
    fontWeight: "500",
  },

  // Dropdown Button
  dropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#2A2A2D",
    borderWidth: 1,
    borderColor: "#3E3E42",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  dropdownLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dropdownIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  dropdownTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  dropdownSubtitle: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },

  // Quick Segmented Selector
  segmentedRow: {
    flexDirection: "row",
    backgroundColor: "#2A2A2D",
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  segmentOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  segmentOptionActive: {
    backgroundColor: Colors.primary,
  },
  segmentOptionText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  segmentOptionTextActive: {
    color: Colors.background,
    fontWeight: "700",
  },

  unitButton: {
    minWidth: 86,
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    backgroundColor: "#2A2A2D",
    borderWidth: 1,
    borderColor: "#3E3E42",
    borderRadius: 10,
  },
  unitText: { color: Colors.text, fontSize: 16, fontWeight: "600" },
  helper: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 10 },

  // Pace Steppers
  paceHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    flexWrap: "wrap",
    gap: 8,
  },
  paceRangeDisplay: {
    color: Colors.primary,
    fontSize: 24,
    fontWeight: "800",
  },
  paceUnitText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  medianBadge: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  medianBadgeText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  stepperRow: {
    flexDirection: "row",
    gap: 12,
  },
  stepperCard: {
    flex: 1,
    backgroundColor: "#262629",
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#3A3A3E",
  },
  stepperLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  stepperValue: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 8,
  },
  stepperButtonsRow: {
    flexDirection: "row",
    gap: 8,
  },
  stepperBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnDisabled: {
    opacity: 0.35,
  },

  // Calculated Result Card
  resultCard: {
    marginHorizontal: 16,
    padding: 18,
    backgroundColor: "#16231A",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(34, 197, 94, 0.35)",
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  resultIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(34, 197, 94, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  resultTitle: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  resultSubtitle: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  resultValueContainer: {
    backgroundColor: "#0F1A12",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  resultBigValue: {
    color: "#22C55E",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  resultValueSubtext: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },

  // Save Button
  saveButton: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 28,
    backgroundColor: Colors.primary,
    borderRadius: 14,
  },
  saveText: {
    color: Colors.background,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  // Modals
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
    padding: 20,
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  option: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#2C2C2E",
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  optionText: { color: Colors.text, fontSize: 16, fontWeight: "600" },
  optionDescription: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
});
