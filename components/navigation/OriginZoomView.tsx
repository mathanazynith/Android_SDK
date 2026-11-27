import { type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, {
  Easing,
  useReducedMotion,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import type { DashboardLaunchOrigin } from './dashboardLaunchTransition';

interface OriginZoomViewProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  launchOrigin?: DashboardLaunchOrigin;
  duration?: number;
  exiting?: boolean;
}

export default function OriginZoomView({
  children,
  style,
  launchOrigin,
  duration = 250,
  exiting = true,
}: OriginZoomViewProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <Reanimated.View style={style}>{children}</Reanimated.View>;
  }

  return (
    <Reanimated.View
      style={[
        style,
        launchOrigin && {
          transformOrigin: [launchOrigin.x, launchOrigin.y, 0],
        },
      ]}
      entering={ZoomIn
        .withInitialValues({ scale: 0.02 })
        .duration(duration)
        .easing(Easing.out(Easing.cubic))}
      exiting={exiting
        ? ZoomOut
          .withInitialValues({ scale: 1 })
          .withTargetValues({ transform: [{ scale: 0.02 }] })
          .duration(Math.min(duration, 210))
          .easing(Easing.in(Easing.cubic))
        : undefined}
    >
      {children}
    </Reanimated.View>
  );
}
