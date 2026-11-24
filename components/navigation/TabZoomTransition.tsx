import { type ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useReducedMotion,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';

interface TabZoomTransitionProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  animate?: boolean;
  launchOrigin?: { x: number; y: number };
}

export default function TabZoomTransition({
  children,
  style,
  animate = true,
  launchOrigin,
}: TabZoomTransitionProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = animate && !reduceMotion;

  return (
    <Animated.View
      style={[
        styles.container,
        style,
        launchOrigin && {
          transformOrigin: [launchOrigin.x, launchOrigin.y, 0],
        },
      ]}
      entering={shouldAnimate
        ? launchOrigin
          ? ZoomIn.withInitialValues({ transform: [{ scale: 0.02 }] }).duration(320)
          : ZoomIn.withInitialValues({ transform: [{ scale: 0.97 }] }).springify(220).damping(18)
        : undefined}
      exiting={shouldAnimate
        ? ZoomOut.duration(launchOrigin ? 320 : 150)
        : undefined}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
