import { StyleSheet, View } from 'react-native';
import WorkoutCard from './WorkoutCard';
import { WorkoutDetail } from './types';
import { useTheme } from '../../../../contexts/ThemeContext';
import MotionEntrance from '../../../../components/MotionEntrance';

interface TimelineProps {
  workouts: WorkoutDetail[];
  onSelectWorkout: (workout: WorkoutDetail) => void;
  onSwapWorkout?: (workout: WorkoutDetail) => void;
}

export default function Timeline({ workouts, onSelectWorkout, onSwapWorkout }: TimelineProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      {workouts.map((workout, index) => (
        <MotionEntrance key={workout.id} delay={Math.min(index, 5) * 35}>
          <View style={styles.row}>
            <View style={styles.leftRail}>
              <View style={[styles.dot, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} />
              {index < workouts.length - 1 && <View style={[styles.line, { backgroundColor: colors.border }]} />}
            </View>
            <View style={styles.cardWrapper}>
              <WorkoutCard workout={workout} onPress={onSelectWorkout} onSwap={onSwapWorkout} />
            </View>
          </View>
        </MotionEntrance>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 14, paddingBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'stretch', marginBottom: 8 },
  leftRail: { width: 30, alignItems: 'center', marginRight: 6, paddingTop: 24 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1 },
  line: { flex: 1, width: 2, marginTop: 4 },
  cardWrapper: { flex: 1 },
});
