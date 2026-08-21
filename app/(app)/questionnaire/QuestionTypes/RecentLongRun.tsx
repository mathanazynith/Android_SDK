import React from "react";
import { Feather } from "@expo/vector-icons";
import DistanceTimePaceSelector from "./DistanceTimePaceSelector";

interface RecentLongRunProps {
  options: any[];
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
    unit?: string;
    time?: string;
    pace?: string;
  };
  onCustomChange?: (field: string, value: string) => void;
}

const RecentLongRun: React.FC<RecentLongRunProps> = ({
  options,
  title = "Recent long run",
  subtitle = "Pick a preset distance or enter your own details",
  distanceLabel = "Distance",
  timeLabel = "Time taken",
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
      icon={<Feather name="activity" size={18} color="#34C759" />}
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
      customDistanceLabel="Distance"
      timeHint={timeHint}
      optionsHint={optionsHint}
    />
  );
};

export default RecentLongRun;