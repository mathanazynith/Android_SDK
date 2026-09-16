import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
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
import { customWorkoutAPI, type UserWorkoutResponse } from '../../../../service/customWorkout';
import { BenchmarkStore } from '../../../../src/services/benchmarkStore';
import {
    PlanBenchmarkAssignment,
    PlanBenchmarkStore,
    PlanBenchmarkType,
} from '../../../../src/services/planBenchmarkStore';
import {
    buildPlanFromPlanSegments,
    buildWorkoutExecutionPlan,
    WorkoutExecutionStep,
} from '../../../../src/utils/workoutPlanBuilder';
import { WorkoutDetail, WorkoutSegment } from './types';

interface WorkoutModalProps {
  visible: boolean;
  workout: WorkoutDetail | null;
  onClose: () => void;
  onUpdateBenchmark?: (
    workoutId: string,
    isBenchmark: boolean,
    assignment?: PlanBenchmarkAssignment
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
  const [showSelector, setShowSelector] = useState(false);
  const [customWorkouts, setCustomWorkouts] = useState<UserWorkoutResponse[]>([]);
  const [benchmarkIds, setBenchmarkIds] = useState<number[]>([]);
  const [loadingBenchmarks, setLoadingBenchmarks] = useState(false);
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

      // Load custom workouts and benchmark IDs for run days
      if (!workout.isRest) {
        setLoadingBenchmarks(true);
        Promise.all([
          customWorkoutAPI.list().catch(() => ({ data: [] })),
          BenchmarkStore.getBenchmarkIds().catch(() => []),
        ])
          .then(([res, bIds]) => {
            const list = Array.isArray(res?.data) ? res.data : [];
            setCustomWorkouts(list);
            setBenchmarkIds(bIds);
          })
          .finally(() => setLoadingBenchmarks(false));
      }
      return;
    }

    if (rendered) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 30, duration: 160, useNativeDriver: true }),
      ]).start(() => {
        setRendered(false);
        setShowSelector(false);
      });
    }
  }, [visible, workout]);

  // Keep activeWorkout synced if parent passes updated workout
  useEffect(() => {
    if (workout) {
      setActiveWorkout(workout);
    }
  }, [workout]);

  const benchmarkCustomWorkouts = useMemo(() => {
    return customWorkouts.filter((w) => benchmarkIds.includes(w.id));
  }, [customWorkouts, benchmarkIds]);

  if (!rendered || !activeWorkout) return null;

  const workoutKey = activeWorkout.rawDate || activeWorkout.id;

  const handleSelectBenchmark = async (
    type: PlanBenchmarkType,
    title: string,
    customWorkoutId?: number,
    targetDistanceKm?: number,
    targetDurationMinutes?: number
  ) => {
    const assignment: PlanBenchmarkAssignment = {
      workoutKey,
      isBenchmark: true,
      benchmarkType: type,
      benchmarkTitle: title,
      customWorkoutId,
      targetDistanceKm,
      targetDurationMinutes,
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
    const updated: WorkoutDetail = {
      ...activeWorkout,
      isBenchmark: true,
      benchmarkTitle: title,
      benchmarkType: type,
      customWorkoutId,
    };
    setActiveWorkout(updated);
    setShowSelector(false);
    onUpdateBenchmark?.(activeWorkout.id, true, assignment);
  };

  const handleRemoveBenchmark = async () => {
    await PlanBenchmarkStore.removeAssignment(workoutKey);
    const updated: WorkoutDetail = {
      ...activeWorkout,
      isBenchmark: false,
      benchmarkTitle: undefined,
      benchmarkType: undefined,
      customWorkoutId: undefined,
    };
    setActiveWorkout(updated);
    setShowSelector(false);
    onUpdateBenchmark?.(activeWorkout.id, false);
  };

  const handleStartRun = () => {
    onClose();
    if (activeWorkout.isBenchmark) {
      // 1. Plan workout tagged as benchmark (e.g. 6 x 400m)
      if (activeWorkout.benchmarkType === 'plan') {
        const hasSegments = Array.isArray(activeWorkout.segments) && activeWorkout.segments.length > 0;
        if (hasSegments) {
          const planSteps = buildPlanFromPlanSegments(
            activeWorkout.segments,
            activeWorkout.title || 'Benchmark Run'
          );
          if (planSteps.length > 0) {
            router.push({
              pathname: '/(app)/screens/map',
              params: {
                workoutTitle: `${activeWorkout.title} (Benchmark)`,
                workoutPlan: JSON.stringify(planSteps),
              },
            });
            return;
          }
        }
        router.push({
          pathname: '/(app)/run',
          params: {
            workoutId: activeWorkout.id,
            workoutTitle: `${activeWorkout.title} (Benchmark)`,
            workoutType: 'Benchmark',
            workoutDuration: activeWorkout.estimatedDuration,
            workoutDistance: activeWorkout.distance,
            workoutPace: activeWorkout.targetPace,
          },
        });
        return;
      }

      // 2. Custom benchmark workout
      if (activeWorkout.benchmarkType === 'custom' && activeWorkout.customWorkoutId) {
        const found = customWorkouts.find((w) => w.id === activeWorkout.customWorkoutId);
        if (found) {
          const executionPlan = buildWorkoutExecutionPlan(found);
          router.push({
            pathname: '/(app)/screens/map',
            params: {
              workoutTitle: activeWorkout.benchmarkTitle || found.title || 'Custom Benchmark',
              workoutPlan: JSON.stringify(executionPlan),
            },
          });
          return;
        }
      }

      // 3. Standard 1 km benchmark
      // 2. Standard 1 km benchmark
      if (activeWorkout.benchmarkType === '1k') {
        const planSteps: WorkoutExecutionStep[] = [
          {
            id: 'bench-1k-warmup',
            title: 'Warm Up (Easy Jog)',
            stepType: 'Warmup',
            targetType: 'DURATION',
            targetDurationSeconds: 300,
          },
          {
            id: 'bench-1k-run',
            title: '1 km Benchmark (Max Effort)',
            stepType: 'Run',
            targetType: 'DISTANCE',
            targetDistanceMeters: 1000,
          },
          {
            id: 'bench-1k-cooldown',
            title: 'Cool Down',
            stepType: 'Cooldown',
            targetType: 'DURATION',
            targetDurationSeconds: 300,
          },
        ];
        router.push({
          pathname: '/(app)/screens/map',
          params: {
            workoutTitle: '1 km Benchmark Run',
            workoutPlan: JSON.stringify(planSteps),
          },
        });
        return;
      }

      // 4. Standard 5 km benchmark
      if (activeWorkout.benchmarkType === '5k') {
        const planSteps: WorkoutExecutionStep[] = [
          {
            id: 'bench-5k-warmup',
            title: 'Warm Up (Easy Jog)',
            stepType: 'Warmup',
            targetType: 'DURATION',
            targetDurationSeconds: 300,
          },
          {
            id: 'bench-5k-run',
            title: '5 km Benchmark (Paced Effort)',
            stepType: 'Run',
            targetType: 'DISTANCE',
            targetDistanceMeters: 5000,
          },
          {
            id: 'bench-5k-cooldown',
            title: 'Cool Down',
            stepType: 'Cooldown',
            targetType: 'DURATION',
            targetDurationSeconds: 300,
          },
        ];
        router.push({
          pathname: '/(app)/screens/map',
          params: {
            workoutTitle: '5 km Benchmark Run',
            workoutPlan: JSON.stringify(planSteps),
          },
        });
        return;
      }

      // 5. 12-Minute Cooper test benchmark
      if (activeWorkout.benchmarkType === 'cooper') {
        const planSteps: WorkoutExecutionStep[] = [
          {
            id: 'bench-cooper-warmup',
            title: 'Warm Up (Easy Jog)',
            stepType: 'Warmup',
            targetType: 'DURATION',
            targetDurationSeconds: 300,
          },
          {
            id: 'bench-cooper-run',
            title: '12-Minute Cooper Test (Max Distance)',
            stepType: 'Run',
            targetType: 'DURATION',
            targetDurationSeconds: 720,
          },
          {
            id: 'bench-cooper-cooldown',
            title: 'Cool Down',
            stepType: 'Cooldown',
            targetType: 'DURATION',
            targetDurationSeconds: 300,
          },
        ];
        router.push({
          pathname: '/(app)/screens/map',
          params: {
            workoutTitle: '12-Minute Cooper Test',
            workoutPlan: JSON.stringify(planSteps),
          },
        });
        return;
      }
    }

    // Regular planned run
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
            workoutTitle: activeWorkout.title,
            workoutPlan: JSON.stringify(planSteps),
          },
        });
        return;
      }
    }

    router.push({
      pathname: '/(app)/run',
      params: {
        workoutId: activeWorkout.id,
        workoutTitle: activeWorkout.title,
        workoutType: activeWorkout.workoutType,
        workoutDuration: activeWorkout.estimatedDuration,
        workoutDistance: activeWorkout.distance,
        workoutPace: activeWorkout.targetPace,
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
      {!activeWorkout.isRest && (
        <View style={styles.benchmarkSection}>
          {activeWorkout.isBenchmark ? (
            <View style={styles.benchmarkActiveBanner}>
              <View style={styles.benchmarkBannerTop}>
                <View style={styles.benchmarkTrophyBadge}>
                  <BenchmarkBadgeIcon size={18} color="#0F172A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.benchmarkBannerOverline}>BENCHMARK RUN ACTIVE</Text>
                  <Text style={styles.benchmarkBannerTitle} numberOfLines={1}>
                    {activeWorkout.benchmarkTitle || 'Benchmark Workout'}
                  </Text>
                </View>
              </View>
              <View style={styles.benchmarkBannerActions}>
                <TouchableOpacity
                  style={styles.benchmarkChangeButton}
                  onPress={() => setShowSelector(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="swap-horizontal" size={14} color="#22C55E" />
                  <Text style={styles.benchmarkChangeButtonText}>Change Test</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.benchmarkRemoveButton}
                  onPress={handleRemoveBenchmark}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close-circle-outline" size={14} color="#EF4444" />
                  <Text style={styles.benchmarkRemoveButtonText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.setBenchmarkButton}
              onPress={() => setShowSelector(true)}
              activeOpacity={0.8}
            >
              <View style={styles.setBenchmarkIconWrap}>
                <BenchmarkBadgeIcon size={18} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.setBenchmarkButtonTitle}>Set as Benchmark Run</Text>
                <Text style={styles.setBenchmarkButtonSub}>
                  Make "{activeWorkout.title}" or a standard test a benchmark
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#22C55E" />
            </TouchableOpacity>
          )}
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

      {!activeWorkout.isRest && (
        <TouchableOpacity
          style={[styles.startButton, activeWorkout.isBenchmark && styles.startBenchmarkButton]}
          onPress={handleStartRun}
          activeOpacity={0.85}
        >
          <View style={styles.startButtonContent}>
            <Ionicons
              name={activeWorkout.isBenchmark ? 'trophy' : 'play'}
              size={18}
              color="#0F172A"
            />
            {activeWorkout.isBenchmark ? (
              <BenchmarkBadgeIcon size={19} color="#0F172A" style={{ marginRight: 6 }} />
            ) : (
              <Ionicons name="play" size={18} color="#0F172A" />
            )}
            <Text style={styles.startButtonText}>
              {activeWorkout.isBenchmark
                ? `Start Benchmark: ${activeWorkout.benchmarkTitle || 'Run'}`
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

      {/* Benchmark Selector Bottom Sheet / Modal */}
      {showSelector && (
        <Modal
          transparent
          visible={showSelector}
          animationType="fade"
          onRequestClose={() => setShowSelector(false)}
        >
          <View style={styles.selectorOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSelector(false)} />
            <View style={styles.selectorCard}>
              <View style={styles.selectorHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectorTitle}>Set Benchmark Run</Text>
                  <Text style={styles.selectorSubtitle}>
                    Designate this planned run as a benchmark to track in Stats
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowSelector(false)}
                  style={styles.selectorClose}
                >
                  <Ionicons name="close" size={20} color={PURE_WHITE} />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.selectorScroll}
              >
                {/* 1. Primary Option: Tag this scheduled plan run */}
                <Text style={styles.selectorSectionHeading}>RECOMMENDED FOR THIS DAY</Text>

                <TouchableOpacity
                  style={[styles.selectorItem, styles.selectorItemHighlight]}
                  onPress={() =>
                    handleSelectBenchmark(
                      'plan',
                      activeWorkout.title || 'Scheduled Run Benchmark'
                    )
                  }
                  activeOpacity={0.7}
                >
                  <View style={[styles.selectorIconWrap, { backgroundColor: '#F59E0B' }]}>
                    <BenchmarkBadgeIcon size={18} color="#0F172A" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectorItemTitle}>
                      Make "{activeWorkout.title}" a Benchmark Run
                    </Text>
                    <Text style={styles.selectorItemDesc}>
                      Track this {activeWorkout.workoutType} workout ({activeWorkout.distance || activeWorkout.estimatedDuration || 'session'}) in your Stats Benchmark list
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#F59E0B" />
                </TouchableOpacity>

                {/* Standard Benchmark Options */}
                <Text style={[styles.selectorSectionHeading, { marginTop: 16 }]}>
                  STANDARD BENCHMARK TESTS
                </Text>

                <TouchableOpacity
                  style={styles.selectorItem}
                  onPress={() =>
                    handleSelectBenchmark('1k', '1 km Benchmark Run', undefined, 1.0)
                  }
                  activeOpacity={0.7}
                >
                  <View style={[styles.selectorIconWrap, { backgroundColor: '#F59E0B' }]}>
                    <Ionicons name="flash" size={18} color="#0F172A" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectorItemTitle}>1 km Benchmark Run</Text>
                    <Text style={styles.selectorItemDesc}>
                      1.0 km peak speed test & VO2 max estimation
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.selectorItem}
                  onPress={() =>
                    handleSelectBenchmark('5k', '5 km Benchmark Run', undefined, 5.0)
                  }
                  activeOpacity={0.7}
                >
                  <View style={[styles.selectorIconWrap, { backgroundColor: '#38BDF8' }]}>
                    <Ionicons name="speedometer" size={18} color="#0F172A" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectorItemTitle}>5 km Benchmark Run</Text>
                    <Text style={styles.selectorItemDesc}>
                      5.0 km aerobic threshold & endurance pace benchmark
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.selectorItem}
                  onPress={() =>
                    handleSelectBenchmark('cooper', '12-Minute Cooper Test', undefined, undefined, 12)
                  }
                  activeOpacity={0.7}
                >
                  <View style={[styles.selectorIconWrap, { backgroundColor: '#A855F7' }]}>
                    <Ionicons name="timer" size={18} color="#0F172A" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectorItemTitle}>12-Minute Cooper Test</Text>
                    <Text style={styles.selectorItemDesc}>
                      Max distance covered in 12 min for aerobic capacity
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                </TouchableOpacity>

                {/* Option to remove benchmark if currently assigned */}
                {activeWorkout.isBenchmark && (
                  <TouchableOpacity
                    style={styles.removeBenchmarkItem}
                    onPress={handleRemoveBenchmark}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    <Text style={styles.removeBenchmarkItemText}>
                      Remove Benchmark (Revert to regular run)
                    </Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
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
  benchmarkSection: { marginTop: 14, marginBottom: 4 },
  benchmarkActiveBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderColor: 'rgba(245, 158, 11, 0.45)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  benchmarkBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  benchmarkTrophyBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benchmarkBannerOverline: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  benchmarkBannerTitle: {
    color: PURE_WHITE,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  benchmarkBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(245, 158, 11, 0.2)',
  },
  benchmarkChangeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  benchmarkChangeButtonText: {
    color: '#22C55E',
    fontSize: 12,
    fontWeight: '700',
  },
  benchmarkRemoveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  benchmarkRemoveButtonText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
  setBenchmarkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(34, 197, 94, 0.10)',
    borderColor: 'rgba(34, 197, 94, 0.35)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 12,
  },
  setBenchmarkIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setBenchmarkButtonTitle: {
    color: PURE_WHITE,
    fontSize: 14,
    fontWeight: '700',
  },
  setBenchmarkButtonSub: {
    color: METRIC_GREY,
    fontSize: 11,
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
  stat: { flex: 1 },
  statLabel: { color: METRIC_GREY, fontSize: 13, fontWeight: '600', marginBottom: 4 },
  statValue: { color: PURE_WHITE, fontSize: 14, lineHeight: 19 },
  startButton: { marginTop: 24, backgroundColor: '#22C55E', borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  startBenchmarkButton: { backgroundColor: '#F59E0B' },
  startButtonContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  startButtonText: { color: '#0F172A', fontSize: 17, fontWeight: '700' },
  // Benchmark Selector Sheet
  selectorOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  selectorCard: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    maxHeight: '78%',
    padding: 20,
    paddingBottom: 32,
  },
  selectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  selectorTitle: {
    color: PURE_WHITE,
    fontSize: 20,
    fontWeight: '700',
  },
  selectorSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 3,
  },
  selectorClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  selectorScroll: {
    paddingBottom: 24,
  },
  selectorSectionHeading: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 6,
  },
  selectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  selectorItemHighlight: {
    borderColor: 'rgba(245, 158, 11, 0.5)',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
  },
  selectorIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorItemTitle: {
    color: PURE_WHITE,
    fontSize: 15,
    fontWeight: '600',
  },
  selectorItemDesc: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  loadingWorkouts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    justifyContent: 'center',
  },
  loadingWorkoutsText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  emptyCustomCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptyCustomText: {
    color: '#94A3B8',
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  removeBenchmarkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 18,
  },
  removeBenchmarkItemText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
});
