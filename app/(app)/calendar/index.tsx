import { useEffect, useRef, useState } from 'react';
import { Animated, SafeAreaView, ScrollView, StatusBar, StyleSheet } from 'react-native';
import { useAuth } from '../../../service/auth';
import { mockRunningPlan } from './components/mockPlan';
import RunningPlanHeader from './components/RunningPlanHeader';
import Timeline from './components/Timeline';
import TrainingCalendarCard from './components/TrainingCalendarCard';
import { WorkoutDetail } from './components/types';
import WorkoutModal from './components/WorkoutModal';

export default function CalendarScreen() {
  const { user } = useAuth();
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutDetail | null>(null);
  const [weekWorkouts, setWeekWorkouts] = useState(() => mockRunningPlan.weeks.map((week) => [...week.workouts]));
  const weekAnimation = useRef(new Animated.Value(1)).current;
  const selectedWeek = mockRunningPlan.weeks[selectedWeekIndex];
  const selectedWeekWorkouts = weekWorkouts[selectedWeekIndex] || selectedWeek.workouts;
  const userName = user?.first_name?.trim() || user?.username?.trim() || 'Runner';

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
      Math.max(0, Math.min(mockRunningPlan.weeks.length - 1, currentIndex + direction))
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <RunningPlanHeader
          planName={mockRunningPlan.name}
          focusLabel={mockRunningPlan.focus}
          userName={userName}
        />
        <TrainingCalendarCard
          weekLabel={selectedWeek.label}
          rangeLabel={selectedWeek.dateRange}
          statusText={selectedWeek.statusText}
          totalWeeks={mockRunningPlan.totalWeeks}
          currentWeekIndex={selectedWeekIndex + 3}
          onPrevious={() => changeWeek(-1)}
          onNext={() => changeWeek(1)}
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
