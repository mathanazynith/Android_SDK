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
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollTimePicker } from "../../../components/ScrollTimePicker";
import { Colors } from "../../../constants/theme";
import { useCustomWorkout } from "./workout-context";

type TimeParts = { hours: string; minutes: string; seconds: string };
const units = ["Kilometers (km)", "Meters (m)", "Miles (mi)"];
const toNumber = (value: string) =>
  Number.parseFloat(value.replace(",", ".")) || 0;
const unitName = (unit: string) =>
  unit.includes("Meters") ? "m" : unit.includes("Miles") ? "mi" : "km";
const secondsOf = ({ hours, minutes, seconds }: TimeParts) =>
  toNumber(hours) * 3600 + toNumber(minutes) * 60 + toNumber(seconds);
const timeText = (time: TimeParts) =>
  `${time.hours || "00"}:${time.minutes || "00"}:${time.seconds || "00"}`;
const timeParts = (total: number): TimeParts => ({
  hours: String(Math.floor(total / 3600)).padStart(2, "0"),
  minutes: String(Math.floor((total % 3600) / 60)).padStart(2, "0"),
  seconds: String(Math.round(total % 60)).padStart(2, "0"),
});
const paceText = (total: number, unit: string) =>
  `${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")} / ${unitName(unit)}`;

export default function RunningDeclaration() {
  const { index } = useLocalSearchParams<{ index?: string }>();
  const { workout, addRun, updateRun } = useCustomWorkout();
  const runIndex = Number(index);
  const existing =
    Number.isInteger(runIndex) && runIndex >= 0
      ? workout.runs[runIndex]
      : undefined;
  const existingDuration = existing?.duration?.split(":") || [];
  const existingRest = existing?.rest?.split(":") || [];
  const [title, setTitle] = useState(existing?.title || "Running");
  const [unit, setUnit] = useState(existing?.unit || units[0]);
  const [unitModal, setUnitModal] = useState(false);
  const [repeatModal, setRepeatModal] = useState(false);
  const [duration, setDuration] = useState<TimeParts>({
    hours: existingDuration[0] === "00" ? "" : existingDuration[0] || "",
    minutes: existingDuration[1] === "00" ? "" : existingDuration[1] || "",
    seconds: existingDuration[2] === "00" ? "" : existingDuration[2] || "",
  });
  const [distance, setDistance] = useState(existing?.distance || "");
  const [pace, setPace] = useState(existing?.pace || "");
  const [repeat, setRepeat] = useState(String(existing?.repeat || 1));
  const [rest, setRest] = useState<TimeParts>({
    hours: existingRest[0] === "00" ? "" : existingRest[0] || "",
    minutes: existingRest[1] === "00" ? "" : existingRest[1] || "",
    seconds: existingRest[2] === "00" ? "" : existingRest[2] || "",
  });
  const [skipLastRest, setSkipLastRest] = useState(
    existing?.skipLastRest ?? true,
  );
  const [notes, setNotes] = useState(existing?.notes || "");

  const calculated = useMemo(() => {
    const durationSeconds = secondsOf(duration);
    let distanceInUnits = toNumber(distance);
    if (unit.includes("Meters") && distanceInUnits > 0) {
      distanceInUnits = distanceInUnits / 1000;
    }
    const match = pace.match(/(\d+)\s*:\s*(\d+(?:\.\d+)?)/);
    const paceSeconds = match
      ? toNumber(match[1]) * 60 + toNumber(match[2])
      : 0;
    if (
      [durationSeconds > 0, distanceInUnits > 0, paceSeconds > 0].filter(
        Boolean,
      ).length < 2
    )
      return { duration: null as TimeParts | null, distance: "", pace: "" };
    if (!durationSeconds && distanceInUnits && paceSeconds)
      return {
        duration: timeParts(distanceInUnits * paceSeconds),
        distance: "",
        pace: "",
      };
    if (!distanceInUnits && durationSeconds && paceSeconds) {
      const calculatedDist = durationSeconds / paceSeconds;
      return {
        duration: null,
        distance: unit.includes("Meters")
          ? String(Math.round(calculatedDist * 1000))
          : calculatedDist.toFixed(2),
        pace: "",
      };
    }
    if (!paceSeconds && durationSeconds && distanceInUnits)
      return {
        duration: null,
        distance: "",
        pace: paceText(durationSeconds / distanceInUnits, unit),
      };
    return { duration: null, distance: "", pace: "" };
  }, [distance, duration, pace, unit]);

  const saveStep = () => {
    const hasDuration = secondsOf(duration) > 0;
    const hasDistance = toNumber(distance) > 0 || toNumber(calculated.distance) > 0;
    const hasPace = /\d+\s*:\s*\d+/.test(pace) || /\d+\s*:\s*\d+/.test(calculated.pace);

    const filledCount = [hasDuration, hasDistance, hasPace].filter(Boolean).length;

    if (!title.trim())
      return Alert.alert(
        "Step title required",
        "Enter a name for this running step.",
      );
    if (filledCount < 2)
      return Alert.alert(
        "Set any two values",
        "A run step requires any two of Duration, Distance, and Pace.",
      );

    const finalDuration = durationValue || (calculated.duration ? timeText(calculated.duration) : "");
    const finalDistance = distance || calculated.distance;
    const finalPace = pace || calculated.pace;
    const hasRest = secondsOf(rest) > 0;

    const step = {
      title: title.trim(),
      stepType: "Run" as const,
      inputType: finalDuration ? ("DURATION" as const) : ("DISTANCE" as const),
      duration: finalDuration,
      distance: finalDistance,
      unit,
      pace: finalPace,
      repeat: Number(repeat) || 1,
      rest: hasRest ? restValue : "",
      skipLastRest,
      skipRest: !hasRest,
      notes: notes.trim(),
    };

    if (existing) updateRun(runIndex, step);
    else addRun(step);
    router.push("/custom-workout/overview");
  };

  const updateTime = (value: string, setValue: (next: TimeParts) => void) => {
    const [hours, minutes, seconds] = value.split(":");
    setValue({ hours, minutes, seconds });
  };

  const durationValue =
    duration.hours || duration.minutes || duration.seconds
      ? timeText(duration)
      : calculated.duration
        ? timeText(calculated.duration)
        : "";
  const restValue =
    rest.hours || rest.minutes || rest.seconds ? timeText(rest) : "";

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
            <Text style={styles.headerBadge}>STEP 2</Text>
            <Text style={styles.headerTitle}>Running Step</Text>
          </View>
          <TouchableOpacity onPress={saveStep} style={styles.doneHeader}>
            <Text style={styles.doneText}>DONE</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionLabel}>STEP NAME</Text>
          <View style={styles.section}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Running, Fast Interval, Hill Run"
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
            />
          </View>

          <Text style={styles.sectionLabel}>SET TWO VALUES (AUTO-CALCULATES 3RD)</Text>
          <View style={styles.section}>
            <Text style={styles.label}>Duration</Text>
            <ScrollTimePicker
              value={durationValue}
              allowEmpty={!durationValue}
              onChange={(value) => updateTime(value, setDuration)}
            />

            <Text style={[styles.label, { marginTop: 16 }]}>Distance</Text>
            <View style={styles.row}>
              <TextInput
                value={distance || calculated.distance}
                onChangeText={setDistance}
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                style={[styles.input, styles.flex]}
              />
              <TouchableOpacity
                style={styles.unitButton}
                onPress={() => setUnitModal(true)}
              >
                <Text style={styles.unitText}>{unitName(unit)}</Text>
                <Feather
                  name="chevron-down"
                  size={18}
                  color={Colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { marginTop: 16 }]}>Pace</Text>
            <TextInput
              value={pace || calculated.pace}
              onChangeText={setPace}
              placeholder={`e.g. 5:30 / ${unitName(unit)}`}
              placeholderTextColor={Colors.textMuted}
              keyboardType="numbers-and-punctuation"
              style={styles.input}
            />
            <Text style={styles.helper}>
              Fill any two fields above. The third value will calculate automatically.
            </Text>
          </View>

          <Text style={styles.sectionLabel}>REPEATS & RECOVERY</Text>
          <View style={styles.section}>
            <View style={styles.repeatRow}>
              <Text style={styles.rowTitle}>Repeat count</Text>
              <TouchableOpacity
                style={styles.repeatButton}
                onPress={() => setRepeatModal(true)}
              >
                <Text style={styles.repeatValue}>{repeat}x</Text>
                <Feather
                  name="chevron-down"
                  size={18}
                  color={Colors.primaryLight}
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>
              Rest duration <Text style={styles.optional}>(optional)</Text>
            </Text>
            <ScrollTimePicker
              value={restValue}
              allowEmpty={!restValue}
              onChange={(value) => updateTime(value, setRest)}
            />

            {secondsOf(rest) > 0 && (
              <View style={styles.switchRow}>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>Skip last rest</Text>
                  <Text style={styles.helper}>
                    Skip rest after the final repeat to transition smoothly.
                  </Text>
                </View>
                <Switch
                  value={skipLastRest}
                  onValueChange={setSkipLastRest}
                  trackColor={{ false: "#3A3A3C", true: Colors.primaryDark }}
                  thumbColor={skipLastRest ? Colors.primaryLight : "#BBBBBB"}
                />
              </View>
            )}

            <View style={{ marginTop: 14 }}>
              <Text style={styles.label}>Notes</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Target heart rate, cadence, or step notes"
                placeholderTextColor={Colors.textMuted}
                style={[styles.input, styles.notesInput]}
                multiline
              />
            </View>
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={saveStep} activeOpacity={0.85}>
            <Text style={styles.saveText}>SAVE RUNNING STEP</Text>
            <Feather name="check" size={20} color={Colors.background} />
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

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
            {units.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.option}
                onPress={() => {
                  setUnit(option);
                  setUnitModal(false);
                }}
              >
                <Text style={styles.optionText}>{option}</Text>
                {unit === option && (
                  <Feather name="check" size={21} color={Colors.primaryLight} />
                )}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={repeatModal}
        transparent
        animationType="fade"
        onRequestClose={() => setRepeatModal(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setRepeatModal(false)}>
          <Pressable
            style={styles.modal}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.modalTitle}>REPEAT COUNT</Text>
            <ScrollView style={styles.repeatScroll}>
              {Array.from({ length: 40 }, (_, index) => String(index + 1)).map(
                (option) => (
                  <TouchableOpacity
                    key={option}
                    style={styles.option}
                    onPress={() => {
                      setRepeat(option);
                      setRepeatModal(false);
                    }}
                  >
                    <Text style={styles.optionText}>{option} times</Text>
                    {repeat === option && (
                      <Feather
                        name="check"
                        size={21}
                        color={Colors.primaryLight}
                      />
                    )}
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
  headerBadge: { color: Colors.primary, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
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
  notesInput: { minHeight: 65, textAlignVertical: "top", paddingTop: 10 },
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
  optional: { color: Colors.textMuted, fontSize: 13 },
  repeatRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2C2C2E",
  },
  rowTitle: { color: Colors.text, fontSize: 17, fontWeight: "500" },
  repeatButton: {
    minWidth: 80,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    backgroundColor: "#2A2A2D",
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 10,
  },
  repeatValue: { color: Colors.primaryLight, fontSize: 16, fontWeight: "700" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#2C2C2E",
  },
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
  saveText: { color: Colors.background, fontSize: 15, fontWeight: "800", letterSpacing: 0.5 },
  overlay: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.75)",
  },
  modal: { overflow: "hidden", backgroundColor: "#222224", borderRadius: 16, borderWidth: 1, borderColor: "#333336" },
  modalTitle: {
    padding: 20,
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
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
