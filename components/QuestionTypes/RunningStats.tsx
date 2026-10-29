import React, { useState, useMemo, useCallback } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
 
interface RunningStatsProps {
  value?: {
    distance?: string;
    time?: string;
    pace?: string;
  };
  onChange: (value: any) => void;
}

const calculatePaceString = (distStr: string, timeStr: string) => {
  const dist = parseFloat(distStr);
  const timeInMinutes = parseFloat(timeStr);
  if (dist > 0 && timeInMinutes > 0) {
    const calculatedPace = timeInMinutes / dist;
    const minutes = Math.floor(calculatedPace);
    const seconds = Math.round((calculatedPace - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')} min/km`;
  }
  return "";
};
 
const RunningStats: React.FC<RunningStatsProps> = ({ value, onChange }) => {
  const [distance, setDistance] = useState(value?.distance || "");
  const [time, setTime] = useState(value?.time || "");

  const pace = useMemo(
    () => calculatePaceString(distance, time),
    [distance, time]
  );

  const handleDistanceChange = useCallback((newDistance: string) => {
    setDistance(newDistance);
    const calculatedPace = calculatePaceString(newDistance, time);
    onChange({
      distance: newDistance,
      time,
      pace: calculatedPace,
    });
  }, [time, onChange]);

  const handleTimeChange = useCallback((newTime: string) => {
    setTime(newTime);
    const calculatedPace = calculatePaceString(distance, newTime);
    onChange({
      distance,
      time: newTime,
      pace: calculatedPace,
    });
  }, [distance, onChange]);
 
  return (
    <View style={styles.container}>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Longest Run Distance (km)</Text>
        <TextInput
          style={styles.input}
          value={distance}
          onChangeText={handleDistanceChange}
          placeholder="Enter distance in km"
          keyboardType="numeric"
        />
      </View>
 
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Time Taken (minutes)</Text>
        <TextInput
          style={styles.input}
          value={time}
          onChangeText={handleTimeChange}
          placeholder="Enter time in minutes"
          keyboardType="numeric"
        />
      </View>
 
      {pace && (
        <View style={[styles.inputGroup, styles.paceContainer]}>
          <Text style={styles.label}>Calculated Pace</Text>
          <View style={styles.paceDisplay}>
            <Text style={styles.paceText}>{pace}</Text>
          </View>
        </View>
      )}
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
  paceContainer: {
    marginTop: 8,
  },
  paceDisplay: {
    backgroundColor: "#e8f5e9",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#4CAF50",
  },
  paceText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2E7D32",
  },
});
 
export default RunningStats;