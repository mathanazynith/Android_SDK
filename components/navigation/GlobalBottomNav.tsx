import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router, usePathname } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  label: 'Home' | 'History' | 'Plans' | 'Stats' | 'Profile';
  route: '/(app)/training-plan' | '/(app)/activity' | '/(app)/dashboard' | '/(app)/stats' | '/(app)/profile';
};

export const PRIMARY_TAB_PATHS = [
  '/activity',
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
  { icon: 'calendar-month', label: 'Plans', route: '/(app)/training-plan' },
  { icon: 'chart-line', label: 'Stats', route: '/(app)/stats' },
  { icon: 'account', label: 'Profile', route: '/(app)/profile' },
];

const ACTIVE_INDICATOR_SIZE = 44;
const TAB_ROW_HORIZONTAL_PADDING = 6;

type TabButtonProps = {
  tab: Tab;
  active: boolean;
  enabled: boolean;
  activeColor: string;
  inactiveColor: string;
  onPress: (tab: Tab) => void;
};

const TabButton = memo(function TabButton({
  tab,
  active,
  enabled,
  activeColor,
  inactiveColor,
  onPress,
}: TabButtonProps) {
  return (
    <TouchableOpacity
      style={styles.tab}
      onPress={() => onPress(tab)}
      disabled={!enabled}
      accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled: !enabled }}
    >
      <View style={styles.iconSlot}>
        <MaterialCommunityIcons name={tab.icon} size={21} color={active ? activeColor : inactiveColor} />
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[
          styles.label,
          { color: active ? activeColor : inactiveColor },
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
  const bottomOffset = 8;
  const { workoutPlan, isWorkoutPlanLoaded, isWorkoutPlanLoading, fetchWorkoutPlan } = useQuestionnaire();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [rowWidth, setRowWidth] = useState(0);
  const [planPrompt, setPlanPrompt] = useState<'get-plan' | 'profile-required' | null>(null);
  const tabNavigationPending = useRef(false);
  const isProfileComplete = isAssessmentProfileComplete(user);
  const isPlanPromptVisible = planPrompt !== null;
  const activeIndex = tabs.findIndex((tab) => isTabActive(pathname, tab.route));
  const tabContentWidth = Math.max(0, rowWidth - TAB_ROW_HORIZONTAL_PADDING * 2);
  const tabWidth = tabContentWidth > 0 ? tabContentWidth / tabs.length : 0;
  const glowTranslateX = useSharedValue(0);
  const hasPositionedIndicator = useRef(false);

  useEffect(() => {
    if (!isWorkoutPlanLoaded && !isWorkoutPlanLoading) void fetchWorkoutPlan();
  }, [fetchWorkoutPlan, isWorkoutPlanLoaded, isWorkoutPlanLoading]);

  useEffect(() => {
    tabNavigationPending.current = false;
  }, [pathname]);

  useEffect(() => {
    if (activeIndex < 0 || rowWidth <= 0) return;

    const targetX = TAB_ROW_HORIZONTAL_PADDING + activeIndex * tabWidth + (tabWidth - ACTIVE_INDICATOR_SIZE) / 2;
    cancelAnimation(glowTranslateX);
    if (reduceMotion || !hasPositionedIndicator.current) {
      glowTranslateX.value = targetX;
      hasPositionedIndicator.current = true;
    } else {
      glowTranslateX.value = withSpring(targetX, { damping: 20, stiffness: 160, mass: 1 });
    }
  }, [activeIndex, glowTranslateX, reduceMotion, rowWidth, tabWidth]);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: glowTranslateX.value }],
  }));

  const hasActivePlan = isWorkoutPlanLoaded && Boolean(workoutPlan?.weeks?.length);
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
    if (tab.label === 'Plans') {
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
      style={styles.tabRow}
    >
      {rowWidth > 0 && activeIndex >= 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.activeIndicator, glowStyle]}
        />
      ) : null}
      {tabs.map((tab) => {
        const active = isTabActive(pathname, tab.route);
        return (
          <TabButton
            key={tab.label}
            tab={tab}
            active={active}
            enabled={tab.label !== 'Plans' || hasActivePlan || !isWorkoutPlanLoading}
            activeColor={BRAND_GREEN}
            inactiveColor={colors.textSecondary}
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
      <View
        style={[
          styles.container,
          {
            bottom: bottomOffset,
            shadowColor: '#000000',
            elevation: 8,
          },
        ]}
      >
        <BlurView
          intensity={55}
          tint={isDark ? 'dark' : 'light'}
          blurTarget={blurTarget}
          blurMethod={isAndroid ? 'dimezisBlurViewSdk31Plus' : undefined}
          blurReductionFactor={isAndroid ? (isDark ? 3 : 2) : undefined}
          style={[
            styles.blurSurface,
            {
              backgroundColor: isDark ? 'rgba(28, 28, 30, 0.5)' : 'rgba(255, 255, 255, 0.48)',
              borderColor: 'rgba(255, 255, 255, 0.12)',
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
    left: 16,
    right: 16,
    height: 72,
    borderRadius: 36,
    zIndex: 10,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
  },
  blurSurface: {
    ...StyleSheet.absoluteFill,
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: TAB_ROW_HORIZONTAL_PADDING,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0, zIndex: 1 },
  iconSlot: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, lineHeight: 13, marginTop: 5, textAlign: 'center', includeFontPadding: false, maxWidth: '100%', fontWeight: '500' },
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
    top: 4,
    width: ACTIVE_INDICATOR_SIZE,
    height: ACTIVE_INDICATOR_SIZE,
    borderRadius: ACTIVE_INDICATOR_SIZE / 2,
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
  },
});