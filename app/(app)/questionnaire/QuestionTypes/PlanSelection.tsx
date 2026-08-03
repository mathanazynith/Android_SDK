import React from "react";
import { Feather } from "@expo/vector-icons";
import DistanceTimePaceSelector from "./DistanceTimePaceSelector";

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
  return (
    <DistanceTimePaceSelector
      title="Running plan"
      subtitle="Choose a preset or create a custom target"
      icon={<Feather name="flag" size={18} color="#34C759" />}
      options={options}
      selectedValue={selectedValue}
      onSelect={onSelect}
      customValues={customValues}
      onCustomChange={onCustomChange}
      distanceField="targetDistance"
      timeField="targetTime"
      paceField="targetPace"
      distanceLabel="Plan"
      timeLabel="Target time"
      customDistanceLabel="Target distance"
      timeHint="Enter HH:MM:SS"
      optionsHint="Select an option from your plan list"
    />
  );
};

export default PlanSelection;