import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface WorkoutIconProps {
  name: string;
  size?: number;
  color?: string;
  backgroundColor?: string;
}

export default function WorkoutIcon({
  name,
  size = 18,
  color = '#FFFFFF',
  backgroundColor = '#34C759',
}: WorkoutIconProps) {
  return (
    <View style={[styles.container, { backgroundColor }]}> 
      <Ionicons name={name as never} size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 46,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
