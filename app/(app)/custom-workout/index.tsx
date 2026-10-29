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
import { TargetPaceRangePicker } from "../../../components/TargetPaceRangePicker";
import { Colors } from "../../../constants/theme";
import { secondsToTimeString, timeStringToSeconds } from "../../../service/customWorkout";
import {
  formatSecondsToPace,
  getMaxDistanceForUnit,
  getUnitFullLabel,
  getUnitLabel,
  normalizeUnit,
  parsePaceToSeconds,
  sanitizeDistanceInput,
  type DistanceUnitType,
} from "../../../src/utils/workoutCalculations";
import CustomWorkoutCards from "./cards";
import CustomWorkoutOverview from "./overview";
import { useCustomWorkout } from "./workout-context";

// Warmup Theme Accent: Orangish Red
const WARMUP_COLOR = "#FF5722";
const WARMUP_LIGHT_BG = "rgba(255, 87, 34, 0.12)";
const WARMUP_BORDER = "rgba(255, 87, 34, 0.35)";

type StepTargetType = "duration" | "distance";

const unitOptions: { label: string; value: DistanceUnitType }[] = [
  { label: "Kilometers (km)", value: "km" },
  { label: "Meters (m)", value: "m" },
  { label: "Miles (mi)", value: "mi" },
];

const parseExistingPaces = (paceStr?: string | null) => {
  // Default warmup pace: 6:40 /km (400s) -> 6:10 (370s) to 7:10 (430s)
  if (!paceStr) return { faster: 370, slower: 430 };
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
      faster: Math.max(60, single - 15),
      slower: Math.min(3600, single + 15),
    };
  }
  return { faster: 370, slower: 430 };
};

export function CustomWorkoutWarmUp() {
  const { workout, setWarmUp } = useCustomWorkout();
  const existing = workout.warmUp;

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

  // Duration State (Default 10 mins if blank)
  const [durationString, setDurationString] = useState<string>(
    existing?.duration && existing.duration !== "00:00:00"
      ? existing.duration
      : "00:10:00"
  );

  // Distance State
  const initialDistance = () => {
    const raw = existing?.distance || "";
    const normUnit = normalizeUnit(existing?.unit);
    if (normUnit === "m") {
      const n = parseFloat(raw.replace(",", "."));
      if (!raw.trim() || isNaN(n) || n < 10) return "10";
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

  const handleDistanceChange = (text: string) => {
    if (meterClampTimeoutRef.current) {
      clearTimeout(meterClampTimeoutRef.current);
    }
    const sanitized = sanitizeDistanceInput(text, unit);
    setDistance(sanitized);

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

  // Pace Steppers State
  const initialPaces = parseExistingPaces(existing?.pace);
  const [fasterPaceSec, setFasterPaceSec] = useState<number>(initialPaces.faster);
  const [slowerPaceSec, setSlowerPaceSec] = useState<number>(initialPaces.slower);

  // Notes
  const [notes, setNotes] = useState(existing?.notes || "");

  const fasterPaceStr = formatSecondsToPace(fasterPaceSec, unit, false);
  const slowerPaceStr = formatSecondsToPace(slowerPaceSec, unit, false);

  const medianPaceSec = Math.round((fasterPaceSec + slowerPaceSec) / 2);
  const medianPaceStr = formatSecondsToPace(medianPaceSec, unit, true);

  const selectUnit = (selected: DistanceUnitType) => {
    setUnit(selected);
    setUnitModalVisible(false);

    if (selected === "m") {
      const sanitized = sanitizeDistanceInput(distance, selected);
      const num = parseFloat(sanitized.replace(",", "."));
      if (!sanitized.trim() || isNaN(num) || num < 10) {
        setDistance("10");
      } else {
        setDistance(sanitized);
      }
    } else {
      setDistance((prev) => sanitizeDistanceInput(prev, selected));
    }
  };

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

  const distNum = Number.parseFloat(distance.replace(",", ".")) || 0;
  const durSeconds = timeStringToSeconds(durationString) ?? 0;

  // 1. If Duration chosen -> calculate Distance
  const calculatedDistanceInfo = useMemo(() => {
    if (durSeconds <= 0 || medianPaceSec <= 0) {
      return { value: 0, text: "--" };
    }
    if (unit === "m") {
      const val = Math.round((durSeconds / medianPaceSec) * 1000);
      return { value: val, text: `${val} m` };
    }
    const val = parseFloat((durSeconds / medianPaceSec).toFixed(2));
    return { value: val, text: `${val.toFixed(2)} ${getUnitLabel(unit)}` };
  }, [durSeconds, medianPaceSec, unit]);

  // 2. If Distance chosen -> calculate Duration
  const calculatedDurationInfo = useMemo(() => {
    if (distNum <= 0 || medianPaceSec <= 0) {
      return { seconds: 0, text: "--:--" };
    }
    let sec = 0;
    if (unit === "m") {
      sec = Math.round((distNum / 1000) * medianPaceSec);
    } else {
      sec = Math.round(distNum * medianPaceSec);
    }
    return {
      seconds: sec,
      text: secondsToTimeString(sec),
    };
  }, [distNum, medianPaceSec, unit]);

  const continueToRunning = () => {
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
        return Alert.alert("Distance required", "Please enter a valid warmup distance.");
      }
      const maxDistance = getMaxDistanceForUnit(unit);
      if (distCheck > maxDistance) {
        return Alert.alert(
          "Distance limit exceeded",
          `Warm Up distance cannot exceed ${maxDistance} ${getUnitLabel(unit)}.`
        );
      }
    } else {
      if (!durSeconds || durSeconds <= 0) {
        return Alert.alert("Duration required", "Please select a valid warmup duration.");
      }
    }

    let finalDuration = durationString;
    let finalDistance = effectiveDistance.trim();

    if (stepType === "duration") {
      if (!finalDistance || parseFloat(finalDistance) <= 0) {
        finalDistance =
          unit === "m"
            ? String(calculatedDistanceInfo.value)
            : calculatedDistanceInfo.value.toFixed(2);
      }
    } else {
      if (!finalDuration || finalDuration === "00:00:00") {
        finalDuration = calculatedDurationInfo.text;
      }
    }

    setWarmUp({
      title: "Warm Up",
      stepType: "Warmup",
      inputType: stepType === "duration" ? "DURATION" : "DISTANCE",
      duration: finalDuration,
      distance: finalDistance,
      unit: getUnitFullLabel(unit),
      pace: `${fasterPaceStr}-${slowerPaceStr}`,
      repeat: 1,
      rest: "",
      skipLastRest: true,
      notes: notes.trim(),
    });

    router.push("/custom-workout/overview");
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
            <Feather name="arrow-left" size={24} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerBadge, { color: WARMUP_COLOR }]}>WARM UP</Text>
            <Text style={styles.headerTitle}>Configure Step</Text>
          </View>
          <TouchableOpacity onPress={continueToRunning} style={styles.doneHeader}>
            <Text style={[styles.doneText, { color: WARMUP_COLOR }]}>DONE</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Target Type: Dropdown Selector */}
          <Text style={styles.sectionLabel}>TARGET TYPE</Text>
          <TouchableOpacity
            style={[
              styles.dropdownButton,
              { borderColor: WARMUP_BORDER },
            ]}
            onPress={() => setTypeDropdownVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.dropdownLeft}>
              <View style={[styles.dropdownIconCircle, { backgroundColor: WARMUP_LIGHT_BG }]}>
                <Feather
                  name={stepType === "duration" ? "clock" : "navigation"}
                  size={16}
                  color={WARMUP_COLOR}
                />
              </View>
              <View>
                <Text style={styles.dropdownTitle}>
                  {stepType === "duration" ? "Duration" : "Distance"}
                </Text>
                <Text style={styles.dropdownSubtitle}>
                  {stepType === "duration"
                    ? "Control warmup by time (scroller)"
                    : `Control warmup by distance (${getUnitLabel(unit)})`}
                </Text>
              </View>
            </View>
            <Feather name="chevron-down" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>

          {/* Conditional Target Input */}
          <Text style={styles.sectionLabel}>
            {stepType === "duration" ? "WARMUP DURATION" : "WARMUP DISTANCE"}
          </Text>
          <View style={styles.section}>
            {stepType === "duration" ? (
              <ScrollTimePicker
                value={durationString}
                allowEmpty={false}
                onChange={(val) => setDurationString(val)}
                accentColor={WARMUP_COLOR}
                compact={true}
              />
            ) : (
              <View>
                <View style={styles.row}>
                  <TextInput
                    value={distance}
                    onChangeText={handleDistanceChange}
                    onBlur={handleDistanceBlur}
                    onSubmitEditing={handleDistanceBlur}
                    placeholder={unit === "m" ? "10" : "e.g. 1.50"}
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
                      size={16}
                      color={Colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                {unit === "m" ? (
                  <Text style={styles.inputHelper}>
                    Minimum distance for meters is 10 m (auto-adjusted).
                  </Text>
                ) : (
                  <Text style={styles.inputHelper}>
                    Max distance: {getMaxDistanceForUnit(unit)} {getUnitLabel(unit)}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Target Pace Range */}
          <Text style={styles.sectionLabel}>TARGET PACE RANGE</Text>
          <View style={styles.section}>
            <TargetPaceRangePicker
              fasterPaceSec={fasterPaceSec}
              slowerPaceSec={slowerPaceSec}
              onChange={(faster, slower) => {
                setFasterPaceSec(faster);
                setSlowerPaceSec(slower);
              }}
              unit={unit}
              accentColor={WARMUP_COLOR}
            />
          </View>

          {/* Dynamic Result Banner */}
          <View
            style={[
              styles.resultBanner,
              { backgroundColor: WARMUP_LIGHT_BG, borderColor: WARMUP_BORDER },
            ]}
          >
            <View style={styles.resultBannerLeft}>
              <View
                style={[
                  styles.resultBannerIcon,
                  { backgroundColor: "rgba(255, 87, 34, 0.2)" },
                ]}
              >
                <Feather
                  name={stepType === "duration" ? "map-pin" : "clock"}
                  size={15}
                  color={WARMUP_COLOR}
                />
              </View>
              <View>
                <Text style={[styles.resultBannerTitle, { color: WARMUP_COLOR }]}>
                  {stepType === "duration" ? "Est. Distance" : "Est. Duration"}
                </Text>
                <Text style={styles.resultBannerSubtitle}>
                  @ {medianPaceStr} median
                </Text>
              </View>
            </View>

            <Text style={[styles.resultBannerValue, { color: WARMUP_COLOR }]}>
              {stepType === "duration"
                ? calculatedDistanceInfo.text
                : calculatedDurationInfo.text}
            </Text>
          </View>

          {/* Notes (Optional) */}
          <Text style={styles.sectionLabel}>NOTES (OPTIONAL)</Text>
          <View style={styles.section}>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Dynamic stretches, light jog"
              placeholderTextColor={Colors.textMuted}
              style={[styles.input, styles.notesInput]}
              multiline
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Target Type Modal */}
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

            <TouchableOpacity
              style={styles.option}
              onPress={() => selectTargetType("duration")}
            >
              <View style={styles.optionLeft}>
                <Feather
                  name="clock"
                  size={18}
                  color={stepType === "duration" ? WARMUP_COLOR : Colors.textSecondary}
                />
                <View>
                  <Text style={styles.optionText}>Duration</Text>
                  <Text style={styles.optionDescription}>
                    Control warmup by time (scroller)
                  </Text>
                </View>
              </View>
              {stepType === "duration" && (
                <Feather name="check" size={20} color={WARMUP_COLOR} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.option}
              onPress={() => selectTargetType("distance")}
            >
              <View style={styles.optionLeft}>
                <Feather
                  name="navigation"
                  size={18}
                  color={stepType === "distance" ? WARMUP_COLOR : Colors.textSecondary}
                />
                <View>
                  <Text style={styles.optionText}>Distance</Text>
                  <Text style={styles.optionDescription}>
                    Control warmup by distance (text box)
                  </Text>
                </View>
              </View>
              {stepType === "distance" && (
                <Feather name="check" size={20} color={WARMUP_COLOR} />
              )}
            </TouchableOpacity>
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
                  <Feather name="check" size={21} color={WARMUP_COLOR} />
                )}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

export default function CustomWorkoutEntry() {
  const { step } = useLocalSearchParams<{ step?: string }>();
  if (step === 'warmup') return <CustomWorkoutWarmUp />;
  if (step === 'overview') return <CustomWorkoutOverview />;
  return <CustomWorkoutCards />;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, backgroundColor: "#101010" },
  header: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: "#000",
    borderBottomWidth: 1,
    borderBottomColor: "#222222",
  },
  headerIcon: { width: 48 },
  headerCenter: { alignItems: "center" },
  headerBadge: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  headerTitle: { color: Colors.text, fontSize: 17, fontWeight: "700" },
  doneHeader: { minWidth: 48, alignItems: "flex-end" },
  doneText: { fontSize: 14, fontWeight: "800" },
  content: { paddingBottom: 16 },

  // Target Type Dropdown
  dropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1C1C1E",
    borderWidth: 1,
    borderColor: WARMUP_BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 4,
  },
  dropdownLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dropdownIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dropdownTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  dropdownSubtitle: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },

  sectionLabel: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  section: {
    padding: 12,
    backgroundColor: "#1C1C1E",
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2C2C2E",
  },
  label: { marginBottom: 6, color: Colors.text, fontSize: 12, fontWeight: "600" },
  input: {
    minHeight: 44,
    height: 44,
    paddingHorizontal: 12,
    color: Colors.text,
    backgroundColor: "#2A2A2D",
    borderWidth: 1,
    borderColor: "#3E3E42",
    borderRadius: 8,
    fontSize: 15,
  },
  notesInput: { minHeight: 44, textAlignVertical: "top", paddingTop: 8 },
  row: { flexDirection: "row", gap: 8 },
  flex: { flex: 1 },
  inputHelper: { color: Colors.textMuted, fontSize: 10, marginTop: 6 },

  unitButton: {
    minWidth: 76,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    backgroundColor: "#2A2A2D",
    borderWidth: 1,
    borderColor: "#3E3E42",
    borderRadius: 8,
  },
  unitText: { color: Colors.text, fontSize: 14, fontWeight: "600" },

  // Result Banner
  resultBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  resultBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  resultBannerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  resultBannerTitle: {
    fontSize: 12,
    fontWeight: "700",
  },
  resultBannerSubtitle: {
    color: Colors.textMuted,
    fontSize: 10,
    marginTop: 1,
  },
  resultBannerValue: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modal: {
    backgroundColor: "#1C1C1E",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#2C2C2E",
  },
  modalTitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2E",
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  optionText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  optionDescription: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
});
