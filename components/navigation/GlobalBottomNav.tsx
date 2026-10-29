import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
    cancelAnimation,
    Easing as ReanimatedEasing,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import { useQuestionnaire } from '../../contexts/QuestionnaireContext';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../service/auth';
import { isAssessmentProfileComplete } from '../../utils/profileEligibility';

type Tab = {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: 'Plan' | 'History' | 'Home' | 'Stats' | 'Profile';
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
  { icon: 'activity', label: 'History', route: '/(app)/activity' },
  { icon: 'home', label: 'Home', route: '/(app)/dashboard' },
  { icon: 'bar-chart-2', label: 'Stats', route: '/(app)/stats' },
  { icon: 'user', label: 'Profile', route: '/(app)/profile' },
];

const ACTIVE_GLOW_SIZE = 60;
const TAB_ROW_HORIZONTAL_PADDING = 4;
const ACTIVE_GLOW_WIDTH = 60;
const TAB_PILL_DURATION_MS = 240;

type TabButtonProps = {
  tab: Tab;
  active: boolean;
  enabled: boolean;
  activeColor: string;
  inactiveColor: string;
  iconSize: number;
  labelSize: number;
  reduceMotion: boolean;
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
  reduceMotion,
  onPress,
}: TabButtonProps) {
  const iconScale = useSharedValue(active ? 1 : 0.98);
  const hasMounted = useRef(false);
  const iconMotionStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    cancelAnimation(iconScale);
    if (reduceMotion) {
      iconScale.value = 1;
    } else if (active) {
      iconScale.value = withSequence(
        withTiming(1.05, {
          duration: 90,
          easing: ReanimatedEasing.out(ReanimatedEasing.quad),
        }),
        withTiming(1, {
          duration: 130,
          easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
        }),
      );
    } else {
      iconScale.value = withTiming(0.98, {
        duration: 120,
        easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
      });
    }
  }, [active, iconScale, reduceMotion]);

  return (
    <TouchableOpacity
      style={styles.tab}
      onPress={() => onPress(tab)}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !enabled }}
    >
      <Animated.View style={[styles.iconWrapper, iconMotionStyle]}>
        <Feather name={tab.icon} size={iconSize} color={active ? activeColor : inactiveColor} />
      </Animated.View>
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

export default function GlobalBottomNav({ blurTarget }: { blurTarget?: RefObject<View | null> }) {
  const pathname = usePathname();
  const { colors, isDark } = useTheme();
  const isAndroid = Platform.OS === 'android';
  const reduceMotion = useReducedMotion();
  const bottomOffset = 12;
  const { workoutPlan, isWorkoutPlanLoaded, isWorkoutPlanLoading, fetchWorkoutPlan } = useQuestionnaire();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [rowWidth, setRowWidth] = useState(0);
  const [planPrompt, setPlanPrompt] = useState<'get-plan' | 'profile-required' | null>(null);
  const isProfileComplete = isAssessmentProfileComplete(user);
  const isPlanPromptVisible = planPrompt !== null;
  const activeIndex = tabs.findIndex((tab) => isTabActive(pathname, tab.route));
  const tabContentWidth = Math.max(0, rowWidth - TAB_ROW_HORIZONTAL_PADDING * 2);
  const tabWidth = tabContentWidth > 0 ? tabContentWidth / tabs.length : 0;
  const glowTranslateX = useSharedValue(0);

  useEffect(() => {
    if (!isWorkoutPlanLoaded && !isWorkoutPlanLoading) void fetchWorkoutPlan();
  }, [fetchWorkoutPlan, isWorkoutPlanLoaded, isWorkoutPlanLoading]);

  useEffect(() => {
    if (activeIndex < 0 || rowWidth <= 0) return;

    const targetX = TAB_ROW_HORIZONTAL_PADDING + activeIndex * tabWidth + (tabWidth - ACTIVE_GLOW_WIDTH) / 2;
    if (reduceMotion) {
      glowTranslateX.value = targetX;
    } else {
      glowTranslateX.value = withTiming(
        targetX,
        {
          duration: TAB_PILL_DURATION_MS,
          easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
        },
      );
    }
  }, [activeIndex, glowTranslateX, reduceMotion, rowWidth, tabWidth]);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: glowTranslateX.value }],
  }));

  const hasActivePlan = isWorkoutPlanLoaded && Boolean(workoutPlan?.weeks?.length);
  const handleTabPress = useCallback((tab: Tab) => {
    if (tab.label === 'Plan') {
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

    if (tab.label === 'Home') {
      router.replace('/(app)/dashboard');
      return;
    }
    if (tab.label === 'Plan') {
      router.replace({ pathname: tab.route, params: { selectedWeek: '1' } });
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

  useEffect(() => {
    setPlanPrompt(null);
  }, [pathname]);

  if (!isPrimaryTabPath(pathname)) return null;

  const navContent = (
    <>
      <View pointerEvents="none" style={[styles.glassSheen, { borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.88)' }]} />
      <LinearGradient
        pointerEvents="none"
        colors={isDark ? ['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.02)', 'rgba(0, 0, 0, 0.12)'] : ['rgba(255, 255, 255, 0.76)', 'rgba(255, 255, 255, 0.22)', 'rgba(220, 252, 231, 0.30)']}
        locations={[0, 0.45, 1]}
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
          >
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.34)', 'rgba(255, 255, 255, 0.08)', 'rgba(34, 197, 94, 0.12)']}
              locations={[0, 0.42, 1]}
              style={styles.activeGlowGradient}
            />
          </Animated.View>
        ) : null}
        {tabs.map((tab) => {
          const active = isTabActive(pathname, tab.route);
          return (
            <TabButton
              key={tab.label}
              tab={tab}
              active={active}
              enabled={tab.label !== 'Plan' || hasActivePlan || !isWorkoutPlanLoading}
              activeColor={isDark ? BRAND_GREEN : '#16A34A'}
              inactiveColor={isDark ? '#FFFFFF' : '#000000'}
              iconSize={24}
              labelSize={12}
              reduceMotion={reduceMotion}
              onPress={handleTabPress}
            />
          );
        })}
      </View>
    </>
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
      <BlurView
        intensity={isDark ? 88 : 92}
        tint={isDark ? 'dark' : 'light'}
        blurTarget={blurTarget}
        blurMethod={isAndroid ? 'dimezisBlurViewSdk31Plus' : undefined}
        blurReductionFactor={isAndroid ? (isDark ? 3 : 2) : undefined}
        style={[
          styles.container,
          {
            bottom: bottomOffset,
            backgroundColor: isDark ? 'rgba(18, 18, 22, 0.48)' : 'rgba(241, 248, 243, 0.72)',
            borderColor: BRAND_GREEN,
            borderWidth: 1.25,
            shadowColor: isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(25, 75, 45, 0.18)',
            elevation: isDark ? 12 : 9,
          },
        ]}
      >
        {navContent}
      </BlurView>
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
  activeGlowGradient: {
    ...StyleSheet.absoluteFill,
    borderRadius: ACTIVE_GLOW_SIZE / 2,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0, position: 'relative' },
  iconWrapper: { width: 30, height: 28, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, lineHeight: 14, marginTop: 1, textAlign: 'center', includeFontPadding: false, maxWidth: '100%' },
  activeLabel: { fontWeight: '700' },
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
  activeGlow: {
    position: 'absolute',
    left: 0,
    top: 1,
    width: ACTIVE_GLOW_WIDTH,
    height: ACTIVE_GLOW_SIZE,
    borderRadius: ACTIVE_GLOW_SIZE / 2,
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(187, 247, 208, 0.5)',
    shadowColor: '#22C55E',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
});