import React from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";
import { useTheme } from "../../../../contexts/ThemeContext";
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
  const { colors } = useTheme();

  // Handle option selection
  const handleSelect = (value: string) => {
    if (onSelect) {
      onSelect(value);
    }
  };

  return (
    <View style={styles.container}>
      {options.map((option) => {
        const isSelected = selectedValue === option.value;
        
        return (
          <TouchableOpacity
            key={option.id}
            style={[
              styles.option,
              { backgroundColor: colors.surface, borderColor: colors.border },
              isSelected && styles.selectedOption,
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            onPress={() => handleSelect(option.value)}
            activeOpacity={0.7}
          >
            <View style={[styles.radioCircle, { borderColor: colors.textTertiary }, isSelected && styles.radioCircleSelected]}>
              {isSelected && <View style={styles.radioSelected} />}
            </View>
            <Text
              style={[
                styles.optionText,
                { color: colors.text },
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
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#303236",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  selectedOption: {
    backgroundColor: "#22C55E",
    borderColor: "#15803D",
    borderWidth: 2,
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#8B8D90",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  radioCircleSelected: {
    borderColor: "#0D0D0D",
  },
  radioSelected: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#0D0D0D",
  },
  optionText: {
    fontSize: 15,
    lineHeight: 20,
    color: "#F4F4F5",
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    flexWrap: "wrap",
  },
  selectedText: {
    color: "#0D0D0D",
    fontWeight: "600",
  },
});

export default SingleChoice;
