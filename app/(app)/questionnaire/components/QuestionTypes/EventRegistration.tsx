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
  onChange: (value: any) => void;
  trainingDaysComputed?: number | string;
}

/**
 * Event distance options matching Page 2 preset options
 * Converted to match the backend option structure
 */
const eventDistanceOptions = [
  { 
    id: "5k", 
    label: "5K", 
    value: "5k", 
    text: "5K",
    numeric_value: "5", 
    numeric_unit: "km" 
  },
  { 
    id: "10k", 
    label: "10K", 
    value: "10k",
    text: "10K", 
    numeric_value: "10", 
    numeric_unit: "km" 
  },
  { 
    id: "15k", 
    label: "15K", 
    value: "15k",
    text: "15K", 
    numeric_value: "15", 
    numeric_unit: "km" 
  },
  { 
    id: "half-marathon", 
    label: "Half Marathon", 
    value: "half-marathon",
    text: "Half Marathon", 
    numeric_value: "21.0975", 
    numeric_unit: "km" 
  },
  { 
    id: "full-marathon", 
    label: "Full Marathon", 
    value: "full-marathon",
    text: "Full Marathon", 
    numeric_value: "42.195", 
    numeric_unit: "km" 
  },
  { 
    id: "custom", 
    label: "CUSTOM", 
    value: "custom",
    text: "CUSTOM",
    requires_input: true, 
    input_type: "number" 
  },
];

const EventRegistration: React.FC<EventRegistrationProps> = ({
  value,
  onChange,
  trainingDaysComputed,
}) => {
  const [eventName, setEventName] = useState(value?.eventName || "");
  const [eventDate, setEventDate] = useState(value?.eventDate || "");
  const [trainingStartDate, setTrainingStartDate] = useState(value?.trainingStartDate || "");
  const [distanceState, setDistanceState] = useState(value?.targetDistance || value?.distance || "");
  const [targetTime, setTargetTime] = useState(value?.targetTime || "");
  
  // Determine selected distance option based on current distance value
  const [selectedDistanceValue, setSelectedDistanceValue] = useState<string | undefined>(() => {
    if (value?.targetDistance && value?.targetDistance !== "") {
      const presetMatch = eventDistanceOptions.find(
        (opt) => String(opt.numeric_value ?? "") === String(value.targetDistance)
      );
      if (presetMatch) {
        return presetMatch.id;
      }
      return "custom";
    }
    return undefined;
  });

  // Shared state for all custom values (distance, time, unit) - pace is computed only
  const customValues = useMemo(() => {
    return {
      distance: distanceState,
      targetDistance: distanceState,
      time: targetTime,
      targetTime,
      unit: "km",
    };
  }, [distanceState, targetTime]);

  // Emit change to parent component with all current values - memoized to prevent infinite loops
  const emitChange = useCallback((next: Partial<{
    eventName: string;
    eventDate: string;
    trainingStartDate: string;
    distance: string;
    targetDistance: string;
    targetTime: string;
  }>) => {
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
        options={eventDistanceOptions}
        selectedValue={selectedDistanceValue}
        onSelect={(val: string, nextCustomValues?: Record<string, any> | null) => {
          setSelectedDistanceValue(val);
          
          // Handle preset distance selection
          if (val === "custom") {
            setDistanceState((prev) => prev || "");
          } else {
            const preset = eventDistanceOptions.find((opt) => opt.id === val);
            setDistanceState(String(preset?.numeric_value ?? ""));
          }
          
          // Extract distance from custom values or use current state
          const nextDistance = String(
            nextCustomValues?.targetDistance ?? nextCustomValues?.distance ?? distanceState
          );
          emitChange({
            distance: nextDistance,
            targetDistance: nextDistance,
          });
        }}
        customValues={customValues}
        onCustomChange={(field: string, val: string) => {
          // Route field changes to appropriate state setters - ignore pace (it's computed)
          if (field === "distance" || field === "targetDistance") {
            setDistanceState(val);
            emitChange({ targetDistance: val, distance: val });
          } else if (field === "time" || field === "targetTime") {
            setTargetTime(val);
            emitChange({ targetTime: val });
          }
          // Ignore pace field changes - pace is computed only, not stored
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