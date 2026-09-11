import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
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

const typeColor = (type: string) => type === 'EXTRA' ? '#FF4D55' : '#35D05B';

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
  return <View style={[styles.metric, compact && styles.summaryMetric]}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
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
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#090C0D" />
        <View style={styles.header}>
          <Text style={styles.title}>Breakdown</Text>
          <TouchableOpacity accessibilityLabel="Close split details" onPress={onClose} style={styles.closeButton}>
            <Feather name="x" size={22} color="#F7F7F7" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.state}>
            <ActivityIndicator size="large" color="#35C72B" />
            <Text style={styles.stateText}>Loading splits...</Text>
          </View>
        ) : error ? (
          <View style={styles.state}>
            <Text style={styles.stateText}>{error}</Text>
            <TouchableOpacity onPress={onRetry} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : allSegments.length === 0 ? (
          <View style={styles.state}>
            <Text style={styles.stateText}>No split data available for this activity.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            <View style={styles.overviewHeader}>
              <Text style={styles.workoutTitle}>Workout Breakdown</Text>
              <Text style={styles.segmentCount}>{displaySegments.length} segments</Text>
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
                <View key={`segment-${segment.sequence}-${segment.type}`} style={styles.segmentCard}>
                  <View style={styles.segmentHeader}>
                    <Text style={styles.segmentTitle}>{segment.sequence}. {titleCase(segment.type)}</Text>
                    <Text style={[styles.segmentType, { color: typeColor(segment.type) }]}>{displayType(segment.type)}</Text>
                  </View>
                  <View style={styles.segmentMetrics}>
                    <SegmentMetric label="Distance" value={formatDistance(distance)} />
                    <SegmentMetric label="Planned" value={formatDistance(segment.planned_distance_m)} />
                    <SegmentMetric label="Time" value={formatMetric(time, formatSplitTime)} />
                    <SegmentMetric label="Pace" value={formatMetric(pace, formatPace)} />
                  </View>
                  {gpsPoints !== undefined && <Text style={styles.gpsPoints}>{gpsPoints} GPS points</Text>}
                  {segment.splits.length > 0 && <>
                    <Text style={styles.splitsTitle}>Splits</Text>
                    {segment.splits.map((split) => <View key={`${segment.sequence}-${split.split_number}`} style={styles.splitRow}>
                      <Text style={styles.splitLabel}>Split {split.split_number}</Text>
                      <Text style={styles.splitValue}>{formatSplitDistance(split.distance_m)}</Text>
                      <Text style={styles.splitValue}>{formatSplitTime(split.time_s)}</Text>
                      <Text style={[styles.splitValue, styles.paceValue]}>{formatPace(split.pace_s_per_km)}</Text>
                    </View>)}
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
      </View>
    </Modal>
  );
}

function RecoveryDetails({ recovery, expanded, onToggle }: { recovery: ActivitySegmentSplits; expanded: boolean; onToggle: () => void }) {
  if (!expanded) {
    return <TouchableOpacity style={styles.recoveryButton} onPress={onToggle} accessibilityRole="button">
      <Text style={styles.recoveryLabel}>Recovery</Text>
      <Feather name="chevron-right" size={22} color="#A9ADAF" />
    </TouchableOpacity>;
  }

  const distance = recovery.completed_distance_m;
  const time = recovery.actual_time_s;
  const pace = recovery.actual_pace_s_per_km ?? (distance && time ? time / (distance / 1000) : undefined);
  return <View style={styles.recoveryDetails}>
    <TouchableOpacity style={styles.recoveryButton} onPress={onToggle} accessibilityRole="button">
      <Text style={styles.recoveryLabel}>Recovery</Text>
      <Feather name="chevron-down" size={22} color="#A9ADAF" />
    </TouchableOpacity>
    <View style={styles.recoveryMetrics}>
      <SegmentMetric label="Distance" value={formatDistance(distance)} />
      <SegmentMetric label="Time" value={formatMetric(time, formatSplitTime)} />
      <SegmentMetric label="Pace" value={formatMetric(pace, formatPace)} />
    </View>
    {recovery.gps_points?.length !== undefined && <Text style={styles.gpsPoints}>{recovery.gps_points.length} GPS points</Text>}
  </View>;
}

const titleCase = (value: string) => value.toLowerCase().replace(/[-_]/g, ' ').replace(/(^| )([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
const formatDistance = (meters: number | undefined) => formatMetric(meters, (value) => formatSplitDistance(value));

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090C0D', paddingHorizontal: 18 },
  header: { height: 86, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#202527' },
  title: { color: '#F7F7F7', fontSize: 30, fontWeight: '700', letterSpacing: 0 },
  closeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingTop: 26, paddingBottom: 36 },
  overviewHeader: { paddingHorizontal: 4, marginBottom: 24 },
  workoutTitle: { color: '#F7F7F7', fontSize: 29, fontWeight: '700', letterSpacing: 0 },
  segmentCount: { color: '#A9ADAF', fontSize: 18, marginTop: 18 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  summaryMetric: { backgroundColor: '#1A1F21', borderRadius: 18, padding: 16, minHeight: 92 },
  segmentCard: { backgroundColor: '#1A1F21', borderRadius: 22, padding: 22, marginBottom: 20, borderWidth: 1, borderColor: '#202628' },
  segmentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  segmentTitle: { color: '#F7F7F7', fontSize: 25, fontWeight: '700', flex: 1, letterSpacing: 0 },
  segmentType: { fontSize: 16, fontWeight: '700', letterSpacing: 0 },
  segmentMetrics: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 24, rowGap: 20 },
  metric: { flex: 1, minWidth: '24%' },
  metricLabel: { color: '#A9ADAF', fontSize: 15, letterSpacing: 0 },
  metricValue: { color: '#F7F7F7', fontSize: 18, fontWeight: '700', marginTop: 6, letterSpacing: 0 },
  gpsPoints: { color: '#A9ADAF', fontSize: 15, marginTop: 22 },
  splitsTitle: { color: '#F7F7F7', fontSize: 24, fontWeight: '700', marginTop: 26, marginBottom: 12 },
  splitRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, minHeight: 28 },
  splitLabel: { color: '#F7F7F7', fontSize: 16, flex: 1.45 },
  splitValue: { color: '#F7F7F7', fontSize: 16, flex: 0.8, textAlign: 'right' },
  paceValue: { flex: 1.2 },
  recoveryDetails: { borderTopWidth: 1, borderTopColor: '#393C3E', marginTop: 24, paddingTop: 4 },
  recoveryButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recoveryLabel: { color: '#F7F7F7', fontSize: 19, fontWeight: '600' },
  recoveryMetrics: { flexDirection: 'row', marginTop: 12, columnGap: 16 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  stateText: { color: '#C4C8C5', fontSize: 16, textAlign: 'center', marginTop: 13 },
  retryButton: { backgroundColor: '#35C72B', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, marginTop: 18 },
  retryText: { color: '#0B0E0F', fontSize: 16, fontWeight: '700' },
});