import { useIsFocused } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

interface TabZoomTransitionProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function TabZoomTransition({ children, style }: TabZoomTransitionProps) {
  const isFocused = useIsFocused();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!isFocused) return;

    if (reduceMotion) {
      scale.value = 1;
      opacity.value = 1;
    } else {
      scale.value = 0.94;
      opacity.value = 0;
      scale.value = withTiming(1, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
      opacity.value = withTiming(1, { duration: 220 });
    }

    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [isFocused, opacity, reduceMotion, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[{ flex: 1 }, style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}
