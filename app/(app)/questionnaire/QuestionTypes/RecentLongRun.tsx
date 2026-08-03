import React from "react";
import { Feather } from "@expo/vector-icons";
import DistanceTimePaceSelector from "./DistanceTimePaceSelector";

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

const RecentLongRun: React.FC<RecentLongRunProps> = ({
  options,
  selectedValue,
  onSelect,
  customValues,
  onCustomChange,
}) => {
  return (
    <DistanceTimePaceSelector
      title="Recent long run"
      subtitle="Pick a preset distance or enter your own details"
      icon={<Feather name="activity" size={18} color="#34C759" />}
      options={options}
      selectedValue={selectedValue}
      onSelect={onSelect}
      customValues={customValues}
      onCustomChange={onCustomChange}
      distanceField="distance"
      timeField="time"
      paceField="pace"
      distanceLabel="Distance"
      timeLabel="Time taken"
      customDistanceLabel="Distance"
      timeHint="Enter HH:MM:SS"
      optionsHint="Select a common distance or custom option"
    />
  );
};

export default RecentLongRun;