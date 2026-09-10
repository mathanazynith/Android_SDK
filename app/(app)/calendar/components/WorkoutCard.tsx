import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import WorkoutIcon from './WorkoutIcon';
import { WorkoutDetail } from './types';
import { useTheme } from '../../../../contexts/ThemeContext';

interface WorkoutCardProps {
  workout: WorkoutDetail;
  onPress: (workout: WorkoutDetail) => void;
  onSwap?: (workout: WorkoutDetail) => void;
}

export default function WorkoutCard({ workout, onPress, onSwap }: WorkoutCardProps) {
  const { colors, isDark } = useTheme();
  const isActiveWorkout = !workout.isRest;
  const secondaryText = isDark ? '#9CA3AF' : '#64748B';
  const [scale] = useState(() => new Animated.Value(1));
  const animate = (toValue: number) => Animated.spring(scale, { toValue, useNativeDriver: true, damping: 16, stiffness: 220 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onPress(workout)}
        onPressIn={() => animate(0.98)}
        onPressOut={() => animate(1)}
        style={[styles.card, isActiveWorkout
          ? { backgroundColor: '#22C55ECC', borderColor: 'rgba(255,255,255,0.25)' }
          : { backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}
      >
        <View style={styles.iconBox}>
          {workout.isRest ? <View style={styles.sleepIcon}><WorkoutIcon name="moon-outline" backgroundColor="transparent" color="#22C55E" size={30} /><Text style={styles.sleepZ}>Z</Text></View> : <WorkoutIcon name={workout.iconName} backgroundColor="transparent" color="#FFFFFF" size={30} />}
        </View>
        <View style={styles.detailBlock}>
          <Text style={[styles.dayText, { color: isActiveWorkout ? '#FFFFFF' : secondaryText }]}>{workout.day}, {workout.date}</Text>
          <Text style={[styles.titleText, { color: isActiveWorkout ? '#FFFFFF' : colors.textPrimary }]}>{workout.title}</Text>
          <Text style={[styles.subtitleText, { color: isActiveWorkout ? '#FFFFFF' : secondaryText }]}>{workout.workoutType}</Text>
          {!workout.isRest && (
            <View style={styles.metricsRow}>
              {workout.distance ? <Metric icon="navigate-outline" value={workout.distance} color={isActiveWorkout ? '#FFFFFF' : colors.textPrimary} /> : null}
              {workout.estimatedDuration ? <Metric icon="time-outline" value={workout.estimatedDuration} color={isActiveWorkout ? '#FFFFFF' : colors.textPrimary} /> : null}
              {workout.targetPace ? <Metric icon="speedometer-outline" value={workout.targetPace} color={isActiveWorkout ? '#FFFFFF' : colors.textPrimary} /> : null}
              {workout.heartRateZone ? <Metric icon="pulse-outline" value={workout.heartRateZone} color={isActiveWorkout ? '#FFFFFF' : colors.textPrimary} /> : null}
            </View>
          )}
          <Text style={[styles.descriptionText, { color: isActiveWorkout ? '#FFFFFF' : secondaryText }]} numberOfLines={2}>{workout.description}</Text>
        </View>
        {onSwap ? (
          <TouchableOpacity
            style={styles.swapButton}
            onPress={(event) => {
              event.stopPropagation();
              onSwap(workout);
            }}
            accessibilityLabel="Swap workout"
            accessibilityRole="button"
          >
            <Ionicons name="swap-horizontal-outline" size={20} color={isActiveWorkout ? '#FFFFFF' : '#22C55E'} />
          </TouchableOpacity>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function Metric({ icon, value, color }: { icon: React.ComponentProps<typeof Ionicons>['name']; value: string; color: string }) {
  return <View style={styles.metric}><Ionicons name={icon} size={13} color={color} /><Text style={[styles.metricText, { color }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  card: {
    minHeight: 92,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: '#1E1E1E',
  },
  iconBox: {
    width: 48,
    alignItems: 'center',
  },
  sleepIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sleepZ: {
    position: 'absolute',
    top: -2,
    right: 0,
    color: '#22C55E',
    fontSize: 15,
    fontWeight: '800',
  },
  detailBlock: {
    flex: 1,
    marginLeft: 12,
  },
  dayText: {
    color: '#8EA8DE',
    fontSize: 15,
    lineHeight: 20,
  },
  titleText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 4,
  },
  subtitleText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    marginTop: 4,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metricText: {
    color: 'rgba(255,255,255,0.66)',
    fontSize: 12,
  },
  descriptionText: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 7,
  },
  swapButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(99,199,43,0.14)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
});
