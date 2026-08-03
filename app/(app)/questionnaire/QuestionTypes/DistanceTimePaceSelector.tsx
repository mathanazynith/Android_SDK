import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../../../../service/auth";
import { RunTypeSelector } from "../components/RunTypeSelector";
import { DistanceInput } from "../components/DistanceInput";
import { TimeInput } from "../components/TimeInput";
import { FormCard } from "../components/FormCard";
import { calculatePace, timeToSeconds } from "../../../../utils/validators";
import {
  getDistanceUnitCode,
  getDistanceUnitDisplayLabel,
  getDistanceUnitPaceLabel,
} from "../../../../utils/distanceUnit";

interface DistanceTimePaceSelectorProps {
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
  options: any[];
  selectedValue?: string;
  onSelect: (value: any, customValues?: Record<string, any> | null) => void;
  customValues?: Record<string, any>;
  onCustomChange?: (field: string, value: string) => void;
  distanceField: string;
  timeField: string;
  paceField: string;
  distanceLabel?: string;
  timeLabel?: string;
  customDistanceLabel?: string;
  timeHint?: string;
  optionsHint?: string;
}

interface DistanceOption {
  id: string;
  text: string;
  label?: string;
  value?: string;
  numeric_value?: string;
  numeric_unit?: string;
  requires_input?: boolean;
  input_type?: string;
}

const DistanceTimePaceSelector: React.FC<DistanceTimePaceSelectorProps> = ({
  title,
  subtitle,
  icon,
  options,
  selectedValue,
  onSelect,
  customValues,
  onCustomChange,
  distanceField,
  timeField,
  paceField,
  distanceLabel = "Distance",
  timeLabel = "Time taken",
  customDistanceLabel = "Distance",
  timeHint = "Enter HH:MM:SS",
  optionsHint = "Select a common distance or custom option",
}) => {
  const { user } = useAuth();
  const [displayPace, setDisplayPace] = useState("");

  const normalizeDistanceOption = (option: any): DistanceOption => ({
    id: String(option.id),
    text: option.text ?? option.label ?? String(option.id),
    label: option.label ?? option.text ?? String(option.id),
    numeric_value: option.numeric_value ?? option.value ?? undefined,
    numeric_unit: option.numeric_unit ?? option.unit ?? "km",
    requires_input: option.requires_input ?? false,
    input_type: option.input_type ?? "",
  });

  const distanceOptions: DistanceOption[] = (options ?? []).map(normalizeDistanceOption);
  const selectedOption = distanceOptions.find((option) => option.id === selectedValue);
  
  const isCustomOption = (option?: DistanceOption) => {
    if (!option) return false;
    // Use requires_input as the most reliable indicator
    if (option.requires_input === true) return true;
    // Fallback to text check
    return /custom/i.test(option.text || option.label || "");
  };
  
  const isCustomSelected = isCustomOption(selectedOption);

  // Find the custom option ID from the options list
  const customOptionId = useMemo(() => {
    const custom = distanceOptions.find(opt => opt.requires_input === true);
    return custom?.id || null;
  }, [distanceOptions]);

  const distanceUnitLabel = useMemo(() => {
    return getDistanceUnitDisplayLabel(user?.profile?.distance_unit || customValues?.unit);
  }, [user?.profile?.distance_unit, customValues?.unit]);

  const paceUnitLabel = useMemo(() => {
    return getDistanceUnitPaceLabel(user?.profile?.distance_unit || customValues?.unit);
  }, [user?.profile?.distance_unit, customValues?.unit]);

  const getPresetDistance = (option?: DistanceOption) => {
    if (!option) return null;

    const numericValue = Number(option.numeric_value ?? option.value ?? "");
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return numericValue;
    }

    const label = String(option.label || option.text || "");
    const kmMatch = label.match(/(\d+(?:\.\d+)?)\s*(km|kilometers?)/i);
    if (kmMatch) {
      return Number(kmMatch[1]);
    }

    const mileMatch = label.match(/(\d+(?:\.\d+)?)\s*(mi|mile|miles)/i);
    if (mileMatch) {
      return Number(mileMatch[1]) * 1.60934;
    }

    if (/half/i.test(label)) {
      return 21.0975;
    }

    if (/full|marathon/i.test(label)) {
      return 42.195;
    }

    return null;
  };

  useEffect(() => {
    const distanceInput = String(customValues?.[distanceField] ?? "").trim();
    const timeValue = String(customValues?.[timeField] ?? "").trim();
    const distanceForSelection = isCustomSelected
      ? (distanceInput ? Number(distanceInput) : null)
      : getPresetDistance(selectedOption);

    if (!distanceForSelection || !timeValue) {
      setDisplayPace("");
      return;
    }

    const seconds = timeToSeconds(timeValue);
    const distanceCode = getDistanceUnitCode(customValues?.unit || distanceUnitLabel || "km");
    const finalDistance = distanceCode === "mi" ? distanceForSelection * 1.60934 : distanceForSelection;

    if (
      !Number.isFinite(distanceForSelection) ||
      distanceForSelection <= 0 ||
      seconds === null ||
      seconds <= 0
    ) {
      setDisplayPace("");
      return;
    }

    const pace = calculatePace(seconds, finalDistance, distanceCode);
    setDisplayPace(pace);
  }, [
    isCustomSelected,
    selectedOption,
    customValues?.[distanceField],
    customValues?.[timeField],
    customValues?.unit,
    distanceUnitLabel,
  ]);

  // ------------------------------------------------------------
  // FIXED: handleOptionSelect – always use the correct custom option ID
  // ------------------------------------------------------------
  const handleOptionSelect = (optionId: string) => {
    // Debug: inspect actual question options when selecting a custom type
    if (__DEV__) {
      console.log("[DEBUG] question.options for this field:", JSON.stringify(options));
    }

    // Find the option from the list
    const nextOption = distanceOptions.find((option) => option.id === optionId);
    if (!nextOption) {
      console.warn("[DistanceTimePaceSelector] Option not found:", optionId);
      return;
    }

    // Determine if the selected option is custom
    const nextIsCustom = isCustomOption(nextOption);
    
    // For custom selection, force the actual custom option ID from the real options list
    let actualOptionId = optionId;
    if (nextIsCustom) {
      if (customOptionId) {
        actualOptionId = customOptionId;
        if (__DEV__) {
          console.log("[DistanceTimePaceSelector] Custom option selected. Using ID:", actualOptionId);
        }
      } else {
        console.warn("[DistanceTimePaceSelector] No custom option found in options list!");
      }
    }

    // For custom, we keep the existing customValues (which will include distance, time, pace)
    // For preset, we set the distance and clear custom values
    const presetDistance = nextOption ? getPresetDistance(nextOption) : null;
    const nextCustomValues = nextIsCustom
      ? { ...customValues } // preserve existing custom values
      : {
          [distanceField]: presetDistance !== null ? String(presetDistance) : "",
          [timeField]: customValues?.[timeField] || "",
          [paceField]: "",
        };

    // Pass the corrected option ID and custom values
    onSelect(actualOptionId, nextCustomValues);

    // If it's not custom, update the distance and unit in the customValues
    if (!nextIsCustom && presetDistance !== null) {
      onCustomChange?.(distanceField, String(presetDistance));
      onCustomChange?.("unit", distanceUnitLabel);
    } else if (!nextIsCustom) {
      onCustomChange?.(distanceField, "");
      onCustomChange?.("unit", distanceUnitLabel);
    }
  };

  return (
    <FormCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        {icon ?? <Feather name="activity" size={18} color="#34C759" />}
      </View>

      <RunTypeSelector
        label={distanceLabel}
        options={distanceOptions.map((option) => ({ id: option.id, label: option.text, value: option.id }))}
        selectedValue={selectedValue}
        hint={optionsHint}
        onSelect={handleOptionSelect}
      />

      <View style={styles.customSection}>
        {isCustomSelected ? (
          <DistanceInput
            label={customDistanceLabel}
            value={customValues?.[distanceField] || ""}
            unitLabel={distanceUnitLabel}
            hint={`Distance will be shown in ${distanceUnitLabel}`}
            onChange={(value) => onCustomChange?.(distanceField, value)}
          />
        ) : null}

        <TimeInput
          label={timeLabel}
          value={customValues?.[timeField] || ""}
          hint={timeHint}
          onChange={(value) => onCustomChange?.(timeField, value)}
        />

        <View style={styles.paceCard}>
          <Text style={styles.paceLabel}>Estimated pace ({paceUnitLabel})</Text>
          <Text style={styles.paceValue}>{displayPace || "Enter distance and time to calculate pace"}</Text>
        </View>
      </View>
    </FormCard>
  );
};

const styles = StyleSheet.create({
  card: { paddingVertical: 18, marginVertical: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  headerTextWrap: { flex: 1 },
  title: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  subtitle: { color: "#8E8E93", fontSize: 12, marginTop: 4 },
  customSection: { marginTop: 10 },
  paceCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(52, 199, 89, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(52, 199, 89, 0.26)",
  },
  paceLabel: { color: "#8E8E93", fontSize: 12, marginBottom: 4 },
  paceValue: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});

export default DistanceTimePaceSelector;