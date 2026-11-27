import React, { useState } from "react";
import { View, TouchableOpacity, Text, StyleSheet, Modal, FlatList } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";
import { QuestionOption } from "../../../../service/questionnaire/questionnaireService";

interface DropdownProps {
  options: QuestionOption[];
  selectedValue?: string;
  onSelect: (value: string) => void;
}

const Dropdown: React.FC<DropdownProps> = ({ options, selectedValue, onSelect }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const reduceMotion = useReducedMotion();
  const selectedOption = options.find((option) => option.value === selectedValue);

  return (
    <View>
      <TouchableOpacity
        style={styles.dropdown}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityState={{ expanded: modalVisible }}
      >
        <Text style={selectedOption ? styles.selectedText : styles.placeholder}>
          {selectedOption ? selectedOption.label : "Select an option..."}
        </Text>
        <Feather name="chevron-down" size={19} color="#34C759" />
      </TouchableOpacity>

      <Modal
        animationType={reduceMotion ? "none" : "fade"}
        transparent
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.duration(240)}
            style={styles.modalContent}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalEyebrow}>ASSESSMENT</Text>
            <Text style={styles.modalTitle}>Select an option</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isSelected = selectedValue === item.value;
                return (
                  <TouchableOpacity
                    style={[styles.modalOption, isSelected && styles.modalOptionSelected]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => {
                      onSelect(item.value);
                      setModalVisible(false);
                    }}
                  >
                    <Text style={[styles.modalOptionText, isSelected && styles.modalOptionTextSelected]}>
                      {item.label}
                    </Text>
                    {isSelected ? <Feather name="check-circle" size={20} color="#34C759" /> : null}
                  </TouchableOpacity>
                );
              }}
            />
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setModalVisible(false)}
              accessibilityRole="button"
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  dropdown: {
    minHeight: 54,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: "#202124",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#3D4044",
  },
  placeholder: { fontSize: 16, color: "#B5B6B9", flex: 1 },
  selectedText: { fontSize: 16, color: "#FFFFFF", flex: 1 },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  modalContent: {
    backgroundColor: "#151718",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: "#303236",
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 28,
    maxHeight: "78%",
  },
  modalHandle: {
    width: 38,
    height: 4,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
    opacity: 0.28,
    alignSelf: "center",
    marginBottom: 20,
  },
  modalEyebrow: {
    color: "#34C759",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textAlign: "center",
    marginBottom: 7,
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "700",
    marginBottom: 16,
    textAlign: "center",
  },
  modalOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#303236",
    borderRadius: 12,
  },
  modalOptionSelected: { backgroundColor: "#202A22" },
  modalOptionText: { fontSize: 16, color: "#FFFFFF", flex: 1 },
  modalOptionTextSelected: { color: "#34C759", fontWeight: "700" },
  modalClose: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#303236",
  },
  modalCloseText: { fontSize: 15, color: "#34C759", fontWeight: "700" },
});

export default Dropdown;
