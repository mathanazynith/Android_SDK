import { Alert } from '@/components/ThemedAlert';
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
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
import { useTheme, type ThemeColors } from "../../../contexts/ThemeContext";
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

type StepTargetType = "duration" | "distance";

const unitOptions: { label: string; value: DistanceUnitType }[] = [
  { label: "Kilometers (km)", value: "km" },
  { label: "Meters (m)", value: "m" },
  { label: "Miles (mi)", value: "mi" },
];

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
      faster: Math.max(60, single - 15),
      slower: Math.min(3600, single + 15),
    };
  }
  return { faster: 270, slower: 330 };
};

export default function RunningDeclaration() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { index } = useLocalSearchParams<{ index?: string }>();
  const { workout, addRun, updateRun, removeRun } = useCustomWorkout();
  const runIndex = Number(index);
  const existing =
    Number.isInteger(runIndex) && runIndex >= 0
      ? workout.runs[runIndex]
      : undefined;

  // Step Title
  const [title] = useState(existing?.title || "Run");

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

  // Duration State (Default 00:00:00 if blank)
  const [durationString, setDurationString] = useState<string>(
    existing?.duration || "00:00:00"
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
  const [notes] = useState(existing?.notes || "");

  const fasterPaceStr = formatSecondsToPace(fasterPaceSec, unit, false);
  const slowerPaceStr = formatSecondsToPace(slowerPaceSec, unit, false);

  // Median Pace: average of fastest and lowest pace
  const medianPaceSec = Math.round((fasterPaceSec + slowerPaceSec) / 2);
  const medianPaceStr = formatSecondsToPace(medianPaceSec, unit, true);

  // Selection handler for unit
  const selectUnit = (selected: DistanceUnitType) => {
    setUnit(selected);
    setDistance((prev) => sanitizeDistanceInput(prev, selected));
    setUnitModalVisible(false);
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
        return Alert.alert("Distance required", "Please enter a valid run distance.");
      }
      const maxDistance = getMaxDistanceForUnit(unit);
      if (distCheck > maxDistance) {
        return Alert.alert(
          "Distance limit exceeded",
          `Run distance cannot exceed ${maxDistance} ${getUnitLabel(unit)}.`
        );
      }
    } else {
      if (durSeconds <= 0) {
        return Alert.alert("Duration required", "Please select a valid run duration.");
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
      groupId: existing?.groupId,
      groupRepeat: existing?.groupRepeat,
      notes: notes.trim(),
    };

    if (existing) {
      updateRun(runIndex, step);
    } else {
      addRun(step);
    }

    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/custom-workout/overview");
    }
  };

  const handleBack = useCallback(() => {
    const isExistingPlaceholder =
      existing &&
      (timeStringToSeconds(existing.duration) ?? 0) === 0 &&
      (Number.parseFloat(existing.distance?.replace(",", ".") || "0") || 0) === 0;
    if (isExistingPlaceholder && Number.isInteger(runIndex) && runIndex >= 0) {
      removeRun(runIndex);
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/custom-workout/overview");
    }
  }, [existing, runIndex, removeRun]);

  useEffect(() => {
    const onBackPress = () => {
      handleBack();
      return true;
    };
    const backHandler = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => backHandler.remove();
  }, [handleBack]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.headerIcon}
            accessibilityLabel="Go back"
          >
            <Feather name="arrow-left" size={24} color={colors.icon} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerBadge}>RUN</Text>
            <Text style={styles.headerTitle}>Configure Step</Text>
          </View>
          <TouchableOpacity onPress={saveStep} style={styles.doneHeader}>
            <Text style={styles.doneText}>DONE</Text>
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
            style={styles.dropdownButton}
            onPress={() => setTypeDropdownVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.dropdownLeft}>
              <View style={styles.dropdownIconCircle}>
                <Feather
                  name={stepType === "duration" ? "clock" : "navigation"}
                  size={16}
                  color={colors.primary}
                />
              </View>
              <View>
                <Text style={styles.dropdownTitle}>
                  {stepType === "duration" ? "Duration" : "Distance"}
                </Text>
                <Text style={styles.dropdownSubtitle}>
                  {stepType === "duration"
                    ? "Control step by time (scroller)"
                    : `Control step by distance (${getUnitLabel(unit)})`}
                </Text>
              </View>
            </View>
            <Feather name="chevron-down" size={18} color={colors.iconSecondary} />
          </TouchableOpacity>

          {/* Conditional Target Input */}
          <Text style={styles.sectionLabel}>
            {stepType === "duration" ? "RUN DURATION" : "RUN DISTANCE"}
          </Text>
          <View style={styles.section}>
            {stepType === "duration" ? (
              <ScrollTimePicker
                value={durationString}
                allowEmpty={true}
                onChange={(val) => setDurationString(val)}
                accentColor={colors.primary}
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
                    placeholder={unit === "m" ? "10" : "e.g. 1.00"}
                    placeholderTextColor={colors.placeholder}
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
                      color={colors.iconSecondary}
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
              accentColor={colors.primary}
            />
          </View>

          {/* Dynamic Result Banner */}
          <View style={styles.resultBanner}>
            <View style={styles.resultBannerLeft}>
              <View style={styles.resultBannerIcon}>
                <Feather
                  name={stepType === "duration" ? "map-pin" : "clock"}
                  size={15}
                  color={colors.primary}
                />
              </View>
              <View>
                <Text style={styles.resultBannerTitle}>
                  {stepType === "duration" ? "Est. Distance" : "Est. Duration"}
                </Text>
                <Text style={styles.resultBannerSubtitle}>
                  @ {medianPaceStr} median
                </Text>
              </View>
            </View>

            <Text style={styles.resultBannerValue}>
              {stepType === "duration"
                ? calculatedDistanceInfo.text
                : calculatedDurationInfo.text}
            </Text>
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
                  color={stepType === "duration" ? colors.primary : colors.iconSecondary}
                />
                <View>
                  <Text style={styles.optionText}>Duration</Text>
                  <Text style={styles.optionDescription}>
                    Control step by time (scroller)
                  </Text>
                </View>
              </View>
              {stepType === "duration" && (
                <Feather name="check" size={20} color={colors.primary} />
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
                  color={stepType === "distance" ? colors.primary : colors.iconSecondary}
                />
                <View>
                  <Text style={styles.optionText}>Distance</Text>
                  <Text style={styles.optionDescription}>
                    Control step by distance (text box)
                  </Text>
                </View>
              </View>
              {stepType === "distance" && (
                <Feather name="check" size={20} color={colors.primary} />
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
                  <Feather name="check" size={21} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 6,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerIcon: { width: 48 },
    headerCenter: { alignItems: "center" },
    headerBadge: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1,
    },
    headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
    doneHeader: { minWidth: 48, alignItems: "flex-end" },
    doneText: { color: colors.primary, fontSize: 14, fontWeight: "800" },
    content: { paddingBottom: 16 },

    // Target Type Dropdown
    dropdownButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: isDark ? "rgba(48, 209, 88, 0.3)" : "rgba(34, 197, 94, 0.35)",
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
      backgroundColor: isDark ? "rgba(48, 209, 88, 0.15)" : "rgba(34, 197, 94, 0.15)",
      alignItems: "center",
      justifyContent: "center",
    },
    dropdownTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: "700",
    },
    dropdownSubtitle: {
      color: colors.textTertiary,
      fontSize: 11,
      marginTop: 1,
    },

    sectionLabel: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 6,
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.8,
    },
    section: {
      padding: 12,
      backgroundColor: colors.surface,
      marginHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    label: { marginBottom: 6, color: colors.textPrimary, fontSize: 12, fontWeight: "600" },
    input: {
      minHeight: 44,
      height: 44,
      paddingHorizontal: 12,
      color: colors.textPrimary,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      fontSize: 15,
    },
    row: { flexDirection: "row", gap: 8 },
    flex: { flex: 1 },
    inputHelper: { color: colors.textTertiary, fontSize: 10, marginTop: 6 },

    unitButton: {
      minWidth: 76,
      height: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 10,
      backgroundColor: colors.surfaceRaised,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
    },
    unitText: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },

    // Result Banner
    resultBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginHorizontal: 16,
      marginTop: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: isDark ? "rgba(48, 209, 88, 0.12)" : "rgba(34, 197, 94, 0.12)",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? "rgba(48, 209, 88, 0.3)" : "rgba(34, 197, 94, 0.35)",
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
      backgroundColor: isDark ? "rgba(34, 197, 94, 0.2)" : "rgba(34, 197, 94, 0.18)",
      alignItems: "center",
      justifyContent: "center",
    },
    resultBannerTitle: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "700",
    },
    resultBannerSubtitle: {
      color: colors.textTertiary,
      fontSize: 10,
      marginTop: 1,
    },
    resultBannerValue: {
      color: colors.primary,
      fontSize: 17,
      fontWeight: "800",
      letterSpacing: 0.5,
    },

    // Modals
    overlay: {
      flex: 1,
      justifyContent: "center",
      padding: 24,
      backgroundColor: colors.overlay,
    },
    modal: {
      overflow: "hidden",
      backgroundColor: colors.surfaceRaised,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalTitle: {
      padding: 20,
      color: colors.textSecondary,
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
      borderTopColor: colors.divider,
    },
    optionLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    optionText: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
    optionDescription: { color: colors.textTertiary, fontSize: 12, marginTop: 2 },
  });
