import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import MotionEntrance from '../../../../components/MotionEntrance';
import { useTheme } from '../../../../contexts/ThemeContext';
import WorkoutCard from './WorkoutCard';
import { WorkoutDetail } from './types';

interface TimelineProps {
  workouts: WorkoutDetail[];
  onSelectWorkout: (workout: WorkoutDetail) => void;
  onSwapWorkout?: (workout: WorkoutDetail) => void;
  selectedWorkoutId?: string;
}

export default function Timeline({ workouts, onSelectWorkout, onSwapWorkout, selectedWorkoutId }: TimelineProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      {workouts.map((workout, index) => (
        <MotionEntrance key={workout.id} delay={Math.min(index, 5) * 35}>
          <View style={styles.row}>
            <View style={styles.leftRail}>
                <View style={[styles.dot, { backgroundColor: workout.accentColor }]}>
                  <Ionicons name={workout.iconName} size={15} color="#FFFFFF" />
                </View>
              {index < workouts.length - 1 && <View style={[styles.line, { backgroundColor: colors.border }]} />}
            </View>
            <View style={styles.cardWrapper}>
                <WorkoutCard
                  workout={workout}
                  onPress={onSelectWorkout}
                  onSwap={onSwapWorkout}
                  isSelected={workout.id === selectedWorkoutId}
                />
            </View>
          </View>
        </MotionEntrance>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'stretch', marginBottom: 4 },
  leftRail: { width: 34, alignItems: 'center', marginRight: 6 },
  dot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  line: { flex: 1, width: 2, marginTop: -1 },
  cardWrapper: { flex: 1 },
});
