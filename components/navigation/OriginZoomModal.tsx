import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Modal,
  useWindowDimensions,
  View,
  type ModalProps,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import type { DashboardLaunchOrigin } from './dashboardLaunchTransition';

interface OriginZoomModalProps extends Omit<ModalProps, 'visible' | 'animationType' | 'children' | 'onShow'> {
  visible: boolean;
  children: ReactNode;
  launchOrigin?: DashboardLaunchOrigin;
  duration?: number;
  onExitComplete?: () => void;
  onShow?: () => void;
}

type LocalOrigin = { x: number; y: number; scaleX: number; scaleY: number };

const clampScale = (value: number) => Math.min(1, Math.max(0.001, value));

export default function OriginZoomModal({
  visible,
  children,
  launchOrigin,
  duration = 380,
  onExitComplete,
  onShow,
  ...modalProps
}: OriginZoomModalProps) {
  const reduceMotion = useReducedMotion();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const rootRef = useRef<View>(null);
  const latestVisibleRef = useRef(visible);
  latestVisibleRef.current = visible;
  const presentedRef = useRef(visible);
  const closingRef = useRef(false);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const frameRef = useRef<number | null>(null);
  const [presented, setPresented] = useState(visible);
  const [activeOrigin, setActiveOrigin] = useState(visible ? launchOrigin : undefined);
  const fallbackScaleX = launchOrigin?.width && windowWidth > 0
    ? clampScale(launchOrigin.width / windowWidth)
    : 0.02;
  const fallbackScaleY = launchOrigin?.height && windowHeight > 0
    ? clampScale(launchOrigin.height / windowHeight)
    : 0.02;
  const [localOrigin, setLocalOrigin] = useState<LocalOrigin>({
    x: windowWidth / 2,
    y: windowHeight / 2,
    scaleX: fallbackScaleX,
    scaleY: fallbackScaleY,
  });
  const scaleX = useRef(new Animated.Value(visible && !reduceMotion ? fallbackScaleX : 1)).current;
  const scaleY = useRef(new Animated.Value(visible && !reduceMotion ? fallbackScaleY : 1)).current;
  const opacity = useRef(new Animated.Value(visible && !reduceMotion ? 0 : 1)).current;

  const setPresentedState = (next: boolean) => {
    presentedRef.current = next;
    setPresented(next);
  };

  const cancelPendingEntry = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  };

  const animateIn = (origin: DashboardLaunchOrigin | undefined, measured?: LocalOrigin) => {
    animationRef.current?.stop();
    cancelPendingEntry();
    closingRef.current = false;
    const nextOrigin = measured ?? {
      x: origin?.x ?? windowWidth / 2,
      y: origin?.y ?? windowHeight / 2,
      scaleX: origin?.width && windowWidth > 0 ? clampScale(origin.width / windowWidth) : 0.02,
      scaleY: origin?.height && windowHeight > 0 ? clampScale(origin.height / windowHeight) : 0.02,
    };
    setLocalOrigin(nextOrigin);
    scaleX.setValue(reduceMotion ? 1 : nextOrigin.scaleX);
    scaleY.setValue(reduceMotion ? 1 : nextOrigin.scaleY);
    opacity.setValue(reduceMotion ? 1 : 0);
    if (reduceMotion) return;

    const animation = Animated.parallel([
      Animated.timing(scaleX, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scaleY, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: Math.min(duration, 280),
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    animationRef.current = animation;
    animation.start();
  };

  const handleShow = () => {
    onShow?.();
    const origin = activeOrigin;
    if (!origin) {
      animateIn(undefined);
      return;
    }
    const root = rootRef.current;
    if (!root) {
      animateIn(origin);
      return;
    }
    root.measureInWindow((windowX, windowY, width, height) => {
      if (width <= 0 || height <= 0 || ![windowX, windowY, width, height].every(Number.isFinite)) {
        animateIn(origin);
        return;
      }
      const measured = {
        x: origin.x - windowX,
        y: origin.y - windowY,
        scaleX: origin.width && width > 0 ? clampScale(origin.width / width) : fallbackScaleX,
        scaleY: origin.height && height > 0 ? clampScale(origin.height / height) : fallbackScaleY,
      };
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        if (latestVisibleRef.current) animateIn(origin, measured);
      });
    });
  };

  useEffect(() => {
    if (visible) {
      if (!presentedRef.current) {
        setActiveOrigin(launchOrigin);
        closingRef.current = false;
        setPresentedState(true);
      } else if (closingRef.current) {
        setActiveOrigin(launchOrigin);
        animateIn(launchOrigin);
      }
      return;
    }

    if (!presentedRef.current || closingRef.current) return;
    closingRef.current = true;
    animationRef.current?.stop();
    cancelPendingEntry();
    if (reduceMotion) {
      setActiveOrigin(undefined);
      closingRef.current = false;
      setPresentedState(false);
      onExitComplete?.();
      return;
    }

    const animation = Animated.parallel([
      Animated.timing(scaleX, {
        toValue: localOrigin.scaleX,
        duration,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scaleY, {
        toValue: localOrigin.scaleY,
        duration,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: Math.min(duration, 280),
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    animationRef.current = animation;
    animation.start(({ finished }) => {
      if (!finished || latestVisibleRef.current) return;
      closingRef.current = false;
      setActiveOrigin(undefined);
      setPresentedState(false);
      onExitComplete?.();
    });
  }, [duration, launchOrigin, localOrigin, onExitComplete, reduceMotion, scaleX, scaleY, opacity, visible]);

  useEffect(() => () => {
    animationRef.current?.stop();
    cancelPendingEntry();
  }, []);

  return (
    <Modal
      {...modalProps}
      visible={presented}
      animationType="none"
      onShow={handleShow}
    >
      <Animated.View
        ref={rootRef}
        collapsable={false}
        style={{
          flex: 1,
          transformOrigin: [localOrigin.x, localOrigin.y, 0],
          opacity,
          transform: [{ scaleX }, { scaleY }],
        }}
      >
        {children}
      </Animated.View>
    </Modal>
  );
}
