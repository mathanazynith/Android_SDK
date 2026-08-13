import { StyleSheet, View } from 'react-native';
import WorkoutCard from './WorkoutCard';
import { WorkoutDetail } from './types';

interface TimelineProps {
  workouts: WorkoutDetail[];
  onSelectWorkout: (workout: WorkoutDetail) => void;
  onSwapWorkout: (workout: WorkoutDetail) => void;
}

export default function Timeline({ workouts, onSelectWorkout, onSwapWorkout }: TimelineProps) {
  return (
    <View style={styles.container}>
      {workouts.map((workout, index) => (
        <View key={workout.id} style={styles.row}>
          <View style={styles.leftRail}>
            <View style={styles.dot} />
            {index < workouts.length - 1 && <View style={styles.line} />}
          </View>
          <View style={styles.cardWrapper}>
            <WorkoutCard workout={workout} onPress={onSelectWorkout} onSwap={onSwapWorkout} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 14, paddingBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'stretch', marginBottom: 8 },
  leftRail: { width: 30, alignItems: 'center', marginRight: 6, paddingTop: 24 },
  dot: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#5B5B5B', borderWidth: 1, borderColor: '#717171' },
  line: { flex: 1, width: 2, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: 4 },
  cardWrapper: { flex: 1 },
});
