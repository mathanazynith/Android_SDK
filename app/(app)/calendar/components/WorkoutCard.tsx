import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import WorkoutIcon from './WorkoutIcon';
import { WorkoutDetail } from './types';

interface WorkoutCardProps {
  workout: WorkoutDetail;
  onPress: (workout: WorkoutDetail) => void;
  onSwap?: (workout: WorkoutDetail) => void;
}

export default function WorkoutCard({ workout, onPress, onSwap }: WorkoutCardProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (toValue: number) => Animated.spring(scale, { toValue, useNativeDriver: true, damping: 16, stiffness: 220 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onPress(workout)}
        onPressIn={() => animate(0.98)}
        onPressOut={() => animate(1)}
        style={styles.card}
      >
        <View style={styles.iconBox}>
          <WorkoutIcon name={workout.iconName} backgroundColor="transparent" color={workout.accentColor} size={30} />
        </View>
        <View style={styles.detailBlock}>
          <Text style={styles.dayText}>{workout.day}, {workout.date}</Text>
          <Text style={styles.titleText}>{workout.title}</Text>
          <Text style={styles.subtitleText}>{workout.workoutType}</Text>
        </View>
        {onSwap ? (
          <TouchableOpacity
            style={styles.swapButton}
            onPress={() => onSwap(workout)}
            accessibilityLabel="Swap workout"
          >
            <Ionicons name="swap-horizontal-outline" size={20} color="#63C72B" />
          </TouchableOpacity>
        ) : null}
      </Pressable>
    </Animated.View>
  );
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
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  iconBox: {
    width: 48,
    alignItems: 'center',
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
