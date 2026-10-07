import { Alert } from '@/components/ThemedAlert';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  // SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ActivityRouteMap from '../../../components/ActivityRouteMap';
import ActivitySplitsModal from '../../../components/ActivitySplitsModal';
import { useTheme } from '../../../contexts/ThemeContext';
import { getBackendErrorMessage } from '../../../service/api';
import { activityAPI, BackendActivity, normalizeActivitySplits } from '../../../src/services/activityApi';
import { ActivityExtraSplits, ActivitySegmentSplits } from '../../../src/types/activity';

const formatDistance = (meters: number) => `${(Math.max(0, meters) / 1000).toFixed(2)} km`;

const formatDuration = (seconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secondsRemaining = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secondsRemaining).padStart(2, '0')}`
    : `${minutes}:${String(secondsRemaining).padStart(2, '0')}`;
};

const formatPace = (secondsPerKm: number) => {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '-- /km';
  const totalSeconds = Math.round(secondsPerKm);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')} /km`;
};

const formatSpeed = (metersPerSecond: number) => `${(Math.max(0, metersPerSecond) * 3.6).toFixed(1)} km/h`;

function DetailMetric({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

export default function ActivityDetailScreen() {
  const { colors, isDark } = useTheme();
  const { id, cropStart, cropEnd } = useLocalSearchParams<{
    id: string;
    cropStart?: string;
    cropEnd?: string;
  }>();
  const [activity, setActivity] = useState<BackendActivity | null>(null);
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
      setActivity(await activityAPI.get(id));
    } catch (requestError) {
      const message = getBackendErrorMessage(requestError, 'Unable to load workout details.');
      setError(message);
      Alert.alert('Workout details unavailable', message);
    } finally {
      setLoading(false);
    }
  }, [id]);

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
      `Delete this ${activity.activity_type.toLowerCase()} from your workout history? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void deleteActivity() },
      ],
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
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
              <Feather name="crop" size={20} color="#FFB020" />
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
                ? <ActivityIndicator size="small" color="#FF6B6B" />
                : <Feather name="trash-2" size={20} color="#FF6B6B" />}
            </TouchableOpacity>
          </View>
        ) : <View style={styles.headerSpacer} />}
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.stateText, { color: colors.textSecondary }]}>Loading activity details...</Text>
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
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.activityType, { color: colors.text }]}>{activity.activity_type.toUpperCase() === 'WALK' ? 'Walk' : 'Run'}</Text>
          <Text style={[styles.date, { color: colors.textSecondary }]}>
            {new Date(activity.start_time).toLocaleString(undefined, {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
            })}
          </Text>

          <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>Distance</Text>
            <Text style={[styles.distance, { color: colors.primary }]}>{formatDistance(activity.distance)}</Text>
            <Text style={[styles.status, { color: colors.textTertiary }]}>{activity.processing_status.toLowerCase()}</Text>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.text }]}>Route</Text>
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
          />

          <Text style={[styles.sectionTitle, { color: colors.text }]}>Performance</Text>
          <View style={[styles.metricsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <DetailMetric label="Moving time" value={formatDuration(activity.moving_time)} />
            <DetailMetric label="Elapsed time" value={formatDuration(activity.elapsed_time)} />
            <DetailMetric label="Average pace" value={formatPace(activity.avg_pace)} />
            <DetailMetric label="Average speed" value={formatSpeed(activity.avg_speed)} />
            <DetailMetric label="Max speed" value={formatSpeed(activity.max_speed)} />
            <DetailMetric label="Calories" value={`${Math.round(activity.calories)} kcal`} />
          </View>

          {(activity.planned_distance_km !== null && activity.planned_distance_km !== undefined)
            || (activity.extra_distance_km !== null && activity.extra_distance_km !== undefined) ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Distance breakdown</Text>
              <View style={[styles.metricsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <DetailMetric label="Planned distance" value={formatDistance(Number(activity.planned_distance ?? (activity.planned_distance_km ?? 0) * 1000))} />
                <DetailMetric label="Extra distance" value={formatDistance(Number(activity.extra_distance ?? (activity.extra_distance_km ?? 0) * 1000))} />
              </View>
            </>
          ) : null}

          <Text style={[styles.sectionTitle, { color: colors.text }]}>Route data</Text>
          <View style={[styles.metricsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <DetailMetric label="Elevation gain" value={`${Math.round(activity.elevation_gain)} m`} />
            <DetailMetric label="Elevation loss" value={`${Math.round(activity.elevation_loss)} m`} />
            <DetailMetric label="Route processed" value={activity.is_processed ? 'Yes' : 'No'} />
          </View>
        </ScrollView>
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
  content: { paddingTop: 16, paddingBottom: 38 },
  activityType: { fontSize: 32, fontWeight: '700' },
  date: { fontSize: 15, marginTop: 5 },
  heroCard: { borderRadius: 26, borderWidth: 1, padding: 22, marginTop: 26 },
  heroLabel: { fontSize: 15 },
  distance: { fontSize: 42, fontWeight: '700', marginTop: 5 },
  status: { fontSize: 13, marginTop: 10, textTransform: 'capitalize' },
  sectionTitle: { fontSize: 21, fontWeight: '700', marginTop: 26, marginBottom: 12 },
  metricsCard: { borderRadius: 22, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', padding: 8 },
  metric: { width: '50%', padding: 14 },
  metricLabel: { fontSize: 13 },
  metricValue: { fontSize: 17, fontWeight: '700', marginTop: 5 },
  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  stateText: { fontSize: 16, textAlign: 'center', marginTop: 13 },
  retryButton: { borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, marginTop: 18 },
  retryText: { fontSize: 16, fontWeight: '700' },
});

