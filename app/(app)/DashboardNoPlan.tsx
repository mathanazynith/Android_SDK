import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import DashboardText from '../../components/common/DashboardText';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../service/auth';
import type { UserWorkoutResponse } from '../../service/customWorkout';
import {
  DistanceUnitType,
  formatWorkoutDistance,
  formatWorkoutDuration,
  getPaceUnitLabel,
  getTargetPace,
} from '../../src/utils/workoutCalculations';
import { buildWorkoutExecutionPlan } from '../../src/utils/workoutPlanBuilder';
import { getDistanceUnitCode } from '../../utils/distanceUnit';

type DashboardNoPlanProps = {
  canStartAssessment: boolean;
  onStartAssessment: () => void;
  scheduledCustomWorkout?: UserWorkoutResponse | null;
  scheduledCustomWorkouts?: UserWorkoutResponse[];
};

const popularWorkouts = [
  { title: '30 MIN', subtitle: 'Easy Run', tag: 'AEROBIC', color: '#30D158', icon: 'activity' as const },
  { title: '70 MIN', subtitle: 'Long Run', tag: 'ENDURANCE', color: '#0A84FF', icon: 'clock' as const },
  { title: '10 x 400m', subtitle: 'Interval Run', tag: 'SPEED', color: '#FF9500', icon: 'target' as const },
  { title: '20 MIN', subtitle: 'Tempo Run', tag: 'THRESHOLD', color: '#AF52DE', icon: 'trending-up' as const },
];

export default function DashboardNoPlan({
  canStartAssessment,
  onStartAssessment,
  scheduledCustomWorkout,
  scheduledCustomWorkouts,
}: DashboardNoPlanProps) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const profileUnit: DistanceUnitType =
    getDistanceUnitCode(user?.profile?.distance_unit) === 'mile' ? 'mi' : 'km';
  const paceUnitLabel = getPaceUnitLabel(profileUnit);

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
    const plan = buildWorkoutExecutionPlan(workout);
    router.push({
      pathname: '/(app)/screens/map',
      params: {
        workoutTitle: workout.title || 'Custom Workout',
        workoutPlan: JSON.stringify(plan),
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

  const openWorkoutSetup = (workout: (typeof popularWorkouts)[0]) => {
    let presetId = 'preset-easy-run-30';
    if (workout.subtitle === 'Interval Run') presetId = 'preset-interval-10x400';
    if (workout.subtitle === 'Long Run') presetId = 'preset-long-run-70';
    if (workout.subtitle === 'Easy Run') presetId = 'preset-easy-run-30';
    if (workout.subtitle === 'Tempo Run') presetId = 'preset-tempo-run-20';

    router.push({
      pathname: '/(app)/workout-setup',
      params: {
        presetId,
        workoutTitle: `${workout.title} ${workout.subtitle}`,
      },
    });
  };

  return (
    <>
      {/* 1. Today's Scheduled Custom Workout Hero Card (if user has scheduled workout for today) */}
      {scheduledCustomWorkout ? (
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => handleStartCustomWorkout(scheduledCustomWorkout)}
          style={[
            styles.heroCard,
            {
              backgroundColor: isDark ? '#111713' : '#F2FAF4',
              borderColor: isDark ? 'rgba(48, 209, 88, 0.45)' : 'rgba(48, 209, 88, 0.5)',
            },
          ]}
        >
          <View style={styles.heroContent}>
            <View style={styles.heroBadgeRow}>
              <View style={[styles.heroPill, { backgroundColor: `${BRAND_GREEN}22` }]}>
                <Feather name="calendar" size={13} color={BRAND_GREEN} />
                <DashboardText style={[styles.heroPillText, { color: BRAND_GREEN }]}>
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

            <DashboardText style={[styles.heroTitle, { color: colors.text }]}>
              {scheduledCustomWorkout.title || 'Custom Workout'}
            </DashboardText>

            {scheduledCustomWorkout.notes ? (
              <DashboardText style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                {scheduledCustomWorkout.notes}
              </DashboardText>
            ) : null}

            {/* Chips row: distance, duration, pace */}
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

            <View style={[styles.recordButton, { backgroundColor: BRAND_GREEN }]}>
              <Feather name="play" size={19} color="#081009" />
              <DashboardText style={styles.recordText}>START WORKOUT</DashboardText>
            </View>
          </View>
        </TouchableOpacity>
      ) : null}

      {/* Additional scheduled workouts for today if multiple */}
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

      {/* 2. Quick Start Hero Card (Free run) */}
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
              <DashboardText style={[styles.heroPillText, { color: BRAND_GREEN }]}>
                {scheduledCustomWorkout ? 'FREE RUN / QUICK START' : 'QUICK START'}
              </DashboardText>
            </View>
            <View style={styles.gpsIndicator}>
              <View style={[styles.gpsDot, { backgroundColor: BRAND_GREEN }]} />
              <DashboardText style={[styles.gpsText, { color: colors.textSecondary }]}>
                GPS Ready
              </DashboardText>
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

      {/* 3. Custom Workout & Plan Assessment Action Cards (Side-by-Side) */}
      <View style={styles.actionCardsRow}>
        {/* Custom Workout Card */}
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => router.push('/(app)/custom-workout')}
          style={[
            styles.actionCard,
            {
              backgroundColor: colors.surface,
              borderColor: isDark ? 'rgba(255, 149, 0, 0.28)' : 'rgba(255, 149, 0, 0.32)',
            },
          ]}
        >
          <View style={[styles.actionIconCircle, { backgroundColor: 'rgba(255, 149, 0, 0.15)' }]}>
            <Feather name="sliders" size={19} color="#FF9500" />
          </View>
          <DashboardText style={[styles.actionCardTitle, { color: colors.text }]}>
            Custom Workout
          </DashboardText>
          <DashboardText style={[styles.actionCardDesc, { color: colors.textSecondary }]}>
            Build your own intervals, repeat blocks & pace targets.
          </DashboardText>
          <View style={styles.actionCardFooter}>
            <DashboardText style={[styles.actionCardLink, { color: '#FF9500' }]}>
              Build Workout
            </DashboardText>
            <Feather name="arrow-right" size={13} color="#FF9500" />
          </View>
        </TouchableOpacity>

        {/* Plan Assessment Card */}
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={onStartAssessment}
          style={[
            styles.actionCard,
            {
              backgroundColor: colors.surface,
              borderColor: isDark ? 'rgba(48, 209, 88, 0.28)' : 'rgba(48, 209, 88, 0.32)',
            },
          ]}
        >
          <View style={[styles.actionIconCircle, { backgroundColor: 'rgba(48, 209, 88, 0.15)' }]}>
            <MaterialCommunityIcons name="target" size={20} color={BRAND_GREEN} />
          </View>
          <DashboardText style={[styles.actionCardTitle, { color: colors.text }]}>
            Adaptive Plan
          </DashboardText>
          <DashboardText style={[styles.actionCardDesc, { color: colors.textSecondary }]}>
            Get an training plan personalized to your race goals.
          </DashboardText>
          <View style={styles.actionCardFooter}>
            <DashboardText style={[styles.actionCardLink, { color: BRAND_GREEN }]}>
              {canStartAssessment ? 'Get Plan' : 'Start Plan'}
            </DashboardText>
            <Feather name="arrow-right" size={13} color={BRAND_GREEN} />
          </View>
        </TouchableOpacity>
      </View>

      {/* 4. Popular Workouts Section */}
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
            onPress={() => openWorkoutSetup(workout)}
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
  customEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  customEditText: {
    fontSize: 12,
    fontWeight: '700',
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
  todayChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 2,
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
  actionCardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  actionCard: {
    flex: 1,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.25,
    justifyContent: 'space-between',
    minHeight: 172,
  },
  actionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  actionCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  actionCardDesc: {
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
    marginBottom: 10,
  },
  actionCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionCardLink: {
    fontSize: 12,
    fontWeight: '800',
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
