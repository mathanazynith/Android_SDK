import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import DashboardText from '../../components/common/DashboardText';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../service/auth';
import type { UserWorkoutResponse } from '../../service/customWorkout';
import type { CurrentWorkout, CurrentWorkoutPlan } from '../../service/workoutPlan';
import {
  DistanceUnitType,
  formatWorkoutDistance,
  formatWorkoutDuration,
  getPaceUnitLabel,
  getTargetPace,
} from '../../src/utils/workoutCalculations';
import { buildWorkoutExecutionPlan } from '../../src/utils/workoutPlanBuilder';
import { getDistanceUnitCode } from '../../utils/distanceUnit';

type DashboardActivePlanProps = {
  plan: CurrentWorkoutPlan;
  todayWorkout: CurrentWorkout | null;
  nextWorkout: CurrentWorkout | null;
  scheduledCustomWorkout?: UserWorkoutResponse | null;
  scheduledCustomWorkouts?: UserWorkoutResponse[];
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

const isRestWorkout = (workout: CurrentWorkout | null) =>
  Boolean(workout && `${workout.workout_type} ${workout.title}`.toLowerCase().includes('rest'));

export default function DashboardActivePlan({
  plan,
  todayWorkout,
  nextWorkout,
  scheduledCustomWorkout,
  scheduledCustomWorkouts,
}: DashboardActivePlanProps) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const profileUnit: DistanceUnitType =
    getDistanceUnitCode(user?.profile?.distance_unit) === 'mile' ? 'mi' : 'km';
  const paceUnitLabel = getPaceUnitLabel(profileUnit);

  const isRestDay = isRestWorkout(todayWorkout);
  const planName = plan.training_plan || plan.template_name || 'Training Plan';
  const pace = plan.target_pace ? `${plan.target_pace}` : '—';
  const paceUnit = plan.pace_unit || 'min/km';

  // Custom workout metrics
  const customDistance = scheduledCustomWorkout
    ? formatWorkoutDistance(scheduledCustomWorkout, profileUnit)
    : '--';
  const customDuration = scheduledCustomWorkout
    ? formatWorkoutDuration(scheduledCustomWorkout)
    : '--';
  const customPace = scheduledCustomWorkout
    ? getTargetPace(scheduledCustomWorkout, profileUnit)
    : '--:--';

  const handleStartCustomWorkout = (workout: UserWorkoutResponse) => {
    const planSteps = buildWorkoutExecutionPlan(workout);
    router.push({
      pathname: '/(app)/screens/map',
      params: {
        workoutTitle: workout.title || 'Custom Workout',
        workoutPlan: JSON.stringify(planSteps),
        assignedRoute: workout.assigned_route
          ? JSON.stringify(workout.assigned_route)
          : undefined,
      },
    });
  };

  const handleEditCustomWorkout = (workout: UserWorkoutResponse) => {
    router.push({
      pathname: '/(app)/custom-workout/overview',
      params: { workoutId: String(workout.id) },
    });
  };

  const handleStartTodayWorkout = () => {
    if (isRestDay || !todayWorkout) {
      if (scheduledCustomWorkout) {
        handleStartCustomWorkout(scheduledCustomWorkout);
        return;
      }
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

  // If today is a rest day on the plan, but user has scheduled a custom workout for today:
  // Feature the custom workout in the Hero spot!
  const showCustomInHero = Boolean(scheduledCustomWorkout && (isRestDay || !todayWorkout));

  return (
    <>
      {/* 1. Today's Workout Hero Card */}
      {showCustomInHero && scheduledCustomWorkout ? (
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => handleStartCustomWorkout(scheduledCustomWorkout)}
          style={[
            styles.todayHeroCard,
            {
              backgroundColor: isDark ? '#111713' : '#F2FAF4',
              borderColor: isDark ? 'rgba(48, 209, 88, 0.45)' : 'rgba(48, 209, 88, 0.5)',
            },
          ]}
        >
          <View style={styles.todayHeaderRow}>
            <View style={[styles.todayTagPill, { backgroundColor: `${BRAND_GREEN}22` }]}>
              <MaterialCommunityIcons name="run-fast" size={14} color={BRAND_GREEN} />
              <DashboardText style={[styles.todayTagText, { color: BRAND_GREEN }]}>
                TODAY&apos;S SCHEDULED WORKOUT
              </DashboardText>
            </View>

            <TouchableOpacity
              onPress={() => handleEditCustomWorkout(scheduledCustomWorkout)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.customEditBtn}
            >
              <DashboardText style={[styles.customEditText, { color: BRAND_GREEN }]}>
                View / Edit
              </DashboardText>
              <Feather name="chevron-right" size={13} color={BRAND_GREEN} />
            </TouchableOpacity>
          </View>

          <DashboardText style={[styles.todayTitle, { color: colors.text }]}>
            {scheduledCustomWorkout.title || 'Custom Workout'}
          </DashboardText>

          <DashboardText style={[styles.todayNotes, { color: colors.textSecondary }]}>
            {scheduledCustomWorkout.notes || 'Your custom scheduled workout for today (Plan Rest Day).'}
          </DashboardText>

          {/* Chips */}
          <View style={styles.todayChipsRow}>
            {customDistance !== '--' && (
              <View style={[styles.todayChip, { backgroundColor: colors.surface }]}>
                <Feather name="map-pin" size={12} color={BRAND_GREEN} />
                <DashboardText style={[styles.todayChipText, { color: colors.text }]}>
                  {customDistance}
                </DashboardText>
              </View>
            )}
            {customDuration !== '--' && (
              <View style={[styles.todayChip, { backgroundColor: colors.surface }]}>
                <Feather name="clock" size={12} color={BRAND_GREEN} />
                <DashboardText style={[styles.todayChipText, { color: colors.text }]}>
                  {customDuration}
                </DashboardText>
              </View>
            )}
            {customPace !== '--:--' && (
              <View style={[styles.todayChip, { backgroundColor: colors.surface }]}>
                <Feather name="zap" size={12} color={BRAND_GREEN} />
                <DashboardText style={[styles.todayChipText, { color: colors.text }]}>
                  {customPace}
                </DashboardText>
              </View>
            )}
          </View>

          <View style={[styles.startTodayButton, { backgroundColor: BRAND_GREEN }]}>
            <Feather name="play" size={18} color="#081009" />
            <DashboardText style={styles.startTodayButtonText}>
              START TODAY&apos;S WORKOUT
            </DashboardText>
          </View>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={handleStartTodayWorkout}
          style={[
            styles.todayHeroCard,
            {
              backgroundColor: isDark
                ? isRestDay
                  ? '#101317'
                  : '#111713'
                : isRestDay
                ? '#F0F4F8'
                : '#F2FAF4',
              borderColor: isDark
                ? isRestDay
                  ? 'rgba(10, 132, 255, 0.35)'
                  : 'rgba(48, 209, 88, 0.35)'
                : isRestDay
                ? 'rgba(10, 132, 255, 0.4)'
                : 'rgba(48, 209, 88, 0.4)',
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
      )}

      {/* 2. Scheduled Custom Workout Card (when user has an active plan run AND ALSO a custom workout today) */}
      {!showCustomInHero && scheduledCustomWorkout ? (
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => handleStartCustomWorkout(scheduledCustomWorkout)}
          style={[
            styles.customWorkoutCard,
            {
              backgroundColor: colors.surface,
              borderColor: isDark ? 'rgba(48, 209, 88, 0.4)' : 'rgba(48, 209, 88, 0.45)',
            },
          ]}
        >
          <View style={styles.todayHeaderRow}>
            <View style={[styles.todayTagPill, { backgroundColor: `${BRAND_GREEN}22` }]}>
              <Feather name="calendar" size={13} color={BRAND_GREEN} />
              <DashboardText style={[styles.todayTagText, { color: BRAND_GREEN }]}>
                SCHEDULED CUSTOM WORKOUT
              </DashboardText>
            </View>
            <TouchableOpacity
              onPress={() => handleEditCustomWorkout(scheduledCustomWorkout)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.customEditBtn}
            >
              <DashboardText style={[styles.customEditText, { color: BRAND_GREEN }]}>
                View / Edit
              </DashboardText>
              <Feather name="chevron-right" size={13} color={BRAND_GREEN} />
            </TouchableOpacity>
          </View>

          <DashboardText style={[styles.todayTitle, { color: colors.text }]}>
            {scheduledCustomWorkout.title || 'Custom Workout'}
          </DashboardText>

          {scheduledCustomWorkout.notes ? (
            <DashboardText style={[styles.todayNotes, { color: colors.textSecondary }]}>
              {scheduledCustomWorkout.notes}
            </DashboardText>
          ) : null}

          {/* Chips */}
          <View style={styles.todayChipsRow}>
            {customDistance !== '--' && (
              <View style={[styles.todayChip, { backgroundColor: colors.background }]}>
                <Feather name="map-pin" size={12} color={BRAND_GREEN} />
                <DashboardText style={[styles.todayChipText, { color: colors.text }]}>
                  {customDistance}
                </DashboardText>
              </View>
            )}
            {customDuration !== '--' && (
              <View style={[styles.todayChip, { backgroundColor: colors.background }]}>
                <Feather name="clock" size={12} color={BRAND_GREEN} />
                <DashboardText style={[styles.todayChipText, { color: colors.text }]}>
                  {customDuration}
                </DashboardText>
              </View>
            )}
            {customPace !== '--:--' && (
              <View style={[styles.todayChip, { backgroundColor: colors.background }]}>
                <Feather name="zap" size={12} color={BRAND_GREEN} />
                <DashboardText style={[styles.todayChipText, { color: colors.text }]}>
                  {customPace}
                </DashboardText>
              </View>
            )}
          </View>

          <View style={[styles.startTodayButton, { backgroundColor: BRAND_GREEN, marginTop: 12 }]}>
            <Feather name="play" size={18} color="#081009" />
            <DashboardText style={styles.startTodayButtonText}>
              START CUSTOM WORKOUT
            </DashboardText>
          </View>
        </TouchableOpacity>
      ) : null}

      {/* Additional scheduled custom workouts for today if multiple */}
      {scheduledCustomWorkouts && scheduledCustomWorkouts.length > 1 && (
        <View style={styles.additionalWorkoutsContainer}>
          {scheduledCustomWorkouts.slice(1).map((w) => (
            <TouchableOpacity
              key={w.id}
              activeOpacity={0.88}
              onPress={() => handleStartCustomWorkout(w)}
              style={[
                styles.additionalWorkoutCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={{ flex: 1 }}>
                <View style={[styles.miniBadge, { backgroundColor: `${BRAND_GREEN}18` }]}>
                  <DashboardText style={[styles.miniBadgeText, { color: BRAND_GREEN }]}>
                    SCHEDULED TODAY
                  </DashboardText>
                </View>
                <DashboardText style={[styles.additionalWorkoutTitle, { color: colors.text }]}>
                  {w.title || 'Custom Workout'}
                </DashboardText>
                <DashboardText style={[styles.additionalWorkoutDetails, { color: colors.textSecondary }]}>
                  {[
                    formatWorkoutDistance(w, profileUnit),
                    formatWorkoutDuration(w),
                    getTargetPace(w, profileUnit) !== '--:--'
                      ? getTargetPace(w, profileUnit)
                      : '',
                  ]
                    .filter((s) => s && s !== '--')
                    .join(' · ')}
                </DashboardText>
              </View>
              <View style={[styles.miniPlayCircle, { backgroundColor: BRAND_GREEN }]}>
                <Feather name="play" size={14} color="#081009" />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 3. Your Training Plan Overview Card */}
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
    padding: 18,
    borderRadius: 22,
    borderWidth: 1.5,
    marginBottom: 16,
    gap: 12,
  },
  customWorkoutCard: {
    padding: 18,
    borderRadius: 22,
    borderWidth: 1.5,
    marginBottom: 16,
    gap: 12,
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
  customEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  customEditText: {
    fontSize: 12,
    fontWeight: '700',
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
    fontWeight: '900',
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
    borderRadius: 10,
  },
  todayChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  startTodayButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    marginTop: 4,
  },
  startTodayButtonText: {
    color: '#081009',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  additionalWorkoutsContainer: {
    gap: 10,
    marginBottom: 16,
  },
  additionalWorkoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  miniBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
  },
  miniBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  additionalWorkoutTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  additionalWorkoutDetails: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  miniPlayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  upcomingBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  upcomingIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  upcomingTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 1,
  },
  upcomingDate: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  planCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    marginBottom: 16,
    gap: 14,
  },
  planHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planTitleGroup: {
    flex: 1,
    gap: 3,
  },
  planBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  planName: {
    fontSize: 18,
    fontWeight: '800',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metric: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    gap: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  viewPlanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 4,
  },
  viewPlanText: {
    fontSize: 13,
    fontWeight: '700',
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
