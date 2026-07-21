import React from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";
import { QuestionOption } from "../../../../service/questionnaire/questionnaireService";

interface SingleChoiceProps {
  options: QuestionOption[];
  selectedValue?: string;
  onSelect: (value: string) => void;
}

const SingleChoice: React.FC<SingleChoiceProps> = ({
  options,
  selectedValue,
  onSelect,
}) => {
  // Handle option selection
  const handleSelect = (value: string) => {
    console.log("SingleChoice - Option selected:", value);
    console.log("SingleChoice - Current selectedValue:", selectedValue);
    if (onSelect) {
      onSelect(value);
    }
  };

  return (
    <View style={styles.container}>
      {options.map((option) => {
        const isSelected = selectedValue === option.value;
        console.log(`SingleChoice - Option ${option.value}: isSelected=${isSelected}`);
        
        return (
          <TouchableOpacity
            key={option.id}
            style={[
              styles.option,
              isSelected && styles.selectedOption,
            ]}
            onPress={() => handleSelect(option.value)}
            activeOpacity={0.7}
          >
            <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
              {isSelected && <View style={styles.radioSelected} />}
            </View>
            <Text
              style={[
                styles.optionText,
                isSelected && styles.selectedText,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
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
    backgroundColor: "#e8f5e9",
    borderColor: "#34C759",
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#666",
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  radioCircleSelected: {
    borderColor: "#34C759",
  },
  radioSelected: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#34C759",
  },
  optionText: {
    fontSize: 16,
    color: "#333",
    flex: 1,
  },
  selectedText: {
    color: "#2E7D32",
    fontWeight: "600",
  },
});

export default SingleChoice;