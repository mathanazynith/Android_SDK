import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
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
import { secondsToTimeString } from "../../../service/customWorkout";
import {
  calculateTwoFields,
  getPaceUnitLabel,
  getUnitFullLabel,
  getUnitLabel,
  normalizeUnit,
  type DistanceUnitType,
} from "../../../src/utils/workoutCalculations";
import { useCustomWorkout } from "./workout-context";

type TimeParts = { hours: string; minutes: string; seconds: string };

const unitOptions: { label: string; value: DistanceUnitType }[] = [
  { label: "Kilometers (km)", value: "km" },
  { label: "Meters (m)", value: "m" },
  { label: "Miles (mi)", value: "mi" },
];

const toNumber = (value: string) =>
  Number.parseFloat(value.replace(",", ".")) || 0;

const secondsOf = ({ hours, minutes, seconds }: TimeParts) =>
  toNumber(hours) * 3600 + toNumber(minutes) * 60 + toNumber(seconds);

const timeText = (time: TimeParts) =>
  `${time.hours || "00"}:${time.minutes || "00"}:${time.seconds || "00"}`;

export default function RunningDeclaration() {
  const { index } = useLocalSearchParams<{ index?: string }>();
  const { workout, addRun, updateRun } = useCustomWorkout();
  const runIndex = Number(index);
  const existing =
    Number.isInteger(runIndex) && runIndex >= 0
      ? workout.runs[runIndex]
      : undefined;

  const existingDuration = existing?.duration?.split(":") || [];

  const [title, setTitle] = useState(existing?.title || "Running");
  const [unit, setUnit] = useState<DistanceUnitType>(normalizeUnit(existing?.unit));
  const [unitModal, setUnitModal] = useState(false);

  const [duration, setDuration] = useState<TimeParts>({
    hours: existingDuration[0] === "00" ? "" : existingDuration[0] || "",
    minutes: existingDuration[1] === "00" ? "" : existingDuration[1] || "",
    seconds: existingDuration[2] === "00" ? "" : existingDuration[2] || "",
  });
  const [distance, setDistance] = useState(existing?.distance || "");
  const [pace, setPace] = useState(existing?.pace || "");
  const [notes, setNotes] = useState(existing?.notes || "");

  // Select unit directly
  const selectUnit = (selected: DistanceUnitType) => {
    setUnit(selected);
    setUnitModal(false);
  };

  // Perform accurate 2-value calculation
  const calculated = useMemo(() => {
    const durSec = secondsOf(duration);
    const distVal = toNumber(distance);
    return calculateTwoFields({
      durationSec: durSec > 0 ? durSec : null,
      distanceVal: distVal > 0 ? distVal : null,
      paceStr: pace ? pace : null,
      unit,
    });
  }, [distance, duration, pace, unit]);

  const durationValue =
    duration.hours || duration.minutes || duration.seconds
      ? timeText(duration)
      : calculated.calculatedDuration != null
      ? secondsToTimeString(calculated.calculatedDuration)
      : "";

  const saveStep = () => {
    const hasDuration =
      secondsOf(duration) > 0 || calculated.calculatedDuration != null;
    const hasDistance =
      toNumber(distance) > 0 || toNumber(calculated.calculatedDistance) > 0;
    const hasPace =
      Boolean(pace?.trim()) || Boolean(calculated.calculatedPace?.trim());

    const filledCount = [hasDuration, hasDistance, hasPace].filter(Boolean)
      .length;

    if (!title.trim())
      return Alert.alert(
        "Step title required",
        "Enter a name for this running step."
      );

    if (filledCount < 2)
      return Alert.alert(
        "Set any two values",
        "A running step requires any two of Duration, Distance, and Pace."
      );

    const finalDuration =
      duration.hours || duration.minutes || duration.seconds
        ? timeText(duration)
        : calculated.calculatedDuration != null
        ? secondsToTimeString(calculated.calculatedDuration)
        : "";

    const finalDistance = distance || calculated.calculatedDistance;
    const finalPace = pace || calculated.calculatedPace;

    const step = {
      title: title.trim(),
      stepType: "Run" as const,
      inputType: finalDuration ? ("DURATION" as const) : ("DISTANCE" as const),
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

  const updateTime = (value: string, setValue: (next: TimeParts) => void) => {
    const [hours, minutes, seconds] = value.split(":");
    setValue({ hours, minutes, seconds });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
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


          <Text style={styles.sectionLabel}>
            SET TWO VALUES (AUTO-CALCULATES 3RD)
          </Text>
          <View style={styles.section}>
            {/* Duration Input */}
            <Text style={styles.label}>Duration</Text>
            <ScrollTimePicker
              value={durationValue}
              allowEmpty={!durationValue}
              onChange={(value) => updateTime(value, setDuration)}
            />

            {/* Distance Input & Unit Selector */}
            <Text style={[styles.label, { marginTop: 16 }]}>
              Distance ({getUnitLabel(unit)})
            </Text>
            <View style={styles.row}>
              <TextInput
                value={distance || calculated.calculatedDistance}
                onChangeText={setDistance}
                placeholder={unit === "m" ? "400" : "0.00"}
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                style={[styles.input, styles.flex]}
              />
              <TouchableOpacity
                style={styles.unitButton}
                onPress={() => setUnitModal(true)}
              >
                <Text style={styles.unitText}>{getUnitLabel(unit)}</Text>
                <Feather
                  name="chevron-down"
                  size={18}
                  color={Colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {/* Pace Input */}
            <Text style={[styles.label, { marginTop: 16 }]}>
              Pace ({getPaceUnitLabel(unit)})
            </Text>
            <TextInput
              value={pace || calculated.calculatedPace}
              onChangeText={setPace}
              placeholder={
                unit === "mi" ? "e.g. 8:30 / mi" : "e.g. 5:30 / km"
              }
              placeholderTextColor={Colors.textMuted}
              keyboardType="numbers-and-punctuation"
              style={styles.input}
            />

            <Text style={styles.helper}>
              Fill any 2 fields to calculate the 3rd. Tap the unit button to switch between km, m, and mi.
            </Text>
          </View>

          <Text style={styles.sectionLabel}>NOTES & INSTRUCTIONS</Text>
          <View style={styles.section}>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Target heart rate, cadence, or interval notes (optional)"
              placeholderTextColor={Colors.textMuted}
              style={[styles.input, styles.notesInput]}
              multiline
            />
          </View>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={saveStep}
            activeOpacity={0.85}
          >
            <Text style={styles.saveText}>SAVE RUNNING STEP</Text>
            <Feather name="check" size={20} color={Colors.background} />
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Unit Modal */}
      <Modal
        visible={unitModal}
        transparent
        animationType="fade"
        onRequestClose={() => setUnitModal(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setUnitModal(false)}>
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
                  <Feather name="check" size={21} color={Colors.primaryLight} />
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
  doneText: { color: Colors.primaryLight, fontSize: 14, fontWeight: "800" },
  content: { paddingBottom: 40 },
  sectionLabel: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 10,
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  section: {
    padding: 20,
    backgroundColor: "#1C1C1E",
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2C2C2E",
  },
  label: { marginBottom: 8, color: Colors.text, fontSize: 15, fontWeight: "500" },
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
  helper: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 8 },
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
    borderTopWidth: 1,
    borderTopColor: "#2C2C2E",
  },
  optionText: { color: Colors.text, fontSize: 16 },
});
