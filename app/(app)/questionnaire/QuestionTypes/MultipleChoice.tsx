import React from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";
import { QuestionOption } from "../../../../service/questionnaire/questionnaireService";

interface MultipleChoiceProps {
  options: QuestionOption[];
  selectedValues: string[];
  onSelect: (values: string[]) => void;
}

const MultipleChoice: React.FC<MultipleChoiceProps> = ({
  options,
  selectedValues,
  onSelect,
}) => {
  const toggleOption = (value: string) => {
    if (selectedValues.includes(value)) {
      onSelect(selectedValues.filter((v) => v !== value));
    } else {
      onSelect([...selectedValues, value]);
    }
  };

  return (
    <View style={styles.container}>
      {options.map((option) => (
        <TouchableOpacity
          key={option.id}
          style={[
            styles.option,
            selectedValues.includes(option.value) && styles.selectedOption,
          ]}
          onPress={() => toggleOption(option.value)}
        >
          <View style={styles.checkbox}>
            {selectedValues.includes(option.value) && (
              <Text style={styles.checkmark}>✓</Text>
            )}
          </View>
          <Text
            style={[
              styles.optionText,
              selectedValues.includes(option.value) && styles.selectedText,
            ]}
          >
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#f8f8f8",
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectedOption: {
    backgroundColor: "#e8e6ff",
    borderColor: "#6C63FF",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#666",
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  checkmark: {
    fontSize: 16,
    color: "#6C63FF",
    fontWeight: "bold",
  },
  optionText: {
    fontSize: 16,
    color: "#333",
    flex: 1,
  },
  selectedText: {
    color: "#6C63FF",
    fontWeight: "600",
  },
});

export default MultipleChoice;