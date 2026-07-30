import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../../../../service/auth";
import { RunTypeSelector } from "../components/RunTypeSelector";
import { DistanceInput } from "../components/DistanceInput";
import { TimeInput } from "../components/TimeInput";
import { FormCard } from "../components/FormCard";
import { calculatePace, timeToSeconds } from "../../../../utils/validators";

interface PlanOption {
  id: string;
  label: string;
  value: string;
}

interface PlanSelectionProps {
  options: PlanOption[];
  selectedValue?: string;
  onSelect: (value: any, customValues?: Record<string, any> | null) => void;
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
  const { user } = useAuth();
  const [calculatedPace, setCalculatedPace] = useState("");

  const selectedOption = options.find((option) => option.value === selectedValue || option.id === selectedValue);
  const isCustomOption = (option: any) =>
    option?.requires_input === true || /custom/i.test(option?.label || option?.text || "");
  const isCustomSelected = Boolean(selectedOption && isCustomOption(selectedOption));

  const distanceUnitLabel = useMemo(() => {
    const rawUnit = String(user?.profile?.distance_unit || "km").trim().toLowerCase();
    if (rawUnit.includes("mile")) {
      return "mi";
    }
    return "km";
  }, [user?.profile?.distance_unit]);

  const getPresetDistance = (option: any) => {
    const numericValue = Number(option?.numeric_value ?? option?.value ?? "");
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return numericValue;
    }

    const label = String(option?.label || option?.text || "");
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
    const distanceValue = String(customValues?.targetDistance ?? "").trim();
    const timeValue = String(customValues?.targetTime ?? "").trim();
    const distanceForSelection = isCustomSelected
      ? (distanceValue ? Number(distanceValue) : null)
      : (selectedOption ? getPresetDistance(selectedOption) : null);

    if (!distanceForSelection || !timeValue) {
      setCalculatedPace("");
      onCustomChange?.("targetPace", "");
      return;
    }

    const seconds = timeToSeconds(timeValue);
    if (!Number.isFinite(distanceForSelection) || distanceForSelection <= 0 || seconds === null || seconds <= 0) {
      setCalculatedPace("");
      onCustomChange?.("targetPace", "");
      return;
    }

    const pace = calculatePace(seconds, distanceForSelection);
    setCalculatedPace(pace);
    onCustomChange?.("targetPace", pace);
  }, [isCustomSelected, selectedOption, customValues?.targetDistance, customValues?.targetTime]);

  const handleOptionSelect = (value: string) => {
    const nextOption = options.find((option) => option.value === value || option.id === value);
    const nextIsCustom = Boolean(nextOption && isCustomOption(nextOption));
    const presetDistance = nextOption ? getPresetDistance(nextOption) : null;
    const nextCustomValues = nextIsCustom
      ? undefined
      : {
          targetDistance: presetDistance !== null ? String(presetDistance) : "",
          targetTime: customValues?.targetTime || "",
          targetPace: "",
        };

    onSelect(value, nextCustomValues);

    if (!nextIsCustom && presetDistance !== null) {
      onCustomChange?.("targetDistance", String(presetDistance));
    } else if (!nextIsCustom) {
      onCustomChange?.("targetDistance", "");
    }
  };

  return (
    <FormCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Running plan</Text>
          <Text style={styles.subtitle}>Choose a preset or create a custom target</Text>
        </View>
        <Feather name="flag" size={18} color="#34C759" />
      </View>

      <RunTypeSelector
        label="Plan"
        options={options.map((option) => ({ id: String(option.id), label: option.label, value: option.value }))}
        selectedValue={selectedValue}
        hint="Select an option from your plan list"
        onSelect={handleOptionSelect}
      />

      <View style={styles.customSection}>
        {isCustomSelected ? (
          <DistanceInput
            label="Target distance"
            value={customValues?.targetDistance || ""}
            unitLabel={distanceUnitLabel}
            hint={`Use your profile unit (${distanceUnitLabel})`}
            onChange={(value) => onCustomChange?.("targetDistance", value)}
          />
        ) : null}
        <TimeInput
          label="Target time"
          value={customValues?.targetTime || ""}
          hint="Enter HH:MM:SS"
          onChange={(value) => onCustomChange?.("targetTime", value)}
        />
        <View style={styles.paceCard}>
          <Text style={styles.paceLabel}>Estimated pace</Text>
          <Text style={styles.paceValue}>{calculatedPace || "Enter distance and time to calculate pace"}</Text>
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

export default PlanSelection;