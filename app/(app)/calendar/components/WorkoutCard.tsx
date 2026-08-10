import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import WorkoutIcon from './WorkoutIcon';
import { WorkoutDetail } from './types';

interface WorkoutCardProps { workout: WorkoutDetail; onPress: (workout: WorkoutDetail) => void; }

export default function WorkoutCard({ workout, onPress }: WorkoutCardProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (toValue: number) => Animated.spring(scale, { toValue, useNativeDriver: true, damping: 16, stiffness: 220 }).start();
  return <Animated.View style={{ transform: [{ scale }] }}><Pressable accessibilityRole="button" onPress={() => onPress(workout)} onPressIn={() => animate(0.98)} onPressOut={() => animate(1)} style={styles.card}><View style={styles.iconBox}><WorkoutIcon name={workout.iconName} backgroundColor="transparent" color={workout.accentColor} size={30} /></View><View style={styles.detailBlock}><Text style={styles.dayText}>Day: {workout.day}, {workout.date}</Text><Text style={styles.titleText}>{workout.title}</Text></View></Pressable></Animated.View>;
}

const styles = StyleSheet.create({
  card: { minHeight: 80, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', backgroundColor: 'rgba(255,255,255,0.06)' },
  iconBox: { width: 48, alignItems: 'center' },
  detailBlock: { flex: 1, marginLeft: 8 },
  dayText: { color: '#8EA8DE', fontSize: 16, lineHeight: 20 },
  titleText: { color: '#FFF', fontSize: 22, fontWeight: '500', marginTop: 1 },
});
