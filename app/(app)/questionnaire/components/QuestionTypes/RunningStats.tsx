import React, { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
 
interface RunningStatsProps {
  value?: {
    distance?: string;
    time?: string;
    pace?: string;
  };
  onChange: (value: any) => void;
}
 
const RunningStats: React.FC<RunningStatsProps> = ({ value, onChange }) => {
  const [distance, setDistance] = useState(value?.distance || "");
  const [time, setTime] = useState(value?.time || "");
  const [pace, setPace] = useState(value?.pace || "");
 
  // Calculate pace when distance or time changes
  useEffect(() => {
    if (distance && time && parseFloat(distance) > 0 && parseFloat(time) > 0) {
      const dist = parseFloat(distance);
      const timeInMinutes = parseFloat(time);
      const calculatedPace = timeInMinutes / dist;
      const minutes = Math.floor(calculatedPace);
      const seconds = Math.round((calculatedPace - minutes) * 60);
      const paceString = `${minutes}:${seconds.toString().padStart(2, '0')} min/km`;
      setPace(paceString);
     
      // Update parent with all values
      onChange({
        distance,
        time,
        pace: paceString
      });
    } else {
      setPace("");
    }
  }, [distance, time]);
 
  return (
    <View style={styles.container}>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Longest Run Distance (km)</Text>
        <TextInput
          style={styles.input}
          value={distance}
          onChangeText={setDistance}
          placeholder="Enter distance in km"
          keyboardType="numeric"
        />
      </View>
 
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Time Taken (minutes)</Text>
        <TextInput
          style={styles.input}
          value={time}
          onChangeText={setTime}
          placeholder="Enter time in minutes"
          keyboardType="numeric"
        />
      </View>
 
      {pace ? (
        <View style={[styles.inputGroup, styles.paceContainer]}>
          <Text style={styles.label}>Calculated Pace</Text>
          <View style={styles.paceDisplay}>
            <Text style={styles.paceText}>{pace}</Text>
          </View>
        </View>
      ) : (
        <View style={[styles.inputGroup, styles.paceContainer]}>
          <Text style={styles.label}>Calculated Pace</Text>
          <View style={styles.paceDisplayEmpty}>
            <Text style={styles.paceEmptyText}>Enter distance and time to calculate pace</Text>
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
  paceDisplayEmpty: {
    backgroundColor: "#f5f5f5",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  paceText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2E7D32",
  },
  paceEmptyText: {
    fontSize: 14,
    color: "#999",
  },
});
 
export default RunningStats;