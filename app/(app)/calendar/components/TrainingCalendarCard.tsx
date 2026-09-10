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
        <TouchableOpacity onPress={previousDisabled ? undefined : onPrevious} disabled={previousDisabled} accessibilityLabel="Previous week" style={styles.navButton}><Text style={[styles.navText, { color: previousDisabled ? colors.border : colors.textSecondary }]}>‹</Text></TouchableOpacity>
        <View style={styles.centerContent}><Text style={[styles.counterText, { color: colors.text }]}>{weekLabel}</Text><Text style={[styles.rangeText, { color: colors.textSecondary }]}>{rangeLabel}</Text></View>
        <TouchableOpacity onPress={nextDisabled ? undefined : onNext} disabled={nextDisabled} accessibilityLabel="Next week" style={styles.navButton}><Text style={[styles.navText, { color: nextDisabled ? colors.border : '#22C55E' }]}>›</Text></TouchableOpacity>
      </View>
      {statusText ? <Text style={[styles.statusText, { color: colors.primary }]}>{statusText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: 'rgba(255,255,255,0.055)', borderRadius: 18, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', marginBottom: 4 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { color: '#FFF', fontSize: 19, fontWeight: '600' },
  weeksCount: { color: 'rgba(255,255,255,0.76)', fontSize: 15 },
  mainRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: { width: 30, height: 48, justifyContent: 'center', alignItems: 'center' },
  navText: { fontSize: 40, fontWeight: '300', lineHeight: 44 },
  previous: { color: 'rgba(255,255,255,0.45)' },
  next: { color: '#63C72B' },
  navDisabled: { color: 'rgba(255,255,255,0.18)' },
  centerContent: { flex: 1, alignItems: 'center' },
  counterText: { color: '#FFF', fontSize: 20, fontWeight: '600' },
  rangeText: { color: 'rgba(255,255,255,0.76)', fontSize: 15, marginTop: 2 },
  statusText: { color: '#63C72B', fontSize: 15, marginTop: 14 },
});
