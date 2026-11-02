import { Ionicons } from '@expo/vector-icons';
import React, { useState } from "react";
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import ThemedCalendarPicker from '../../../../components/common/ThemedCalendarPicker';
import { useTheme } from '../../../../contexts/ThemeContext';

interface DatePickerProps {
  value?: string;
  onChange: (value: string) => void;
  minimumDate?: Date;
  maximumDate?: Date;
}

const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, minimumDate, maximumDate }) => {
  const { colors } = useTheme();
  const [show, setShow] = useState(false);
  const selectedDate = value ? new Date(`${value}T00:00:00`) : new Date();

  const formatDateInputValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <View>
      <TouchableOpacity style={[styles.dateButton, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} onPress={() => setShow(true)}>
        <Text style={[value ? styles.dateText : styles.placeholder, { color: value ? colors.text : colors.textSecondary }]}>
          {value ? formatDate(new Date(value)) : "Select a date..."}
        </Text>
        <Ionicons name="calendar-outline" size={22} color={colors.primary} />
      </TouchableOpacity>

      {show && <ThemedCalendarPicker value={selectedDate} title="Select date" minimumDate={minimumDate} maximumDate={maximumDate} onCancel={() => setShow(false)} onConfirm={(date) => { onChange(formatDateInputValue(date)); setShow(false); }} />}
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
