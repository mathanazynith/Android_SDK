import { Feather } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuestionnaire } from '../../contexts/QuestionnaireContext';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';
import { useResponsive } from '../../utils/responsive';

type Tab = {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: 'Plan' | 'Activities' | 'Record' | 'Stats' | 'Profile';
  route: '/(app)/training-plan' | '/(app)/activity' | '/(app)/dashboard' | '/(app)/attendance' | '/(app)/profile';
};

export const PRIMARY_TAB_PATHS = [
  '/training-plan',
  '/activity',
  '/dashboard',
  '/attendance',
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
  { icon: 'bar-chart-2', label: 'Stats', route: '/(app)/attendance' },
  { icon: 'user', label: 'Profile', route: '/(app)/profile' },
];

const NAV_HORIZONTAL_PADDING = 8;
const ACTIVE_PILL_WIDTH = 45;
const ACTIVE_PILL_HEIGHT = 45;

type TabButtonProps = {
  tab: Tab;
  active: boolean;
  enabled: boolean;
  inactiveColor: string;
  iconSize: number;
  labelSize: number;
  onPress: (tab: Tab) => void;
};

const TabButton = memo(function TabButton({
  tab,
  active,
  enabled,
  inactiveColor,
  iconSize,
  labelSize,
  onPress,
}: TabButtonProps) {
  const scale = useRef(new Animated.Value(active ? 1.12 : 1)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: active ? 1.12 : 1,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  }, [active, scale]);

  return (
    <TouchableOpacity
      style={styles.tab}
      onPress={() => onPress(tab)}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !enabled }}
    >
      <Animated.View style={[styles.iconWrapper, { transform: [{ scale }] }]}>
        <Feather name={tab.icon} size={iconSize} color={active ? BRAND_GREEN : inactiveColor} />
      </Animated.View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[
          styles.label,
          { color: active ? BRAND_GREEN : inactiveColor, fontSize: labelSize },
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
  if (route === '/(app)/attendance') return pathname.includes('/attendance');
  if (route === '/(app)/profile') return pathname.includes('/profile');
  return false;
};

export default function GlobalBottomNav() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { spacing, fontSize } = useResponsive();
  const { workoutPlan, isWorkoutPlanLoaded, isWorkoutPlanLoading, fetchWorkoutPlan } = useQuestionnaire();
  const [rowWidth, setRowWidth] = useState(0);
  const activeIndex = tabs.findIndex((tab) => isTabActive(pathname, tab.route));
  const tabWidth = rowWidth > 0 ? rowWidth / tabs.length : 0;

  const pillTranslateX = useRef(new Animated.Value(0)).current;
  const pillOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isWorkoutPlanLoaded && !isWorkoutPlanLoading) void fetchWorkoutPlan();
  }, [fetchWorkoutPlan, isWorkoutPlanLoaded, isWorkoutPlanLoading]);

  useEffect(() => {
    const hasActiveTab = activeIndex >= 0 && rowWidth > 0;
    if (hasActiveTab) {
      const nextPosition = activeIndex * tabWidth + (tabWidth - ACTIVE_PILL_WIDTH) / 2;
      Animated.spring(pillTranslateX, {
        toValue: nextPosition,
        useNativeDriver: true,
        friction: 8,
        tension: 100,
      }).start();

      Animated.timing(pillOpacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(pillOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [activeIndex, pillOpacity, pillTranslateX, rowWidth, tabWidth]);

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
    <View
      style={[
        styles.container,
        {
          bottom: spacing(12) + insets.bottom,
          minHeight: spacing(78),
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View
        onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
        style={styles.tabRow}
      >
        {rowWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.activePill,
              {
                opacity: pillOpacity,
                transform: [{ translateX: pillTranslateX }],
              },
            ]}
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
              inactiveColor={colors.inactive}
              iconSize={spacing(24)}
              labelSize={fontSize(10, 9, 11)}
              onPress={handleTabPress}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    minHeight: 78,
    paddingHorizontal: NAV_HORIZONTAL_PADDING,
    paddingVertical: 6,
    borderRadius: 42,
    borderWidth: 1,
    zIndex: 10,
  },
  tabRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0, position: 'relative' },
  iconWrapper: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, lineHeight: 12, marginTop: 3, textAlign: 'center', includeFontPadding: false, maxWidth: '100%' },
  activeLabel: { fontWeight: '700' },
  disabledLabel: { opacity: 0.5 },
  activePill: {
    position: 'absolute',
    left: 0,
    top: '45%',
    marginTop: -ACTIVE_PILL_HEIGHT / 2,
    width: ACTIVE_PILL_WIDTH,
    height: ACTIVE_PILL_HEIGHT,
    borderRadius: ACTIVE_PILL_HEIGHT / 2,
    backgroundColor: '#22C55E40',
  },
});