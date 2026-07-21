import React, { useState } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

interface DatePickerProps {
  value?: string;
  onChange: (value: string) => void;
}

const DatePicker: React.FC<DatePickerProps> = ({ value, onChange }) => {
  const [show, setShow] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    value ? new Date(value) : new Date()
  );

  const onDateChange = (event: any, date?: Date) => {
    setShow(Platform.OS === "ios");
    if (date) {
      setSelectedDate(date);
      onChange(date.toISOString().split("T")[0]);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <View>
      <TouchableOpacity style={styles.dateButton} onPress={() => setShow(true)}>
        <Text style={value ? styles.dateText : styles.placeholder}>
          {value ? formatDate(new Date(value)) : "Select a date..."}
        </Text>
      </TouchableOpacity>

      {show && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  dateButton: {
    padding: 16,
    backgroundColor: "#f8f8f8",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  dateText: {
    fontSize: 16,
    color: "#333",
  },
  placeholder: {
    fontSize: 16,
    color: "#999",
  },
});

export default DatePicker;