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
}
export default function TrainingCalendarCard({ weekLabel, rangeLabel, statusText, totalWeeks, onPrevious, onNext, previousDisabled, nextDisabled }: TrainingCalendarCardProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.topRow}><Text style={[styles.title, { color: colors.text }]}>Training Calendar</Text><Text style={[styles.weeksCount, { color: colors.textSecondary }]}>{totalWeeks} weeks</Text></View>
      <View style={styles.mainRow}>
        <TouchableOpacity onPress={previousDisabled ? undefined : onPrevious} disabled={previousDisabled} accessibilityRole="button" accessibilityLabel="Previous week" style={styles.navButton}><Text style={[styles.navText, { color: previousDisabled ? colors.border : colors.textSecondary }]}>‹</Text></TouchableOpacity>
        <View style={styles.centerContent}><Text style={[styles.counterText, { color: colors.text }]}>{weekLabel}</Text><Text style={[styles.rangeText, { color: colors.textSecondary }]}>{rangeLabel}</Text></View>
        <TouchableOpacity onPress={nextDisabled ? undefined : onNext} disabled={nextDisabled} accessibilityRole="button" accessibilityLabel="Next week" style={styles.navButton}><Text style={[styles.navText, { color: nextDisabled ? colors.border : colors.primary }]}>›</Text></TouchableOpacity>
      </View>
      {statusText ? <Text style={[styles.statusText, { color: colors.primary }]}>{statusText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 20, borderWidth: 1, marginBottom: 4 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 19, fontWeight: '600' },
  weeksCount: { fontSize: 15 },
  mainRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: { width: 30, height: 48, justifyContent: 'center', alignItems: 'center' },
  navText: { fontSize: 40, fontWeight: '300', lineHeight: 44 },
  centerContent: { flex: 1, alignItems: 'center' },
  counterText: { fontSize: 20, fontWeight: '600' },
  rangeText: { fontSize: 15, marginTop: 2 },
  statusText: { fontSize: 15, marginTop: 14 },
});
