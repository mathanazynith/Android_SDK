import React, { useMemo, useState, useCallback, useRef } from "react";
import { ActivityIndicator, View, Text, TextInput, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import DatePicker from "../../QuestionTypes/DatePicker";
import DistanceTimePaceSelector from "../../QuestionTypes/DistanceTimePaceSelector";
import { useTheme } from "../../../../../contexts/ThemeContext";

interface EventRegistrationProps {
  value?: {
    eventName?: string;
    eventDate?: string;
    trainingStartDate?: string;
    distance?: string;
    targetDistance?: string;
    targetTime?: string;
    targetPace?: string;
  };
  options: any[];
  selectedValue?: string;
  customValues?: Record<string, any>;
  onChange: (value: any) => void;
  maxDistanceKm?: number | null;
  racePrediction?: RacePrediction | null;
  isRacePredictionLoading?: boolean;
  racePredictionError?: string | null;
  validationMessages?: {
    eventName?: string[];
    eventDate?: string[];
    trainingStartDate?: string[];
    distance?: string[];
    targetTime?: string[];
  };
  labels?: {
    eventName?: string;
    eventNamePlaceholder?: string;
    eventDate?: string;
    trainingStartDate?: string;
    detailsTitle?: string;
    detailsDescription?: string;
    distance?: string;
    targetTime?: string;
    timeHint?: string;
    optionsHint?: string;
  };
}

export interface RacePrediction {
  status?: string;
  target_distance_km?: number;
  benchmark?: { distance_km?: number; time?: string; pace?: string };
  training_period?: { start_date?: string; target_date?: string; weeks?: number };
  predicted_time?: string;
  predicted_pace?: string;
  goal_status?: string;
  validation_error?: string | null;
  message?: string;
  goal_time?: string;
  goal_pace?: string;
  time_gap_seconds?: number;
  required_improvement_seconds?: number;
  required_improvement?: string;
  required_improvement_percent?: number;
  modelled_adaptation_percent?: number;
}

const formatPercent = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2).replace(/\.00$/, "")}%` : null;

const formatWeeks = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? `${Number.isInteger(value) ? value : value.toFixed(1)} weeks` : null;

export function RacePredictionCard({
  prediction,
  isLoading = false,
  error,
}: {
  prediction?: RacePrediction | null;
  isLoading?: boolean;
  error?: string | null;
}) {
  const { colors } = useTheme();
  if (!isLoading && !prediction && !error) return null;

  const goalStatus = String(prediction?.goal_status ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  const isSupported = ["SUPPORTED", "GOAL_SUPPORTED"].includes(goalStatus);
  const isUnsupported = /UNSUPPORTED|NOT_SUPPORTED|NOT_CURRENTLY_SUPPORTED|NOT_FEASIBLE|UNACHIEVABLE/.test(goalStatus)
    || Boolean(prediction?.validation_error);
  const improvement = [prediction?.required_improvement, formatPercent(prediction?.required_improvement_percent)]
    .filter(Boolean)
    .join(" · ");
  const benchmark = prediction?.benchmark
    ? [
        typeof prediction.benchmark.distance_km === "number" ? `${prediction.benchmark.distance_km} km` : null,
        prediction.benchmark.time,
        prediction.benchmark.pace,
      ].filter(Boolean).join(" · ")
    : null;
  const trainingDates = prediction?.training_period?.start_date && prediction.training_period.target_date
    ? `${prediction.training_period.start_date} – ${prediction.training_period.target_date}`
    : null;
  const rows: Array<[string, string | null | undefined]> = [
    ["Your goal", prediction?.goal_time],
    ["Predicted race time", prediction?.predicted_time],
    ["Your goal pace", prediction?.goal_pace],
    ["Predicted pace", prediction?.predicted_pace],
    ["Required improvement", isSupported ? null : improvement || null],
    ["Training period", formatWeeks(prediction?.training_period?.weeks)],
    ["Training dates", trainingDates],
    ["Target distance", typeof prediction?.target_distance_km === "number" ? `${prediction.target_distance_km} km` : null],
    ["Benchmark", benchmark],
    ["Modelled adaptation", formatPercent(prediction?.modelled_adaptation_percent)],
  ];

  return (
    <View style={[
      styles.predictionCard,
      { backgroundColor: colors.surface, borderColor: colors.border },
      isUnsupported && styles.predictionUnsupported,
    ]}>
      {isLoading ? (
        <View style={styles.predictionLoading}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.predictionMessage, { color: colors.textSecondary }]}>Checking your goal time...</Text>
        </View>
      ) : prediction ? (
        <>
          <Text style={[styles.predictionTitle, { color: colors.textPrimary }]}>
            {isSupported ? "Goal time is supported" : isUnsupported ? "Goal time is not currently supported" : "Race prediction"}
          </Text>
          {!!(prediction.validation_error || prediction.message) && (
            <Text style={[styles.predictionMessage, { color: isUnsupported ? "#D93025" : colors.textSecondary }]}>
              {prediction.validation_error || prediction.message}
            </Text>
          )}
          <View style={styles.predictionGrid}>
            {rows.filter(([, value]) => !!value).map(([label, value]) => (
              <View key={label} style={styles.predictionRow}>
                <Text style={[styles.predictionLabel, { color: colors.textSecondary }]}>{label}</Text>
                <Text style={[styles.predictionValue, { color: colors.textPrimary }]}>{value}</Text>
              </View>
            ))}
          </View>
        </>
      ) : error ? (
        <Text style={[styles.predictionMessage, { color: colors.textSecondary }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const EventRegistration: React.FC<EventRegistrationProps> = ({
  value,
  options,
  selectedValue,
  customValues,
  onChange,
  maxDistanceKm,
  racePrediction,
  isRacePredictionLoading = false,
  racePredictionError,
  validationMessages,
  labels,
}) => {
  const { colors } = useTheme();
  const [eventName, setEventName] = useState(value?.eventName || "");
  const [eventDate, setEventDate] = useState(value?.eventDate || "");
  const [trainingStartDate, setTrainingStartDate] = useState(value?.trainingStartDate || "");
  const [distanceState, setDistanceState] = useState(value?.targetDistance || value?.distance || customValues?.distance || "");
  const [targetTime, setTargetTime] = useState(value?.targetTime || customValues?.targetTime || "");
  const [selectedDistanceValue, setSelectedDistanceValue] = useState<string | undefined>(selectedValue);
  // Selecting a preset triggers both onSelect and onCustomChange. State does
  // not update between those callbacks, so this preserves the new option ID
  // instead of allowing onCustomChange to write the old one back.
  const selectedDistanceValueRef = useRef<string | undefined>(selectedValue);

  React.useEffect(() => {
    setSelectedDistanceValue(selectedValue);
    selectedDistanceValueRef.current = selectedValue;
  }, [selectedValue]);

  React.useEffect(() => {
    setDistanceState(value?.targetDistance || value?.distance || customValues?.distance || "");
  }, [value?.targetDistance, value?.distance, customValues?.distance]);

  React.useEffect(() => {
    setTargetTime(value?.targetTime || customValues?.targetTime || "");
  }, [value?.targetTime, customValues?.targetTime]);

  // Shared state for all custom values (distance, time, unit) - pace is computed only
  const normalizedCustomValues = useMemo(() => {
    return {
      ...customValues,
      distance: distanceState,
      targetDistance: distanceState,
      time: targetTime,
      targetTime,
      unit: "km",
    };
  }, [customValues, distanceState, targetTime]);

  interface EventRegistrationChange {
    eventName: string;
    eventDate: string;
    trainingStartDate: string;
    distance: string;
    targetDistance: string;
    targetTime: string;
    eventDistanceValue?: string;
    eventDistanceCustomValues?: Record<string, any> | null;
  }

  // Emit change to parent component with all current values - memoized to prevent infinite loops
  const emitChange = useCallback((next: Partial<EventRegistrationChange>) => {
    onChange({
      eventName,
      eventDate,
      trainingStartDate,
      distance: distanceState,
      targetDistance: distanceState,
      targetTime,
      ...next,
    });
  }, [eventName, eventDate, trainingStartDate, distanceState, targetTime, onChange]);

  return (
    <View style={styles.container}>
      {/* 1. Event Name Input */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
        <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>{labels?.eventName || "What is your event name?"}</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.text }]}
          value={eventName}
          onChangeText={(val) => {
            setEventName(val);
            emitChange({ eventName: val });
          }}
          placeholder={labels?.eventNamePlaceholder || "Enter event name"}
          placeholderTextColor={colors.textSecondary}
        />
        {validationMessages?.eventName?.map((message) => (
          <Text key={message} style={styles.validationText}>{message}</Text>
        ))}
      </View>

      {/* 2. Event distance */}
      <DistanceTimePaceSelector
        title={labels?.detailsTitle || "Event Details"}
        subtitle={labels?.detailsDescription || "Pick a preset distance or enter your own details"}
        icon={<Feather name="flag" size={18} color={colors.primary} />}
        options={options}
        selectedValue={selectedDistanceValue}
        showTimeInput={false}
        showPace={false}
        onSelect={(val: string, nextCustomValues?: Record<string, any> | null) => {
          const selectedOption = options.find((opt) => String(opt.id) === String(val));
          const isCustom = selectedOption?.requires_input === true;

          setSelectedDistanceValue(val);
          selectedDistanceValueRef.current = val;

          if (isCustom) {
            setDistanceState(String(nextCustomValues?.distance ?? nextCustomValues?.targetDistance ?? distanceState));
          } else {
            setDistanceState(String(selectedOption?.numeric_value ?? selectedOption?.value ?? ""));
          }

          const nextDistance = isCustom
            ? String(nextCustomValues?.distance ?? nextCustomValues?.targetDistance ?? distanceState)
            : String(selectedOption?.numeric_value ?? selectedOption?.value ?? "");

          emitChange({
            eventDistanceValue: val,
            eventDistanceCustomValues: nextCustomValues || normalizedCustomValues,
            distance: nextDistance,
            targetDistance: nextDistance,
            targetTime: targetTime,
          });
        }}
        customValues={normalizedCustomValues}
        onCustomChange={(field: string, val: string) => {
          if (field === "distance" || field === "targetDistance") {
            setDistanceState(val);
          } else if (field === "time" || field === "targetTime") {
            setTargetTime(val);
          }

          const updatedCustomValues = {
            ...normalizedCustomValues,
            [field]: val,
          };

          emitChange({
            eventDistanceValue: selectedDistanceValueRef.current,
            eventDistanceCustomValues: updatedCustomValues,
            distance: field === "distance" || field === "targetDistance" ? val : distanceState,
            targetDistance: field === "distance" || field === "targetDistance" ? val : distanceState,
            targetTime: field === "time" || field === "targetTime" ? val : targetTime,
          });
        }}
        distanceField="targetDistance"
        timeField="targetTime"
        paceField="targetPace"
        distanceLabel={labels?.distance || "Distance"}
        timeLabel={labels?.targetTime || "Target time"}
        customDistanceLabel="Enter Distance"
        timeHint={labels?.timeHint || "Enter HH:MM:SS"}
        optionsHint={labels?.optionsHint || "Select a common distance or custom option"}
        maxDistanceKm={maxDistanceKm}
      />
      {validationMessages?.distance?.map((message) => (
        <Text key={message} style={styles.validationText}>{message}</Text>
      ))}

      {/* 3. Event Date Picker */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
        <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>{labels?.eventDate || "When is your event?"}</Text>
        <DatePicker
          value={eventDate}
          onChange={(date) => {
            setEventDate(date);
            emitChange({ eventDate: date });
          }}
        />
        {validationMessages?.eventDate?.map((message) => (
          <Text key={message} style={styles.validationText}>{message}</Text>
        ))}
      </View>

      {/* 4. Training Start Date Picker */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
        <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>{labels?.trainingStartDate || "When can you start training for this event?"}</Text>
        <DatePicker
          value={trainingStartDate}
          onChange={(date) => {
            setTrainingStartDate(date);
            emitChange({ trainingStartDate: date });
          }}
        />
        {validationMessages?.trainingStartDate?.map((message) => (
          <Text key={message} style={styles.validationText}>{message}</Text>
        ))}
      </View>

      {/* 5. Target time and pace, after both dates for race validation */}
      <DistanceTimePaceSelector
        title={labels?.targetTime || "Target time"}
        subtitle={labels?.timeHint || "Enter your goal finish time"}
        options={options}
        selectedValue={selectedDistanceValue}
        customValues={normalizedCustomValues}
        showHeader={false}
        showDistanceSelector={false}
        showTimeInput
        showPace
        distanceField="targetDistance"
        timeField="targetTime"
        paceField="targetPace"
        distanceLabel={labels?.distance || "Distance"}
        timeLabel={labels?.targetTime || "Target time"}
        timeHint={labels?.timeHint || "Enter HH:MM:SS"}
        maxDistanceKm={maxDistanceKm}
        onSelect={() => {}}
        onCustomChange={(field: string, val: string) => {
          if (field === "time" || field === "targetTime") setTargetTime(val);
          const updatedCustomValues = { ...normalizedCustomValues, [field]: val };
          emitChange({
            eventDistanceValue: selectedDistanceValueRef.current,
            eventDistanceCustomValues: updatedCustomValues,
            targetTime: field === "time" || field === "targetTime" ? val : targetTime,
          });
        }}
      />
      {validationMessages?.targetTime?.map((message) => (
        <Text key={message} style={styles.validationText}>{message}</Text>
      ))}

      <RacePredictionCard prediction={racePrediction} isLoading={isRacePredictionLoading} error={racePredictionError} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 18,
  },
  section: {
    gap: 8,
    backgroundColor: "#202124",
    borderRadius: 18,
    padding: 22,
  },
  sectionLabel: {
    fontSize: 15,
    color: "#F4F4F5",
    fontWeight: "600",
    marginBottom: 4,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    color: "#8E8E93",
    fontWeight: "500",
    marginBottom: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: "#45474B",
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    color: "#F4F4F5",
    backgroundColor: "#303236",
  },
  validationText: {
    color: "#FF6B6B",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  predictionCard: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10, marginTop: 14 },
  predictionUnsupported: { borderColor: "#DC2626" },
  predictionLoading: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 28 },
  predictionTitle: { fontSize: 15, fontWeight: "700" },
  predictionMessage: { fontSize: 14, lineHeight: 20 },
  predictionGrid: { gap: 8 },
  predictionRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  predictionLabel: { flex: 1, fontSize: 14 },
  predictionValue: { fontSize: 14, fontWeight: "700", textAlign: "right" },
});

export default EventRegistration;
