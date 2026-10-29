import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
    Modal,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RunningLoader } from './common/RunningLoader';
import { useTheme } from '../contexts/ThemeContext';
import { ActivitySegmentSplits, ActivitySplit } from '../src/types/activity';
import { formatPace, formatSplitDistance, formatSplitTime } from '../src/utils/splitFormatters';

interface ActivitySplitsModalProps {
  visible: boolean;
  loading: boolean;
  error: string | null;
  segments: ActivitySegmentSplits[];
  extraSplits: ActivitySplit[];
  onClose: () => void;
  onRetry: () => void;
}

const typeColor = (type: string, isDark: boolean) =>
  type === 'EXTRA'
    ? (isDark ? '#FF6B6B' : '#DC2626')
    : (isDark ? '#35D05B' : '#16A34A');

const displayType = (type: string) => type.replace(/[-_]/g, ' ').toUpperCase();

const sumSplits = (splits: ActivitySplit[], field: 'distance_m' | 'time_s') =>
  splits.reduce((total, split) => total + (Number.isFinite(split[field]) ? split[field] : 0), 0);

const formatMetric = (value: number | undefined, formatter: (value: number) => string) =>
  value !== undefined && Number.isFinite(value) && value >= 0 ? formatter(value) : '—';

interface DisplaySegment {
  segment: ActivitySegmentSplits;
  recovery?: ActivitySegmentSplits;
}

function SegmentMetric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[
      styles.metric,
      compact && [styles.summaryMetric, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }],
    ]}>
      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

export default function ActivitySplitsModal({
  visible,
  loading,
  error,
  segments,
  extraSplits,
  onClose,
  onRetry,
}: ActivitySplitsModalProps) {
  const { isDark, colors } = useTheme();
  const totalDistance = useMemo(() => segments.reduce((total, segment) => (
    total + (segment.completed_distance_m ?? sumSplits(segment.splits, 'distance_m'))
  ), 0) + sumSplits(extraSplits, 'distance_m'), [extraSplits, segments]);
  const plannedDistance = useMemo(() => segments.reduce((total, segment) => total + (segment.planned_distance_m ?? 0), 0), [segments]);
  const extraDistance = sumSplits(extraSplits, 'distance_m');
  const allSegments = useMemo(() => [
    ...segments,
    ...(extraSplits.length > 0 ? [{
      sequence: segments.length + 1,
      type: 'EXTRA',
      splits: extraSplits,
      completed_distance_m: sumSplits(extraSplits, 'distance_m'),
    }] : []),
  ], [extraSplits, segments]);
  const displaySegments = useMemo<DisplaySegment[]>(() => {
    const grouped: DisplaySegment[] = [];
    allSegments.forEach((segment) => {
      const previous = grouped.at(-1);
      const isRecovery = ['RECOVERY', 'REST'].includes(segment.type.replace(/[-_ ]/g, '').toUpperCase());
      if (isRecovery && previous?.segment.type === 'RUN') previous.recovery = segment;
      else grouped.push({ segment, recovery: segment.recovery });
    });
    return grouped;
  }, [allSegments]);
  const [expandedRecovery, setExpandedRecovery] = useState<Set<string>>(new Set());

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Breakdown</Text>
          <TouchableOpacity accessibilityLabel="Close split details" onPress={onClose} style={styles.closeButton}>
            <Feather name="x" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.state}>
            <RunningLoader size={60} label="Loading splits..." />
          </View>
        ) : error ? (
          <View style={styles.state}>
            <Text style={[styles.stateText, { color: colors.textSecondary }]}>{error}</Text>
            <TouchableOpacity onPress={onRetry} style={[styles.retryButton, { backgroundColor: colors.primary }]}>
              <Text style={[styles.retryText, { color: colors.primaryText }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : allSegments.length === 0 ? (
          <View style={styles.state}>
            <Text style={[styles.stateText, { color: colors.textSecondary }]}>No split data available for this activity.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            <View style={styles.overviewHeader}>
              <Text style={[styles.workoutTitle, { color: colors.text }]}>Workout Breakdown</Text>
              <Text style={[styles.segmentCount, { color: colors.textSecondary }]}>{displaySegments.length} segments</Text>
            </View>
            <View style={styles.summaryRow}>
              <SegmentMetric compact label="Distance" value={formatDistance(totalDistance)} />
              <SegmentMetric compact label="Planned" value={formatDistance(plannedDistance || undefined)} />
              <SegmentMetric compact label="Extra" value={formatDistance(extraDistance || undefined)} />
            </View>
            {displaySegments.map(({ segment, recovery }) => {
              const distance = segment.completed_distance_m ?? sumSplits(segment.splits, 'distance_m');
              const time = segment.actual_time_s ?? sumSplits(segment.splits, 'time_s');
              const pace = segment.actual_pace_s_per_km ?? (distance > 0 && time > 0 ? time / (distance / 1000) : undefined);
              const gpsPoints = segment.gps_points?.length;
              return (
                <View key={`segment-${segment.sequence}-${segment.type}`} style={[styles.segmentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.segmentHeader}>
                    <Text style={[styles.segmentTitle, { color: colors.text }]}>{segment.sequence}. {titleCase(segment.type)}</Text>
                    <Text style={[styles.segmentType, { color: typeColor(segment.type, isDark) }]}>{displayType(segment.type)}</Text>
                  </View>
                  <View style={styles.segmentMetrics}>
                    <SegmentMetric label="Distance" value={formatDistance(distance)} />
                    <SegmentMetric label="Planned" value={formatDistance(segment.planned_distance_m)} />
                    <SegmentMetric label="Time" value={formatMetric(time, formatSplitTime)} />
                    <SegmentMetric label="Pace" value={formatMetric(pace, formatPace)} />
                  </View>
                  {gpsPoints !== undefined && <Text style={[styles.gpsPoints, { color: colors.textTertiary }]}>{gpsPoints} GPS points</Text>}
                  {segment.splits.length > 0 && <>
                    <Text style={[styles.splitsTitle, { color: colors.text }]}>Splits</Text>
                    {segment.splits.map((split) => (
                      <View key={`${segment.sequence}-${split.split_number}`} style={styles.splitRow}>
                        <Text style={[styles.splitLabel, { color: colors.text }]}>Split {split.split_number}</Text>
                        <Text style={[styles.splitValue, { color: colors.text }]}>{formatSplitDistance(split.distance_m)}</Text>
                        <Text style={[styles.splitValue, { color: colors.text }]}>{formatSplitTime(split.time_s)}</Text>
                        <Text style={[styles.splitValue, styles.paceValue, { color: colors.textSecondary }]}>{formatPace(split.pace_s_per_km)}</Text>
                      </View>
                    ))}
                  </>}
                  {recovery && <RecoveryDetails
                    recovery={recovery}
                    expanded={expandedRecovery.has(String(recovery.id ?? recovery.sequence))}
                    onToggle={() => setExpandedRecovery((current) => {
                      const key = String(recovery.id ?? recovery.sequence);
                      const next = new Set(current);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })}
                  />}
                </View>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function RecoveryDetails({ recovery, expanded, onToggle }: { recovery: ActivitySegmentSplits; expanded: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  if (!expanded) {
    return (
      <TouchableOpacity style={styles.recoveryButton} onPress={onToggle} accessibilityRole="button">
        <Text style={[styles.recoveryLabel, { color: colors.text }]}>Recovery</Text>
        <Feather name="chevron-right" size={22} color={colors.textSecondary} />
      </TouchableOpacity>
    );
  }

  const distance = recovery.completed_distance_m;
  const time = recovery.actual_time_s;
  const pace = recovery.actual_pace_s_per_km ?? (distance && time ? time / (distance / 1000) : undefined);
  return (
    <View style={[styles.recoveryDetails, { borderTopColor: colors.border }]}>
      <TouchableOpacity style={styles.recoveryButton} onPress={onToggle} accessibilityRole="button">
        <Text style={[styles.recoveryLabel, { color: colors.text }]}>Recovery</Text>
        <Feather name="chevron-down" size={22} color={colors.textSecondary} />
      </TouchableOpacity>
      <View style={styles.recoveryMetrics}>
        <SegmentMetric label="Distance" value={formatDistance(distance)} />
        <SegmentMetric label="Time" value={formatMetric(time, formatSplitTime)} />
        <SegmentMetric label="Pace" value={formatMetric(pace, formatPace)} />
      </View>
      {recovery.gps_points?.length !== undefined && <Text style={[styles.gpsPoints, { color: colors.textTertiary }]}>{recovery.gps_points.length} GPS points</Text>}
    </View>
  );
}

const titleCase = (value: string) => value.toLowerCase().replace(/[-_]/g, ' ').replace(/(^| )([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
const formatDistance = (meters: number | undefined) => formatMetric(meters, (value) => formatSplitDistance(value));

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 18 },
  header: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: 0 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingTop: 20, paddingBottom: 36 },
  overviewHeader: { paddingHorizontal: 4, marginBottom: 20 },
  workoutTitle: { fontSize: 26, fontWeight: '700', letterSpacing: 0 },
  segmentCount: { fontSize: 16, marginTop: 8 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  summaryMetric: { borderRadius: 18, padding: 16, minHeight: 88 },
  segmentCard: { borderRadius: 22, padding: 20, marginBottom: 20, borderWidth: 1 },
  segmentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  segmentTitle: { fontSize: 22, fontWeight: '700', flex: 1, letterSpacing: 0 },
  segmentType: { fontSize: 15, fontWeight: '700', letterSpacing: 0 },
  segmentMetrics: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 20, rowGap: 16 },
  metric: { flex: 1, minWidth: '24%' },
  metricLabel: { fontSize: 14, letterSpacing: 0 },
  metricValue: { fontSize: 17, fontWeight: '700', marginTop: 5, letterSpacing: 0 },
  gpsPoints: { fontSize: 14, marginTop: 18 },
  splitsTitle: { fontSize: 22, fontWeight: '700', marginTop: 24, marginBottom: 12 },
  splitRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, minHeight: 28 },
  splitLabel: { fontSize: 15, flex: 1.45 },
  splitValue: { fontSize: 15, flex: 0.8, textAlign: 'right' },
  paceValue: { flex: 1.2 },
  recoveryDetails: { borderTopWidth: 1, marginTop: 20, paddingTop: 4 },
  recoveryButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recoveryLabel: { fontSize: 17, fontWeight: '600' },
  recoveryMetrics: { flexDirection: 'row', marginTop: 12, columnGap: 16 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  stateText: { fontSize: 16, textAlign: 'center', marginTop: 13 },
  retryButton: { borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, marginTop: 18 },
  retryText: { fontSize: 16, fontWeight: '700' },
});