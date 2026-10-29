import { Alert } from '@/components/ThemedAlert';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import ActivityRouteMap from '../../../components/ActivityRouteMap';
import ActivitySplitsModal from '../../../components/ActivitySplitsModal';
import { RunningLoader } from '../../../components/common/RunningLoader';
import MotionEntrance from '../../../components/MotionEntrance';
import { useTheme } from '../../../contexts/ThemeContext';
import { getBackendErrorMessage } from '../../../service/api';
import { activityAPI, BackendActivity, normalizeActivitySplits, runRouteAPI } from '../../../src/services/activityApi';
import { ActivityExtraSplits, ActivitySegmentSplits } from '../../../src/types/activity';

const formatDistance = (meters: number) => `${(Math.max(0, meters) / 1000).toFixed(2)} km`;

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '--';
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secondsRemaining = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secondsRemaining).padStart(2, '0')}`
    : `${minutes} min ${secondsRemaining} sec`;
};

const formatPace = (secondsPerKm: number) => {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '-- /km';
  const totalSeconds = Math.round(secondsPerKm);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')} /km`;
};

const formatSpeed = (metersPerSecond: number) => `${(Math.max(0, metersPerSecond) * 3.6).toFixed(1)} km/h`;
const formatBackendSpeed = (speed: number) => Number.isFinite(speed) ? `${speed} Km/hr` : '--';

const formatRecordedDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '--'
    : `${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};

const formatActivityDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '--'
    : `${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} at ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
};

function DetailMetric({
  label,
  value,
  fullWidth = false,
  singleLine = false,
}: {
  label: string;
  value: string;
  fullWidth?: boolean;
  singleLine?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.metric, fullWidth && styles.metricFullWidth]}>
      <Text style={[styles.metricLabel, fullWidth && styles.metricLabelInline, { color: colors.textSecondary }]}>{label}</Text>
      <Text
        numberOfLines={singleLine ? 1 : undefined}
        adjustsFontSizeToFit={singleLine}
        minimumFontScale={singleLine ? 0.75 : undefined}
        style={[styles.metricValue, fullWidth && styles.metricValueInline, { color: colors.text }]}
      >
        {value}
      </Text>
    </View>
  );
}

export default function ActivityDetailScreen() {
  const { colors, isDark } = useTheme();
  const { id, cropStart, cropEnd, savedRouteId: savedRouteIdParam } = useLocalSearchParams<{
    id: string;
    cropStart?: string;
    cropEnd?: string;
    savedRouteId?: string;
  }>();
  const [activity, setActivity] = useState<BackendActivity | null>(null);
  const [savedRouteId, setSavedRouteId] = useState<number | null>(null);
  const [savedRouteIsPublic, setSavedRouteIsPublic] = useState<boolean | null>(null);
  const [isUpdatingRouteVisibility, setIsUpdatingRouteVisibility] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splitsVisible, setSplitsVisible] = useState(false);
  const [splitsLoading, setSplitsLoading] = useState(false);
  const [splitsError, setSplitsError] = useState<string | null>(null);
  const [splitSegments, setSplitSegments] = useState<ActivitySegmentSplits[]>([]);
  const [extraSplits, setExtraSplits] = useState<ActivityExtraSplits['splits']>([]);
  const cropStartIndex = cropStart === undefined ? undefined : Number(cropStart);
  const cropEndIndex = cropEnd === undefined ? undefined : Number(cropEnd);

  const loadActivity = useCallback(async () => {
    if (!id) {
      const noSelectionMessage = 'No workout was selected.';
      setError(noSelectionMessage);
      Alert.alert('Workout details unavailable', noSelectionMessage);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setError(null);
      const loadedActivity = await activityAPI.get(id);
      setActivity(loadedActivity);
      const parsedRouteId = Number(savedRouteIdParam ?? loadedActivity.saved_route_id);
      if (Number.isInteger(parsedRouteId) && parsedRouteId > 0) {
        try {
          const route = await runRouteAPI.get(parsedRouteId);
          setSavedRouteId(parsedRouteId);
          setSavedRouteIsPublic(route.is_public);
        } catch (routeError) {
          setSavedRouteId(null);
          setSavedRouteIsPublic(null);
          console.warn('[ActivityDetail] Could not load saved-route visibility', routeError);
        }
      } else {
        setSavedRouteId(null);
        setSavedRouteIsPublic(null);
      }
    } catch (requestError) {
      const message = getBackendErrorMessage(requestError, 'Unable to load workout details.');
      setError(message);
      Alert.alert('Workout details unavailable', message);
    } finally {
      setLoading(false);
    }
  }, [id, savedRouteIdParam]);

  useEffect(() => {
    // The request applies its state updates asynchronously after the screen mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadActivity();
  }, [loadActivity]);

  const deleteActivity = async () => {
    if (!activity) return;

    setDeleting(true);
    try {
      const message = await activityAPI.delete(activity.id);
      showDeleteSuccess(message);
    } catch (deleteError: any) {
      try {
        await activityAPI.get(activity.id);
        throw deleteError;
      } catch (verificationError: any) {
        if (verificationError?.response?.status === 404) {
          showDeleteSuccess('Activity deleted successfully.');
          return;
        }

        Alert.alert(
          'Could not delete workout',
          getBackendErrorMessage(deleteError, 'Please try again.'),
        );
        setDeleting(false);
      }
    }
  };

  const showDeleteSuccess = (message: string) => {
    Alert.alert('Workout deleted', message, [
      { text: 'OK', onPress: () => handleBack() },
    ]);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(app)/activity');
  };

  const confirmDelete = () => {
    if (!activity) return;

    Alert.alert(
      'Delete workout?',
      `Delete this ${activity.activity_type.toLowerCase()} from your workout history? Any route saved from it will also be removed from My Routes and public suggestions if published. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void deleteActivity() },
      ],
    );
  };

  const applyRouteVisibility = async (isPublic: boolean) => {
    if (savedRouteId === null || isUpdatingRouteVisibility) return;
    setIsUpdatingRouteVisibility(true);
    try {
      await runRouteAPI.setVisibility(savedRouteId, isPublic);
      setSavedRouteIsPublic(isPublic);
    } catch (requestError) {
      Alert.alert('Could not change route visibility', getBackendErrorMessage(requestError, 'Please try again.'));
    } finally {
      setIsUpdatingRouteVisibility(false);
    }
  };

  const requestRouteVisibility = (isPublic: boolean) => {
    if (!isPublic) {
      void applyRouteVisibility(false);
      return;
    }

    Alert.alert(
      'Make route public?',
      'Other signed-in Zy-Run users will be able to view this route.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Make Public', onPress: () => { void applyRouteVisibility(true); } },
      ],
      { cancelable: true },
    );
  };

  const loadSplits = async () => {
    if (!activity) return;
    setSplitsVisible(true);
    setSplitsLoading(true);
    setSplitsError(null);
    try {
      const detail = await activityAPI.get(activity.id);
      const splitData = normalizeActivitySplits(detail);
      setSplitSegments(splitData.segments);
      setExtraSplits(splitData.extra?.splits ?? []);
    } catch (requestError) {
      setSplitsError(getBackendErrorMessage(requestError, 'Unable to load split details.'));
    } finally {
      setSplitsLoading(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={styles.header}>
        <TouchableOpacity accessibilityLabel="Back to workout history" onPress={handleBack} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Activity Details</Text>
        {activity ? (
          <View style={styles.headerButtonsContainer}>
            <TouchableOpacity
              accessibilityLabel="Crop workout"
              onPress={() => router.push(`/activity/crop/${activity.id}`)}
              style={styles.cropButton}
            >
              <Feather name="scissors" size={20} color="#FFB020" />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Open split details"
              onPress={() => void loadSplits()}
              style={styles.splitButton}
            >
              <Feather name="list" size={20} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Delete workout"
              disabled={deleting}
              onPress={confirmDelete}
              style={styles.deleteButton}
            >
              {deleting
                ? <RunningLoader size={18} fillColor="#FF6B6B" />
                : <Feather name="trash-2" size={20} color="#FF6B6B" />}
            </TouchableOpacity>
          </View>
        ) : <View style={styles.headerSpacer} />}
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <RunningLoader size={64} label="Loading activity details..." />
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Feather name="alert-circle" size={32} color="#FFB020" />
          <Text style={[styles.stateText, { color: colors.textSecondary }]}>{error}</Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={() => void loadActivity()}>
            <Text style={[styles.retryText, { color: colors.primaryText }]}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : activity ? (
        <View style={styles.activityBody}>
          <View style={styles.routePanel}>
            <Text style={[styles.sectionTitle, styles.routeTitle, { color: colors.text }]}>Route</Text>
            <ActivityRouteMap
              encodedPolyline={activity.encoded_polyline}
              plannedEncodedPolyline={activity.planned_encoded_polyline}
              extraEncodedPolyline={activity.extra_encoded_polyline}
              savedGpsPoints={activity.route?.points ?? activity.gps_points}
              runningRoutes={activity.route?.running_routes}
              pauseRoutes={activity.route?.pause_routes}
              pauseEvents={activity.pause_events ?? activity.route?.pause_events}
              pausePoints={activity.route?.pause_points}
              cropStartIndex={Number.isFinite(cropStartIndex) ? cropStartIndex : undefined}
              cropEndIndex={Number.isFinite(cropEndIndex) ? cropEndIndex : undefined}
              enableFullScreen
            />
            {savedRouteId !== null && savedRouteIsPublic !== null ? (
              <View style={[styles.routeVisibilityRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.routeVisibilityCopy}>
                  <Text style={[styles.routeVisibilityTitle, { color: colors.text }]}>Saved route</Text>
                  <Text style={[styles.routeVisibilityHint, { color: colors.textSecondary }]}>
                    {savedRouteIsPublic ? 'Public · visible to other signed-in users' : 'Private · visible only to you'}
                  </Text>
                </View>
                <Switch
                  value={savedRouteIsPublic}
                  onValueChange={requestRouteVisibility}
                  disabled={isUpdatingRouteVisibility}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.surface}
                  accessibilityLabel={`Make saved route ${savedRouteIsPublic ? 'private' : 'public'}`}
                />
              </View>
            ) : null}
          </View>

          <ScrollView
            style={styles.detailsScroll}
            contentContainerStyle={styles.detailsContent}
            showsVerticalScrollIndicator={false}
          >
            <MotionEntrance>
            <Text style={[styles.workoutHeading, { color: colors.text }]}>Workout Details</Text>
            <Text style={[styles.date, { color: colors.textSecondary }]}>
              {formatActivityDate(activity.start_time)}
            </Text>
            <View style={styles.workoutTypeRow}>
              <Text style={[styles.workoutType, { color: colors.text }]}>
                {activity.activity_type.toUpperCase() === 'WALK' ? 'Walk' : 'Run'}
              </Text>
              <Text style={[styles.workoutStatus, { color: colors.text }]}>
                {activity.processing_status.toUpperCase()}
              </Text>
            </View>

            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <DetailMetric label="Distance" value={formatDistance(activity.distance)} />
              <DetailMetric label="Moving time" value={formatDuration(activity.moving_time)} />
              <DetailMetric label="Average pace" value={formatPace(activity.avg_pace)} />
              <DetailMetric label="Calories" value={`${Math.round(activity.calories)} kcal`} />
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>Distance breakdown</Text>
            <View style={[styles.metricsCard, styles.verticalMetricsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <DetailMetric fullWidth label="Distance" value={formatDistance(activity.distance)} />
              <DetailMetric
                fullWidth
                label="Planned distance"
                value={formatDistance(activity.distance)}
              />
              <DetailMetric
                fullWidth
                label="Extra distance"
                value={activity.extra_distance != null
                  ? (Number(activity.extra_distance) > 0 ? formatDistance(Number(activity.extra_distance)) : 'No extra distance')
                  : activity.extra_distance_km != null
                    ? (Number(activity.extra_distance_km) > 0 ? formatDistance(Number(activity.extra_distance_km) * 1000) : 'No extra distance')
                    : 'No extra distance'}
              />
              <DetailMetric fullWidth label="Elapsed time" value={formatDuration(activity.elapsed_time)} />
                <DetailMetric fullWidth label="Moving time" value={formatDuration(activity.moving_time)} />
              <DetailMetric fullWidth label="Average pace" value={formatPace(activity.avg_pace)} />
              <DetailMetric fullWidth label="Average speed" value={formatBackendSpeed(activity.avg_speed)} />
              <DetailMetric fullWidth label="Max speed" value={formatSpeed(activity.max_speed)} />
              <DetailMetric fullWidth label="Calories" value={`${Math.round(activity.calories)} kcal`} />
              <DetailMetric fullWidth label="Elevation gain" value={`${Math.round(activity.elevation_gain)} m`} />
              <DetailMetric fullWidth label="Elevation loss" value={`${Math.round(activity.elevation_loss)} m`} />
              <DetailMetric fullWidth singleLine label="Recorded" value={formatRecordedDate(activity.end_time)} />
            </View>
            </MotionEntrance>
          </ScrollView>
        </View>
      ) : null}
      <ActivitySplitsModal
        visible={splitsVisible}
        loading={splitsLoading}
        error={splitsError}
        segments={splitSegments}
        extraSplits={extraSplits}
        onClose={() => setSplitsVisible(false)}
        onRetry={() => void loadSplits()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 0,
  },
  header: { height: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 42, height: 42, justifyContent: 'center', alignItems: 'center' },
  headerButtonsContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cropButton: { width: 42, height: 42, justifyContent: 'center', alignItems: 'center' },
  splitButton: { width: 42, height: 42, justifyContent: 'center', alignItems: 'center' },
  deleteButton: { width: 42, height: 42, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 19, fontWeight: '700' },
  headerSpacer: { width: 42 },
  activityBody: { flex: 1, minHeight: 0 },
  routePanel: { flexShrink: 0, paddingTop: 12 },
  routeTitle: { marginTop: 0 },
  routeVisibilityRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10 },
  routeVisibilityCopy: { flex: 1, minWidth: 0 },
  routeVisibilityTitle: { fontSize: 13, fontWeight: '700' },
  routeVisibilityHint: { fontSize: 11, marginTop: 3 },
  detailsScroll: { flex: 1 },
  detailsContent: { paddingBottom: 38 },
  workoutHeading: { fontSize: 24, fontWeight: '700', marginTop: 26 },
  date: { fontSize: 15, marginTop: 5 },
  workoutTypeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 },
  workoutType: { fontSize: 20, fontWeight: '700' },
  workoutStatus: { fontSize: 14, fontWeight: '700' },
  summaryCard: { borderRadius: 22, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', padding: 8, marginTop: 26 },
  sectionTitle: { fontSize: 21, fontWeight: '700', marginTop: 26, marginBottom: 12 },
  metricsCard: { borderRadius: 22, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', padding: 8 },
  verticalMetricsCard: { flexDirection: 'column' },
  metric: { width: '50%', padding: 14 },
  metricFullWidth: { width: '100%', minHeight: 42, paddingHorizontal: 8, paddingVertical: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  metricLabel: { fontSize: 13 },
  metricLabelInline: { flex: 1, flexShrink: 1 },
  metricValue: { fontSize: 17, fontWeight: '700', marginTop: 5 },
  metricValueInline: { flex: 1, marginTop: 0, flexShrink: 1, textAlign: 'right' },
  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  stateText: { fontSize: 16, textAlign: 'center', marginTop: 13 },
  retryButton: { borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, marginTop: 18 },
  retryText: { fontSize: 16, fontWeight: '700' },
});
