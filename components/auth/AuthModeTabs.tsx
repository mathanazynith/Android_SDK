import { useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';

type AuthMode = 'login' | 'signup';

interface AuthModeTabsProps {
  mode: AuthMode;
  onChange: (mode: AuthMode) => void;
}

export default function AuthModeTabs({ mode, onChange }: AuthModeTabsProps) {
  const { colors } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const [selectedMode, setSelectedMode] = useState(mode);
  const [isSwitching, setIsSwitching] = useState(false);
  const [indicatorPosition] = useState(() => new Animated.Value(mode === 'signup' ? 1 : 0));
  const segmentWidth = Math.max(0, (trackWidth - 6) / 2);

  const handleLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const switchMode = (nextMode: AuthMode) => {
    if (nextMode === selectedMode || isSwitching) return;

    setSelectedMode(nextMode);
    setIsSwitching(true);
    Animated.timing(indicatorPosition, {
      toValue: nextMode === 'signup' ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      setIsSwitching(false);
      if (finished) onChange(nextMode);
    });
  };

  return (
    <View
      accessibilityRole="tablist"
      onLayout={handleLayout}
      style={[styles.track, { backgroundColor: colors.surfaceRaised }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          {
            backgroundColor: BRAND_GREEN,
            width: segmentWidth,
            transform: [{
              translateX: indicatorPosition.interpolate({
                inputRange: [0, 1],
                outputRange: [0, segmentWidth],
              }),
            }],
          },
        ]}
      />
      {(['login', 'signup'] as const).map((tab) => {
        const selected = selectedMode === tab;
        const label = tab === 'login' ? 'Sign In' : 'Sign Up';
        return (
          <TouchableOpacity
            key={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled: isSwitching }}
            disabled={isSwitching}
            onPress={() => switchMode(tab)}
            style={styles.tab}
          >
            <Text style={[styles.label, { color: selected ? '#101510' : colors.textSecondary }]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    minHeight: 38,
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    marginBottom: 14,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: 8,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});
