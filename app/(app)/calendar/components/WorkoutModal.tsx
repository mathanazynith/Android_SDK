import { Alert } from '@/components/ThemedAlert';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

export default function WorkoutModal({
  visible,
  workout,
  onClose,
  onUpdateBenchmark,
}: WorkoutModalProps) {
  const { colors, isDark } = useTheme();
  const reduceMotion = useReducedMotion();
  const [rendered, setRendered] = useState(visible);
  const renderedRef = useRef(visible);
  const [activeWorkout, setActiveWorkout] = useState<WorkoutDetail | null>(workout);
  const [assignedRoute, setAssignedRoute] = useState<SuggestedRoute | null>(null);
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

  const handleToggleBenchmark = async () => {
    if (!activeWorkout || activeWorkout.isRest) return;
    const nextState = !activeWorkout.isBenchmark;
    const workoutKey = activeWorkout.rawDate || activeWorkout.id;

    // Optimistically update activeWorkout
    const updated: WorkoutDetail = {
      ...activeWorkout,
      isBenchmark: nextState,
      benchmarkTitle: nextState ? activeWorkout.title : undefined,
      benchmarkType: nextState ? 'plan' : undefined,
    };
    setActiveWorkout(updated);

    let assignment: PlanBenchmarkAssignment | undefined = undefined;
    if (nextState) {
      assignment = {
        workoutKey,
        isBenchmark: true,
        benchmarkType: 'plan',
        benchmarkTitle: activeWorkout.title || 'Plan Benchmark',
        workoutDbId: activeWorkout.workoutDbId,
        planWorkoutTitle: activeWorkout.title,
        planWorkoutDate: activeWorkout.date || activeWorkout.rawDate,
        planWorkoutDay: activeWorkout.day,
        planWorkoutType: activeWorkout.workoutType,
        planWorkoutDistance: activeWorkout.distance,
        planWorkoutDuration: activeWorkout.estimatedDuration,
        planWorkoutPace: activeWorkout.targetPace,
        planWorkoutSegments: activeWorkout.segments,
        planWorkoutSteps: activeWorkout.steps,
        notes: activeWorkout.notes,
      };
      await PlanBenchmarkStore.setAssignment(workoutKey, assignment);
    } else {
      await PlanBenchmarkStore.removeAssignment(workoutKey, activeWorkout.workoutDbId);
    }

    // Call backend API to persist is_benchmark in workouts table
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
      if (saved?.id) {
        dbId = saved.id;
        if (assignment) {
          assignment.workoutDbId = saved.id;
          await PlanBenchmarkStore.setAssignment(workoutKey, assignment);
        } else {
          await PlanBenchmarkStore.removeAssignment(workoutKey, saved.id);
        }
      }
    } catch (err) {
      console.warn('[WorkoutModal] Failed to persist is_benchmark to backend:', err);
    }

    if (dbId && dbId !== activeWorkout.workoutDbId) {
      setActiveWorkout((prev) => (prev ? { ...prev, workoutDbId: dbId } : prev));
    }

    onUpdateBenchmark?.(activeWorkout.id, nextState, assignment, dbId);

    Alert.alert(
      nextState ? 'Marked as Benchmark' : 'Benchmark Removed',
      nextState
        ? `"${activeWorkout.title || 'Workout'}" is now set as a Benchmark Workout in Statistics.`
        : `"${activeWorkout.title || 'Workout'}" removed from Benchmark Workouts in Statistics.`
    );
  };

  const handleStartRun = () => {
    onClose();
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
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
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
                {activeWorkout.isBenchmark
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
        <SummaryMetric label="HR Zone" value={activeWorkout.heartRateZone} />
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
        <Stat label="HR Zone" value={activeWorkout.heartRateZone} />
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
              onClose();
              router.push({ pathname: '/custom-workout/suggested-routes', params: { workoutId: String(workoutId) } });
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

  return (
    <Modal
      transparent
      visible={visible || (rendered && !reduceMotion)}
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.overlay, { opacity }]}>
        <BlurView intensity={isDark ? 80 : 65} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.cardWrapper, { transform: [{ translateY }] }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {content}
          </View>
        </Animated.View>
      </Animated.View>
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

function SummaryMetric({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.summaryMetric, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
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
  overlay: { flex: 1, backgroundColor: 'transparent', justifyContent: 'center', paddingHorizontal: 18 },
  cardWrapper: { maxHeight: '90%' },
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
