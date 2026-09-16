import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

const BENCHMARK_BADGE_IMG = require('../assets/images/benchmark-badge.png');

export interface BenchmarkBadgeIconProps {
  size?: number;
  color?: string;
  style?: StyleProp<ImageStyle>;
}

export default function BenchmarkBadgeIcon({
  size = 20,
  color = '#F59E0B',
  style,
}: BenchmarkBadgeIconProps) {
  return (
    <Image
      source={BENCHMARK_BADGE_IMG}
      style={[
        {
          width: size,
          height: size,
          tintColor: color,
        },
        style,
      ]}
      resizeMode="contain"
    />
  );
}

