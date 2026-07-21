import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
  FlatList,
} from "react-native";
import { Feather } from "@expo/vector-icons";

interface PlanOption {
  id: string;
  label: string;
  value: string;
}

interface PlanSelectionProps {
  options: PlanOption[];
  selectedValue?: string;
  onSelect: (value: any) => void;
  customValues?: {
    targetDistance?: string;
    targetTime?: string;
    targetPace?: string;
  };
  onCustomChange?: (field: string, value: string) => void;
}

const PlanSelection: React.FC<PlanSelectionProps> = ({
  options,
  selectedValue,
  onSelect,
  customValues,
  onCustomChange,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [calculatedPace, setCalculatedPace] = useState("");

  const selectedOption = options.find((o) => o.value === selectedValue);
  const isCustomSelected = selectedValue === "custom";

  // Calculate pace when distance and time change
  useEffect(() => {
    if (customValues?.targetDistance && customValues?.targetTime) {
      const distance = parseFloat(customValues.targetDistance);
      const timeInMinutes = parseFloat(customValues.targetTime);
      
      if (distance > 0 && timeInMinutes > 0) {
        const pace = timeInMinutes / distance;
        const minutes = Math.floor(pace);
        const seconds = Math.round((pace - minutes) * 60);
        const paceString = `${minutes}:${seconds.toString().padStart(2, '0')} min/km`;
        setCalculatedPace(paceString);
        
        // Update parent with calculated pace
        if (onCustomChange) {
          onCustomChange("targetPace", paceString);
        }
      } else {
        setCalculatedPace("");
        if (onCustomChange) {
          onCustomChange("targetPace", "");
        }
      }
    } else {
      setCalculatedPace("");
      if (onCustomChange) {
        onCustomChange("targetPace", "");
      }
    }
  }, [customValues?.targetDistance, customValues?.targetTime]);

  const handleOptionSelect = (value: string) => {
    onSelect(value);
    setModalVisible(false);
  };

  return (
    <View style={styles.container}>
      {/* Dropdown Trigger */}
      <TouchableOpacity
        style={styles.dropdown}
        onPress={() => setModalVisible(true)}
      >
        <Text style={selectedOption ? styles.selectedText : styles.placeholder}>
          {selectedOption ? selectedOption.label : "Select your running plan..."}
        </Text>
        <Feather name="chevron-down" size={20} color="#666" />
      </TouchableOpacity>

      {/* Modal Dropdown */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Your Plan</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Feather name="x" size={24} color="#1A1A1A" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalOption,
                    selectedValue === item.value && styles.modalOptionSelected,
                  ]}
                  onPress={() => handleOptionSelect(item.value)}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      selectedValue === item.value && styles.modalOptionTextSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {selectedValue === item.value && (
                    <Feather name="check" size={18} color="#34C759" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Custom Fields - only show when "Custom" is selected */}
      {isCustomSelected && (
        <View style={styles.customContainer}>
          <View style={styles.customRow}>
            <View style={styles.customField}>
              <Text style={styles.customLabel}>Target Distance (km)</Text>
              <TextInput
                style={styles.customInput}
                value={customValues?.targetDistance || ""}
                onChangeText={(value) => onCustomChange?.("targetDistance", value)}
                placeholder="Enter distance"
                keyboardType="numeric"
                placeholderTextColor="#999"
              />
            </View>
            <View style={styles.customField}>
              <Text style={styles.customLabel}>Target Time (min)</Text>
              <TextInput
                style={styles.customInput}
                value={customValues?.targetTime || ""}
                onChangeText={(value) => onCustomChange?.("targetTime", value)}
                placeholder="Enter time"
                keyboardType="numeric"
                placeholderTextColor="#999"
              />
            </View>
          </View>

          {calculatedPace ? (
            <View style={styles.paceCard}>
              <Feather name="activity" size={18} color="#34C759" />
              <View style={styles.paceContent}>
                <Text style={styles.paceLabel}>Target Pace</Text>
                <Text style={styles.paceValue}>{calculatedPace}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.paceCardEmpty}>
              <Feather name="loader" size={18} color="#999" />
              <Text style={styles.paceEmptyText}>
                Enter distance and time to calculate pace
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  dropdown: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    backgroundColor: "#F8F9FB",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E8ECF1",
  },
  placeholder: {
    fontSize: 15,
    color: "#999",
  },
  selectedText: {
    fontSize: 15,
    color: "#1A1A1A",
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 20,
    maxHeight: "60%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  modalOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  modalOptionSelected: {
    backgroundColor: "#34C75910",
    borderRadius: 8,
  },
  modalOptionText: {
    fontSize: 16,
    color: "#1A1A1A",
  },
  modalOptionTextSelected: {
    color: "#34C759",
    fontWeight: "600",
  },
  customContainer: {
    marginTop: 12,
    backgroundColor: "#F8F9FB",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E8ECF1",
  },
  customRow: {
    flexDirection: "row",
    gap: 12,
  },
  customField: {
    flex: 1,
  },
  customLabel: {
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
    marginBottom: 6,
  },
  customInput: {
    borderWidth: 1.5,
    borderColor: "#E8ECF1",
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
    backgroundColor: "#FFFFFF",
    color: "#1A1A1A",
  },
  paceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#34C75910",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#34C75930",
    marginTop: 12,
  },
  paceCardEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F5F7FA",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E8ECF1",
    marginTop: 12,
  },
  paceContent: {
    flex: 1,
  },
  paceLabel: {
    fontSize: 12,
    color: "#666",
    fontWeight: "400",
  },
  paceValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#34C759",
  },
  paceEmptyText: {
    fontSize: 13,
    color: "#999",
    flex: 1,
  },
});

export default PlanSelection;