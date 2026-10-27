import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../../contexts/ThemeContext';

interface TrainingCalendarCardProps {
  weekLabel: string;
  rangeLabel: string;
  statusText: string;
  totalWeeks: number;
  currentWeekIndex: number;
  onPrevious: () => void;
  onNext: () => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  selectedDayLabel?: string;
  onPreviousDay?: () => void;
  onNextDay?: () => void;
  previousDayDisabled?: boolean;
  nextDayDisabled?: boolean;
}
export default function TrainingCalendarCard({ weekLabel, rangeLabel, statusText, totalWeeks, onPrevious, onNext, previousDisabled, nextDisabled, selectedDayLabel, onPreviousDay, onNextDay, previousDayDisabled, nextDayDisabled }: TrainingCalendarCardProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.topRow}>
        <Text style={[styles.title, { color: colors.text }]}>Training Calendar</Text>
        <Text style={[styles.weeksCount, { color: colors.textSecondary }]}>{totalWeeks} weeks</Text>
      </View>
      <View style={styles.mainRow}>
        <TouchableOpacity onPress={onPrevious} disabled={previousDisabled} accessibilityRole="button" accessibilityLabel="Previous week" style={[styles.navButton, { backgroundColor: colors.surfaceRaised }]}>
          <Feather name="chevron-left" size={18} color={previousDisabled ? colors.textTertiary : colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.centerContent}>
          <Text style={[styles.counterText, { color: colors.text }]}>{weekLabel}</Text>
          <Text style={[styles.rangeText, { color: colors.textSecondary }]}>{rangeLabel}</Text>
        </View>
        <TouchableOpacity onPress={onNext} disabled={nextDisabled} accessibilityRole="button" accessibilityLabel="Next week" style={[styles.navButton, { backgroundColor: colors.surfaceRaised }]}>
          <Feather name="chevron-right" size={18} color={nextDisabled ? colors.textTertiary : colors.primary} />
        </TouchableOpacity>
      </View>
      {statusText ? <Text style={[styles.statusText, { color: colors.primary }]}>{statusText}</Text> : null}
      {selectedDayLabel ? (
        <View style={[styles.daySelector, { backgroundColor: colors.surfaceRaised }]}>
          <TouchableOpacity onPress={onPreviousDay} disabled={previousDayDisabled} accessibilityRole="button" accessibilityLabel="Previous day" style={styles.dayButton}>
            <Feather name="chevron-left" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.dayLabel, { color: colors.text }]}>{selectedDayLabel}</Text>
          <TouchableOpacity onPress={onNextDay} disabled={nextDayDisabled} accessibilityRole="button" accessibilityLabel="Next day" style={styles.dayButton}>
            <Feather name="chevron-right" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, paddingHorizontal: 14, paddingTop: 13, paddingBottom: 12, borderWidth: StyleSheet.hairlineWidth, marginBottom: 4 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '700' },
  weeksCount: { fontSize: 13, fontWeight: '500' },
  mainRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  centerContent: { flex: 1, alignItems: 'center' },
  counterText: { fontSize: 16, fontWeight: '700' },
  rangeText: { fontSize: 13, marginTop: 2 },
  statusText: { fontSize: 12, marginTop: 8, textAlign: 'center' },
  daySelector: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', borderRadius: 18, marginTop: 10, minHeight: 32, paddingHorizontal: 4 },
  dayButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  dayLabel: { fontSize: 12, fontWeight: '500', paddingHorizontal: 7 },
});
