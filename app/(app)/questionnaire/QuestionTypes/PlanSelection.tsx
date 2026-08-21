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
  title?: string;
  subtitle?: string;
  distanceLabel?: string;
  timeLabel?: string;
  timeHint?: string;
  optionsHint?: string;
  selectedValue?: string;
  onSelect: (value: any, customValues?: Record<string, any> | null) => void;
  customValues?: {
    distance?: string;
    time?: string;
    pace?: string;
    unit?: string;
  };
  onCustomChange?: (field: string, value: string) => void;
}

const PlanSelection: React.FC<PlanSelectionProps> = ({
  options,
  title = "What is your primary running goal?",
  subtitle = "Pick a preset distance or enter your own details",
  distanceLabel = "Distance",
  timeLabel = "What is your target finish time for this goal?",
  timeHint = "Enter HH:MM:SS",
  optionsHint = "Select a common distance or custom option",
  selectedValue,
  onSelect,
  customValues,
  onCustomChange,
}) => {
  return (
    <DistanceTimePaceSelector
      title={title}
      subtitle={subtitle}
      icon={<Feather name="flag" size={18} color="#34C759" />}
      options={options}
      selectedValue={selectedValue}
      onSelect={onSelect}
      customValues={customValues}
      onCustomChange={onCustomChange}
      distanceField="distance"
      timeField="time"
      paceField="pace"
      distanceLabel={distanceLabel}
      timeLabel={timeLabel}
      customDistanceLabel="Enter Distance"
      timeHint={timeHint}
      optionsHint={optionsHint}
    />
  );
};

export default PlanSelection;
