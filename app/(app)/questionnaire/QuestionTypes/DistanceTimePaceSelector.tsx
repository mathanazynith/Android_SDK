import React, { useCallback, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../../../../service/auth";
import { RunTypeSelector } from "../components/RunTypeSelector";
import { DistanceInput } from "../components/DistanceInput";
import { ScrollTimePicker } from "../../../../components/ScrollTimePicker";
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
  paceLabel?: string;
  pacePlaceholder?: string;
  showHeader?: boolean;
  showTimeInput?: boolean;
  showPace?: boolean;
  maxDistanceKm?: number | null;
}

interface DistanceOption {
  id: string;
  text?: string;
  label?: string;
  value?: string;
  numeric_value?: string;
  numeric_unit?: string;
  requires_input?: boolean;
  input_type?: string;
}

export const getDistanceInKilometers = (option?: DistanceOption | null): number | null => {
  if (!option) return null;

  const numericValue = Number(option.numeric_value ?? option.value ?? "");
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return /^(mi|mile|miles)$/i.test(String(option.numeric_unit ?? "km"))
      ? numericValue * 1.60934
      : numericValue;
  }

  const label = String(option.label || option.text || "");
  const kmMatch = label.match(/(\d+(?:\.\d+)?)\s*(k|km|kilometers?)/i);
  if (kmMatch) return Number(kmMatch[1]);

  const mileMatch = label.match(/(\d+(?:\.\d+)?)\s*(mi|mile|miles)/i);
  if (mileMatch) return Number(mileMatch[1]) * 1.60934;

  if (/half/i.test(label)) return 21.0975;
  if (/full|marathon/i.test(label)) return 42.195;

  return null;
};

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
  paceLabel = "Estimated pace",
  pacePlaceholder = "Enter distance and time to calculate pace",
  showHeader = true,
  showTimeInput = true,
  showPace = true,
  maxDistanceKm,
}) => {
  const { user } = useAuth();

  const normalizeDistanceOption = (option: any): DistanceOption => ({
    id: String(option.id),
    text: option.text ?? option.label ?? String(option.id),
    label: option.label ?? option.text ?? String(option.id),
    numeric_value: option.numeric_value ?? option.value ?? undefined,
    numeric_unit: option.numeric_unit ?? option.unit ?? "km",
    requires_input: option.requires_input ?? false,
    input_type: option.input_type ?? "",
  });

  const distanceOptions = useMemo<DistanceOption[]>(
    () => (options ?? []).map(normalizeDistanceOption),
    [options]
  );
  const selectedOption = useMemo(
    () => distanceOptions.find((option) => option.id === selectedValue),
    [distanceOptions, selectedValue]
  );
  
  const isCustomOption = (option?: DistanceOption) => {
    if (!option) return false;
    // Use requires_input as the most reliable indicator
    if (option.requires_input === true) return true;
    // Fallback to text check
    return /custom/i.test(option.text || option.label || "");
  };
  
  const isCustomSelected = isCustomOption(selectedOption);
  const selectedDistanceInput = customValues?.[distanceField];
  const selectedTimeValue = customValues?.[timeField];
  const selectedUnit = customValues?.unit;

  // Find the custom option ID from the options list
  const customOptionId = useMemo(() => {
    const custom = distanceOptions.find(opt => opt.requires_input === true);
    return custom?.id || null;
  }, [distanceOptions]);

  const distanceUnitLabel = useMemo(() => {
    return getDistanceUnitDisplayLabel(user?.profile?.distance_unit || customValues?.unit);
  }, [user?.profile?.distance_unit, customValues?.unit]);
  const maxDistanceForInput = maxDistanceKm && maxDistanceKm > 0
    ? (getDistanceUnitCode(user?.profile?.distance_unit || customValues?.unit) === "mile"
        ? maxDistanceKm / 1.60934
        : maxDistanceKm)
    : undefined;

  const paceUnitLabel = useMemo(() => {
    return getDistanceUnitPaceLabel(user?.profile?.distance_unit || customValues?.unit);
  }, [user?.profile?.distance_unit, customValues?.unit]);

  const displayPace = useMemo(() => {
    const distanceInput = String(selectedDistanceInput ?? "").trim();
    const timeValue = String(selectedTimeValue ?? "").trim();
    const customDistance = Number(distanceInput);
    const distanceForSelection = isCustomSelected
      ? (Number.isFinite(customDistance) && customDistance > 0
          ? (getDistanceUnitCode(user?.profile?.distance_unit || selectedUnit) === "mile"
              ? customDistance * 1.60934
              : customDistance)
          : null)
      : getDistanceInKilometers(selectedOption);

    if (!distanceForSelection || !timeValue) {
      return "";
    }

    const seconds = timeToSeconds(timeValue);
    const distanceCode = getDistanceUnitCode(selectedUnit || distanceUnitLabel || "km");
    if (
      !Number.isFinite(distanceForSelection) ||
      distanceForSelection <= 0 ||
      seconds === null ||
      seconds <= 0
    ) {
      return "";
    }

    const pace = calculatePace(seconds, distanceForSelection, distanceCode);
    return pace;
  }, [
    isCustomSelected,
    selectedOption,
    selectedDistanceInput,
    selectedTimeValue,
    selectedUnit,
    distanceUnitLabel,
    user?.profile?.distance_unit,
  ]);

  // ------------------------------------------------------------
  // FIXED: handleOptionSelect – always use the correct custom option ID
  // ------------------------------------------------------------
  const handleOptionSelect = useCallback((optionId: string) => {
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
    const presetDistance = getDistanceInKilometers(nextOption);
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
  }, [
    customOptionId,
    customValues,
    distanceField,
    distanceOptions,
    distanceUnitLabel,
    onCustomChange,
    onSelect,
    options,
    paceField,
    timeField,
  ]);

  return (
    <FormCard style={styles.card}>
      {showHeader ? (
        <View style={styles.header}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          {icon ?? <Feather name="activity" size={18} color="#34C759" />}
        </View>
      ) : null}

      <RunTypeSelector
        label={distanceLabel}
        options={distanceOptions.map((option) => ({
          id: option.id,
          label: option.text ?? option.label ?? option.id,
          value: option.id,
          disabled: !isCustomOption(option) && Boolean(maxDistanceKm && (getDistanceInKilometers(option) ?? 0) > maxDistanceKm),
        }))}
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
            maxValue={maxDistanceForInput}
          />
        ) : null}

        {showTimeInput ? (
          <ScrollTimePicker
            label={timeLabel}
            value={customValues?.[timeField]}
            hint={timeHint}
            onChange={(value) => onCustomChange?.(timeField, value)}
            maxHours={99}
          />
        ) : null}

        {showPace ? (
          <View style={styles.paceCard}>
            <Text style={styles.paceLabel}>{paceLabel} ({paceUnitLabel})</Text>
            <Text style={styles.paceValue}>{displayPace || pacePlaceholder}</Text>
          </View>
        ) : null}
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
