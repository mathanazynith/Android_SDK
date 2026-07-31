import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../../../../service/auth";
import { RunTypeSelector } from "../components/RunTypeSelector";
import { DistanceInput } from "../components/DistanceInput";
import { TimeInput } from "../components/TimeInput";
import { FormCard } from "../components/FormCard";
import { calculatePace, timeToSeconds } from "../../../../utils/validators";
import { getDistanceUnitDisplayLabel } from "../../../../utils/distanceUnit";

interface RecentLongRunProps {
  options: any[];
  selectedValue?: string;
  onSelect: (value: any, customValues?: Record<string, any> | null) => void;
  customValues?: {
    distance?: string;
    unit?: string;
    time?: string;
    pace?: string;
  };
  onCustomChange?: (field: string, value: string) => void;
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

const RecentLongRun: React.FC<RecentLongRunProps> = ({
  options,
  selectedValue,
  onSelect,
  customValues,
  onCustomChange,
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
    return option.requires_input === true || /custom/i.test(option.text || option.label || "");
  };
  const isCustomSelected = isCustomOption(selectedOption);

  const distanceUnitLabel = useMemo(() => {
    return getDistanceUnitDisplayLabel(user?.profile?.distance_unit || customValues?.unit);
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
    const distanceInput = String(customValues?.distance ?? "").trim();
    const timeValue = String(customValues?.time ?? "").trim();
    const distanceForSelection = isCustomSelected
      ? (distanceInput ? Number(distanceInput) : null)
      : getPresetDistance(selectedOption);

    if (!distanceForSelection || !timeValue) {
      setDisplayPace("");
      onCustomChange?.("pace", "");
      return;
    }

    const seconds = timeToSeconds(timeValue);
    const isMiles = String(customValues?.unit || distanceUnitLabel || "").toLowerCase().includes("mile");
    const finalDistance = isMiles ? distanceForSelection * 1.60934 : distanceForSelection;

    if (!Number.isFinite(distanceForSelection) || distanceForSelection <= 0 || seconds === null || seconds <= 0) {
      setDisplayPace("");
      onCustomChange?.("pace", "");
      return;
    }

    const pace = calculatePace(seconds, finalDistance);
    setDisplayPace(pace);
    onCustomChange?.("pace", pace);
  }, [isCustomSelected, selectedOption, customValues?.distance, customValues?.time, customValues?.unit, distanceUnitLabel]);

  const handleOptionSelect = (optionId: string) => {
    const nextOption = distanceOptions.find((option) => option.id === optionId);
    const nextIsCustom = isCustomOption(nextOption);
    const presetDistance = nextOption ? getPresetDistance(nextOption) : null;
    const nextCustomValues = nextIsCustom
      ? undefined
      : {
          distance: presetDistance !== null ? String(presetDistance) : "",
          unit: distanceUnitLabel,
          time: customValues?.time || "",
          pace: "",
        };

    onSelect(optionId, nextCustomValues);

    if (!nextIsCustom && presetDistance !== null) {
      onCustomChange?.("distance", String(presetDistance));
      onCustomChange?.("unit", distanceUnitLabel);
    } else if (!nextIsCustom) {
      onCustomChange?.("distance", "");
      onCustomChange?.("unit", distanceUnitLabel);
    }
  };

  return (
    <FormCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Recent long run</Text>
          <Text style={styles.subtitle}>Pick a preset distance or enter your own details</Text>
        </View>
        <Feather name="activity" size={18} color="#34C759" />
      </View>

      <RunTypeSelector
        label="Distance"
        options={distanceOptions.map((option) => ({ id: option.id, label: option.text, value: option.id }))}
        selectedValue={selectedValue}
        hint="Select a common distance or custom option"
        onSelect={handleOptionSelect}
      />

      <View style={styles.customSection}>
        {isCustomSelected ? (
          <DistanceInput
            label="Distance"
            value={customValues?.distance || ""}
            unitLabel={distanceUnitLabel}
            hint={`Distance will be shown in ${distanceUnitLabel}`}
            onChange={(value) => onCustomChange?.("distance", value)}
          />
        ) : null}
        <TimeInput
          label="Time taken"
          value={customValues?.time || ""}
          hint="Enter HH:MM:SS"
          onChange={(value) => onCustomChange?.("time", value)}
        />
        <View style={styles.paceCard}>
          <Text style={styles.paceLabel}>Estimated pace</Text>
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

export default RecentLongRun;