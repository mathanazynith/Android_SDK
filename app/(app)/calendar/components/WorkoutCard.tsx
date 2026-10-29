import { Feather, Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import BenchmarkBadgeIcon from '../../../../components/BenchmarkBadgeIcon';
import { useTheme } from '../../../../contexts/ThemeContext';
import { WorkoutDetail } from './types';

interface WorkoutCardProps {
  workout: WorkoutDetail;
  onPress: (workout: WorkoutDetail) => void;
  onSwap?: (workout: WorkoutDetail) => void;
  isSelected?: boolean;
}

export default function WorkoutCard({ workout, onPress, onSwap, isSelected = false }: WorkoutCardProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));

  const animate = (toValue: number) => {
    if (reduceMotion) {
      scale.setValue(toValue);
      return;
    }
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      damping: 16,
      stiffness: 220,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        onPress={() => onPress(workout)}
        onPressIn={() => animate(0.98)}
        onPressOut={() => animate(1)}
        style={[
          styles.card,
          { backgroundColor: isSelected ? colors.selected : 'transparent' },
          isSelected && { borderColor: workout.isBenchmark ? '#F59E0B' : workout.accentColor },
        ]}
      >
        <View style={styles.detailBlock}>
          <View style={styles.headerRow}>
            <Text style={[styles.dayText, { color: colors.textSecondary }]}>Day: {workout.day}, {workout.date}</Text>
            {workout.isBenchmark && (
              <View style={styles.benchmarkBadge}>
                <BenchmarkBadgeIcon size={13} color="#F59E0B" />
                <Text style={styles.benchmarkBadgeText}>BENCHMARK</Text>
              </View>
            )}
          </View>
          <Text style={[styles.titleText, { color: colors.text }]} numberOfLines={1}>{workout.title}</Text>
        </View>
        {onSwap ? (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={(event) => {
              event.stopPropagation();
              onSwap(workout);
            }}
            accessibilityLabel="Swap workout"
            accessibilityRole="button"
          >
            <Ionicons name="swap-horizontal-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
        ) : (
          <Feather name="chevron-right" size={18} color={colors.textTertiary} />
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 62,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailBlock: { flex: 1, minWidth: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  dayText: { fontSize: 11, lineHeight: 15 },
  titleText: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  actionButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  benchmarkBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245, 158, 11, 0.16)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, gap: 4 },
  benchmarkBadgeText: { color: '#F59E0B', fontSize: 9, fontWeight: '800' },
});