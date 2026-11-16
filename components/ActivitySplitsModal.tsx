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
import { useTheme, type ThemeColors } from '../contexts/ThemeContext';
import { ActivityLapRecord, ActivitySegmentSplits, ActivitySplit } from '../src/types/activity';
import {
    formatDistanceValueFromMeters,
    formatPaceValueFromSecondsPerKm,
    formatSplitDistanceValue,
} from '../src/utils/activityUnitFormatters';
import { formatSplitTime } from '../src/utils/splitFormatters';
import { getDistanceUnitCode, getDistanceUnitDisplayLabel } from '../utils/distanceUnit';
import { RunningLoader } from './common/RunningLoader';

interface ActivitySplitsModalProps {
  visible: boolean;
  loading: boolean;
  error: string | null;
  segments: ActivitySegmentSplits[];
  laps: ActivityLapRecord[];
  extraSplits: ActivitySplit[];
  extraLaps?: ActivityLapRecord[];
  extraDistanceMeters?: number | null;
  distanceUnit?: string | null;
  onClose: () => void;
  onRetry: () => void;
}

const typePresentation = (type: string, isDark: boolean, colors: ThemeColors) =>
  type === 'EXTRA'
    ? {
      color: isDark ? '#FDA4AF' : '#B91C1C',
      backgroundColor: isDark ? '#451A24' : '#FEE2E2',
    }
    : {
      color: isDark ? '#4ADE80' : '#15803D',
      backgroundColor: colors.selected,
    };

const displayType = (type: string) => type.replace(/[-_]/g, ' ').toUpperCase();

const lapColor = (isDark: boolean, colors: ThemeColors) => isDark ? '#0A9EFF' : colors.primary;

const sumSplits = (splits: ActivitySplit[], field: 'distance_m' | 'time_s') =>
  splits.reduce((total, split) => total + (Number.isFinite(split[field]) ? split[field] : 0), 0);

const formatMetric = (value: number | undefined, formatter: (value: number) => string) =>
  value !== undefined && Number.isFinite(value) && value >= 0 ? formatter(value) : '—';

interface DisplaySegment {
  segment: ActivitySegmentSplits;
  recovery?: ActivitySegmentSplits;
}

function SegmentMetric({
  label,
  value,
  compact = false,
  highlighted = false,
  inline = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
  highlighted?: boolean;
  inline?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[
      styles.metric,
      { backgroundColor: colors.background, borderColor: colors.border },
      inline && styles.inlineMetric,
      compact && [styles.summaryMetric, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }],
      compact && highlighted && { backgroundColor: colors.selected, borderColor: colors.primary },
    ]}>
      <Text style={[styles.metricLabel, inline && styles.inlineMetricLabel, { color: compact && highlighted ? colors.primary : colors.textSecondary }]}>{label}</Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[styles.metricValue, inline && styles.inlineMetricValue, { color: colors.text }]}
      >
        {value}
      </Text>
    </View>
  );
}

export default function ActivitySplitsModal({
  visible,
  loading,
  error,
  segments,
  laps,
  extraSplits,
  extraLaps = [],
  extraDistanceMeters,
  distanceUnit,
  onClose,
  onRetry,
}: ActivitySplitsModalProps) {
  const { isDark, colors } = useTheme();
  const distanceLabel = getDistanceUnitDisplayLabel(distanceUnit);
  const splitDistanceLabel = getDistanceUnitCode(distanceUnit) === 'mile' ? 'mi' : 'km';
  const paceLabel = `min/${getDistanceUnitCode(distanceUnit) === 'mile' ? 'mi' : 'km'}`;
  const totalDistance = useMemo(() => segments.reduce((total, segment) => (
    total + (segment.completed_distance_m ?? sumSplits(segment.splits, 'distance_m'))
  ), 0) + Math.max(
    sumSplits(extraSplits, 'distance_m'),
    extraLaps.reduce((total, lap) => total + (lap.distance_m ?? 0), 0),
  ), [extraLaps, extraSplits, segments]);
  const splitExtraDistance = Math.max(
    sumSplits(extraSplits, 'distance_m'),
    extraLaps.reduce((total, lap) => total + (lap.distance_m ?? 0), 0),
  );
  const extraDistance = extraDistanceMeters !== null
    && extraDistanceMeters !== undefined
    && Number.isFinite(extraDistanceMeters)
    && extraDistanceMeters > 0
    ? extraDistanceMeters
    : splitExtraDistance;
  const hasExtraDistance = Number.isFinite(extraDistance) && extraDistance > 0;
  const allSegments = useMemo(() => {
    const hasExtraDistance = (
      Number.isFinite(extraDistanceMeters)
      && extraDistanceMeters !== null
      && extraDistanceMeters !== undefined
      && extraDistanceMeters > 0
    ) || sumSplits(extraSplits, 'distance_m') > 0 || extraLaps.length > 0;
    return [
      ...segments,
      ...(hasExtraDistance ? [{
        sequence: segments.length + 1,
        type: 'EXTRA',
        splits: extraSplits,
        completed_distance_m: (
          Number.isFinite(extraDistanceMeters) && extraDistanceMeters !== null && extraDistanceMeters !== undefined && extraDistanceMeters > 0
            ? extraDistanceMeters
            : sumSplits(extraSplits, 'distance_m') || sumSplits(extraLaps.flatMap((lap) => lap.splits ?? []), 'distance_m')
        ),
      }] : []),
    ];
  }, [extraDistanceMeters, extraLaps, extraSplits, segments]);
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
  const [collapsedLaps, setCollapsedLaps] = useState<Set<string>>(new Set());

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
            <RunningLoader size={60} fillColor={colors.primary} label="Loading splits..." />
          </View>
        ) : error ? (
          <View style={styles.state}>
            <Text style={[styles.stateText, { color: colors.textSecondary }]}>{error}</Text>
            <TouchableOpacity onPress={onRetry} style={[styles.retryButton, { backgroundColor: colors.primary }]}>
              <Text style={[styles.retryText, { color: colors.primaryText }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : allSegments.length === 0 && laps.length === 0 ? (
          <View style={styles.state}>
            <Text style={[styles.stateText, { color: colors.textSecondary }]}>No split data available for this activity.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            <View style={styles.overviewHeader}>
              <Text style={[styles.workoutTitle, { color: colors.text }]}>Workout Breakdown</Text>
              <Text style={[styles.segmentCount, { color: colors.textSecondary }]}>
                {displaySegments.length} segments{laps.length > 0 ? ` · ${laps.length} laps` : ''}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <SegmentMetric compact highlighted label={`Distance (${distanceLabel})`} value={formatDistanceValueFromMeters(totalDistance, distanceUnit)} />
              {hasExtraDistance && (
                <SegmentMetric compact label={`Extra (${distanceLabel})`} value={formatDistanceValueFromMeters(extraDistance, distanceUnit)} />
              )}
            </View>
            {displaySegments.length === 0 && laps.length > 0 && (
              <View style={[styles.segmentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.splitsTitle, { color: colors.text, marginTop: 0 }]}>Splits</Text>
                <View style={[styles.splitHeaderRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.splitHeader, styles.splitLabelColumn, { color: colors.textSecondary }]}>Lap</Text>
                  <Text style={[styles.splitHeader, styles.splitDistanceColumn, { color: colors.textSecondary }]}>Distance ({splitDistanceLabel})</Text>
                  <Text style={[styles.splitHeader, styles.splitTimeColumn, { color: colors.textSecondary }]}>Time</Text>
                  <Text style={[styles.splitHeader, styles.splitPaceColumn, { color: colors.textSecondary }]}>Pace</Text>
                  <Text style={[styles.splitHeader, styles.splitStepsColumn, { color: colors.textSecondary }]}>Steps</Text>
                </View>
                {laps.map((lap, lapIndex) => {
                  const lapKey = `unassigned-${lap.sequence}-${lapIndex}`;
                  const isCollapsed = collapsedLaps.has(lapKey);
                  return (
                    <View key={lapKey}>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`${isCollapsed ? 'Expand' : 'Collapse'} ${lap.label}`}
                        onPress={() => setCollapsedLaps((current) => {
                          const next = new Set(current);
                          if (next.has(lapKey)) next.delete(lapKey);
                          else next.add(lapKey);
                          return next;
                        })}
                        style={styles.lapRow}
                      >
                        <Text style={[styles.splitValue, styles.splitLabelColumn, styles.splitNumber, { color: lapColor(isDark, colors) }]}>{lap.label}</Text>
                        <Text style={[styles.splitValue, styles.splitDistanceColumn, { color: lapColor(isDark, colors) }]}>{formatMetric(lap.distance_m, (value) => formatDistanceValueFromMeters(value, distanceUnit))}</Text>
                        <Text style={[styles.splitValue, styles.splitTimeColumn, { color: lapColor(isDark, colors) }]}>{formatMetric(lap.time_s, formatSplitTime)}</Text>
                        <Text style={[styles.splitValue, styles.splitPaceColumn, { color: lapColor(isDark, colors) }]}>{formatMetric(lap.pace_s_per_km, (value) => formatPaceValueFromSecondsPerKm(value, distanceUnit))}</Text>
                        <Text style={[styles.splitValue, styles.splitStepsColumn, { color: lapColor(isDark, colors) }]}>{formatMetric(lap.steps ?? undefined, (value) => Math.round(value).toLocaleString())}</Text>
                        <Feather name={isCollapsed ? 'chevron-right' : 'chevron-down'} size={18} color={colors.textSecondary} />
                      </TouchableOpacity>
                      {!isCollapsed && lap.splits?.map((split, splitIndex) => (
                        <View key={`${lapKey}-split-${split.split_number}-${splitIndex}`} style={styles.nestedSplitRow}>
                          <Text style={[styles.splitValue, styles.splitLabelColumn, { color: colors.text }]}>Split {split.split_number}</Text>
                          <Text style={[styles.splitValue, styles.splitDistanceColumn, { color: colors.text }]}>{formatSplitDistanceValue(split.distance_m, distanceUnit)}</Text>
                          <Text style={[styles.splitValue, styles.splitTimeColumn, { color: colors.text }]}>{formatSplitTime(split.time_s)}</Text>
                          <Text style={[styles.splitValue, styles.splitPaceColumn, { color: colors.textSecondary }]}>{formatPaceValueFromSecondsPerKm(split.pace_s_per_km, distanceUnit)}</Text>
                          <Text style={[styles.splitValue, styles.splitStepsColumn, { color: colors.textSecondary }]}>{formatMetric(split.steps ?? undefined, (value) => Math.round(value).toLocaleString())}</Text>
                          <View style={styles.lapChevronSpacer} />
                        </View>
                      ))}
                    </View>
                  );
                })}
              </View>
            )}
            {displaySegments.map(({ segment, recovery }) => {
              const distance = segment.completed_distance_m ?? sumSplits(segment.splits, 'distance_m');
              const time = segment.actual_time_s ?? sumSplits(segment.splits, 'time_s');
              const pace = segment.actual_pace_s_per_km ?? (distance > 0 && time > 0 ? time / (distance / 1000) : undefined);
              const gpsPoints = segment.gps_points?.length;
              const typeStyle = typePresentation(segment.type, isDark, colors);
              const primarySegmentSequence = displaySegments.find(({ segment: candidate }) => (
                candidate.type === 'RUN' || candidate.type === 'WALK'
              ))?.segment.sequence ?? displaySegments[0]?.segment.sequence;
              const segmentLaps = segment.type === 'EXTRA'
                ? extraLaps
                : segment.laps?.length
                  ? segment.laps
                  : laps.filter((lap) => (
                  lap.segment_sequence === segment.sequence
                  || (lap.segment_sequence === undefined && segment.sequence === primarySegmentSequence)
                ));
              const lapRows = segmentLaps.length > 0
                ? segmentLaps.map((lap) => ({
                  ...lap,
                  splits: lap.splits?.length
                    ? lap.splits
                    : segmentLaps.length === 1
                      ? segment.splits
                      : [],
                }))
                : segment.splits.length > 0
                  ? [{
                    sequence: 1,
                    segment_sequence: segment.sequence,
                    label: 'Lap 1',
                    distance_m: distance,
                    time_s: time,
                    pace_s_per_km: pace,
                    splits: segment.splits,
                  }]
                  : [];
              return (
                <View key={`segment-${segment.sequence}-${segment.type}`} style={[styles.segmentCard, { backgroundColor: colors.surface, borderColor: isDark ? colors.surface : colors.border }]}>
                  <View style={styles.segmentHeader}>
                    <Text style={[styles.segmentTitle, { color: colors.text }]}>{segment.sequence}. {titleCase(segment.type)}</Text>
                    <Text style={[styles.segmentType, typeStyle]}>{displayType(segment.type)}</Text>
                  </View>
                  <View style={styles.segmentMetrics}>
                    <SegmentMetric inline label="Distance" value={formatDistanceValueFromMeters(distance, distanceUnit)} />
                    <SegmentMetric inline label="Planned" value={formatMetric(segment.planned_distance_m, (value) => formatDistanceValueFromMeters(value, distanceUnit))} />
                    <SegmentMetric inline label="Time" value={formatMetric(time, formatSplitTime)} />
                    <SegmentMetric inline label="Pace" value={formatMetric(pace, (value) => `${formatPaceValueFromSecondsPerKm(value, distanceUnit)} ${paceLabel}`)} />
                  </View>
                  {gpsPoints !== undefined && <Text style={[styles.gpsPoints, { color: colors.textTertiary }]}>{gpsPoints} GPS points</Text>}
                  {lapRows.length > 0 && <>
                    <Text style={[styles.splitsTitle, { color: colors.text }]}>Splits</Text>
                    <View style={[styles.splitHeaderRow, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.splitHeader, styles.splitLabelColumn, { color: colors.textSecondary }]}>Lap</Text>
                      <Text style={[styles.splitHeader, styles.splitDistanceColumn, { color: colors.textSecondary }]}>Distance ({splitDistanceLabel})</Text>
                      <Text style={[styles.splitHeader, styles.splitTimeColumn, { color: colors.textSecondary }]}>Time</Text>
                      <Text style={[styles.splitHeader, styles.splitPaceColumn, { color: colors.textSecondary }]}>Pace ({paceLabel})</Text>
                      <Text style={[styles.splitHeader, styles.splitStepsColumn, { color: colors.textSecondary }]}>Steps</Text>
                    </View>
                    {lapRows.map((lap, lapIndex) => {
                      const lapKey = `${segment.sequence}-${lap.sequence}-${lapIndex}`;
                      const isCollapsed = collapsedLaps.has(lapKey);
                      return (
                        <View key={lapKey}>
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={`${isCollapsed ? 'Expand' : 'Collapse'} ${lap.label}`}
                            onPress={() => setCollapsedLaps((current) => {
                              const next = new Set(current);
                              if (next.has(lapKey)) next.delete(lapKey);
                              else next.add(lapKey);
                              return next;
                            })}
                            style={styles.lapRow}
                          >
                            <Text style={[styles.splitValue, styles.splitLabelColumn, styles.splitNumber, { color: lapColor(isDark, colors) }]}>{lap.label}</Text>
                            <Text style={[styles.splitValue, styles.splitDistanceColumn, { color: lapColor(isDark, colors) }]}>
                              {formatMetric(lap.distance_m, (value) => formatDistanceValueFromMeters(value, distanceUnit))}
                            </Text>
                            <Text style={[styles.splitValue, styles.splitTimeColumn, { color: lapColor(isDark, colors) }]}>
                              {formatMetric(lap.time_s, formatSplitTime)}
                            </Text>
                            <Text style={[styles.splitValue, styles.splitPaceColumn, { color: lapColor(isDark, colors) }]}>
                              {formatMetric(lap.pace_s_per_km, (value) => formatPaceValueFromSecondsPerKm(value, distanceUnit))}
                            </Text>
                            <Text style={[styles.splitValue, styles.splitStepsColumn, { color: lapColor(isDark, colors) }]}>
                              {formatMetric(lap.steps ?? undefined, (value) => Math.round(value).toLocaleString())}
                            </Text>
                            <Feather name={isCollapsed ? 'chevron-right' : 'chevron-down'} size={18} color={colors.textSecondary} />
                          </TouchableOpacity>
                          {!isCollapsed && lap.splits?.map((split, splitIndex) => (
                            <View
                              key={`${lapKey}-split-${split.split_number}-${splitIndex}`}
                              style={[styles.nestedSplitRow, splitIndex < (lap.splits?.length ?? 0) - 1 && { borderBottomColor: colors.border }]}
                            >
                              <Text style={[styles.splitValue, styles.splitLabelColumn, { color: colors.text }]}>Split {split.split_number}</Text>
                              <Text style={[styles.splitValue, styles.splitDistanceColumn, { color: colors.text }]}>{formatSplitDistanceValue(split.distance_m, distanceUnit)}</Text>
                              <Text style={[styles.splitValue, styles.splitTimeColumn, { color: colors.text }]}>{formatSplitTime(split.time_s)}</Text>
                              <Text style={[styles.splitValue, styles.splitPaceColumn, { color: colors.textSecondary }]}>{formatPaceValueFromSecondsPerKm(split.pace_s_per_km, distanceUnit)}</Text>
                              <Text style={[styles.splitValue, styles.splitStepsColumn, { color: colors.textSecondary }]}>{formatMetric(split.steps ?? undefined, (value) => Math.round(value).toLocaleString())}</Text>
                              <View style={styles.lapChevronSpacer} />
                            </View>
                          ))}
                        </View>
                      );
                    })}
                  </>}
                  {recovery && <RecoveryDetails
                    recovery={recovery}
                    distanceUnit={distanceUnit}
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

function RecoveryDetails({ recovery, distanceUnit, expanded, onToggle }: { recovery: ActivitySegmentSplits; distanceUnit?: string | null; expanded: boolean; onToggle: () => void }) {
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
        <SegmentMetric label={`Distance (${getDistanceUnitDisplayLabel(distanceUnit)})`} value={formatDistanceValueFromMeters(distance, distanceUnit)} />
        <SegmentMetric label="Time" value={formatMetric(time, formatSplitTime)} />
        <SegmentMetric label={`Pace (min/${getDistanceUnitCode(distanceUnit) === 'mile' ? 'mi' : 'km'})`} value={formatMetric(pace, (value) => formatPaceValueFromSecondsPerKm(value, distanceUnit))} />
      </View>
      {recovery.gps_points?.length !== undefined && <Text style={[styles.gpsPoints, { color: colors.textTertiary }]}>{recovery.gps_points.length} GPS points</Text>}
    </View>
  );
}

const titleCase = (value: string) => value.toLowerCase().replace(/[-_]/g, ' ').replace(/(^| )([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 18 },
  header: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1 },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: 0 },
  closeButton: { position: 'absolute', right: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingTop: 20, paddingBottom: 36 },
  overviewHeader: { paddingHorizontal: 4, marginBottom: 20 },
  workoutTitle: { fontSize: 26, fontWeight: '700', letterSpacing: 0 },
  segmentCount: { fontSize: 16, marginTop: 8 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  summaryMetric: { borderRadius: 15, padding: 11, minHeight: 70 },
  lapCard: { borderRadius: 20, padding: 17, marginBottom: 16, borderWidth: 1 },
  segmentCard: { borderRadius: 20, padding: 17, marginBottom: 16, borderWidth: 1 },
  segmentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  segmentTitle: { fontSize: 22, fontWeight: '700', flex: 1, letterSpacing: 0 },
  segmentType: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden' },
  segmentMetrics: { flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'space-between', columnGap: 8, marginTop: 16 },
  metric: { flexGrow: 1, flexShrink: 1, flexBasis: '46%', minWidth: 0, borderRadius: 12, borderWidth: 1, padding: 8 },
  metricLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0 },
  metricValue: { fontSize: 13, fontWeight: '600', marginTop: 3, letterSpacing: 0 },
  inlineMetric: { flex: 1, flexGrow: 1, flexBasis: 0, minWidth: 0, backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0, padding: 0 },
  inlineMetricLabel: { fontSize: 12, fontWeight: '400' },
  inlineMetricValue: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  gpsPoints: { fontSize: 14, marginTop: 18 },
  splitsTitle: { fontSize: 21, fontWeight: '700', marginTop: 23, marginBottom: 10 },
  splitHeaderRow: { flexDirection: 'row', alignItems: 'center', minHeight: 34, borderBottomWidth: 1 },
  splitHeader: { fontSize: 11, fontWeight: '700', letterSpacing: 0.15, textAlign: 'right' },
  splitRow: { flexDirection: 'row', alignItems: 'center', minHeight: 40, borderBottomWidth: StyleSheet.hairlineWidth },
  lapRow: { flexDirection: 'row', alignItems: 'center', minHeight: 40, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128, 128, 128, 0.2)' },
  nestedSplitRow: { flexDirection: 'row', alignItems: 'center', minHeight: 26, paddingLeft: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  lapChevronSpacer: { width: 18, marginLeft: 4 },
  splitValue: { fontSize: 13, fontWeight: '500', textAlign: 'right' },
  splitLabelColumn: { flex: 0.8, textAlign: 'left' },
  splitDistanceColumn: { flex: 1.05 },
  splitTimeColumn: { flex: 0.8 },
  splitPaceColumn: { flex: 1.35 },
  splitStepsColumn: { flex: 0.7 },
  splitNumber: { fontWeight: '700' },
  recoveryDetails: { borderTopWidth: 1, marginTop: 20, paddingTop: 4 },
  recoveryButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recoveryLabel: { fontSize: 17, fontWeight: '600' },
  recoveryMetrics: { flexDirection: 'row', marginTop: 12, columnGap: 16 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  stateText: { fontSize: 16, textAlign: 'center', marginTop: 13 },
  retryButton: { borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, marginTop: 18 },
  retryText: { fontSize: 16, fontWeight: '700' },
});
