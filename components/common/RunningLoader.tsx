import React, { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import LottieView from 'lottie-react-native';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';

const runnerLoopGreen = require('../../assets/animations/runner-loop-green.json');
const runnerLoopMuted = require('../../assets/animations/runner-loop-muted.json');
const runnerLoop = require('../../assets/animations/runner-loop.json');

export interface RunningLoaderProps {
  /** Size of the runner icon in pixels. Default is 56. */
  size?: number;
  /** Custom base Lottie animation source (unfilled/base layer). Default: theme-aware runner-loop-muted.json. */
  baseSource?: any;
  /** Custom fill Lottie animation source (filled layer). Default: runner-loop-green.json. */
  fillSource?: any;
  /** Progress from 0 to 1 (or 0 to 100). If omitted, runs in continuous indeterminate loop. */
  progress?: number;
  /** If true, loops the fill from 0% to 100% continuously. Defaults to true if progress is undefined. */
  indeterminate?: boolean;
  /** Primary fill color once loaded. Default: brand green (#22C55E). */
  fillColor?: string;
  /** Background / unfilled silhouette color. Default: theme-aware muted color. */
  unfilledColor?: string;
  /** Direction of fill: 'bottom-to-top' (liquid rising) or 'left-to-right' (charging forward). Default: 'bottom-to-top'. */
  direction?: 'bottom-to-top' | 'left-to-right';
  /** Visual style: 'lottie' (animated athlete from Lottie JSON) | 'silhouette' (vector runner filling from inside) | 'emoji' (runner emoji). Default: 'lottie' when size > 32, 'silhouette' when size <= 32. */
  mode?: 'lottie' | 'silhouette' | 'emoji';
  /** Optional label text below the runner (e.g. "Loading workout..."). */
  label?: string;
  /** Whether to display numerical percentage text (e.g. "72%"). Default: false. */
  showPercentage?: boolean;
  /** Whether to display animated speed lines behind the runner. Default: true. */
  showSpeedLines?: boolean;
  /** Whether to render dynamic ground contact shadow. Default: true. */
  showShadow?: boolean;
  /** Centers in a full-screen overlay backdrop. Default: false. */
  fullScreen?: boolean;
  /** Custom container style. */
  style?: ViewStyle;
}

export const RunningLoader: React.FC<RunningLoaderProps> = ({
  size = 56,
  baseSource,
  fillSource,
  progress,
  indeterminate,
  fillColor = BRAND_GREEN,
  unfilledColor,
  direction = 'bottom-to-top',
  mode,
  label,
  showPercentage = false,
  showSpeedLines = true,
  showShadow = true,
  fullScreen = false,
  style,
}) => {
  const { isDark, colors } = useTheme();

  const isSmall = size <= 28;
  const effectiveMode = mode ?? (size > 32 ? 'lottie' : 'silhouette');
  const isLottie = effectiveMode === 'lottie';
  const effectiveShowSpeedLines = !isLottie && showSpeedLines && !isSmall;
  const effectiveShowShadow = !isLottie && showShadow && !isSmall;

  // Resolved Lottie animation sources
  const effectiveBaseSource = baseSource || (isDark ? runnerLoopMuted : runnerLoop);
  const effectiveFillSource = fillSource || runnerLoopGreen;

  // Determine indeterminate mode: default to true if progress is not passed
  const isIndeterminate = indeterminate ?? progress === undefined;

  // Normalized progress value (0 to 1)
  const normalizedProgress = progress !== undefined
    ? Math.min(1, Math.max(0, progress > 1 ? progress / 100 : progress))
    : 0;

  // Animated values initialized once using lazy state
  const [fillAnim] = useState(() => new Animated.Value(isIndeterminate ? 0 : normalizedProgress));
  const [strideAnim] = useState(() => new Animated.Value(0));
  const [windAnim] = useState(() => new Animated.Value(0));
  const [pulseAnim] = useState(() => new Animated.Value(1));

  // Keep a tracked numeric value for percentage text display
  const [currentProgressPct, setCurrentProgressPct] = React.useState(
    Math.round((isIndeterminate ? 0 : normalizedProgress) * 100)
  );

  // Default unfilled silhouette color
  const defaultUnfilled = isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(15, 23, 42, 0.18)';
  const effectiveUnfilledColor = unfilledColor || defaultUnfilled;

  // 1. Stride / Running motion loop (vertical bobbing + forward athletic lean, only needed for silhouette)
  useEffect(() => {
    if (isLottie) return;

    const strideLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(strideAnim, {
          toValue: 1,
          duration: 340,
          easing: Easing.bezier(0.37, 0, 0.63, 1),
          useNativeDriver: true,
        }),
        Animated.timing(strideAnim, {
          toValue: 0,
          duration: 340,
          easing: Easing.bezier(0.37, 0, 0.63, 1),
          useNativeDriver: true,
        }),
      ])
    );
    strideLoop.start();

    return () => strideLoop.stop();
  }, [strideAnim, isLottie]);

  // 2. Speed / Wind streak lines loop
  useEffect(() => {
    if (!effectiveShowSpeedLines || isLottie) return;

    const windLoop = Animated.loop(
      Animated.timing(windAnim, {
        toValue: 1,
        duration: 520,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    windLoop.start();

    return () => windLoop.stop();
  }, [windAnim, effectiveShowSpeedLines, isLottie]);

  // 3. Fill animation (determinate vs indeterminate)
  useEffect(() => {
    let listenerId: string | null = null;
    if (showPercentage) {
      listenerId = fillAnim.addListener(({ value }) => {
        setCurrentProgressPct(Math.round(value * 100));
      });
    }

    if (isIndeterminate) {
      // Loop: 0 -> 1 over 1600ms, brief pause, then reset and repeat
      const fillLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(fillAnim, {
            toValue: 1,
            duration: 1600,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: false,
          }),
          Animated.delay(250),
          Animated.timing(fillAnim, {
            toValue: 0,
            duration: 350,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.delay(120),
        ])
      );
      fillLoop.start();

      return () => {
        fillLoop.stop();
        if (listenerId) fillAnim.removeListener(listenerId);
      };
    } else {
      // Determinate smooth transition
      Animated.timing(fillAnim, {
        toValue: normalizedProgress,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();

      // Pulse effect on 100% completion
      if (normalizedProgress >= 0.999) {
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.14,
            duration: 180,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 220,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      }

      return () => {
        if (listenerId) fillAnim.removeListener(listenerId);
      };
    }
  }, [isIndeterminate, normalizedProgress, fillAnim, pulseAnim, showPercentage]);

  // Interpolations for runner physics (memoized to prevent re-creation)
  const bobbingTranslateY = useMemo(() => strideAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -size * (isSmall ? 0.08 : 0.12), 0],
  }), [strideAnim, size, isSmall]);

  const athleticTilt = useMemo(() => strideAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['-6deg', '-12deg', '-6deg'],
  }), [strideAnim]);

  // Dynamic ground shadow reacts inversely to airborne height
  const shadowScaleX = useMemo(() => strideAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1.2, 0.72, 1.2],
  }), [strideAnim]);

  const shadowOpacity = useMemo(() => strideAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.38, 0.14, 0.38],
  }), [strideAnim]);

  // Wind speed streak offsets
  const windTranslateX = useMemo(() => windAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -size * 0.35],
  }), [windAnim, size]);

  const windOpacity = useMemo(() => windAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.65, 0.35, 0],
  }), [windAnim]);

  // Fill dimension (height or width depending on direction)
  const fillDimension = useMemo(() => fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, size],
  }), [fillAnim, size]);

  const emojiHaloOpacity = useMemo(() => fillAnim.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0.2, 0.6, 1],
  }), [fillAnim]);

  return (
    <View
      style={[
        styles.wrapper,
        { padding: isSmall ? 0 : 12 },
        fullScreen && [styles.fullScreenBackdrop, { backgroundColor: colors.overlay }],
        style,
      ]}
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: isIndeterminate ? undefined : currentProgressPct,
      }}
    >
      <View style={styles.stage}>
        {/* Animated Speed Lines (Wind) */}
        {effectiveShowSpeedLines && (
          <Animated.View
            style={[
              styles.speedLinesContainer,
              {
                width: size * 0.5,
                height: size * 0.6,
                left: -size * 0.28,
                transform: [{ translateX: windTranslateX }],
                opacity: windOpacity,
              },
            ]}
          >
            <View
              style={[
                styles.speedLine,
                { width: size * 0.32, backgroundColor: fillColor },
              ]}
            />
            <View
              style={[
                styles.speedLine,
                { width: size * 0.44, marginTop: size * 0.12, backgroundColor: fillColor },
              ]}
            />
            <View
              style={[
                styles.speedLine,
                { width: size * 0.24, marginTop: size * 0.12, backgroundColor: fillColor },
              ]}
            />
          </Animated.View>
        )}

        {/* Runner Motion Container (Bobbing + Tilt + Pulse) */}
        <Animated.View
          style={[
            styles.runnerMotionBox,
            {
              transform: isLottie
                ? [{ scale: pulseAnim }]
                : [
                    { translateY: bobbingTranslateY },
                    { rotate: athleticTilt },
                    { scale: pulseAnim },
                  ],
            },
          ]}
        >
          {effectiveMode === 'lottie' ? (
            // Lottie Athlete Mode (User's animated runner with bottom-to-top green fill)
            <View style={{ width: size, height: size, position: 'relative' }}>
              {/* Layer 1: Base Unfilled Athlete */}
              <LottieView
                source={effectiveBaseSource}
                autoPlay
                loop
                style={{ width: size, height: size }}
              />

              {/* Layer 2: Animated Clipping Window for Liquid Green Fill */}
              <Animated.View
                collapsable={false}
                style={[
                  styles.clipContainer,
                  direction === 'bottom-to-top'
                    ? {
                        height: fillDimension,
                        width: size,
                        bottom: 0,
                        left: 0,
                      }
                    : {
                        width: fillDimension,
                        height: size,
                        top: 0,
                        left: 0,
                      },
                ]}
              >
                {/* Layer 3: Vibrant Green Athlete Running in Synced Lockstep */}
                <View
                  style={{
                    width: size,
                    height: size,
                    position: 'absolute',
                    bottom: direction === 'bottom-to-top' ? 0 : undefined,
                    top: direction === 'left-to-right' ? 0 : undefined,
                    left: 0,
                  }}
                >
                  <LottieView
                    source={effectiveFillSource}
                    autoPlay
                    loop
                    style={{ width: size, height: size }}
                  />
                </View>
              </Animated.View>
            </View>
          ) : effectiveMode === 'emoji' ? (
            // Emoji Mode with green progress circular glow
            <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View
                style={[
                  styles.emojiHalo,
                  {
                    width: size * 1.15,
                    height: size * 1.15,
                    borderRadius: (size * 1.15) / 2,
                    borderColor: fillColor,
                    borderWidth: 2.5,
                    opacity: emojiHaloOpacity,
                  },
                ]}
              />
              <Text style={{ fontSize: size * 0.72, includeFontPadding: false }}>🏃</Text>
            </View>
          ) : (
            // Silhouette Mode (Liquid inside fill effect)
            <View style={{ width: size, height: size, position: 'relative' }}>
              {/* Layer 1: Base Unfilled Silhouette */}
              <MaterialCommunityIcons
                name="run-fast"
                size={size}
                color={effectiveUnfilledColor}
              />

              {/* Layer 2: Animated Clipping Window (Anchored to bottom or left) */}
              <Animated.View
                collapsable={false}
                style={[
                  styles.clipContainer,
                  direction === 'bottom-to-top'
                    ? {
                        height: fillDimension,
                        width: size,
                        bottom: 0,
                        left: 0,
                      }
                    : {
                        width: fillDimension,
                        height: size,
                        top: 0,
                        left: 0,
                      },
                ]}
              >
                {/* Layer 3: Vibrant Green Runner Icon aligned with the base runner */}
                <View
                  style={[
                    styles.alignedGreenRunner,
                    {
                      width: size,
                      height: size,
                      bottom: direction === 'bottom-to-top' ? 0 : undefined,
                      top: direction === 'left-to-right' ? 0 : undefined,
                      left: 0,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="run-fast"
                    size={size}
                    color={fillColor}
                  />
                </View>
              </Animated.View>
            </View>
          )}
        </Animated.View>

        {/* Dynamic Ground Contact Shadow */}
        {effectiveShowShadow && (
          <Animated.View
            style={[
              styles.shadow,
              {
                width: size * 0.68,
                height: Math.max(4, size * 0.08),
                marginTop: size * 0.04,
                transform: [{ scaleX: shadowScaleX }],
                opacity: shadowOpacity,
                backgroundColor: isDark ? '#000000' : '#334155',
              },
            ]}
          />
        )}
      </View>

      {/* Progress percentage label */}
      {showPercentage && (
        <Text style={[styles.percentageText, { color: fillColor }]}>
          {currentProgressPct}%
        </Text>
      )}

      {/* Descriptive Status Label */}
      {Boolean(label) && (
        <Text style={[styles.labelText, { color: colors.textSecondary }]}>
          {label}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  fullScreenBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 9999,
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  speedLinesContainer: {
    position: 'absolute',
    top: '20%',
    justifyContent: 'center',
    zIndex: 0,
  },
  speedLine: {
    height: 2,
    borderRadius: 1,
    opacity: 0.75,
  },
  runnerMotionBox: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  clipContainer: {
    position: 'absolute',
    overflow: 'hidden',
    zIndex: 2,
  },
  alignedGreenRunner: {
    position: 'absolute',
  },
  emojiHalo: {
    position: 'absolute',
    borderStyle: 'dashed',
  },
  shadow: {
    borderRadius: 999,
    alignSelf: 'center',
  },
  percentageText: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  labelText: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 6,
    textAlign: 'center',
    maxWidth: 220,
  },
});

export default RunningLoader;
