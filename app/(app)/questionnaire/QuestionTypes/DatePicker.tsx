import React, { useState } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from '@expo/vector-icons';

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
    if (Platform.OS === "android") {
      setShow(false);
    } else {
      setShow(true);
    }
    
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
        <Ionicons name="calendar-outline" size={22} color="#4ADE80" />
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#303236",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#45474B",
  },
  dateText: {
    fontSize: 16,
    color: "#F4F4F5",
  },
  placeholder: {
    fontSize: 16,
    color: "#A8A9AD",
  },
});

export default DatePicker;
