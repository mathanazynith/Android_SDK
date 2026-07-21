import React from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";

interface YesNoProps {
  value?: boolean;
  onChange: (value: boolean) => void;
}

const YesNo: React.FC<YesNoProps> = ({ value, onChange }) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, value === true && styles.selectedYes]}
        onPress={() => onChange(true)}
      >
        <Text style={[styles.buttonText, value === true && styles.selectedText]}>
          Yes
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, value === false && styles.selectedNo]}
        onPress={() => onChange(false)}
      >
        <Text style={[styles.buttonText, value === false && styles.selectedText]}>
          No
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 16,
    backgroundColor: "#f8f8f8",
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectedYes: {
    backgroundColor: "#e8f5e9",
    borderColor: "#4CAF50",
  },
  selectedNo: {
    backgroundColor: "#fce4ec",
    borderColor: "#f44336",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  selectedText: {
    color: "#333",
  },
});

export default YesNo;