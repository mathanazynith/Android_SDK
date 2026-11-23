import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router, usePathname } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Platform, Pressable, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useQuestionnaire } from '../../contexts/QuestionnaireContext';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../service/auth';
import { isAssessmentProfileComplete } from '../../utils/profileEligibility';

type Tab = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: 'Home' | 'History' | 'Feed' | 'Plans' | 'Stats' | 'Profile';
  route: '/(app)/training-plan' | '/(app)/activity' | '/(app)/social' | '/(app)/dashboard' | '/(app)/stats' | '/(app)/profile';
};

export const PRIMARY_TAB_PATHS = [
  '/activity',
  '/social',
  '/training-plan',
  '/dashboard',
  '/stats',
  '/profile',
] as const;

export const isPrimaryTabPath = (pathname: string) => {
  const normalizedPathname = pathname.replace('/(app)', '');
  return PRIMARY_TAB_PATHS.includes(normalizedPathname as (typeof PRIMARY_TAB_PATHS)[number]);
};

const tabs: Tab[] = [
  { icon: 'home', label: 'Home', route: '/(app)/dashboard' },
  { icon: 'history', label: 'History', route: '/(app)/activity' },
  { icon: 'account-group', label: 'Feed', route: '/(app)/social' },
  { icon: 'calendar-month', label: 'Plans', route: '/(app)/training-plan' },
  { icon: 'chart-line', label: 'Stats', route: '/(app)/stats' },
  { icon: 'account', label: 'Profile', route: '/(app)/profile' },
];

const ACTIVE_INDICATOR_BASE_SIZE = 36;
const ACTIVE_TAB_SCALE = 1.15;
const TAB_ROW_BASE_HORIZONTAL_PADDING = 6;
const BOTTOM_NAV_BOTTOM_GAP = 12;

type TabButtonProps = {
  tab: Tab;
  active: boolean;
  enabled: boolean;
  activeColor: string;
  inactiveColor: string;
  iconSize: number;
  iconSlotSize: number;
  labelFontSize: number;
  labelLineHeight: number;
  labelMarginTop: number;
  onPress: (tab: Tab) => void;
};

const TabButton = memo(function TabButton({
  tab,
  active,
  enabled,
  activeColor,
  inactiveColor,
  iconSize,
  iconSlotSize,
  labelFontSize,
  labelLineHeight,
  labelMarginTop,
  onPress,
}: TabButtonProps) {
  const reduceMotion = useReducedMotion();
  const contentScale = useSharedValue(active ? ACTIVE_TAB_SCALE : 1);
  const contentScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: contentScale.value }],
  }));

  useEffect(() => {
    const targetScale = active ? ACTIVE_TAB_SCALE : 1;
    if (reduceMotion) {
      contentScale.value = targetScale;
      return;
    }
    contentScale.value = withSpring(targetScale, { damping: 18, stiffness: 260, mass: 0.7 });
  }, [active, contentScale, reduceMotion]);

  return (
    <TouchableOpacity
      style={styles.tab}
      onPress={() => onPress(tab)}
      disabled={!enabled}
      accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled: !enabled }}
    >
      <Animated.View style={[styles.tabContent, contentScaleStyle, active && styles.selectedTabContent]}>
        <View style={[styles.iconSlot, { width: iconSlotSize, height: iconSlotSize }]}>
          <MaterialCommunityIcons name={tab.icon} size={iconSize} color={active ? activeColor : inactiveColor} />
        </View>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={[
            styles.label,
            { fontSize: labelFontSize, lineHeight: labelLineHeight, marginTop: labelMarginTop },
            { color: active ? activeColor : inactiveColor },
            active && styles.activeLabel,
            !enabled && styles.disabledLabel,
          ]}
        >
          {tab.label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
});

const isTabActive = (pathname: string, route: Tab['route']) => {
  if (route === '/(app)/social') return pathname.includes('/social');
  if (route === '/(app)/training-plan') return pathname.includes('/training-plan');
  if (route === '/(app)/activity') return pathname.includes('/activity') || pathname.includes('/history') || pathname === '/home';
  if (route === '/(app)/dashboard') return pathname.includes('/dashboard');
  if (route === '/(app)/stats') return pathname.includes('/stats');
  if (route === '/(app)/profile') return pathname.includes('/profile');
  return false;
};

export default function GlobalBottomNav({ blurTarget }: { blurTarget?: RefObject<View | null> }) {
  const pathname = usePathname();
  const { colors, isDark } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isAndroid = Platform.OS === 'android';
  const reduceMotion = useReducedMotion();
  const layoutScale = Math.max(0.82, Math.min(1.08, windowWidth / 390, windowHeight / 760));
  const horizontalMargin = Math.min(16, Math.max(10, windowWidth * 0.04));
  const navWidth = Math.max(0, Math.min(windowWidth - horizontalMargin * 2, 560));
  const navHeight = Math.round(72 * layoutScale);
  const navRadius = navHeight / 2;
  const bottomOffset = BOTTOM_NAV_BOTTOM_GAP;
  const tabRowHorizontalPadding = TAB_ROW_BASE_HORIZONTAL_PADDING * layoutScale;
  const activeIndicatorSize = ACTIVE_INDICATOR_BASE_SIZE * layoutScale;
  const iconSlotSize = 44 * layoutScale;
  const iconSize = 21 * layoutScale;
  const labelFontSize = Math.min(12, Math.max(9.5, 11 * layoutScale));
  const labelLineHeight = labelFontSize + 2 * layoutScale;
  const labelMarginTop = 5 * layoutScale;
  const tabContentHeight = iconSlotSize + labelMarginTop + labelLineHeight;
  const iconCenterY = (navHeight - tabContentHeight) / 2 + iconSlotSize / 2;
  const activeIconCenterY = navHeight / 2 + (iconCenterY - navHeight / 2) * ACTIVE_TAB_SCALE;
  const activeIndicatorTop = activeIconCenterY - activeIndicatorSize / 2;
  const { workoutPlan, isWorkoutPlanLoaded, isWorkoutPlanLoading, fetchWorkoutPlan } = useQuestionnaire();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [rowWidth, setRowWidth] = useState(0);
  const [planPrompt, setPlanPrompt] = useState<'get-plan' | 'profile-required' | null>(null);
  const tabNavigationPending = useRef(false);
  const isProfileComplete = isAssessmentProfileComplete(user);
  const isPlanPromptVisible = planPrompt !== null;
  const hasActivePlan = isWorkoutPlanLoaded && Boolean(workoutPlan?.weeks?.length);
  const visibleTabs = useMemo(
    () => hasActivePlan ? tabs : tabs.filter((tab) => tab.label !== 'Plans'),
    [hasActivePlan],
  );
  const activeIndex = visibleTabs.findIndex((tab) => isTabActive(pathname, tab.route));
  const tabContentWidth = Math.max(0, rowWidth - tabRowHorizontalPadding * 2);
  const tabWidth = tabContentWidth > 0 ? tabContentWidth / visibleTabs.length : 0;
  const glowTranslateX = useSharedValue(0);
  const hasPositionedIndicator = useRef(false);
  const previousTabCount = useRef(visibleTabs.length);

  useEffect(() => {
    if (!isWorkoutPlanLoaded && !isWorkoutPlanLoading) void fetchWorkoutPlan();
  }, [fetchWorkoutPlan, isWorkoutPlanLoaded, isWorkoutPlanLoading]);

  useEffect(() => {
    tabNavigationPending.current = false;
  }, [pathname]);

  useEffect(() => {
    if (activeIndex < 0 || rowWidth <= 0) return;

    const targetX = tabRowHorizontalPadding + activeIndex * tabWidth + (tabWidth - activeIndicatorSize) / 2;
    const tabCountChanged = previousTabCount.current !== visibleTabs.length;
    previousTabCount.current = visibleTabs.length;
    cancelAnimation(glowTranslateX);
    if (reduceMotion || tabCountChanged || !hasPositionedIndicator.current) {
      glowTranslateX.value = targetX;
      hasPositionedIndicator.current = true;
    } else {
      glowTranslateX.value = withSpring(targetX, { damping: 20, stiffness: 160, mass: 1 });
    }
  }, [
    activeIndex,
    activeIndicatorSize,
    glowTranslateX,
    reduceMotion,
    rowWidth,
    tabRowHorizontalPadding,
    tabWidth,
    visibleTabs.length,
  ]);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: glowTranslateX.value }],
  }));

  const handleTabPress = useCallback((tab: Tab) => {
    if (tab.label === 'Plans') {
      if (isWorkoutPlanLoading) return;
      if (!isWorkoutPlanLoaded) {
        void fetchWorkoutPlan();
        return;
      }
      if (!hasActivePlan) {
        setPlanPrompt('get-plan');
        return;
      }
    }

    setPlanPrompt(null);
    if (isTabActive(pathname, tab.route)) return;
    if (tabNavigationPending.current) return;
    tabNavigationPending.current = true;

    if (tab.label === 'Home') {
      router.replace('/(app)/dashboard');
      return;
    }
    router.replace(tab.route);
  }, [fetchWorkoutPlan, hasActivePlan, isWorkoutPlanLoaded, isWorkoutPlanLoading, pathname]);

  const handleGetPlan = useCallback(() => {
    if (isAuthLoading) return;
    if (!isProfileComplete) {
      setPlanPrompt('profile-required');
      return;
    }
    setPlanPrompt(null);
    router.push('/(app)/questionnaire');
  }, [isAuthLoading, isProfileComplete]);

  const handleCompleteProfile = useCallback(() => {
    setPlanPrompt(null);
    router.push('/(app)/profile/edit');
  }, []);

  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    if (planPrompt !== null) {
      setPlanPrompt(null);
    }
  }

  if (!isPrimaryTabPath(pathname)) return null;

  const navContent = (
    <View
      onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
      style={[styles.tabRow, { paddingHorizontal: tabRowHorizontalPadding }]}
    >
      {rowWidth > 0 && activeIndex >= 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.activeIndicator,
            {
              top: activeIndicatorTop,
              width: activeIndicatorSize,
              height: activeIndicatorSize,
              borderRadius: activeIndicatorSize / 2,
            },
            glowStyle,
          ]}
        />
      ) : null}
      {visibleTabs.map((tab) => {
        const active = isTabActive(pathname, tab.route);
        return (
          <TabButton
            key={tab.label}
            tab={tab}
            active={active}
            enabled={tab.label !== 'Plans' || hasActivePlan || !isWorkoutPlanLoading}
            activeColor={BRAND_GREEN}
            inactiveColor={colors.textSecondary}
            iconSize={iconSize}
            iconSlotSize={iconSlotSize}
            labelFontSize={labelFontSize}
            labelLineHeight={labelLineHeight}
            labelMarginTop={labelMarginTop}
            onPress={handleTabPress}
          />
        );
      })}
    </View>
  );

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {isPlanPromptVisible && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss plan prompt"
          onPress={() => setPlanPrompt(null)}
          style={StyleSheet.absoluteFill}
        />
      )}
      {isAndroid && (
        <View
          pointerEvents="none"
          style={[
            styles.androidHalo,
            {
              bottom: bottomOffset - 2,
              left: (windowWidth - navWidth) / 2 - 2,
              width: navWidth + 4,
              height: navHeight + 4,
              borderRadius: navRadius + 2,
            },
          ]}
        />
      )}
      <View
        style={[
          styles.container,
          {
            bottom: bottomOffset,
            left: (windowWidth - navWidth) / 2,
            width: navWidth,
            height: navHeight,
            borderRadius: navRadius,
            shadowColor: BRAND_GREEN,
            elevation: 8,
          },
        ]}
      >
        <BlurView
          intensity={55}
          tint={isDark ? 'dark' : 'light'}
          blurTarget={blurTarget}
          blurMethod={isAndroid ? 'none' : undefined}
          blurReductionFactor={isAndroid ? (isDark ? 3 : 2) : undefined}
          style={[
            styles.blurSurface,
            {
              borderRadius: navRadius,
              backgroundColor: isDark ? 'rgba(10, 10, 10, 0.96)' : 'rgba(255, 255, 255, 0.96)',
              borderColor: isDark ? 'rgba(34, 197, 94, 0.36)' : 'rgba(22, 163, 74, 0.32)',
            },
          ]}
        >
          {navContent}
        </BlurView>
      </View>
      {isPlanPromptVisible && (
        <View
          accessibilityRole="alert"
          style={[styles.planPrompt, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={styles.planPromptHeader}>
            <View style={[styles.planPromptIcon, { backgroundColor: isDark ? 'rgba(52, 199, 89, 0.16)' : 'rgba(22, 163, 74, 0.12)' }]}>
              <Feather name="clipboard" size={18} color={BRAND_GREEN} />
            </View>
            <View style={styles.planPromptCopy}>
              <Text style={[styles.planPromptTitle, { color: colors.textPrimary }]}>
                {planPrompt === 'profile-required' ? 'Complete your profile first' : 'No plan assigned yet'}
              </Text>
              <Text style={[styles.planPromptDescription, { color: colors.textSecondary }]}>
                {planPrompt === 'profile-required'
                  ? 'Complete your required personal details to personalize your running plan.'
                  : 'Complete a quick assessment to create your running plan.'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setPlanPrompt(null)}
              accessibilityRole="button"
              accessibilityLabel="Close plan prompt"
              style={styles.planPromptClose}
            >
              <Feather name="x" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={planPrompt === 'profile-required' ? handleCompleteProfile : handleGetPlan}
            accessibilityRole="button"
            accessibilityHint={planPrompt === 'profile-required'
              ? 'Opens profile editing to complete the required information.'
              : isProfileComplete
                ? 'Starts the assessment to create a running plan.'
                : 'Shows the profile information required before starting the assessment.'}
            style={[
              styles.planPromptButton,
              { backgroundColor: BRAND_GREEN },
              planPrompt === 'get-plan' && !isProfileComplete && styles.planPromptButtonDisabled,
            ]}
          >
            <Text style={styles.planPromptButtonText}>
              {planPrompt === 'profile-required' ? 'Complete Profile' : 'Get Plan'}
            </Text>
            <Feather name="arrow-right" size={17} color="#081009" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  androidHalo: {
    position: 'absolute',
    zIndex: 9,
    borderWidth: 2,
    borderColor: 'rgba(34, 197, 94, 0.12)',
  },
  blurSurface: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    borderWidth: 1,
  },
  tabRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0, zIndex: 1 },
  tabContent: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0 },
  selectedTabContent: { zIndex: 2 },
  iconSlot: { alignItems: 'center', justifyContent: 'center' },
  label: { textAlign: 'center', includeFontPadding: false, maxWidth: '100%', fontWeight: '500' },
  activeLabel: { fontWeight: '600' },
  disabledLabel: { opacity: 0.5 },
  planPrompt: {
    position: 'absolute',
    left: 16,
    bottom: 88,
    width: '88%',
    maxWidth: 320,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    zIndex: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 14,
  },
  planPromptHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  planPromptIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  planPromptCopy: { flex: 1, gap: 4 },
  planPromptTitle: { fontSize: 15, fontWeight: '700' },
  planPromptDescription: { fontSize: 13, lineHeight: 18 },
  planPromptClose: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', marginTop: -4, marginRight: -4 },
  planPromptButton: { minHeight: 42, marginTop: 12, paddingHorizontal: 14, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  planPromptButtonDisabled: { opacity: 0.45 },
  planPromptButtonText: { color: '#081009', fontSize: 14, fontWeight: '700' },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
  },
});
