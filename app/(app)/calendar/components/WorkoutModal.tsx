import { Alert } from '@/components/ThemedAlert';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import BenchmarkBadgeIcon from '../../../../components/BenchmarkBadgeIcon';
import { useTheme } from '../../../../contexts/ThemeContext';
import { cacheAssignedRoute, customWorkoutAPI, getCachedAssignedRoute, type SuggestedRoute } from '../../../../service/customWorkout';
import { workoutPlanService } from '../../../../service/workoutPlan';
import {
    PlanBenchmarkAssignment,
    PlanBenchmarkStore,
} from '../../../../src/services/planBenchmarkStore';
import { buildPlanFromPlanSegments } from '../../../../src/utils/workoutPlanBuilder';
import { WorkoutDetail, WorkoutSegment } from './types';

interface WorkoutModalProps {
  visible: boolean;
  workout: WorkoutDetail | null;
  onClose: () => void;
  presentation?: 'modal' | 'page';
  onUpdateBenchmark?: (
    workoutId: string,
    isBenchmark: boolean,
    assignment?: PlanBenchmarkAssignment,
    workoutDbId?: number
  ) => void;
}

const isSegmentType = (segment: WorkoutSegment, type: 'warmup' | 'cooldown') => {
  const value = segment.type.toLowerCase().replace(/[-_\s]/g, '');
  return type === 'warmup' ? value.includes('warmup') : value.includes('cooldown');
};

const segmentTitle = (segment: WorkoutSegment) =>
  [
    segment.repeats > 1 ? `${segment.repeats} x` : '',
    segment.distance,
    segment.duration,
    segment.pace ? `at ${segment.pace}` : '',
  ]
    .filter(Boolean)
    .join(' ');

const segmentSubtitle = (segment: WorkoutSegment, fallback: string) =>
  [segment.rest ? `${segment.rest} rest` : '', segment.notes].filter(Boolean).join(' · ') || fallback;

type PageSegmentRow = {
  key: string;
  label: string;
  title: string;
  recovery?: string;
  note?: string;
};

const getPageSegmentRows = (segments: WorkoutSegment[], fallbackSteps: string[]): PageSegmentRow[] => {
  if (!segments.length) {
    return fallbackSteps.map((step, index) => ({
      key: `step-${index}`,
      label: `Step ${index + 1}`,
      title: step,
    }));
  }

  return segments.flatMap((segment, segmentIndex) => {
    const repeatCount = Number.isFinite(segment.repeats)
      ? Math.max(1, Math.floor(segment.repeats))
      : 1;
    const canExpandRepeats = repeatCount > 1
      && !isSegmentType(segment, 'warmup')
      && !isSegmentType(segment, 'cooldown');

    if (canExpandRepeats) {
      return Array.from({ length: repeatCount }, (_, repeatIndex) => ({
        key: `segment-${segmentIndex}-rep-${repeatIndex}`,
        label: `Rep ${repeatIndex + 1}`,
        title: segmentTitle({ ...segment, repeats: 1 }) || segment.notes || 'Workout interval',
        recovery: repeatIndex < repeatCount - 1 ? segment.rest || undefined : undefined,
        note: segment.notes || undefined,
      }));
    }

    const label = isSegmentType(segment, 'warmup')
      ? 'Warm-up'
      : isSegmentType(segment, 'cooldown')
        ? 'Cool-down'
        : segment.type || 'Workout';

    return [{
      key: `segment-${segmentIndex}`,
      label,
      title: segmentTitle(segment) || segment.notes || label,
      recovery: segment.rest || undefined,
      note: segment.notes || undefined,
    }];
  });
};

const getWorkoutPageIcon = (workout: WorkoutDetail) => {
  const label = `${workout.workoutType} ${workout.title}`.toLowerCase();
  if (workout.isRest || label.includes('rest')) {
    return { name: 'moon-outline' as const, color: '#64748B' };
  }
  if (label.includes('long')) {
    return { name: 'flame' as const, color: '#F97316' };
  }
  if (label.includes('interval')) {
    return { name: 'flash-outline' as const, color: '#F59E0B' };
  }
  if (label.includes('tempo')) {
    return { name: 'speedometer-outline' as const, color: '#0EA5E9' };
  }
  if (label.includes('recovery')) {
    return { name: 'bicycle-outline' as const, color: '#14B8A6' };
  }
  return { name: workout.iconName || 'walk-outline', color: workout.accentColor || '#22C55E' };
};

export default function WorkoutModal({
  visible,
  workout,
  onClose,
  presentation = 'modal',
  onUpdateBenchmark,
}: WorkoutModalProps) {
  const { colors } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const compactPage = windowHeight < 760;
  const reduceMotion = useReducedMotion();
  const [rendered, setRendered] = useState(visible);
  const renderedRef = useRef(visible);
  const [activeWorkout, setActiveWorkout] = useState<WorkoutDetail | null>(workout);
  const [assignedRoute, setAssignedRoute] = useState<SuggestedRoute | null>(null);
  const [isSavingBenchmark, setIsSavingBenchmark] = useState(false);
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(30));

  if (workout && activeWorkout?.id !== workout.id) {
    setActiveWorkout(workout);
  }

  useEffect(() => {
    if (visible && workout) {
      opacity.stopAnimation();
      translateY.stopAnimation();
      renderedRef.current = true;
      if (reduceMotion) {
        opacity.setValue(1);
        translateY.setValue(0);
        return;
      }
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(translateY, {
          toValue: 0,
          damping: 17,
          stiffness: 180,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (renderedRef.current) {
      if (reduceMotion) {
        opacity.setValue(0);
        translateY.setValue(30);
        renderedRef.current = false;
        return;
      }
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 30, duration: 160, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!finished) return;
        renderedRef.current = false;
        setRendered(false);
      });
    }
  }, [opacity, reduceMotion, translateY, visible, workout]);

  useFocusEffect(
    useCallback(() => {
      const workoutDbId = activeWorkout?.workoutDbId;
      let cancelled = false;
      if (!visible || !workoutDbId) {
        setAssignedRoute(null);
        return undefined;
      }

      void customWorkoutAPI.get(workoutDbId).then(({ data }) => {
        if (cancelled) return;
        const route = data.assigned_route || data.assignedRoute || data.route || getCachedAssignedRoute(workoutDbId);
        setAssignedRoute(route);
        if (route) cacheAssignedRoute(workoutDbId, route);
      }).catch(() => {
        if (!cancelled) setAssignedRoute(getCachedAssignedRoute(workoutDbId));
      });

      return () => {
        cancelled = true;
      };
    }, [activeWorkout?.workoutDbId, visible]),
  );

  if ((!rendered && !visible) || !activeWorkout) return null;

  const saveBenchmark = async (nextState: boolean) => {
    if (!activeWorkout || activeWorkout.isRest || isSavingBenchmark) return;
    setIsSavingBenchmark(true);
    const workoutKey = activeWorkout.rawDate || activeWorkout.id;
    let assignment: PlanBenchmarkAssignment | undefined = undefined;
    if (nextState) {
      assignment = {
        workoutKey,
        isBenchmark: true,
        benchmarkType: 'plan',
        benchmarkTitle: activeWorkout.title || 'Plan Benchmark',
        workoutDbId: activeWorkout.workoutDbId,
        planWorkoutTitle: activeWorkout.title,
        planWorkoutDate: activeWorkout.rawDate || activeWorkout.date,
        planWorkoutDay: activeWorkout.day,
        planWorkoutType: activeWorkout.workoutType,
        planWorkoutDistance: activeWorkout.distance,
        planWorkoutDuration: activeWorkout.estimatedDuration,
        planWorkoutPace: activeWorkout.targetPace,
        planWorkoutSegments: activeWorkout.segments,
        planWorkoutSteps: activeWorkout.steps,
        notes: activeWorkout.notes,
      };
    }

    let dbId = activeWorkout.workoutDbId;
    try {
      const saved = await workoutPlanService.updatePlanWorkoutBenchmark(
        {
          workoutDbId: activeWorkout.workoutDbId,
          workoutDate: activeWorkout.rawDate,
          weekNumber: activeWorkout.weekNumber,
          displayOrder: activeWorkout.displayOrder,
          weekday: activeWorkout.day,
          title: activeWorkout.title,
          workoutType: activeWorkout.workoutType,
          distance: activeWorkout.distance ? parseFloat(activeWorkout.distance) * 1000 : null,
          duration: activeWorkout.estimatedDuration ? parseInt(activeWorkout.estimatedDuration, 10) * 60 : null,
          notes: activeWorkout.notes,
          segments: activeWorkout.segments,
        },
        nextState
      );
      if (!saved) {
        throw new Error('The benchmark change could not be saved. Please try again.');
      }

      if (saved.id) dbId = saved.id;
      if (assignment) {
        assignment.workoutDbId = dbId;
        await PlanBenchmarkStore.setAssignment(workoutKey, assignment);
      } else {
        await PlanBenchmarkStore.removeAssignment(workoutKey, dbId);
      }

      setActiveWorkout((prev) => prev ? {
        ...prev,
        isBenchmark: nextState,
        benchmarkTitle: nextState ? prev.title : undefined,
        benchmarkType: nextState ? 'plan' : undefined,
        workoutDbId: dbId || prev.workoutDbId,
      } : prev);
      onUpdateBenchmark?.(activeWorkout.id, nextState, assignment, dbId);

      Alert.alert(
        nextState ? 'Marked as Benchmark' : 'Benchmark Removed',
        nextState
          ? `"${activeWorkout.title || 'Workout'}" is now set as a Benchmark Workout in Statistics.`
          : `"${activeWorkout.title || 'Workout'}" removed from Benchmark Workouts in Statistics.`
      );
    } catch (err) {
      console.warn('[WorkoutModal] Failed to persist benchmark change:', err);
      const message = err instanceof Error
        ? err.message
        : 'Unable to update this benchmark. Please try again.';
      Alert.alert('Unable to update benchmark', message);
    } finally {
      setIsSavingBenchmark(false);
    }
  };

  const handleToggleBenchmark = () => {
    if (!activeWorkout || activeWorkout.isRest || isSavingBenchmark) return;
    const nextState = !activeWorkout.isBenchmark;
    Alert.alert(
      nextState ? 'Mark as Benchmark?' : 'Remove Benchmark?',
      nextState
        ? `Add "${activeWorkout.title || 'Workout'}" to Benchmark Workouts?`
        : `Remove "${activeWorkout.title || 'Workout'}" from Benchmark Workouts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: nextState ? 'Mark as Benchmark' : 'Remove Benchmark',
          style: nextState ? 'default' : 'destructive',
          onPress: () => { void saveBenchmark(nextState); },
        },
      ],
    );
  };

  const handleStartRun = () => {
    if (presentation === 'modal') onClose();
    const hasSegments = Array.isArray(activeWorkout.segments) && activeWorkout.segments.length > 0;
    if (hasSegments) {
      const planSteps = buildPlanFromPlanSegments(
        activeWorkout.segments,
        activeWorkout.title || 'Planned Run'
      );
      if (planSteps.length > 0) {
        router.push({
          pathname: '/(app)/screens/map',
          params: {
            workoutTitle: activeWorkout.isBenchmark
              ? `${activeWorkout.title} (Benchmark)`
              : activeWorkout.title,
            workoutPlan: JSON.stringify(planSteps),
            ...(assignedRoute ? { assignedRoute: JSON.stringify(assignedRoute) } : {}),
          },
        });
        return;
      }
    }

    router.push({
      pathname: '/(app)/run',
      params: {
        workoutId: activeWorkout.id,
        workoutTitle: activeWorkout.isBenchmark
          ? `${activeWorkout.title} (Benchmark)`
          : activeWorkout.title,
        workoutType: activeWorkout.isBenchmark ? 'Benchmark' : activeWorkout.workoutType,
        workoutDuration: activeWorkout.estimatedDuration,
        workoutDistance: activeWorkout.distance,
        workoutPace: activeWorkout.targetPace,
        ...(assignedRoute ? { assignedRoute: JSON.stringify(assignedRoute) } : {}),
      },
    });
  };

  const content = (
    <ScrollView style={styles.fullScreen} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <Text style={[styles.caption, { color: colors.textSecondary }]}>Workout Details</Text>
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: colors.text }]}>{activeWorkout.title}</Text>
          <Text style={[styles.type, { color: colors.primary }]}>{activeWorkout.workoutType}</Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          style={[styles.closeButton, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel="Close workout details"
        >
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Benchmark Banner or Set Benchmark Button (Only on active Run days, NOT on Rest days) */}
      {/* Benchmark Action Button / Status (Only on active Run days, NOT on Rest days) */}
      {!activeWorkout.isRest && (
        <View style={styles.benchmarkSection}>
          <TouchableOpacity
            style={[
              styles.benchmarkToggleButton,
              { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
              activeWorkout.isBenchmark && styles.benchmarkToggleButtonActive,
            ]}
            onPress={handleToggleBenchmark}
            disabled={isSavingBenchmark}
            activeOpacity={0.8}
            accessibilityLabel={activeWorkout.isBenchmark ? 'Remove benchmark' : 'Mark as benchmark'}
          >
            <View
              style={[
                styles.benchmarkToggleIconWrap,
                activeWorkout.isBenchmark && styles.benchmarkToggleIconWrapActive,
              ]}
            >
              <BenchmarkBadgeIcon
                size={20}
                color={activeWorkout.isBenchmark ? '#0F172A' : '#F59E0B'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.benchmarkToggleTitle,
                  { color: colors.text },
                  activeWorkout.isBenchmark && styles.benchmarkToggleTitleActive,
                ]}
              >
                {isSavingBenchmark
                  ? 'Saving benchmark...'
                  : activeWorkout.isBenchmark
                  ? 'Benchmark Workout Active'
                  : 'Mark as Benchmark Workout'}
              </Text>
              <Text style={[styles.benchmarkToggleSub, { color: colors.textSecondary }]}>
                {activeWorkout.isBenchmark
                  ? 'Tap to remove this workout from Benchmark list in Statistics'
                  : `Tap to mark "${activeWorkout.title}" as benchmark in Statistics`}
              </Text>
            </View>
            <Ionicons
              name={activeWorkout.isBenchmark ? 'checkmark-circle' : 'add-circle-outline'}
              size={22}
              color={activeWorkout.isBenchmark ? '#F59E0B' : colors.primary}
            />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.summaryGrid}>
        <SummaryMetric label="Distance" value={activeWorkout.distance} />
        <SummaryMetric label="Duration" value={activeWorkout.estimatedDuration} />
        <SummaryMetric label="Target Pace" value={activeWorkout.targetPace} />
      </View>

      <Text style={[styles.segmentsHeading, { color: colors.text }]}>Segments</Text>
      <SegmentGroup
        title="WARM-UP"
        segments={activeWorkout.segments.filter((segment) => isSegmentType(segment, 'warmup'))}
        fallback={activeWorkout.warmUp}
        fallbackLabel="Easy warmup"
      />
      <SegmentGroup
        title="SESSION"
        accent
        segments={activeWorkout.segments.filter(
          (segment) => !isSegmentType(segment, 'warmup') && !isSegmentType(segment, 'cooldown')
        )}
        fallbackSegments={activeWorkout.steps}
        fallbackLabel="Workout interval"
      />
      <SegmentGroup
        title="COOL DOWN"
        segments={activeWorkout.segments.filter((segment) => isSegmentType(segment, 'cooldown'))}
        fallback={activeWorkout.coolDown}
        fallbackLabel="Cooldown"
      />

      <DetailSection label="Description" text={activeWorkout.description} />
      <DetailSection label="Instructions" text={activeWorkout.instructions} />

      <Text style={[styles.sectionLabel, styles.statsTitle, { color: colors.text, borderTopColor: colors.border }]}>Stats</Text>
      <View style={styles.statsRow}>
        <Stat label="Est Calories" value={activeWorkout.estimatedCalories} />
        <Stat label="Duration" value={activeWorkout.estimatedDuration} />
      </View>
      <View style={styles.statsRow}>
        <Stat label="Target Pace" value={activeWorkout.targetPace} />
        <Stat label="Distance" value={activeWorkout.distance} />
        <Stat label="Notes" value={activeWorkout.notes} />
      </View>

      {!activeWorkout.isRest && activeWorkout.workoutDbId ? (
        <View style={styles.routeActions}>
          {assignedRoute ? (
            <TouchableOpacity
              style={[styles.assignedRouteButton, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
              onPress={() => {
                onClose();
                router.push({ pathname: '/custom-workout/route-detail', params: { route: JSON.stringify(assignedRoute) } });
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle" size={19} color={colors.primary} />
              <Text style={[styles.assignedRouteText, { color: colors.text }]}>
                Route assigned · {(Number(assignedRoute.distance || 0) / 1000).toFixed(2)} km
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.suggestedRoutesButton, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
            onPress={() => {
              const workoutId = activeWorkout.workoutDbId;
              if (!workoutId) {
                Alert.alert('Routes unavailable', 'This workout is not linked to a saved plan workout.');
                return;
              }
              if (presentation === 'modal') onClose();
              router.push({
                pathname: '/(app)/custom-workout/suggested-routes',
                params: { workoutId: String(workoutId) },
              });
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="map-outline" size={19} color={colors.primary} />
            <Text style={[styles.suggestedRoutesText, { color: colors.primary }]}>Suggested Routes</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      ) : null}

      {!activeWorkout.isRest && (
        <TouchableOpacity
          style={[{ backgroundColor: activeWorkout.isBenchmark ? '#F59E0B' : colors.primary }, styles.startButton]}
          onPress={handleStartRun}
          activeOpacity={0.85}
        >
          <View style={styles.startButtonContent}>
            {activeWorkout.isBenchmark ? (
              <BenchmarkBadgeIcon size={19} color="#0F172A" style={{ marginRight: 6 }} />
            ) : (
              <Ionicons name="play" size={18} color={colors.primaryText} />
            )}
            <Text style={[styles.startButtonText, { color: activeWorkout.isBenchmark ? '#0F172A' : colors.primaryText }]}>
              {activeWorkout.isBenchmark
                ? `Start Benchmark: ${activeWorkout.title || 'Run'}`
                : 'Start Run'}
            </Text>
          </View>
        </TouchableOpacity>
      )}
    </ScrollView>
  );

  if (presentation === 'page') {
    const pageIcon = getWorkoutPageIcon(activeWorkout);
    const pageSegmentRows = getPageSegmentRows(activeWorkout.segments, activeWorkout.steps);

    return (
      <SafeAreaView edges={['top', 'bottom']} style={[styles.fullScreen, { backgroundColor: colors.background }]}>
        <View style={[styles.pageContent, { paddingHorizontal: compactPage ? 16 : 20, paddingTop: compactPage ? 8 : 14, paddingBottom: compactPage ? 8 : 14 }]}>
          <View style={styles.pageMain}>
            <View>
              <Text style={[styles.caption, styles.pageCaption, { color: colors.textSecondary }]}>Workout Details</Text>
              <View style={styles.headerRow}>
                <View style={[styles.pageWorkoutIcon, { backgroundColor: colors.surfaceRaised }]}>
                  <Ionicons name={pageIcon.name} size={28} color={pageIcon.color} />
                </View>
                <View style={styles.titleBlock}>
                  <Text style={[styles.title, compactPage && styles.pageTitleCompact, { color: colors.text }]} numberOfLines={1}>{activeWorkout.title}</Text>
                  <Text style={[styles.type, { color: colors.primary }]} numberOfLines={1}>{activeWorkout.workoutType}</Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={[styles.closeButton, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel="Close workout details"
                >
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {activeWorkout.isRest ? (
              <View style={[styles.restMessageCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <Text style={[styles.restMessageTitle, { color: colors.text }]}>Take a rest today</Text>
                <Text style={[styles.sectionText, { color: colors.textSecondary }]}>
                  Recover today, then do your best on your next workout day.
                </Text>
              </View>
            ) : (
              <>
              <TouchableOpacity
                style={[
                  styles.pageBenchmarkButton,
                  compactPage && styles.pageBenchmarkButtonCompact,
                  { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
                  activeWorkout.isBenchmark && styles.benchmarkToggleButtonActive,
                ]}
                onPress={handleToggleBenchmark}
                disabled={isSavingBenchmark}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={activeWorkout.isBenchmark ? 'Remove benchmark' : 'Mark as benchmark'}
              >
                <View style={[styles.benchmarkToggleIconWrap, compactPage && styles.pageBenchmarkIconCompact, activeWorkout.isBenchmark && styles.benchmarkToggleIconWrapActive]}>
                  <BenchmarkBadgeIcon size={compactPage ? 17 : 20} color={activeWorkout.isBenchmark ? '#0F172A' : '#F59E0B'} />
                </View>
                <View style={styles.pageBenchmarkCopy}>
                  <Text style={[styles.benchmarkToggleTitle, { color: colors.text }]} numberOfLines={1}>
                    {isSavingBenchmark ? 'Saving benchmark...' : activeWorkout.isBenchmark ? 'Benchmark Workout Active' : 'Mark as Benchmark Workout'}
                  </Text>
                  {!compactPage && (
                    <Text style={[styles.benchmarkToggleSub, { color: colors.textSecondary }]} numberOfLines={2}>
                      {activeWorkout.isBenchmark
                        ? 'Tap to remove this workout from Benchmark list in Statistics'
                        : `Tap to mark "${activeWorkout.title}" as benchmark in Statistics`}
                    </Text>
                  )}
                </View>
                <Ionicons name={activeWorkout.isBenchmark ? 'checkmark-circle' : 'add-circle-outline'} size={22} color={activeWorkout.isBenchmark ? '#F59E0B' : colors.primary} />
              </TouchableOpacity>

            <View style={[styles.pageSummaryGrid, compactPage && styles.pageSummaryGridCompact]}>
              <View style={styles.pageSummaryRow}>
                <SummaryMetric pageLayout label="Distance" value={activeWorkout.distance} />
                <SummaryMetric pageLayout label="Duration" value={activeWorkout.estimatedDuration} />
              </View>
              <View style={styles.pageSummaryRow}>
                <SummaryMetric pageLayout label="Target Pace" value={activeWorkout.targetPace} />
              </View>
            </View>

            {pageSegmentRows.length > 0 && (
              <View style={styles.pageInfoBlock}>
                <Text style={[styles.pageSectionTitle, { color: colors.text }]}>Segments</Text>
                <View style={styles.pageSegmentsList}>
                  {pageSegmentRows.map((row) => (
                    <View
                      key={row.key}
                      style={[
                        styles.pageSegmentRow,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                    >
                      <View style={[styles.pageSegmentBadge, { backgroundColor: colors.selected }]}>
                        <Text style={[styles.pageSegmentLabel, { color: colors.primary }]}>{row.label}</Text>
                      </View>
                      <View style={styles.pageSegmentCopy}>
                        <Text style={[styles.pageSegmentTitle, { color: colors.text }]}>{row.title}</Text>
                        {(row.recovery || row.note) && (
                          <View style={styles.pageSegmentMeta}>
                            {row.recovery && (
                              <>
                                <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
                                <Text style={[styles.pageSegmentSubtitle, { color: colors.textSecondary }]}>
                                  {row.recovery} recovery
                                </Text>
                              </>
                            )}
                            {row.recovery && row.note && (
                              <View style={[styles.pageSegmentMetaDivider, { backgroundColor: colors.border }]} />
                            )}
                            {row.note && (
                              <Text style={[styles.pageSegmentSubtitle, styles.pageSegmentNote, { color: colors.textSecondary }]}>
                                {row.note}
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {!!activeWorkout.description && (
              <View style={styles.pageInfoBlock}>
                <Text style={[styles.pageSectionTitle, { color: colors.text }]}>Description</Text>
                <Text style={[styles.sectionText, { color: colors.textSecondary }]} numberOfLines={compactPage ? 2 : 3}>
                  {activeWorkout.description}
                </Text>
              </View>
            )}

            {!compactPage && !!activeWorkout.instructions && (
              <View style={styles.pageInfoBlock}>
                <Text style={[styles.pageSectionTitle, { color: colors.text }]}>Instructions</Text>
                <Text style={[styles.sectionText, { color: colors.textSecondary }]} numberOfLines={3}>
                  {activeWorkout.instructions}
                </Text>
              </View>
            )}
              </>
            )}
          </View>

          <View style={styles.pageActions}>
            {!activeWorkout.isRest && activeWorkout.workoutDbId ? (
              <TouchableOpacity
                style={[styles.suggestedRoutesButton, styles.pageActionButton, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
                onPress={() => {
                  router.push({
                    pathname: '/(app)/custom-workout/suggested-routes',
                    params: { workoutId: String(activeWorkout.workoutDbId) },
                  });
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="map-outline" size={19} color={colors.primary} />
                <Text style={[styles.suggestedRoutesText, { color: colors.primary }]}>Suggested Routes</Text>
                <Ionicons name="chevron-forward" size={20} color={colors.primary} />
              </TouchableOpacity>
            ) : null}
            {!activeWorkout.isRest && (
              <TouchableOpacity
                style={[styles.startButton, styles.pageActionButton, { backgroundColor: activeWorkout.isBenchmark ? '#F59E0B' : colors.primary }]}
                onPress={handleStartRun}
                activeOpacity={0.85}
              >
                <View style={styles.startButtonContent}>
                  {activeWorkout.isBenchmark
                    ? <BenchmarkBadgeIcon size={19} color="#0F172A" style={{ marginRight: 6 }} />
                    : <Ionicons name="play" size={18} color={colors.primaryText} />}
                  <Text style={[styles.startButtonText, { color: activeWorkout.isBenchmark ? '#0F172A' : colors.primaryText }]}>
                    {activeWorkout.isBenchmark ? `Start Benchmark: ${activeWorkout.title || 'Run'}` : 'Start Run'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <Modal
      transparent={false}
      visible={visible || (rendered && !reduceMotion)}
      animationType="none"
      onRequestClose={onClose}
    >
      <SafeAreaView edges={['top', 'bottom']} style={[styles.fullScreen, { backgroundColor: colors.background }]}>
        <Animated.View style={[styles.fullScreen, { opacity, transform: [{ translateY }] }]}>
          <View style={[styles.modalCard, styles.fullScreenCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              {content}
          </View>
        </Animated.View>
      </SafeAreaView>
    </Modal>
  );
}

function DetailSection({ label, text }: { label: string; text: string }) {
  const { colors } = useTheme();
  return text ? (
    <>
      <Text style={[styles.sectionLabel, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.sectionText, { color: colors.textSecondary }]}>{text}</Text>
    </>
  ) : null;
}

function SummaryMetric({ label, value, pageLayout = false }: { label: string; value: string; pageLayout?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.summaryMetric, pageLayout && styles.pageSummaryMetric, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: colors.text }]}>{value || '—'}</Text>
    </View>
  );
}

function SegmentGroup({
  title,
  accent = false,
  segments = [],
  fallback,
  fallbackSegments = [],
  fallbackLabel,
}: {
  title: string;
  accent?: boolean;
  segments?: WorkoutSegment[];
  fallback?: string;
  fallbackSegments?: string[];
  fallbackLabel: string;
}) {
  const { colors } = useTheme();
  const rows = segments.length
    ? segments
    : fallbackSegments.map((step, index) => ({
        order: index + 1,
        type: 'session',
        repeats: 1,
        distance: '',
        duration: '',
        pace: '',
        rest: '',
        notes: step,
      }));
  if (!rows.length && !fallback) return null;
  return (
    <View style={styles.segmentGroup}>
      <Text style={[styles.segmentHeader, {
        backgroundColor: accent ? colors.selected : colors.surfaceRaised,
        color: accent ? colors.primary : colors.textSecondary,
      }]}>{title}</Text>
      {rows.length ? (
        rows.map((segment, index) => (
          <View key={`${title}-${segment.order}-${index}`} style={[styles.segmentItem, { backgroundColor: colors.surfaceRaised, borderTopColor: colors.border }]}>
            <Text style={[styles.segmentIndex, { color: colors.primary }]}>{accent ? index + 1 : '•'}</Text>
            <View style={styles.segmentCopy}>
              <Text style={[styles.segmentTitle, { color: colors.text }]}>
                {segmentTitle(segment) || segment.notes || 'Workout'}
              </Text>
              <Text style={[styles.segmentSubtitle, { color: colors.textSecondary }]}>{segmentSubtitle(segment, fallbackLabel)}</Text>
            </View>
            <View style={styles.runTag}>
              <Ionicons name="walk" size={14} color={colors.primary} />
              <Text style={[styles.runTagText, { color: colors.primary }]}>RUN</Text>
            </View>
          </View>
        ))
      ) : (
        <View style={[styles.segmentItem, { backgroundColor: colors.surfaceRaised, borderTopColor: colors.border }]}>
          <Text style={[styles.segmentIndex, { color: colors.primary }]}>•</Text>
          <View style={styles.segmentCopy}>
            <Text style={[styles.segmentTitle, { color: colors.text }]}>{fallback}</Text>
            <Text style={[styles.segmentSubtitle, { color: colors.textSecondary }]}>{fallbackLabel}</Text>
          </View>
          <View style={styles.runTag}>
            <Ionicons name="walk" size={14} color={colors.primary} />
            <Text style={[styles.runTagText, { color: colors.primary }]}>RUN</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return value ? (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
    </View>
  ) : null;
}

const styles = StyleSheet.create({
  fullScreen: { flex: 1 },
  pageContent: { flex: 1, justifyContent: 'space-between' },
  pageMain: { gap: 14 },
  pageCaption: { marginBottom: 4 },
  pageTitleCompact: { fontSize: 24, lineHeight: 29 },
  pageWorkoutIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  restMessageCard: { minHeight: 132, justifyContent: 'center', gap: 8, padding: 18, borderRadius: 16, borderWidth: 1 },
  restMessageTitle: { fontSize: 18, fontWeight: '700' },
  pageBenchmarkButton: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 12, borderWidth: 1 },
  pageBenchmarkButtonCompact: { minHeight: 54, paddingVertical: 8 },
  pageBenchmarkIconCompact: { width: 34, height: 34 },
  pageBenchmarkCopy: { flex: 1, minWidth: 0 },
  pageSummaryGrid: { gap: 8 },
  pageSummaryGridCompact: { gap: 7 },
  pageSummaryRow: { flexDirection: 'row', gap: 8 },
  pageSummaryMetric: { flex: 1, width: 'auto', minHeight: 54 },
  pageInfoBlock: { gap: 4 },
  pageSegmentsList: { gap: 6 },
  pageSegmentRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, borderWidth: 1 },
  pageSegmentBadge: { minWidth: 54, minHeight: 28, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, borderRadius: 8 },
  pageSegmentLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  pageSegmentCopy: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 2 },
  pageSegmentTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  pageSegmentMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 4, rowGap: 2 },
  pageSegmentMetaDivider: { width: 3, height: 3, borderRadius: 2, marginHorizontal: 2 },
  pageSegmentSubtitle: { fontSize: 11, lineHeight: 14 },
  pageSegmentNote: { flexShrink: 1 },
  pageSectionTitle: { fontSize: 15, fontWeight: '700' },
  pageActions: { gap: 8 },
  pageActionButton: { marginTop: 0 },
  modalCard: {
    borderRadius: 16,
    borderWidth: 1,
    opacity: 1,
    maxHeight: '90%',
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
  },
  fullScreenCard: { flex: 1, maxHeight: '100%', borderRadius: 0, borderWidth: 0 },
  scrollContent: { padding: 22, paddingBottom: 26 },
  caption: { fontSize: 12, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  titleBlock: { flex: 1 },
  title: { fontSize: 28, fontWeight: '700', lineHeight: 34 },
  type: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  // Benchmark UI on Run Days
  benchmarkSection: {
    marginHorizontal: 0,
    marginBottom: 14,
  },
  benchmarkToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  benchmarkToggleButtonActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#F59E0B',
  },
  benchmarkToggleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benchmarkToggleIconWrapActive: {
    backgroundColor: '#F59E0B',
  },
  benchmarkToggleTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  benchmarkToggleTitleActive: {
    color: '#F59E0B',
  },
  benchmarkToggleSub: {
    fontSize: 12,
    marginTop: 2,
  },
  // Metrics & Stats
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  summaryMetric: { width: '48%', minHeight: 58, borderRadius: 10, borderWidth: 1, padding: 10 },
  summaryLabel: { fontSize: 12 },
  summaryValue: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  segmentsHeading: { fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  segmentGroup: { marginBottom: 12, borderRadius: 12, overflow: 'hidden' },
  segmentHeader: { fontSize: 12, fontWeight: '800', paddingHorizontal: 12, paddingVertical: 8 },
  segmentItem: { flexDirection: 'row', alignItems: 'center', minHeight: 58, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1 },
  segmentIndex: { width: 24, fontSize: 15, fontWeight: '700' },
  segmentCopy: { flex: 1 },
  segmentTitle: { fontSize: 15, fontWeight: '700' },
  segmentSubtitle: { fontSize: 12, marginTop: 3 },
  runTag: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 8 },
  runTagText: { fontSize: 11, fontWeight: '800' },
  sectionLabel: { fontSize: 16, fontWeight: '700', marginTop: 17, marginBottom: 5 },
  sectionText: { fontSize: 14, lineHeight: 21 },
  statsTitle: { borderTopWidth: 1, paddingTop: 17 },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  routeActions: { gap: 10, marginTop: 18 },
  assignedRouteButton: { minHeight: 52, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  assignedRouteText: { flex: 1, fontSize: 14, fontWeight: '700' },
  suggestedRoutesButton: { minHeight: 52, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  suggestedRoutesText: { flex: 1, fontSize: 15, fontWeight: '800' },
  stat: { flex: 1 },
  statLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  statValue: { fontSize: 14, lineHeight: 19 },
  startButton: { marginTop: 24, borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  startButtonContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  startButtonText: { fontSize: 16, fontWeight: '700' },
});
