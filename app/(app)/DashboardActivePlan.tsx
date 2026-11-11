import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';
import type { CurrentWorkout, CurrentWorkoutPlan } from '../../service/workoutPlan';
import DashboardText from '../../components/common/DashboardText';

type DashboardActivePlanProps = {
  plan: CurrentWorkoutPlan;
  todayWorkout: CurrentWorkout | null;
  nextWorkout: CurrentWorkout | null;
};

const popularWorkouts = [
  { title: '30 MIN', subtitle: 'Easy Run', tag: 'AEROBIC', color: '#30D158', icon: 'activity' as const },
  { title: '70 MIN', subtitle: 'Long Run', tag: 'ENDURANCE', color: '#0A84FF', icon: 'clock' as const },
  { title: '10 x 400m', subtitle: 'Interval Run', tag: 'SPEED', color: '#FF9500', icon: 'target' as const },
  { title: '20 MIN', subtitle: 'Tempo Run', tag: 'THRESHOLD', color: '#AF52DE', icon: 'trending-up' as const },
];

const detailsFor = (workout: CurrentWorkout | null) => {
  if (!workout) return '';
  return [
    workout.distance != null ? `${(workout.distance / 1000).toFixed(1)} km` : '',
    workout.duration != null ? `${Math.round(workout.duration / 60)} min` : '',
    workout.target_pace ? `${workout.target_pace} ${workout.pace_unit || 'min/km'}`.trim() : '',
  ].filter(Boolean).join('  ·  ');
};

const formatWorkoutDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
};

const isRestWorkout = (workout: CurrentWorkout | null) =>
  Boolean(workout && `${workout.workout_type} ${workout.title}`.toLowerCase().includes('rest'));

export default function DashboardActivePlan({ plan, todayWorkout, nextWorkout }: DashboardActivePlanProps) {
  const { colors, isDark } = useTheme();
  const isRestDay = isRestWorkout(todayWorkout);
  const planName = plan.training_plan || plan.template_name || 'Training Plan';
  const pace = plan.target_pace ? `${plan.target_pace}` : '—';
  const paceUnit = plan.pace_unit || 'min/km';

  const handleStartTodayWorkout = () => {
    if (isRestDay || !todayWorkout) {
      router.push('/(app)/screens/map');
      return;
    }

    router.push({
      pathname: '/(app)/workout-setup',
      params: {
        workoutTitle: todayWorkout.title || "Today's Workout",
        workoutType: todayWorkout.workout_type,
        targetPace: todayWorkout.target_pace || undefined,
        duration: todayWorkout.duration ? String(Math.round(todayWorkout.duration / 60)) : undefined,
        distance: todayWorkout.distance ? String(todayWorkout.distance) : undefined,
        planSegments: todayWorkout.segments?.length ? JSON.stringify(todayWorkout.segments) : undefined,
        workoutDbId: todayWorkout.id ? String(todayWorkout.id) : undefined,
      },
    });
  };

  const openPopularWorkoutSetup = (workout: (typeof popularWorkouts)[0]) => {
    let presetId = 'preset-easy-run-30';
    if (workout.subtitle === 'Interval Run') presetId = 'preset-interval-10x400';
    if (workout.subtitle === 'Long Run') presetId = 'preset-long-run-70';
    if (workout.subtitle === 'Easy Run') presetId = 'preset-easy-run-30';
    if (workout.subtitle === 'Tempo Run') presetId = 'preset-tempo-run-20';

    router.push({
      pathname: '/(app)/workout-setup',
      params: { presetId, workoutTitle: `${workout.title} ${workout.subtitle}` },
    });
  };

  return (
    <>
      {/* 1. Today's Workout Hero Card */}
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={handleStartTodayWorkout}
        style={[
          styles.todayHeroCard,
          {
            backgroundColor: isDark ? (isRestDay ? '#101317' : '#111713') : (isRestDay ? '#F0F4F8' : '#F2FAF4'),
            borderColor: isDark
              ? (isRestDay ? 'rgba(10, 132, 255, 0.35)' : 'rgba(48, 209, 88, 0.35)')
              : (isRestDay ? 'rgba(10, 132, 255, 0.4)' : 'rgba(48, 209, 88, 0.4)'),
          },
        ]}
      >
        <View style={styles.todayHeaderRow}>
          <View
            style={[
              styles.todayTagPill,
              { backgroundColor: isRestDay ? 'rgba(10, 132, 255, 0.18)' : `${BRAND_GREEN}22` },
            ]}
          >
            {isRestDay ? (
              <Feather name="moon" size={13} color="#0A84FF" />
            ) : (
              <MaterialCommunityIcons name="run-fast" size={14} color={BRAND_GREEN} />
            )}
            <DashboardText
              style={[
                styles.todayTagText,
                { color: isRestDay ? '#0A84FF' : BRAND_GREEN },
              ]}
            >
              {isRestDay ? 'REST & RECOVERY' : "TODAY'S WORKOUT"}
            </DashboardText>
          </View>

          <View
            style={[
              styles.workoutIconCircle,
              { backgroundColor: isRestDay ? '#0A84FF' : BRAND_GREEN },
            ]}
          >
            <Feather name={isRestDay ? 'moon' : 'play'} size={14} color="#081009" />
          </View>
        </View>

        <DashboardText style={[styles.todayTitle, { color: colors.text }]}>
          {todayWorkout?.title || (todayWorkout ? todayWorkout.workout_type : 'Rest Day')}
        </DashboardText>

        <DashboardText style={[styles.todayNotes, { color: colors.textSecondary }]}>
          {todayWorkout?.notes ||
            (isRestDay
              ? 'Take it easy and recharge. Recovery is when fitness adaptations are locked in.'
              : todayWorkout
              ? detailsFor(todayWorkout)
              : 'Enjoy a restful recovery day ahead of your next workout.')}
        </DashboardText>

        {/* Workout metrics chips (if run day) */}
        {!isRestDay && todayWorkout ? (
          <View style={styles.todayChipsRow}>
            {todayWorkout.distance ? (
              <View style={[styles.todayChip, { backgroundColor: colors.surface }]}>
                <Feather name="map-pin" size={12} color={BRAND_GREEN} />
                <DashboardText style={[styles.todayChipText, { color: colors.text }]}>
                  {(todayWorkout.distance / 1000).toFixed(1)} km
                </DashboardText>
              </View>
            ) : null}

            {todayWorkout.duration ? (
              <View style={[styles.todayChip, { backgroundColor: colors.surface }]}>
                <Feather name="clock" size={12} color={BRAND_GREEN} />
                <DashboardText style={[styles.todayChipText, { color: colors.text }]}>
                  {Math.round(todayWorkout.duration / 60)} min
                </DashboardText>
              </View>
            ) : null}

            {todayWorkout.target_pace ? (
              <View style={[styles.todayChip, { backgroundColor: colors.surface }]}>
                <Feather name="zap" size={12} color={BRAND_GREEN} />
                <DashboardText style={[styles.todayChipText, { color: colors.text }]}>
                  {todayWorkout.target_pace} {todayWorkout.pace_unit || 'min/km'}
                </DashboardText>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Start Button inside Today's Card */}
        <View
          style={[
            styles.startTodayButton,
            { backgroundColor: isRestDay ? '#0A84FF' : BRAND_GREEN },
          ]}
        >
          <Feather name={isRestDay ? 'coffee' : 'play'} size={18} color="#081009" />
          <DashboardText style={styles.startTodayButtonText}>
            {isRestDay ? 'VIEW SCHEDULE' : "START TODAY'S WORKOUT"}
          </DashboardText>
        </View>
      </TouchableOpacity>

      {/* 2. Your Training Plan Overview Card */}
      <TouchableOpacity
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={`View ${planName} training plan`}
        onPress={() => router.push('/(app)/training-plan')}
        style={[styles.planCard, { backgroundColor: colors.surface, borderColor: `${BRAND_GREEN}44` }]}
      >
        <View style={styles.planHeading}>
          <View style={styles.planTitleGroup}>
            <View style={styles.planBadgeRow}>
              <Feather name="check-circle" size={14} color={BRAND_GREEN} />
              <DashboardText style={[styles.eyebrow, { color: BRAND_GREEN }]}>
                ACTIVE TRAINING PLAN
              </DashboardText>
            </View>
            <DashboardText style={[styles.planName, { color: colors.text }]} numberOfLines={1}>
              {planName}
            </DashboardText>
          </View>
          <Feather name="chevron-right" size={20} color={colors.textSecondary} />
        </View>

        <View style={styles.metricsRow}>
          <View style={[styles.metric, { backgroundColor: colors.background }]}>
            <DashboardText style={[styles.metricValue, { color: colors.text }]}>
              {plan.weeks.length}
            </DashboardText>
            <DashboardText style={[styles.metricLabel, { color: colors.textSecondary }]}>
              WEEKS
            </DashboardText>
          </View>
          <View style={[styles.metric, { backgroundColor: colors.background }]}>
            <DashboardText style={[styles.metricValue, { color: colors.text }]}>
              {plan.running_days}
            </DashboardText>
            <DashboardText style={[styles.metricLabel, { color: colors.textSecondary }]}>
              DAYS/WK
            </DashboardText>
          </View>
          <View style={[styles.metric, { backgroundColor: colors.background }]}>
            <DashboardText style={[styles.metricValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {pace}
            </DashboardText>
            <DashboardText style={[styles.metricLabel, { color: colors.textSecondary }]}>
              {paceUnit}
            </DashboardText>
          </View>
        </View>

        <View style={styles.viewPlanRow}>
          <Feather name="calendar" size={15} color={BRAND_GREEN} />
          <DashboardText style={[styles.viewPlanText, { color: colors.text }]}>
            View Full Schedule & Calendar
          </DashboardText>
          <Feather name="arrow-right" size={14} color={BRAND_GREEN} />
        </View>
      </TouchableOpacity>

      {/* 4. Open Run Shortcut */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => router.push('/(app)/screens/map')}
        style={[
          styles.heroCard,
          {
            backgroundColor: isDark ? '#111713' : '#F2FAF4',
            borderColor: isDark ? 'rgba(48, 209, 88, 0.32)' : 'rgba(48, 209, 88, 0.38)',
          },
        ]}
      >
        <View style={styles.heroContent}>
          <View style={styles.heroBadgeRow}>
            <View style={[styles.heroPill, { backgroundColor: `${BRAND_GREEN}22` }]}>
              <MaterialCommunityIcons name="run-fast" size={14} color={BRAND_GREEN} />
              <DashboardText style={[styles.heroPillText, { color: BRAND_GREEN }]}>QUICK START</DashboardText>
            </View>
            <View style={styles.gpsIndicator}>
              <View style={[styles.gpsDot, { backgroundColor: BRAND_GREEN }]} />
              <DashboardText style={[styles.gpsText, { color: colors.textSecondary }]}>GPS Ready</DashboardText>
            </View>
          </View>

          <DashboardText style={[styles.heroTitle, { color: colors.text }]}>
            Ready for a run?
          </DashboardText>
          <DashboardText style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
            Track real-time pace, route map, splits & audio milestone alerts.
          </DashboardText>

          <View style={[styles.recordButton, { backgroundColor: BRAND_GREEN }]}>
            <Feather name="play" size={19} color="#081009" />
            <DashboardText style={styles.recordText}>RECORD WORKOUT</DashboardText>
          </View>
        </View>
      </TouchableOpacity>

      {/* 5. Popular Workouts */}
      <View style={styles.sectionHeaderRow}>
        <DashboardText style={[styles.sectionTitle, { color: colors.text }]}>
          POPULAR WORKOUTS
        </DashboardText>
        <DashboardText style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
          Quick presets
        </DashboardText>
      </View>

      <View style={styles.workoutRow}>
        {popularWorkouts.map((workout) => (
          <TouchableOpacity
            key={workout.subtitle}
            activeOpacity={0.85}
            style={[
              styles.popularWorkoutCard,
              {
                backgroundColor: colors.surface,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.border,
              },
            ]}
            onPress={() => openPopularWorkoutSetup(workout)}
          >
            <View style={styles.popularCardHeader}>
              <View style={[styles.popularTagBadge, { backgroundColor: `${workout.color}16` }]}>
                <DashboardText style={[styles.popularTagText, { color: workout.color }]}>
                  {workout.tag}
                </DashboardText>
              </View>
              <Feather name={workout.icon} size={16} color={workout.color} />
            </View>

            <DashboardText style={[styles.popularTitle, { color: colors.text }]}>
              {workout.title}
            </DashboardText>
            <DashboardText style={[styles.popularSubtitle, { color: colors.textSecondary }]}>
              {workout.subtitle}
            </DashboardText>

            <View style={styles.popularStartRow}>
              <DashboardText style={[styles.popularStartText, { color: workout.color }]}>
                Start
              </DashboardText>
              <Feather name="chevron-right" size={13} color={workout.color} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  todayHeroCard: {
    borderRadius: 22,
    borderWidth: 1.25,
    padding: 18,
    marginBottom: 16,
    gap: 10,
  },
  todayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  todayTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  todayTagText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  workoutIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  todayNotes: {
    fontSize: 13,
    lineHeight: 18,
  },
  todayChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  todayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  todayChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  startTodayButton: {
    width: '100%',
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    marginTop: 6,
  },
  startTodayButtonText: {
    color: '#081009',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  planCard: {
    padding: 18,
    marginBottom: 14,
    borderRadius: 22,
    borderWidth: 1.25,
  },
  planHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  planTitleGroup: {
    flex: 1,
    gap: 4,
  },
  planBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  planName: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metric: {
    flex: 1,
    minHeight: 64,
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },
  viewPlanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 12,
  },
  viewPlanText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  nextWorkoutCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14,
    gap: 6,
  },
  nextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nextDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  nextDateText: {
    fontSize: 12,
    fontWeight: '600',
  },
  nextTag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  nextWorkoutName: {
    fontSize: 16,
    fontWeight: '800',
  },
  nextDetails: {
    fontSize: 13,
    fontWeight: '500',
  },
  heroCard: {
    borderRadius: 22,
    borderWidth: 1.25,
    padding: 18,
    marginBottom: 16,
  },
  heroContent: {
    gap: 10,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
  },
  heroPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  gpsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gpsDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  gpsText: {
    fontSize: 11,
    fontWeight: '600',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  recordButton: {
    width: '100%',
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    marginTop: 4,
  },
  recordText: {
    color: '#081009',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  workoutRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    marginBottom: 16,
  },
  popularWorkoutCard: {
    width: '48.5%',
    minHeight: 126,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  popularCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  popularTagBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  popularTagText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  popularTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  popularSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 8,
  },
  popularStartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  popularStartText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
