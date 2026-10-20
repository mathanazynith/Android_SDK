import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BRAND_GREEN, useTheme } from "../../contexts/ThemeContext";

interface ThemedCalendarPickerProps {
  value: Date;
  title: string;
  onCancel: () => void;
  onConfirm: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
}

const weekdayLabels = ["S", "M", "T", "W", "T", "F", "S"];
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const sameDay = (left: Date, right: Date) => left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
const beforeDay = (left: Date, right: Date) => new Date(left.getFullYear(), left.getMonth(), left.getDate()) < new Date(right.getFullYear(), right.getMonth(), right.getDate());
const afterDay = (left: Date, right: Date) => new Date(left.getFullYear(), left.getMonth(), left.getDate()) > new Date(right.getFullYear(), right.getMonth(), right.getDate());

export default function ThemedCalendarPicker({ value, title, onCancel, onConfirm, minimumDate, maximumDate }: ThemedCalendarPickerProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState(() => new Date(value.getFullYear(), value.getMonth(), value.getDate()));
  const [displayMonth, setDisplayMonth] = useState(() => startOfMonth(value));
  const [showYears, setShowYears] = useState(false);

  const year = displayMonth.getFullYear();
  const month = displayMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const currentMonth = new Date(year, month, 1);
  const previousMonth = new Date(year, month - 1, 1);
  const nextMonth = new Date(year, month + 1, 1);
  const canGoPrevious = !minimumDate || previousMonth.getFullYear() > minimumDate.getFullYear() || (previousMonth.getFullYear() === minimumDate.getFullYear() && previousMonth.getMonth() >= minimumDate.getMonth());
  const canGoNext = !maximumDate || nextMonth.getFullYear() < maximumDate.getFullYear() || (nextMonth.getFullYear() === maximumDate.getFullYear() && nextMonth.getMonth() <= maximumDate.getMonth());
  const firstYear = minimumDate?.getFullYear() ?? 1900;
  const lastYear = maximumDate?.getFullYear() ?? new Date().getFullYear() + 5;
  const years = Array.from({ length: Math.max(1, lastYear - firstYear + 1) }, (_, index) => firstYear + index);
  const monthLabel = currentMonth.toLocaleDateString(undefined, { month: "long" });

  const chooseDay = (day: number) => {
    const date = new Date(year, month, day);
    if ((minimumDate && beforeDay(date, minimumDate)) || (maximumDate && afterDay(date, maximumDate))) return;
    setSelectedDate(date);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close calendar" onPress={onCancel} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.topBar}>
            <View style={styles.titleWrap}>
              <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Choose a date</Text>
            </View>
            <View style={[styles.selectedDate, { backgroundColor: colors.selected }]}>
              <Feather name="calendar" size={14} color={colors.primary} />
              <Text style={[styles.selectedDateText, { color: colors.primary }]}>
                {selectedDate.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
              </Text>
            </View>
          </View>

          <View style={styles.monthBar}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous month" disabled={!canGoPrevious} onPress={() => setDisplayMonth(previousMonth)} style={[styles.monthArrow, { backgroundColor: colors.surfaceRaised, opacity: canGoPrevious ? 1 : 0.4 }]}>
              <Feather name="chevron-left" size={20} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Choose year" onPress={() => setShowYears((current) => !current)} style={styles.monthLabel}>
              <Text style={[styles.monthText, { color: colors.text }]}>{monthLabel}</Text>
              <Text style={[styles.yearText, { color: colors.primary }]}>{year}</Text>
              <Feather name={showYears ? "chevron-up" : "chevron-down"} size={14} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next month" disabled={!canGoNext} onPress={() => setDisplayMonth(nextMonth)} style={[styles.monthArrow, { backgroundColor: colors.surfaceRaised, opacity: canGoNext ? 1 : 0.4 }]}>
              <Feather name="chevron-right" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {showYears ? (
            <ScrollView style={styles.yearScroll} contentContainerStyle={styles.yearGrid}>
              {years.map((itemYear) => {
                const active = itemYear === year;
                return (
                  <TouchableOpacity key={itemYear} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => { setDisplayMonth(new Date(itemYear, month, 1)); setShowYears(false); }} style={[styles.yearCell, { backgroundColor: active ? colors.selected : colors.surfaceRaised }]}>
                    <Text style={[styles.yearCellText, { color: active ? colors.primary : colors.text }]}>{itemYear}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <>
              <View style={styles.weekdays}>
                {weekdayLabels.map((label, index) => <Text key={`${label}-${index}`} style={[styles.weekday, { color: colors.textTertiary }]}>{label}</Text>)}
              </View>
              <View style={styles.daysGrid}>
                {Array.from({ length: cellCount }, (_, index) => {
                  const day = index - firstWeekday + 1;
                  if (day < 1 || day > daysInMonth) return <View key={`empty-${index}`} style={styles.dayCell} />;
                  const date = new Date(year, month, day);
                  const active = sameDay(date, selectedDate);
                  const today = sameDay(date, new Date());
                  const disabled = Boolean((minimumDate && beforeDay(date, minimumDate)) || (maximumDate && afterDay(date, maximumDate)));
                  return (
                    <View key={date.toISOString()} style={styles.dayCell}>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={date.toLocaleDateString()} accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={() => chooseDay(day)} style={[styles.dayButton, active && { backgroundColor: colors.primary }, today && !active && { borderColor: colors.primary, borderWidth: 1 }, disabled && styles.disabledDay]}>
                        <Text style={[styles.dayText, { color: active ? colors.primaryText : colors.textSecondary }]}>{day}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          <View style={styles.actions}>
            <TouchableOpacity accessibilityRole="button" onPress={onCancel} style={[styles.cancelButton, { borderColor: colors.border }]}>
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => onConfirm(selectedDate)} style={[styles.doneButton, { backgroundColor: BRAND_GREEN }]}>
              <Text style={[styles.actionText, { color: colors.primaryText }]}>Use this date</Text>
              <Feather name="check" size={17} color={colors.primaryText} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: { paddingHorizontal: 20, paddingTop: 12, borderWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handle: { width: 36, height: 4, marginBottom: 16, borderRadius: 2, alignSelf: "center" },
  topBar: { minHeight: 54, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  titleWrap: { flex: 1, gap: 3 },
  title: { fontSize: 18, fontWeight: "700" },
  subtitle: { fontSize: 12, fontWeight: "500" },
  selectedDate: { minHeight: 34, paddingHorizontal: 10, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  selectedDateText: { fontSize: 12, fontWeight: "700" },
  monthBar: { minHeight: 46, marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthArrow: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  monthLabel: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  monthText: { fontSize: 16, fontWeight: "700" },
  yearText: { fontSize: 16, fontWeight: "800" },
  weekdays: { flexDirection: "row", marginBottom: 4 },
  weekday: { flex: 1, height: 30, textAlign: "center", textAlignVertical: "center", fontSize: 11, fontWeight: "700" },
  daysGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  dayButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 14, fontWeight: "600" },
  disabledDay: { opacity: 0.28 },
  yearScroll: { maxHeight: 310, marginBottom: 12 },
  yearGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  yearCell: { width: "30%", minHeight: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  yearCellText: { fontSize: 14, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 10, paddingTop: 8 },
  cancelButton: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  doneButton: { flex: 1.5, minHeight: 48, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  actionText: { fontSize: 14, fontWeight: "700" },
});