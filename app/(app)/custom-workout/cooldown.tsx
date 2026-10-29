import { Alert } from '@/components/ThemedAlert';
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
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
import { useCustomWorkout } from "./workout-context";

// Cooldown Theme Accent: Blue
const COOLDOWN_COLOR = "#0A84FF";
const COOLDOWN_LIGHT_BG = "rgba(10, 132, 255, 0.12)";
const COOLDOWN_BORDER = "rgba(10, 132, 255, 0.35)";

type StepTargetType = "duration" | "distance";

const unitOptions: { label: string; value: DistanceUnitType }[] = [
  { label: "Kilometers (km)", value: "km" },
  { label: "Meters (m)", value: "m" },
  { label: "Miles (mi)", value: "mi" },
];

const targetTypeOptions: {
  label: string;
  value: StepTargetType;
  description: string;
  icon: "clock" | "navigation";
}[] = [
  {
    label: "Duration",
    value: "duration",
    description: "Control cooldown by time (scroller)",
    icon: "clock",
  },
  {
    label: "Distance",
    value: "distance",
    description: "Control cooldown by distance (text box)",
    icon: "navigation",
  },
];

const parseExistingPaces = (paceStr?: string | null) => {
  // Default cooldown pace: 8:20 /km (500s) -> 7:50 (470s) to 8:50 (530s)
  if (!paceStr) return { faster: 470, slower: 530 };
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
  return { faster: 470, slower: 530 };
};

export default function Cooldown() {
  const { workout, setCooldown } = useCustomWorkout();
  const existing = workout.cooldown;

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

  // Duration State (Default 5 mins if blank)
  const [durationString, setDurationString] = useState<string>(
    existing?.duration && existing.duration !== "00:00:00"
      ? existing.duration
      : "00:05:00"
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

  const save = () => {
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
        return Alert.alert("Distance required", "Please enter a valid cooldown distance.");
      }
      const maxDistance = getMaxDistanceForUnit(unit);
      if (distCheck > maxDistance) {
        return Alert.alert(
          "Distance limit exceeded",
          `Cooldown distance cannot exceed ${maxDistance} ${getUnitLabel(unit)}.`
        );
      }
    } else {
      if (!durSeconds || durSeconds <= 0) {
        return Alert.alert("Duration required", "Please select a valid cooldown duration.");
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

    setCooldown({
      title: "Cool Down",
      stepType: "Cooldown",
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
            <Feather name="arrow-left" size={26} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerBadge, { color: COOLDOWN_COLOR }]}>COOL DOWN</Text>
            <Text style={styles.headerTitle}>Configure Step</Text>
          </View>
          <TouchableOpacity onPress={save} style={styles.doneHeader}>
            <Text style={[styles.doneText, { color: COOLDOWN_COLOR }]}>DONE</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* 1. TYPE DROPDOWN: Clean single card without double-box */}
          <Text style={styles.sectionLabel}>TARGET TYPE</Text>
          <TouchableOpacity
            style={styles.dropdownCard}
            onPress={() => setTypeDropdownVisible(true)}
            activeOpacity={0.8}
          >
            <View style={styles.dropdownLeft}>
              <View style={[styles.dropdownIconCircle, { backgroundColor: COOLDOWN_LIGHT_BG }]}>
                <Feather
                  name={stepType === "duration" ? "clock" : "navigation"}
                  size={18}
                  color={COOLDOWN_COLOR}
                />
              </View>
              <View>
                <Text style={styles.dropdownTitle}>
                  {stepType === "duration" ? "Duration" : "Distance"}
                </Text>
                <Text style={styles.dropdownSubtitle}>
                  {stepType === "duration"
                    ? "Control cooldown by time (scroller)"
                    : "Control cooldown by distance (text box)"}
                </Text>
              </View>
            </View>
            <Feather name="chevron-down" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>

          {/* 2. CONDITIONAL TARGET INPUT */}
          <Text style={styles.sectionLabel}>
            {stepType === "duration" ? "COOLDOWN DURATION" : "COOLDOWN DISTANCE"}
          </Text>
          <View style={styles.section}>
            {stepType === "duration" ? (
              <View>
                <Text style={styles.label}>Select Duration (HH:MM:SS)</Text>
                <ScrollTimePicker
                  value={durationString}
                  allowEmpty={false}
                  onChange={(val) => setDurationString(val)}
                  accentColor={COOLDOWN_COLOR}
                />
              </View>
            ) : (
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
                    placeholder={unit === "m" ? "10" : "e.g. 0.60"}
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

                {unit === "m" ? (
                  <Text style={styles.inputHelper}>
                    Minimum distance for meters is 10 m (automatically adjusted).
                  </Text>
                ) : (
                  <Text style={styles.inputHelper}>
                    Maximum distance: {getMaxDistanceForUnit(unit)} {getUnitLabel(unit)}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* 3. PACE SECTION: Fastest Pace & Lowest Pace Steppers */}
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
              accentColor={COOLDOWN_COLOR}
            />
          </View>

          {/* 4. DYNAMIC ESTIMATED RESULT CARD */}
          <View
            style={[
              styles.resultCard,
              { backgroundColor: "rgba(10, 132, 255, 0.08)", borderColor: COOLDOWN_BORDER },
            ]}
          >
            <View style={styles.resultHeader}>
              <View style={[styles.resultIconCircle, { backgroundColor: COOLDOWN_LIGHT_BG }]}>
                <Feather
                  name={stepType === "duration" ? "map-pin" : "clock"}
                  size={18}
                  color={COOLDOWN_COLOR}
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
              <Text style={[styles.resultBigValue, { color: COOLDOWN_COLOR }]}>
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

          {/* 5. NOTES (OPTIONAL) */}
          <Text style={styles.sectionLabel}>NOTES (OPTIONAL)</Text>
          <View style={styles.section}>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Gentle walk, light stretching"
              placeholderTextColor={Colors.textMuted}
              style={[styles.input, styles.notesInput]}
              multiline
            />
          </View>
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
                    color={stepType === option.value ? COOLDOWN_COLOR : Colors.textSecondary}
                  />
                  <View>
                    <Text style={styles.optionText}>{option.label}</Text>
                    <Text style={styles.optionDescription}>
                      {option.description}
                    </Text>
                  </View>
                </View>
                {stepType === option.value && (
                  <Feather name="check" size={21} color={COOLDOWN_COLOR} />
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
                  <Feather name="check" size={21} color={COOLDOWN_COLOR} />
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
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  headerTitle: { color: Colors.text, fontSize: 20, fontWeight: "700" },
  doneHeader: { minWidth: 55, alignItems: "flex-end" },
  doneText: { fontSize: 14, fontWeight: "800" },
  content: { paddingBottom: 40 },
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

  // Clean Single Card Dropdown
  dropdownCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1C1C1E",
    borderWidth: 1,
    borderColor: "#2C2C2E",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginHorizontal: 16,
    marginBottom: 6,
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
    fontSize: 24,
    fontWeight: "800",
  },
  paceUnitText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  medianBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  medianBadgeText: {
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
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnDisabled: {
    opacity: 0.35,
  },

  // Calculated Result Card
  resultCard: {
    marginHorizontal: 16,
    marginTop: 14,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  resultIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  resultTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  resultSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  resultValueContainer: {
    backgroundColor: "#101012",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2C2C2E",
  },
  resultBigValue: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  resultValueSubtext: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 3,
    fontWeight: "500",
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
