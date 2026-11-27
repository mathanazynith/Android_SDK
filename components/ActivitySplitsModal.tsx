import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { ActivityLapRecord, ActivitySegmentSplits, ActivitySplit } from '../src/types/activity';
import {
  formatActivityDistanceValueFromMeters,
  formatDistanceValueFromMeters,
  formatPaceValueFromSecondsPerKm,
  formatSplitDistanceValue,
} from '../src/utils/activityUnitFormatters';
import { formatDurationHhMmSs, formatSplitTime } from '../src/utils/splitFormatters';
import { getDistanceUnitCode, getDistanceUnitDisplayLabel } from '../utils/distanceUnit';
import { RunningLoader } from './common/RunningLoader';
import OriginZoomModal from './navigation/OriginZoomModal';
import type { DashboardLaunchOrigin } from './navigation/dashboardLaunchTransition';

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
  launchOrigin?: DashboardLaunchOrigin;
  onExitComplete?: () => void;
}

const sumSplits = (splits: ActivitySplit[], field: 'distance_m' | 'time_s') =>
  splits.reduce((total, split) => total + (Number.isFinite(split[field]) ? split[field] : 0), 0);

const positiveOrFallback = (primary: number | null | undefined, fallback: number) =>
  primary !== null && primary !== undefined && Number.isFinite(primary) && primary > 0 ? primary : fallback;

const getSegmentDistance = (segment: ActivitySegmentSplits) => positiveOrFallback(
  segment.completed_distance_m,
  positiveOrFallback(
    segment.laps?.reduce((total, lap) => total + (lap.distance_m ?? 0), 0),
    sumSplits(segment.splits, 'distance_m'),
  ),
);

const getSegmentTime = (segment: ActivitySegmentSplits) => positiveOrFallback(
  segment.actual_time_s,
  positiveOrFallback(
    segment.laps?.reduce((total, lap) => total + (lap.time_s ?? 0), 0),
    sumSplits(segment.splits, 'time_s'),
  ),
);

const formatMetric = (value: number | undefined, formatter: (value: number) => string) =>
  value !== undefined && Number.isFinite(value) && value >= 0 ? formatter(value) : '—';

const formatSegmentDistance = (meters: number | null | undefined, distanceUnit?: string | null) => {
  return formatActivityDistanceValueFromMeters(meters, distanceUnit);
};

interface DisplaySegment {
  segment: ActivitySegmentSplits;
  recovery?: ActivitySegmentSplits;
}

interface DisplayLap extends ActivityLapRecord {
  key: string;
  groupLabel: string;
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

function LapTable({
  laps,
  selectedLapKey,
  onSelectLap,
  distanceUnit,
}: {
  laps: DisplayLap[];
  selectedLapKey: string | null;
  onSelectLap: (key: string | null) => void;
  distanceUnit?: string | null;
}) {
  const { colors } = useTheme();
  if (laps.length === 0) return null;
  const splitDistanceLabel = getDistanceUnitCode(distanceUnit) === 'mile' ? 'mi' : 'km';
  const paceLabel = `min/${getDistanceUnitCode(distanceUnit) === 'mile' ? 'mi' : 'km'}`;
  const totalDistance = laps.reduce((sum, lap) => sum + (lap.distance_m ?? 0), 0);
  const totalTime = laps.reduce((sum, lap) => sum + (lap.time_s ?? 0), 0);
  const averagePace = totalDistance > 0 ? totalTime / (totalDistance / 1000) : undefined;
  const totalSteps = laps.reduce((sum, lap) => sum + (lap.steps ?? 0), 0);
  const cadenceEntries = laps.map((lap) => lap.cadence_spm).filter((value): value is number => Number.isFinite(value));
  const averageCadence = cadenceEntries.length > 0
    ? cadenceEntries.reduce((sum, cadence) => sum + cadence, 0) / cadenceEntries.length
    : undefined;
  return (
    <View style={[styles.tableCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.tableTitleRow}>
        <View>
          <Text style={[styles.tableTitle, { color: colors.text }]}>Laps</Text>
          <Text style={[styles.tableHint, { color: colors.textSecondary }]}>Tap a lap to view its splits</Text>
        </View>
      </View>
      <View style={[styles.tableHeaderRow, { borderBottomColor: colors.border }]}>
        <Text style={[styles.tableHead, styles.lapColumn, { color: colors.textSecondary }]}>Lap</Text>
        <Text style={[styles.tableHead, styles.timeColumn, { color: colors.textSecondary }]}>Time{'\n'}(s)</Text>
        <Text style={[styles.tableHead, styles.distanceColumn, { color: colors.textSecondary }]}>Distance{'\n'}({splitDistanceLabel})</Text>
        <Text style={[styles.tableHead, styles.paceColumn, { color: colors.textSecondary }]}>Avg pace{'\n'}({paceLabel})</Text>
        <Text style={[styles.tableHead, styles.stepsColumn, { color: colors.textSecondary }]}>Steps</Text>
        <Text style={[styles.tableHead, styles.cadenceColumn, { color: colors.textSecondary }]}>Cadence{'\n'}(spm)</Text>
      </View>
      {laps.map((lap, index) => {
        const selected = lap.key === selectedLapKey;
        return (
          <View key={lap.key} style={[styles.tableEntry, { backgroundColor: selected ? colors.selected : index % 2 === 0 ? colors.background : 'transparent', borderBottomColor: colors.border }]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`View splits for ${lap.label || `Lap ${lap.sequence}`}`}
              onPress={() => onSelectLap(selected ? null : lap.key)}
              style={styles.tableMainRow}
            >
              <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tableCell, styles.lapColumn, styles.lapName, { color: selected ? colors.primary : colors.text }]}>{lap.sequence}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tableCell, styles.timeColumn, { color: colors.text }]}>{formatMetric(lap.time_s, formatSplitTime)}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tableCell, styles.distanceColumn, { color: colors.text }]}>{formatMetric(lap.distance_m, (value) => formatDistanceValueFromMeters(value, distanceUnit))}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tableCell, styles.paceColumn, { color: colors.text }]}>{formatMetric(lap.pace_s_per_km, (value) => formatPaceValueFromSecondsPerKm(value, distanceUnit))}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tableCell, styles.stepsColumn, { color: colors.text }]}>{formatMetric(lap.steps ?? undefined, (value) => Math.round(value).toLocaleString())}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tableCell, styles.cadenceColumn, { color: colors.text }]}>{formatMetric(lap.cadence_spm ?? undefined, (value) => `${Math.round(value)}`)}</Text>
            </TouchableOpacity>
            {selected ? (
              <View style={[styles.inlineSplitPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <SplitsTable lap={lap} distanceUnit={distanceUnit} embedded />
              </View>
            ) : null}
          </View>
        );
      })}
      <View style={[styles.tableTotalRow, { borderTopColor: colors.border }]}>
        <Text style={[styles.tableCell, styles.lapColumn, styles.lapName, { color: colors.text }]}>Total</Text>
        <Text style={[styles.tableCell, styles.timeColumn, styles.lapName, { color: colors.text }]}>{formatMetric(totalTime, formatSplitTime)}</Text>
        <Text style={[styles.tableCell, styles.distanceColumn, styles.lapName, { color: colors.text }]}>{formatDistanceValueFromMeters(totalDistance, distanceUnit)}</Text>
        <Text style={[styles.tableCell, styles.paceColumn, styles.lapName, { color: colors.text }]}>{formatMetric(averagePace, (value) => formatPaceValueFromSecondsPerKm(value, distanceUnit))}</Text>
        <Text style={[styles.tableCell, styles.stepsColumn, styles.lapName, { color: colors.text }]}>{formatMetric(totalSteps, (value) => Math.round(value).toLocaleString())}</Text>
        <Text style={[styles.tableCell, styles.cadenceColumn, styles.lapName, { color: colors.text }]}>{formatMetric(averageCadence, (value) => `${Math.round(value)}`)}</Text>
      </View>
    </View>
  );
}

function SplitsTable({ lap, distanceUnit, embedded = false }: { lap: DisplayLap; distanceUnit?: string | null; embedded?: boolean }) {
  const { colors } = useTheme();
  const splitDistanceLabel = getDistanceUnitCode(distanceUnit) === 'mile' ? 'mi' : 'km';
  const paceLabel = `min/${getDistanceUnitCode(distanceUnit) === 'mile' ? 'mi' : 'km'}`;
  return (
    <View style={[
      styles.tableCard,
      embedded && styles.embeddedSplitTable,
      { backgroundColor: colors.surface, borderColor: colors.border },
    ]}>
      <View style={[styles.tableTitleRow, embedded && styles.embeddedSplitTitleRow]}>
        <View>
          <Text style={[styles.tableTitle, embedded && styles.embeddedSplitTitle, { color: colors.text }]}>Splits - {lap.label || `Lap ${lap.sequence}`}</Text>
          <Text style={[styles.tableHint, embedded && styles.embeddedSplitHint, { color: colors.textSecondary }]}>{lap.splits?.length ?? 0} splits for this lap</Text>
        </View>
        <Feather name="activity" size={19} color={colors.primary} />
      </View>
      <View style={[styles.tableHeaderRow, { borderBottomColor: colors.border }]}>
        <Text style={[styles.tableHead, styles.lapColumn, { color: colors.textSecondary }]}>Split</Text>
        <Text style={[styles.tableHead, styles.timeColumn, { color: colors.textSecondary }]}>Time{'\n'}(s)</Text>
        <Text style={[styles.tableHead, styles.distanceColumn, { color: colors.textSecondary }]}>Distance{'\n'}({splitDistanceLabel})</Text>
        <Text style={[styles.tableHead, styles.paceColumn, { color: colors.textSecondary }]}>Avg pace{'\n'}({paceLabel})</Text>
        <Text style={[styles.tableHead, styles.stepsColumn, { color: colors.textSecondary }]}>Steps</Text>
        <Text style={[styles.tableHead, styles.cadenceColumn, { color: colors.textSecondary }]}>Cadence{'\n'}(spm)</Text>
      </View>
      {lap.splits?.length ? lap.splits.map((split, index) => (
        <View key={`${lap.key}-split-${split.split_number}-${index}`} style={[styles.tableEntry, { backgroundColor: index % 2 === 0 ? colors.background : 'transparent', borderBottomColor: colors.border }]}>
          <View style={styles.tableMainRow}>
            <Text numberOfLines={1} style={[styles.tableCell, styles.lapColumn, styles.lapName, { color: colors.primary }]}>{split.split_number}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tableCell, styles.timeColumn, { color: colors.text }]}>{formatSplitTime(split.time_s)}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tableCell, styles.distanceColumn, { color: colors.text }]}>{formatSplitDistanceValue(split.distance_m, distanceUnit)}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tableCell, styles.paceColumn, { color: colors.text }]}>{formatPaceValueFromSecondsPerKm(split.pace_s_per_km, distanceUnit)}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tableCell, styles.stepsColumn, { color: colors.text }]}>{formatMetric(split.steps ?? undefined, (value) => Math.round(value).toLocaleString())}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tableCell, styles.cadenceColumn, { color: colors.text }]}>{formatMetric(split.cadence_spm ?? split.average_spm ?? undefined, (value) => `${Math.round(value)}`)}</Text>
          </View>
        </View>
      )) : <Text style={[styles.noSplits, { color: colors.textSecondary }]}>No split details were recorded for this lap.</Text>}
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
  launchOrigin,
  onExitComplete,
}: ActivitySplitsModalProps) {
  const { isDark, colors } = useTheme();
  const distanceLabel = getDistanceUnitDisplayLabel(distanceUnit);
  const paceLabel = `min/${getDistanceUnitCode(distanceUnit) === 'mile' ? 'mi' : 'km'}`;
  const totalDistance = useMemo(() => segments.reduce((total, segment) => (
    total + getSegmentDistance(segment)
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
  const lapEntries = useMemo<DisplayLap[]>(() => {
    const workoutSegments = displaySegments
      .map(({ segment }) => segment)
      .filter((segment) => segment.type !== 'EXTRA');
    const primarySegmentSequence = workoutSegments.find((segment) => (
      segment.type === 'RUN' || segment.type === 'WALK'
    ))?.sequence ?? workoutSegments[0]?.sequence;
    const entries: DisplayLap[] = [];

    if (workoutSegments.length === 0) {
      laps.forEach((lap, index) => entries.push({
        ...lap,
        key: `activity-lap-${lap.sequence}-${index}`,
        groupLabel: 'Workout',
      }));
    }

    workoutSegments.forEach((segment) => {
      const segmentLaps = segment.laps?.length
        ? segment.laps
        : laps.filter((lap) => (
          lap.segment_sequence === segment.sequence
          || (lap.segment_sequence === undefined && segment.sequence === primarySegmentSequence)
        ));
      const distance = getSegmentDistance(segment);
      const time = getSegmentTime(segment);
      const pace = segment.actual_pace_s_per_km ?? (distance > 0 && time > 0 ? time / (distance / 1000) : undefined);
      if (segmentLaps.length > 0) {
        segmentLaps.forEach((lap, index) => entries.push({
          ...lap,
          splits: lap.splits?.length ? lap.splits : segmentLaps.length === 1 ? segment.splits : [],
          key: `segment-${segment.sequence}-lap-${lap.sequence}-${index}`,
          groupLabel: `${segment.sequence}. ${titleCase(segment.type)}`,
        }));
      } else if (segment.splits.length > 0) {
        entries.push({
          sequence: 1,
          segment_sequence: segment.sequence,
          label: 'Lap 1',
          distance_m: distance,
          time_s: time,
          pace_s_per_km: pace,
          splits: segment.splits,
          key: `segment-${segment.sequence}-lap-1`,
          groupLabel: `${segment.sequence}. ${titleCase(segment.type)}`,
        });
      }
    });

    displaySegments
      .map(({ segment }) => segment)
      .filter((segment) => segment.type === 'EXTRA')
      .forEach((segment) => {
        const segmentLaps = extraLaps.length > 0 ? extraLaps : segment.laps ?? [];
        const distance = getSegmentDistance(segment);
        const time = getSegmentTime(segment);
        const pace = segment.actual_pace_s_per_km ?? (distance > 0 && time > 0 ? time / (distance / 1000) : undefined);
        if (segmentLaps.length > 0) {
          segmentLaps.forEach((lap, index) => entries.push({
            ...lap,
            splits: lap.splits?.length ? lap.splits : segmentLaps.length === 1 ? segment.splits : [],
            key: `extra-${segment.sequence}-lap-${lap.sequence}-${index}`,
            groupLabel: 'Extra distance',
          }));
        } else if (segment.splits.length > 0) {
          entries.push({
            sequence: 1,
            segment_sequence: segment.sequence,
            label: 'Lap 1',
            distance_m: distance,
            time_s: time,
            pace_s_per_km: pace,
            splits: segment.splits,
            key: `extra-${segment.sequence}-lap-1`,
            groupLabel: 'Extra distance',
          });
        }
      });

    return entries;
  }, [displaySegments, extraLaps, laps]);
  const [selectedLapKey, setSelectedLapKey] = useState<string | null>(null);
  const selectedLap = lapEntries.find((lap) => lap.key === selectedLapKey) ?? null;
  const standaloneLaps = lapEntries.filter((lap) => lap.groupLabel === 'Workout');
  const [expandedLapGroups, setExpandedLapGroups] = useState<Set<string>>(() => new Set());

  const toggleLapGroup = (groupLabel: string) => {
    const isExpanded = expandedLapGroups.has(groupLabel);
    setExpandedLapGroups((current) => {
      const next = new Set(current);
      if (next.has(groupLabel)) next.delete(groupLabel);
      else next.add(groupLabel);
      return next;
    });
    if (isExpanded && selectedLap?.groupLabel === groupLabel) setSelectedLapKey(null);
  };

  return (
    <OriginZoomModal visible={visible} launchOrigin={launchOrigin} onExitComplete={onExitComplete} onRequestClose={onClose}>
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
              <SegmentMetric compact highlighted label={`Distance (${distanceLabel})`} value={formatActivityDistanceValueFromMeters(totalDistance, distanceUnit)} />
              {hasExtraDistance && (
                <SegmentMetric compact label={`Extra (${distanceLabel})`} value={formatActivityDistanceValueFromMeters(extraDistance, distanceUnit)} />
              )}
            </View>
            {standaloneLaps.length > 0 && (
              <>
                <View style={styles.standaloneLapsHeader}>
                  <Text style={[styles.sectionLapsLabel, { color: colors.text }]}>Workout laps</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={expandedLapGroups.has('Workout') ? 'Hide workout laps' : 'Show workout laps'}
                    accessibilityState={{ expanded: expandedLapGroups.has('Workout') }}
                    onPress={() => toggleLapGroup('Workout')}
                    style={[styles.segmentType, { backgroundColor: colors.selected }]}
                  >
                    <Text style={[styles.lapsButtonText, { color: colors.primary }]}>Laps</Text>
                    <Feather name={expandedLapGroups.has('Workout') ? 'chevron-up' : 'chevron-down'} size={13} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                {expandedLapGroups.has('Workout') ? <LapTable laps={standaloneLaps} selectedLapKey={selectedLap?.key ?? null} onSelectLap={setSelectedLapKey} distanceUnit={distanceUnit} /> : null}
              </>
            )}
            {displaySegments.map(({ segment, recovery }) => {
              const distance = getSegmentDistance(segment);
              const time = getSegmentTime(segment);
              const pace = segment.actual_pace_s_per_km ?? (distance > 0 && time > 0 ? time / (distance / 1000) : undefined);
              const groupLabel = segment.type === 'EXTRA' ? 'Extra distance' : `${segment.sequence}. ${titleCase(segment.type)}`;
              const segmentLapEntries = lapEntries.filter((lap) => lap.groupLabel === groupLabel);
              const isLapsExpanded = expandedLapGroups.has(groupLabel);
              return (
                <View key={`segment-${segment.sequence}-${segment.type}`}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isLapsExpanded ? `Hide ${titleCase(segment.type)} laps` : `Show ${titleCase(segment.type)} laps`}
                    accessibilityState={{ expanded: isLapsExpanded, disabled: segmentLapEntries.length === 0 }}
                    disabled={segmentLapEntries.length === 0}
                    onPress={() => toggleLapGroup(groupLabel)}
                    style={({ pressed }) => [styles.segmentCard, { backgroundColor: colors.surface, borderColor: isDark ? colors.surface : colors.border, opacity: pressed ? 0.88 : 1 }]}
                  >
                    <View style={styles.segmentHeader}>
                      <Text style={[styles.segmentTitle, { color: colors.text }]}>{segment.sequence}. {titleCase(segment.type)}</Text>
                    </View>
                    <View style={styles.segmentMetrics}>
                      <SegmentMetric inline label={`Distance (${getDistanceUnitDisplayLabel(distanceUnit)})`} value={formatSegmentDistance(distance, distanceUnit)} />
                      <SegmentMetric inline label={`Planned (${getDistanceUnitDisplayLabel(distanceUnit)})`} value={formatMetric(segment.planned_distance_m, (value) => formatSegmentDistance(value, distanceUnit))} />
                      <SegmentMetric inline label="Time" value={formatMetric(time, formatDurationHhMmSs)} />
                      <SegmentMetric inline label="Pace" value={formatMetric(pace, (value) => `${formatPaceValueFromSecondsPerKm(value, distanceUnit)} ${paceLabel}`)} />
                    </View>
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
                  </Pressable>
                  {isLapsExpanded ? <LapTable laps={segmentLapEntries} selectedLapKey={selectedLap?.key ?? null} onSelectLap={setSelectedLapKey} distanceUnit={distanceUnit} /> : null}
                </View>
              );
            })}
          </ScrollView>
        )}
        </SafeAreaView>
    </OriginZoomModal>
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
        <SegmentMetric label={`Distance (${getDistanceUnitDisplayLabel(distanceUnit)})`} value={formatSegmentDistance(distance, distanceUnit)} />
        <SegmentMetric label="Time" value={formatMetric(time, formatDurationHhMmSs)} />
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
  listContent: { paddingTop: 14, paddingBottom: 26 },
  overviewHeader: { paddingHorizontal: 4, marginBottom: 12 },
  workoutTitle: { fontSize: 23, fontWeight: '700', letterSpacing: 0 },
  segmentCount: { fontSize: 14, marginTop: 5 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  summaryMetric: { borderRadius: 13, padding: 9, minHeight: 58 },
  tableCard: { borderRadius: 16, padding: 11, marginBottom: 12, borderWidth: 1 },
  tableTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  tableTitle: { fontSize: 17, fontWeight: '800' },
  tableHint: { fontSize: 11, marginTop: 3 },
  segmentCard: { borderRadius: 16, padding: 12, marginBottom: 12, borderWidth: 1 },
  segmentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  segmentTitle: { fontSize: 19, fontWeight: '700', flex: 1, letterSpacing: 0 },
  segmentType: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden' },
  lapsButtonText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  standaloneLapsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 4 },
  sectionLapsLabel: { fontSize: 15, fontWeight: '700' },
  segmentMetrics: { flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'space-between', columnGap: 6, marginTop: 11 },
  metric: { flexGrow: 1, flexShrink: 1, flexBasis: '46%', minWidth: 0, borderRadius: 11, borderWidth: 1, padding: 7 },
  metricLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0 },
  metricValue: { fontSize: 12, fontWeight: '600', marginTop: 3, letterSpacing: 0 },
  inlineMetric: { flex: 1, flexGrow: 1, flexBasis: 0, minWidth: 0, backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0, padding: 0 },
  inlineMetricLabel: { fontSize: 10, fontWeight: '400' },
  inlineMetricValue: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  gpsPoints: { fontSize: 12, marginTop: 12 },
  tableHeaderRow: { flexDirection: 'row', alignItems: 'flex-end', minHeight: 46, borderBottomWidth: 1, paddingBottom: 6 },
  tableHead: { fontSize: 9, fontWeight: '700', lineHeight: 11, textAlign: 'right', paddingHorizontal: 1 },
  tableEntry: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 4 },
  tableMainRow: { flexDirection: 'row', alignItems: 'center', minHeight: 38 },
  tableCell: { fontSize: 10, fontWeight: '600', textAlign: 'right', minWidth: 0, paddingHorizontal: 1 },
  inlineSplitPanel: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, marginBottom: 9, padding: 4 },
  embeddedSplitTable: { marginBottom: 0, padding: 6, borderRadius: 10 },
  embeddedSplitTitleRow: { marginBottom: 5 },
  embeddedSplitTitle: { fontSize: 15 },
  embeddedSplitHint: { fontSize: 10, marginTop: 1 },
  tableTotalRow: { flexDirection: 'row', alignItems: 'center', minHeight: 42, borderTopWidth: 1, marginTop: 2 },
  lapColumn: { flex: 0.72, textAlign: 'left' },
  timeColumn: { flex: 0.83 },
  distanceColumn: { flex: 0.95 },
  paceColumn: { flex: 1 },
  stepsColumn: { flex: 0.7 },
  cadenceColumn: { flex: 0.95 },
  lapName: { fontWeight: '800' },
  noSplits: { fontSize: 12, marginTop: 4, paddingVertical: 8 },
  recoveryDetails: { borderTopWidth: 1, marginTop: 20, paddingTop: 4 },
  recoveryButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recoveryLabel: { fontSize: 17, fontWeight: '600' },
  recoveryMetrics: { flexDirection: 'row', marginTop: 12, columnGap: 16 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  stateText: { fontSize: 16, textAlign: 'center', marginTop: 13 },
  retryButton: { borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, marginTop: 18 },
  retryText: { fontSize: 16, fontWeight: '700' },
});
