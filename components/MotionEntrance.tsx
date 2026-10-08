import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

interface MotionEntranceProps {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

export default function MotionEntrance({ children, delay = 0, style }: MotionEntranceProps) {
  const reduceMotion = useReducedMotion();
  const entering = reduceMotion ? undefined : FadeInDown.delay(delay).duration(240);

  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}
