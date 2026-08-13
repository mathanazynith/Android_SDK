import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuestionnaire } from '../../../contexts/QuestionnaireContext';
import { useAuth } from '../../../service/auth';
import { mockRunningPlan } from './components/mockPlan';
import RunningPlanHeader from './components/RunningPlanHeader';
import Timeline from './components/Timeline';
import TrainingCalendarCard from './components/TrainingCalendarCard';
import { RunningPlanData, WorkoutDetail } from './components/types';
import WorkoutModal from './components/WorkoutModal';

export default function CalendarScreen() {
  const { user } = useAuth();
  const { assessmentResult, isAssessmentResultLoading, fetchAssessmentResult } = useQuestionnaire();
  const [useMock, setUseMock] = useState<boolean>(true);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState<number>(0);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutDetail | null>(null);
  const [weekWorkouts, setWeekWorkouts] = useState<WorkoutDetail[][]>([]);
  const [planMeta, setPlanMeta] = useState<RunningPlanData | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<boolean>(true);
  const [planError, setPlanError] = useState<string | null>(null);
  const weekAnimation = useRef(new Animated.Value(1)).current;
  const selectedWeek = planMeta?.weeks?.[selectedWeekIndex];
  const selectedWeekWorkouts = weekWorkouts[selectedWeekIndex] || selectedWeek?.workouts || [];
  const userName = user?.first_name?.trim() || user?.username?.trim() || 'Runner';

  // read runtime mock flag from storage on mount
  useEffect(() => {
    (async () => {
      try {
        const v = await storage.getItem(storage.KEYS.USE_MOCK_CALENDAR);
        setUseMock(v === null ? true : v === 'true');
      } catch (err) {
        setUseMock(true);
      }
    })();
  }, []);

  useEffect(() => {
    weekAnimation.setValue(0.94);
    Animated.spring(weekAnimation, {
      toValue: 1,
      useNativeDriver: true,
      damping: 15,
      stiffness: 190,
    }).start();
  }, [selectedWeekIndex, weekAnimation]);

  const changeWeek = (direction: -1 | 1) => {
    setSelectedWeekIndex((currentIndex) =>
      Math.max(0, Math.min((planMeta?.weeks?.length ?? 1) - 1, currentIndex + direction))
    );
  };

  const getSwapPartner = (workout: WorkoutDetail): WorkoutDetail => {
    if (workout.isRest) {
      return {
        ...workout,
        title: 'Cross-Training',
        workoutType: 'Recovery alternative',
        iconName: 'bicycle-outline' as any,
        accentColor: '#46C5FF',
        description: 'Swap this rest day for a gentle cross-training session that supports recovery without losing progress.',
        instructions: 'Choose easy cycling or yoga and keep the effort light. Focus on mobility and steady breathing.',
        steps: ['Warm up with 5–8 minutes of brisk walking or dynamic stretching.', 'Complete 20 minutes of low-impact cross-training.', 'Finish with mobility exercises for hips and hamstrings.'],
        coolDown: '5 minutes of slow walking and gentle stretching.',
        estimatedDuration: '28 min',
        estimatedCalories: '150 kcal',
        targetPace: 'Easy',
        heartRateZone: 'Zone 1',
        distance: 'Cross training',
        notes: 'Use this swap if you want an active rest alternative.',
      } as WorkoutDetail;
    }

    return {
      ...workout,
      title: workout.title.includes('Run') ? 'Alternative Run' : `${workout.title} Alt`,
      workoutType: 'Alternate session',
      iconName: 'swap-horizontal-outline' as any,
      accentColor: '#63C72B',
      description: 'Try this alternate version to keep the session fresh while preserving overall recovery and load.',
      instructions: 'Follow the same duration but ease the intensity slightly to keep it comfortable.',
      steps: ['Complete the session with a slightly reduced effort.', 'Maintain good running form and cadence.'],
      coolDown: 'Easy walking and mobility for 5–8 minutes.',
      estimatedDuration: workout.estimatedDuration,
      estimatedCalories: workout.estimatedCalories,
      targetPace: 'Easy to moderate',
      heartRateZone: 'Zone 2',
      distance: workout.distance === '—' ? '—' : workout.distance,
      notes: 'This alternate is a lighter version of the planned session.',
    } as WorkoutDetail;
  };

  const handleSwapWorkout = (workout: WorkoutDetail) => {
    const newState = weekWorkouts.map((workouts, index) =>
      index !== selectedWeekIndex ? workouts : workouts.map((item) => (item.id === workout.id ? (getSwapPartner(item) as any) : item))
    );

    setWeekWorkouts(newState as WorkoutDetail[][]);

    if (selectedWorkout?.id === workout.id) {
      setSelectedWorkout(getSwapPartner(workout) as any as WorkoutDetail);
    }
  };


  const normalizeBackendWorkout = (item: any): WorkoutDetail => {
    return {
      id: String(item?.id ?? item?.workout_id ?? item?.name ?? Math.random()),
      day: item?.day ?? item?.weekday ?? item?.name ?? 'Day',
      date: item?.date ?? item?.date_text ?? '',
      title: item?.title ?? item?.name ?? item?.workout ?? 'Workout',
      workoutType: item?.type ?? item?.workout_type ?? item?.activity ?? '',
      iconName: (item?.iconName ?? 'walk-outline') as any,
      accentColor: item?.accentColor ?? '#63C72B',
      isRest: Boolean(item?.is_rest ?? item?.isRest ?? false),
      description: item?.description ?? item?.details ?? '',
      instructions: item?.instructions ?? item?.instruction ?? '',
      warmUp: item?.warm_up ?? item?.warmUp ?? '',
      steps: item?.steps ?? item?.steps_list ?? [],
      coolDown: item?.cool_down ?? item?.coolDown ?? '',
      estimatedDuration: item?.estimatedDuration ?? item?.duration ?? '',
      estimatedCalories: item?.estimatedCalories ?? item?.calories ?? '',
      targetPace: item?.targetPace ?? item?.pace ?? '',
      heartRateZone: item?.heartRateZone ?? item?.hr_zone ?? '',
      distance: item?.distance ?? item?.target_distance ?? '—',
      notes: item?.notes ?? '',
    } as WorkoutDetail;
  };

  useEffect(() => {
    const loadPlanFromBackend = async () => {
      setLoadingPlan(true);
      setPlanError(null);
      if (useMock) {
        // Load mock plan immediately and skip backend fetch
        const plan = mockRunningPlan;
        setPlanMeta(plan);
        setWeekWorkouts(plan.weeks.map((w) => w.workouts || []));
        const firstWithWorkouts = plan.weeks.findIndex((w) => Array.isArray(w.workouts) && w.workouts.length > 0);
        setSelectedWeekIndex(firstWithWorkouts >= 0 ? firstWithWorkouts : 0);
        setLoadingPlan(false);
        return;
      }
      try {
        if (!assessmentResult) {
          // try to fetch; QuestionnaireContext will cache
          await fetchAssessmentResult();
        }

        const backendPlan = assessmentResult?.assessment?.running_plan ?? assessmentResult?.running_plan ?? assessmentResult?.recommendation?.recommended_plan ?? null;

        if (!backendPlan) {
          setPlanMeta(null);
          setWeekWorkouts([]);
          setPlanError('No running plan available from backend.');
          return;
        }

        // Build RunningPlanData expected by components
        const weeksSource = backendPlan?.weeks ?? backendPlan?.schedule ?? backendPlan?.weekly_schedule ?? null;

        let weeks = [] as any[];
        if (Array.isArray(weeksSource) && weeksSource.length > 0) {
          // backend might provide array of week objects
          weeks = weeksSource.map((w: any, idx: number) => ({
            id: w.id ?? `week-${idx}`,
            label: w.label ?? `Week ${w.week ?? idx + 1}`,
            dateRange: w.date_range ?? w.dateRange ?? `${w.start_date ?? ''} – ${w.end_date ?? ''}`,
            statusText: w.status_text ?? w.statusText ?? '',
            workouts: Array.isArray(w.workouts || w.runs || w.days) ? (w.workouts || w.runs || w.days).map(normalizeBackendWorkout) : [],
          }));
        } else if (backendPlan?.weeklyDays || backendPlan?.duration_weeks) {
          // fallback: if backend returns a flat schedule, try to group by week index
          const schedule = backendPlan?.schedule ?? backendPlan?.workouts ?? [];
          const grouped: Record<number, any[]> = {};
          (schedule || []).forEach((item: any) => {
            const weekNo = Number(item.week ?? item.week_number ?? item.weekIndex ?? 1) - 1;
            const key = Number.isNaN(weekNo) ? 0 : weekNo;
            grouped[key] = grouped[key] || [];
            grouped[key].push(normalizeBackendWorkout(item));
          });
          weeks = Object.keys(grouped).map((k) => ({
            id: `week-${k}`,
            label: `Week ${Number(k) + 1}`,
            dateRange: '',
            statusText: '',
            workouts: grouped[Number(k)] ?? [],
          }));
        }

        const runningPlanData: RunningPlanData = {
          name: backendPlan?.name ?? backendPlan?.title ?? 'Recommended Plan',
          focus: backendPlan?.focus ?? backendPlan?.summary?.focus ?? 'Focus',
          totalWeeks: Number(backendPlan?.duration_weeks ?? backendPlan?.total_weeks ?? weeks.length ?? 0),
          weeks: weeks,
        };

        setPlanMeta(runningPlanData);
        setWeekWorkouts(runningPlanData.weeks.map((w) => w.workouts || []));
        setSelectedWeekIndex((i) => Math.min(i, Math.max(0, runningPlanData.weeks.length - 1)));
      } catch (err: any) {
        setPlanError('Failed to load running plan from backend.');
      } finally {
        setLoadingPlan(false);
      }
    };

    loadPlanFromBackend();
  }, [assessmentResult, useMock]);

  if (loadingPlan || isAssessmentResultLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#28a745" />
          <Text style={{ color: '#fff', marginTop: 12 }}>Generating your running plan...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (planError || !planMeta) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ color: '#fff', fontSize: 16, marginBottom: 12 }}>{planError ?? 'No running plan available.'}</Text>
          <TouchableOpacity
            onPress={async () => {
              setLoadingPlan(true);
              setPlanError(null);
              await fetchAssessmentResult();
              setLoadingPlan(false);
            }}
            style={{ backgroundColor: '#28a745', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 }}
          >
            <Text style={{ color: '#fff' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <RunningPlanHeader
          planName={planMeta.name}
          focusLabel={planMeta.focus}
          userName={userName}
        />
        <TrainingCalendarCard
          weekLabel={selectedWeek?.label ?? ''}
          rangeLabel={selectedWeek?.dateRange ?? ''}
          statusText={selectedWeek?.statusText ?? ''}
          totalWeeks={planMeta.totalWeeks}
          currentWeekIndex={selectedWeekIndex + 1}
          onPrevious={() => changeWeek(-1)}
          onNext={() => changeWeek(1)}
          previousDisabled={selectedWeekIndex <= 0}
          nextDisabled={selectedWeekIndex >= (planMeta?.weeks?.length ?? 1) - 1}
        />
        <Animated.View style={[styles.timelineWrapper, { transform: [{ scale: weekAnimation }] }]}>          
          <Timeline
            workouts={selectedWeekWorkouts}
            onSelectWorkout={setSelectedWorkout}
            onSwapWorkout={handleSwapWorkout}
          />
        </Animated.View>
      </ScrollView>
      <WorkoutModal
        visible={selectedWorkout !== null}
        workout={selectedWorkout}
        onClose={() => setSelectedWorkout(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06090B' },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 34 },
  timelineWrapper: { flex: 1 },
});
