import React, { useEffect, useRef, useState } from 'react';
import { Animated, SafeAreaView, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { useAuth } from '../../../service/auth';
import RunningPlanHeader from './components/RunningPlanHeader';
import { mockRunningPlan } from './components/mockPlan';
import Timeline from './components/Timeline';
import TrainingCalendarCard from './components/TrainingCalendarCard';
import { WorkoutDetail } from './components/types';
import WorkoutModal from './components/WorkoutModal';

export default function CalendarScreen() {
  const { user } = useAuth();
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutDetail | null>(null);
  const weekAnimation = useRef(new Animated.Value(1)).current;
  const selectedWeek = mockRunningPlan.weeks[selectedWeekIndex];
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
          <Timeline workouts={selectedWeek.workouts} onSelectWorkout={setSelectedWorkout} />
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
