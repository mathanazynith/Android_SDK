import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { useAuth } from "../../../../../service/auth";
import { getDistanceUnitDisplayLabel, getDistanceUnitPaceLabel } from "../../../../../utils/distanceUnit";
 
interface EventRegistrationProps {
  value?: {
    eventName?: string;
    distance?: string;
    targetTime?: string;
  };
  onChange: (value: any) => void;
}
 
const EventRegistration: React.FC<EventRegistrationProps> = ({
  value,
  onChange
}) => {
  const { user } = useAuth();
  const [eventName, setEventName] = useState(value?.eventName || "");
  const [distance, setDistance] = useState(value?.distance || "");
  const [targetTime, setTargetTime] = useState(value?.targetTime || "");
  const distanceUnitLabel = getDistanceUnitDisplayLabel(user?.profile?.distance_unit);
  const paceUnitLabel = getDistanceUnitPaceLabel(user?.profile?.distance_unit);
 
  const handleChange = (field: string, val: string) => {
    const updatedValue = {
      eventName,
      distance,
      targetTime,
      [field]: val
    };
   
    if (field === 'eventName') setEventName(val);
    if (field === 'distance') setDistance(val);
    if (field === 'targetTime') setTargetTime(val);
   
    onChange(updatedValue);
  };
 
  return (
    <View style={styles.container}>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Event Name</Text>
        <TextInput
          style={styles.input}
          value={eventName}
          onChangeText={(val) => handleChange('eventName', val)}
          placeholder="Enter event name"
        />
      </View>
 
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Event Distance ({distanceUnitLabel})</Text>
        <TextInput
          style={styles.input}
          value={distance}
          onChangeText={(val) => handleChange('distance', val)}
          placeholder={`Enter distance in ${distanceUnitLabel}`}
          keyboardType="numeric"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Target Pace ({paceUnitLabel})</Text>
        <TextInput
          style={styles.input}
          value={targetTime}
          onChangeText={(val) => handleChange('targetTime', val)}
          placeholder="Enter target time in minutes"
          keyboardType="numeric"
        />
      </View>
    </View>
  );
};
 
const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  inputGroup: {
    gap: 4,
  },
  label: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#f8f8f8",
  },
});
 
export default EventRegistration;