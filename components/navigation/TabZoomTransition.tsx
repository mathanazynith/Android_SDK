import { type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  Keyframe,
  useReducedMotion,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import type { DashboardLaunchOrigin } from './dashboardLaunchTransition';

interface TabZoomTransitionProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  animate?: boolean;
  launchOrigin?: DashboardLaunchOrigin;
}

export default function TabZoomTransition({
  children,
  style,
  animate = true,
  launchOrigin,
}: TabZoomTransitionProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = animate && !reduceMotion;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const hasOriginRect = Boolean(
    launchOrigin?.width && launchOrigin.height && windowWidth > 0 && windowHeight > 0,
  );
  const originScaleX = hasOriginRect
    ? Math.min(1, Math.max(0.001, launchOrigin!.width! / windowWidth))
    : 0.02;
  const originScaleY = hasOriginRect
    ? Math.min(1, Math.max(0.001, launchOrigin!.height! / windowHeight))
    : 0.02;

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
          ? hasOriginRect
            ? new Keyframe({
                0: { opacity: 0, transform: [{ scaleX: originScaleX }, { scaleY: originScaleY }] },
                100: {
                  opacity: 1,
                  transform: [{ scaleX: 1 }, { scaleY: 1 }],
                  easing: Easing.out(Easing.cubic),
                },
              }).duration(380)
            : ZoomIn.withInitialValues({ scale: 0.02 }).duration(380).easing(Easing.out(Easing.cubic))
          : ZoomIn.withInitialValues({ transform: [{ scale: 0.97 }] }).springify(250).damping(18)
        : undefined}
      exiting={shouldAnimate
        ? launchOrigin && hasOriginRect
          ? new Keyframe({
              0: { opacity: 1, transform: [{ scaleX: 1 }, { scaleY: 1 }] },
              100: {
                opacity: 0,
                transform: [{ scaleX: originScaleX }, { scaleY: originScaleY }],
                easing: Easing.in(Easing.cubic),
              },
            }).duration(380)
          : ZoomOut.duration(launchOrigin ? 380 : 180)
            .withTargetValues({ transform: [{ scale: launchOrigin ? 0.02 : 0.97 }] })
            .easing(Easing.in(Easing.cubic))
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
