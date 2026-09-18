import { Feather } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { memo, useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useQuestionnaire } from '../../contexts/QuestionnaireContext';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';

type Tab = {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: 'Plan' | 'Activities' | 'Record' | 'Stats' | 'Profile';
  route: '/(app)/training-plan' | '/(app)/activity' | '/(app)/dashboard' | '/(app)/stats' | '/(app)/profile';
};

export const PRIMARY_TAB_PATHS = [
  '/training-plan',
  '/activity',
  '/dashboard',
  '/stats',
  '/profile',
] as const;

export const isPrimaryTabPath = (pathname: string) => {
  const normalizedPathname = pathname.replace('/(app)', '');
  return PRIMARY_TAB_PATHS.includes(normalizedPathname as (typeof PRIMARY_TAB_PATHS)[number]);
};

const tabs: Tab[] = [
  { icon: 'clipboard', label: 'Plan', route: '/(app)/training-plan' },
  { icon: 'activity', label: 'Activities', route: '/(app)/activity' },
  { icon: 'home', label: 'Record', route: '/(app)/dashboard' },
  { icon: 'bar-chart-2', label: 'Stats', route: '/(app)/stats' },
  { icon: 'user', label: 'Profile', route: '/(app)/profile' },
];

const ACTIVE_GLOW_SIZE = 60;
const TAB_ROW_HORIZONTAL_PADDING = 4;
const ACTIVE_GLOW_WIDTH = 60;

type TabButtonProps = {
  tab: Tab;
  active: boolean;
  enabled: boolean;
  activeColor: string;
  inactiveColor: string;
  iconSize: number;
  labelSize: number;
  onPress: (tab: Tab) => void;
};

const TabButton = memo(function TabButton({
  tab,
  active,
  enabled,
  activeColor,
  inactiveColor,
  iconSize,
  labelSize,
  onPress,
}: TabButtonProps) {
  return (
    <TouchableOpacity
      style={styles.tab}
      onPress={() => onPress(tab)}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !enabled }}
    >
      <View style={styles.iconWrapper}>
        <Feather name={tab.icon} size={iconSize} color={active ? activeColor : inactiveColor} />
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[
          styles.label,
          { color: active ? activeColor : inactiveColor, fontSize: labelSize },
          active && styles.activeLabel,
          !enabled && styles.disabledLabel,
        ]}
      >
        {tab.label}
      </Text>
    </TouchableOpacity>
  );
});

const isTabActive = (pathname: string, route: Tab['route']) => {
  if (route === '/(app)/training-plan') return pathname.includes('/training-plan');
  if (route === '/(app)/activity') return pathname.includes('/activity') || pathname.includes('/history') || pathname === '/home';
  if (route === '/(app)/dashboard') return pathname.includes('/dashboard');
  if (route === '/(app)/stats') return pathname.includes('/stats');
  if (route === '/(app)/profile') return pathname.includes('/profile');
  return false;
};

export default function GlobalBottomNav() {
  const pathname = usePathname();
  const { isDark } = useTheme();
  const isLegacyAndroidBlur = Platform.OS === 'android' && Number(Platform.Version) < 31;
  const { workoutPlan, isWorkoutPlanLoaded, isWorkoutPlanLoading, fetchWorkoutPlan } = useQuestionnaire();
  const [rowWidth, setRowWidth] = useState(0);
  const activeIndex = tabs.findIndex((tab) => isTabActive(pathname, tab.route));
  const tabContentWidth = Math.max(0, rowWidth - TAB_ROW_HORIZONTAL_PADDING * 2);
  const tabWidth = tabContentWidth > 0 ? tabContentWidth / tabs.length : 0;
  const glowTranslateX = useSharedValue(0);

  useEffect(() => {
    if (!isWorkoutPlanLoaded && !isWorkoutPlanLoading) void fetchWorkoutPlan();
  }, [fetchWorkoutPlan, isWorkoutPlanLoaded, isWorkoutPlanLoading]);

  useEffect(() => {
    if (activeIndex >= 0 && rowWidth > 0) {
      glowTranslateX.value = withTiming(
        TAB_ROW_HORIZONTAL_PADDING + activeIndex * tabWidth + (tabWidth - ACTIVE_GLOW_WIDTH) / 2,
        {
          duration: 180,
        },
      );
    }
  }, [activeIndex, glowTranslateX, rowWidth, tabWidth]);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: glowTranslateX.value }],
  }));

  const hasActivePlan = isWorkoutPlanLoaded && Boolean(workoutPlan?.weeks?.length);
  const handleTabPress = useCallback((tab: Tab) => {
    if (tab.label === 'Record') {
      router.replace('/(app)/dashboard');
      return;
    }
    if (tab.label === 'Plan') {
      router.replace({ pathname: tab.route, params: { selectedWeek: '1' } });
      return;
    }
    router.replace(tab.route);
  }, []);

  if (!isPrimaryTabPath(pathname)) return null;

  return (
    <BlurView
      intensity={isLegacyAndroidBlur ? 0 : isDark ? 85 : 80}
      tint={isDark ? 'dark' : 'light'}
      experimentalBlurMethod="dimezisBlurView"
      style={[
        styles.container,
        {
          backgroundColor: isLegacyAndroidBlur
            ? isDark ? 'rgba(28, 28, 30, 0.88)' : 'rgba(255, 255, 255, 0.88)'
            : isDark ? 'rgba(18, 18, 22, 0.55)' : 'rgba(255, 255, 255, 0.70)',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(226, 226, 226, 0.75)',
          borderWidth: isDark ? 1.2 : 1.5,
          shadowColor: isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.08)',
          elevation: isDark ? 12 : 8,
        },
      ]}
    >
      <View pointerEvents="none" style={[styles.glassSheen, { borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.10)' }]} />
      <LinearGradient
        pointerEvents="none"
        colors={isDark ? ['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.02)', 'rgba(0, 0, 0, 0.12)'] : ['rgba(255, 255, 255, 0.42)', 'rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.02)']}
        locations={[0, 0.42, 1]}
        style={styles.glassGradient}
      />
      <View
        onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
        style={styles.tabRow}
      >
        {rowWidth > 0 && activeIndex >= 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.activeGlow, glowStyle]}
          />
        ) : null}
        {tabs.map((tab) => {
          const active = isTabActive(pathname, tab.route);
          return (
            <TabButton
              key={tab.label}
              tab={tab}
              active={active}
              enabled={tab.label !== 'Plan' || hasActivePlan}
              activeColor={isDark ? BRAND_GREEN : '#16A34A'}
              inactiveColor={isDark ? '#FFFFFF' : '#000000'}
              iconSize={24}
              labelSize={12}
              onPress={handleTabPress}
            />
          );
        })}
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    height: 64,
    borderRadius: 30,
    overflow: 'hidden',
    zIndex: 10,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 20,
  },
  tabRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: TAB_ROW_HORIZONTAL_PADDING,
  },
  glassSheen: {
    ...StyleSheet.absoluteFill,
    borderRadius: 30,
    borderWidth: 1,
    borderBottomColor: 'transparent',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  glassGradient: {
    ...StyleSheet.absoluteFill,
    borderRadius: 40,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0, position: 'relative' },
  iconWrapper: { width: 30, height: 28, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, lineHeight: 14, marginTop: 1, textAlign: 'center', includeFontPadding: false, maxWidth: '100%' },
  activeLabel: { fontWeight: '700' },
  disabledLabel: { opacity: 0.5 },
  activeGlow: {
    position: 'absolute',
    left: 0,
    top: 1,
    width: ACTIVE_GLOW_WIDTH,
    height: ACTIVE_GLOW_SIZE,
    borderRadius: ACTIVE_GLOW_SIZE / 2,
    backgroundColor: '#22C55E40',
  },
});