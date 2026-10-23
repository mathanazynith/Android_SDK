import { type ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useReducedMotion,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';

interface TabZoomTransitionProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  animate?: boolean;
}

export default function TabZoomTransition({ children, style, animate = true }: TabZoomTransitionProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = animate && !reduceMotion;

  return (
    <Animated.View
      style={[styles.container, style]}
      entering={shouldAnimate ? FadeIn.springify(220).damping(18) : undefined}
      exiting={shouldAnimate ? FadeOut.duration(150) : undefined}
      layout={shouldAnimate ? LinearTransition.springify(220).damping(18) : undefined}
    >
      <Animated.View
        style={styles.content}
        entering={shouldAnimate
          ? ZoomIn.withInitialValues({ transform: [{ scale: 0.95 }] }).springify(220).damping(18)
          : undefined}
        exiting={shouldAnimate ? ZoomOut.duration(150) : undefined}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
