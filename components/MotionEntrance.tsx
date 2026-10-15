import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown, FadeInLeft, FadeInRight, useReducedMotion } from 'react-native-reanimated';

interface MotionEntranceProps {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  direction?: 'up' | 'left' | 'right';
}

export default function MotionEntrance({ children, delay = 0, style, direction = 'up' }: MotionEntranceProps) {
  const reduceMotion = useReducedMotion();
  const entering = reduceMotion
    ? undefined
    : (direction === 'right' ? FadeInRight : direction === 'left' ? FadeInLeft : FadeInDown)
      .delay(delay)
      .duration(240);

  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}
