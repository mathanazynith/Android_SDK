import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Animated,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import BenchmarkBadgeIcon from '../../../../components/BenchmarkBadgeIcon';
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

const PURE_WHITE = '#FFFFFF';
const FOREST_GREEN = '#0B4720';
const INTENSE_FOREST_GREEN = 'rgba(0, 77, 38, 0.70)';
const MUTED_GREEN_BORDER = '#1E4623';
const METRIC_GREY = '#D1D5DB';

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
  const [rendered, setRendered] = useState(visible);
  const [activeWorkout, setActiveWorkout] = useState<WorkoutDetail | null>(workout);
  const [assignedRoute, setAssignedRoute] = useState<SuggestedRoute | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(30));

  useEffect(() => {
    if (visible && workout) {
      setActiveWorkout(workout);
      setRendered(true);
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

    if (rendered) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 30, duration: 160, useNativeDriver: true }),
      ]).start(() => {
        setRendered(false);
      });
    }
  }, [visible, workout]);

  // Keep activeWorkout synced if parent passes updated workout
  useEffect(() => {
    if (workout) {
      setActiveWorkout(workout);
    }
  }, [workout]);

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

  if (!rendered || !activeWorkout) return null;

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
      <Text style={styles.caption}>Workout Details</Text>
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{activeWorkout.title}</Text>
          <Text style={styles.type}>{activeWorkout.workoutType}</Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="Close workout details"
        >
          <Ionicons name="close" size={24} color={PURE_WHITE} />
        </TouchableOpacity>
      </View>

      {/* Benchmark Banner or Set Benchmark Button (Only on active Run days, NOT on Rest days) */}
      {/* Benchmark Action Button / Status (Only on active Run days, NOT on Rest days) */}
      {!activeWorkout.isRest && (
        <View style={styles.benchmarkSection}>
          <TouchableOpacity
            style={[
              styles.benchmarkToggleButton,
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
                  activeWorkout.isBenchmark && styles.benchmarkToggleTitleActive,
                ]}
              >
                {activeWorkout.isBenchmark
                  ? 'Benchmark Workout Active'
                  : 'Mark as Benchmark Workout'}
              </Text>
              <Text style={styles.benchmarkToggleSub}>
                {activeWorkout.isBenchmark
                  ? 'Tap to remove this workout from Benchmark list in Statistics'
                  : `Tap to mark "${activeWorkout.title}" as benchmark in Statistics`}
              </Text>
            </View>
            <Ionicons
              name={activeWorkout.isBenchmark ? 'checkmark-circle' : 'add-circle-outline'}
              size={22}
              color={activeWorkout.isBenchmark ? '#F59E0B' : '#22C55E'}
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

      <Text style={styles.segmentsHeading}>Segments</Text>
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

      <Text style={[styles.sectionLabel, styles.statsTitle]}>Stats</Text>
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
              style={styles.assignedRouteButton}
              onPress={() => {
                onClose();
                router.push({ pathname: '/custom-workout/route-detail', params: { route: JSON.stringify(assignedRoute) } });
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle" size={19} color="#39B800" />
              <Text style={styles.assignedRouteText}>
                Route assigned · {(Number(assignedRoute.distance || 0) / 1000).toFixed(2)} km
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#39B800" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.suggestedRoutesButton}
            onPress={() => {
              const workoutId = activeWorkout.workoutDbId;
              onClose();
              router.push({ pathname: '/custom-workout/suggested-routes', params: { workoutId: String(workoutId) } });
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="map-outline" size={19} color="#39B800" />
            <Text style={styles.suggestedRoutesText}>Suggested Routes</Text>
            <Ionicons name="chevron-forward" size={20} color="#39B800" />
          </TouchableOpacity>
        </View>
      ) : null}

      {!activeWorkout.isRest && (
        <TouchableOpacity
          style={[styles.startButton, activeWorkout.isBenchmark && styles.startBenchmarkButton]}
          onPress={handleStartRun}
          activeOpacity={0.85}
        >
          <View style={styles.startButtonContent}>
            {activeWorkout.isBenchmark ? (
              <BenchmarkBadgeIcon size={19} color="#0F172A" style={{ marginRight: 6 }} />
            ) : (
              <Ionicons name="play" size={18} color="#0F172A" />
            )}
            <Text style={styles.startButtonText}>
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
    <Modal transparent visible={rendered} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity }]}>
        <BlurView intensity={90} tint="light" style={StyleSheet.absoluteFill} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.cardWrapper, { transform: [{ translateY }] }]}>
          <View style={styles.modalCard}>
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.intenseTint]} />
            {content}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function DetailSection({ label, text }: { label: string; text: string }) {
  return text ? (
    <>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Text style={styles.sectionText}>{text}</Text>
    </>
  ) : null;
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryMetric}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value || '—'}</Text>
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
      <Text style={[styles.segmentHeader, accent && styles.segmentHeaderAccent]}>{title}</Text>
      {rows.length ? (
        rows.map((segment, index) => (
          <View key={`${title}-${segment.order}-${index}`} style={styles.segmentItem}>
            <Text style={styles.segmentIndex}>{accent ? index + 1 : '•'}</Text>
            <View style={styles.segmentCopy}>
              <Text style={styles.segmentTitle}>
                {segmentTitle(segment) || segment.notes || 'Workout'}
              </Text>
              <Text style={styles.segmentSubtitle}>{segmentSubtitle(segment, fallbackLabel)}</Text>
            </View>
            <View style={styles.runTag}>
              <Ionicons name="walk" size={14} color="#22C55E" />
              <Text style={styles.runTagText}>RUN</Text>
            </View>
          </View>
        ))
      ) : (
        <View style={styles.segmentItem}>
          <Text style={styles.segmentIndex}>•</Text>
          <View style={styles.segmentCopy}>
            <Text style={styles.segmentTitle}>{fallback}</Text>
            <Text style={styles.segmentSubtitle}>{fallbackLabel}</Text>
          </View>
          <View style={styles.runTag}>
            <Ionicons name="walk" size={14} color="#22C55E" />
            <Text style={styles.runTagText}>RUN</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return value ? (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  ) : null;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'transparent', justifyContent: 'center', paddingHorizontal: 18 },
  cardWrapper: { maxHeight: '84%' },
  modalCard: {
    backgroundColor: FOREST_GREEN,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: MUTED_GREEN_BORDER,
    opacity: 1,
    maxHeight: '84%',
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
  },
  intenseTint: { backgroundColor: INTENSE_FOREST_GREEN },
  scrollContent: { padding: 22, paddingBottom: 26 },
  caption: { color: PURE_WHITE, fontSize: 18, marginBottom: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  titleBlock: { flex: 1 },
  title: { color: PURE_WHITE, fontSize: 32, fontWeight: '500', lineHeight: 38 },
  type: { color: PURE_WHITE, fontSize: 16, marginTop: 3 },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
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
    backgroundColor: '#16351F',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: MUTED_GREEN_BORDER,
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
    color: PURE_WHITE,
    fontSize: 15,
    fontWeight: '700',
  },
  benchmarkToggleTitleActive: {
    color: '#F59E0B',
  },
  benchmarkToggleSub: {
    color: METRIC_GREY,
    fontSize: 12,
    marginTop: 2,
  },
  // Metrics & Stats
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  summaryMetric: { width: '48%', minHeight: 58, backgroundColor: '#16351F', borderRadius: 10, padding: 10 },
  summaryLabel: { color: METRIC_GREY, fontSize: 12 },
  summaryValue: { color: PURE_WHITE, fontSize: 16, fontWeight: '700', marginTop: 4 },
  segmentsHeading: { color: PURE_WHITE, fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  segmentGroup: { marginBottom: 12, borderRadius: 12, overflow: 'hidden' },
  segmentHeader: { backgroundColor: '#D1D5DB', color: '#0F172A', fontSize: 12, fontWeight: '800', paddingHorizontal: 12, paddingVertical: 8 },
  segmentHeaderAccent: { backgroundColor: '#22C55E' },
  segmentItem: { flexDirection: 'row', alignItems: 'center', minHeight: 58, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#16351F', borderTopWidth: 1, borderTopColor: MUTED_GREEN_BORDER },
  segmentIndex: { width: 24, color: PURE_WHITE, fontSize: 15, fontWeight: '700' },
  segmentCopy: { flex: 1 },
  segmentTitle: { color: PURE_WHITE, fontSize: 15, fontWeight: '700' },
  segmentSubtitle: { color: METRIC_GREY, fontSize: 12, marginTop: 3 },
  runTag: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 8 },
  runTagText: { color: '#22C55E', fontSize: 11, fontWeight: '800' },
  sectionLabel: { color: PURE_WHITE, fontSize: 18, fontWeight: '600', marginTop: 17, marginBottom: 5 },
  sectionText: { color: PURE_WHITE, fontSize: 16, lineHeight: 22 },
  statsTitle: { borderTopWidth: 1, borderTopColor: MUTED_GREEN_BORDER, paddingTop: 17 },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  routeActions: { gap: 10, marginTop: 18 },
  assignedRouteButton: { minHeight: 52, borderRadius: 14, backgroundColor: '#16351F', borderWidth: 1, borderColor: '#39B800', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  assignedRouteText: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  suggestedRoutesButton: { minHeight: 52, borderRadius: 14, backgroundColor: '#16351F', borderWidth: 1, borderColor: MUTED_GREEN_BORDER, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  suggestedRoutesText: { flex: 1, color: '#39B800', fontSize: 15, fontWeight: '800' },
  stat: { flex: 1 },
  statLabel: { color: METRIC_GREY, fontSize: 13, fontWeight: '600', marginBottom: 4 },
  statValue: { color: PURE_WHITE, fontSize: 14, lineHeight: 19 },
  startButton: { marginTop: 24, backgroundColor: '#22C55E', borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  startBenchmarkButton: { backgroundColor: '#F59E0B' },
  startButtonContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  startButtonText: { color: '#0F172A', fontSize: 17, fontWeight: '700' },
});
