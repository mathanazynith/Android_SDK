import React, { useMemo, useState, useCallback } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import DatePicker from "../../QuestionTypes/DatePicker";
import DistanceTimePaceSelector from "../../QuestionTypes/DistanceTimePaceSelector";

interface EventRegistrationProps {
  value?: {
    eventName?: string;
    eventDate?: string;
    trainingStartDate?: string;
    trainingDaysAvailable?: number | string;
    distance?: string;
    targetDistance?: string;
    targetTime?: string;
    targetPace?: string;
  };
  options: any[];
  selectedValue?: string;
  customValues?: Record<string, any>;
  onChange: (value: any) => void;
  trainingDaysComputed?: number | string;
}

const EventRegistration: React.FC<EventRegistrationProps> = ({
  value,
  options,
  selectedValue,
  customValues,
  onChange,
  trainingDaysComputed,
}) => {
  const [eventName, setEventName] = useState(value?.eventName || "");
  const [eventDate, setEventDate] = useState(value?.eventDate || "");
  const [trainingStartDate, setTrainingStartDate] = useState(value?.trainingStartDate || "");
  const [distanceState, setDistanceState] = useState(value?.targetDistance || value?.distance || customValues?.distance || "");
  const [targetTime, setTargetTime] = useState(value?.targetTime || customValues?.targetTime || "");
  const [selectedDistanceValue, setSelectedDistanceValue] = useState<string | undefined>(selectedValue);

  React.useEffect(() => {
    setSelectedDistanceValue(selectedValue);
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
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>What is your event name?</Text>
        <TextInput
          style={styles.input}
          value={eventName}
          onChangeText={(val) => {
            setEventName(val);
            emitChange({ eventName: val });
          }}
          placeholder="Enter event name"
          placeholderTextColor="#999"
        />
      </View>

      {/* 2. Event Date Picker */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>When is your event?</Text>
        <DatePicker
          value={eventDate}
          onChange={(date) => {
            setEventDate(date);
            emitChange({ eventDate: date });
          }}
        />
      </View>

      {/* 3. Training Start Date Picker */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>When can you start training for this event?</Text>
        <DatePicker
          value={trainingStartDate}
          onChange={(date) => {
            setTrainingStartDate(date);
            emitChange({ trainingStartDate: date });
          }}
        />
      </View>

      {/* 4. Training Days Available (Computed) */}
      {trainingDaysComputed !== undefined && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Training Days Available</Text>
          <View style={styles.computedValueBox}>
            <Text style={styles.computedValue}>{trainingDaysComputed}</Text>
          </View>
        </View>
      )}

      {/* 5. Distance & Target Time Section - Reusing Page 2 Components */}
      <DistanceTimePaceSelector
        title="Event Details"
        subtitle="Pick a preset distance or enter your own details"
        icon={<Feather name="flag" size={18} color="#34C759" />}
        options={options}
        selectedValue={selectedDistanceValue}
        onSelect={(val: string, nextCustomValues?: Record<string, any> | null) => {
          const selectedOption = options.find((opt) => String(opt.id) === String(val));
          const isCustom = selectedOption?.requires_input === true;

          setSelectedDistanceValue(val);

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
            eventDistanceValue: selectedDistanceValue,
            eventDistanceCustomValues: updatedCustomValues,
            distance: field === "distance" || field === "targetDistance" ? val : distanceState,
            targetDistance: field === "distance" || field === "targetDistance" ? val : distanceState,
            targetTime: field === "time" || field === "targetTime" ? val : targetTime,
          });
        }}
        distanceField="targetDistance"
        timeField="targetTime"
        paceField="targetPace"
        distanceLabel="Distance"
        timeLabel="Target time"
        customDistanceLabel="Enter Distance"
        timeHint="Enter HH:MM:SS"
        optionsHint="Select a common distance or custom option"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 18,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 15,
    color: "#1A1A1A",
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
    borderColor: "#E5E5EA",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: "#1A1A1A",
    backgroundColor: "#F9F9F9",
  },
  computedValueBox: {
    borderWidth: 1,
    borderColor: "#E5E5EA",
    borderRadius: 10,
    padding: 14,
    backgroundColor: "#F9F9F9",
    minHeight: 48,
    justifyContent: "center",
  },
  computedValue: {
    fontSize: 16,
    color: "#1A1A1A",
    fontWeight: "500",
  },
});

export default EventRegistration;