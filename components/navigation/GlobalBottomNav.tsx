import { Feather } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuestionnaire } from '../../contexts/QuestionnaireContext';

type Tab = {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: 'Plan' | 'Activities' | 'Record' | 'Stats' | 'Profile';
  route: '/(app)/training-plan' | '/(app)/activity' | '/(app)/dashboard' | '/(app)/attendance' | '/(app)/profile';
};

const tabs: Tab[] = [
  { icon: 'clipboard', label: 'Plan', route: '/(app)/training-plan' },
  { icon: 'activity', label: 'Activities', route: '/(app)/activity' },
  { icon: 'home', label: 'Record', route: '/(app)/dashboard' },
  { icon: 'bar-chart-2', label: 'Stats', route: '/(app)/attendance' },
  { icon: 'user', label: 'Profile', route: '/(app)/profile' },
];

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
  const { workoutPlan, isWorkoutPlanLoaded, isWorkoutPlanLoading, fetchWorkoutPlan } = useQuestionnaire();

  useEffect(() => {
    if (!isWorkoutPlanLoaded && !isWorkoutPlanLoading) void fetchWorkoutPlan();
  }, [fetchWorkoutPlan, isWorkoutPlanLoaded, isWorkoutPlanLoading]);

  if (!isWorkoutPlanLoaded) return null;

  const hasActivePlan = Boolean(workoutPlan && workoutPlan.weeks && workoutPlan.weeks.length > 0);
  const visibleTabs = hasActivePlan ? tabs : tabs.filter((tab) => tab.label !== 'Plan');

  return (
    <View style={[styles.container, { bottom: 12 + insets.bottom }]}>
      {visibleTabs.map((tab) => {
        const active = isTabActive(pathname, tab.route);

        return (
          <TouchableOpacity
            key={tab.label}
            style={styles.tab}
            onPress={() => {
              if (tab.label === 'Record') {
                router.replace('/(app)/dashboard');
                return;
              }
              if (tab.label === 'Plan') {
                router.replace({ pathname: tab.route, params: { selectedWeek: '1' } });
                return;
              }
              router.replace(tab.route);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Feather name={tab.icon} size={24} color={active ? '#4ADE80' : '#9CA3AF'} />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[styles.label, active && styles.activeLabel]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 12, right: 12, minHeight: 78, paddingHorizontal: 8, paddingVertical: 6, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderRadius: 42, backgroundColor: 'rgba(41, 47, 41, 0.96)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', zIndex: 10 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0 },
  label: { color: '#9CA3AF', fontSize: 10, lineHeight: 12, marginTop: 3, textAlign: 'center', includeFontPadding: false, maxWidth: '100%' },
  activeLabel: { color: '#4ADE80', fontWeight: '700' },
});