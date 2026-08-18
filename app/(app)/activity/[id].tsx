import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

import ActivityRouteMap from '../../../components/ActivityRouteMap';
import { getBackendErrorMessage } from '../../../service/api';
import { activityAPI, BackendActivity } from '../../../src/services/activityApi';

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
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export default function ActivityDetailScreen() {
  const { id, cropStart, cropEnd } = useLocalSearchParams<{
    id: string;
    cropStart?: string;
    cropEnd?: string;
  }>();
  const [activity, setActivity] = useState<BackendActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cropStartIndex = cropStart === undefined ? undefined : Number(cropStart);
  const cropEndIndex = cropEnd === undefined ? undefined : Number(cropEnd);

  const loadActivity = useCallback(async () => {
    if (!id) {
      setError('No workout was selected.');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setError(null);
      setActivity(await activityAPI.get(id));
    } catch (requestError) {
      setError(getBackendErrorMessage(requestError, 'Unable to load workout details.'));
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
      { text: 'OK', onPress: () => router.back() },
    ]);
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity accessibilityLabel="Back to workout history" onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color="#F7F7F7" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Activity Details</Text>
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
          <ActivityIndicator size="large" color="#35C72B" />
          <Text style={styles.stateText}>Loading activity details...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Feather name="alert-circle" size={32} color="#FFB020" />
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void loadActivity()}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : activity ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.activityType}>{activity.activity_type.toUpperCase() === 'WALK' ? 'Walk' : 'Run'}</Text>
          <Text style={styles.date}>
            {new Date(activity.start_time).toLocaleString(undefined, {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
            })}
          </Text>

          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>Distance</Text>
            <Text style={styles.distance}>{formatDistance(activity.distance)}</Text>
            <Text style={styles.status}>{activity.processing_status.toLowerCase()}</Text>
          </View>

          <Text style={styles.sectionTitle}>Route</Text>
          <ActivityRouteMap
            encodedPolyline={activity.encoded_polyline}
            cropStartIndex={Number.isFinite(cropStartIndex) ? cropStartIndex : undefined}
            cropEndIndex={Number.isFinite(cropEndIndex) ? cropEndIndex : undefined}
          />

          <Text style={styles.sectionTitle}>Performance</Text>
          <View style={styles.metricsCard}>
            <DetailMetric label="Moving time" value={formatDuration(activity.moving_time)} />
            <DetailMetric label="Elapsed time" value={formatDuration(activity.elapsed_time)} />
            <DetailMetric label="Average pace" value={formatPace(activity.avg_pace)} />
            <DetailMetric label="Average speed" value={formatSpeed(activity.avg_speed)} />
            <DetailMetric label="Max speed" value={formatSpeed(activity.max_speed)} />
            <DetailMetric label="Calories" value={`${Math.round(activity.calories)} kcal`} />
          </View>

          <Text style={styles.sectionTitle}>Route data</Text>
          <View style={styles.metricsCard}>
            <DetailMetric label="GPS points" value={String(activity.gps_points_count)} />
            <DetailMetric label="Elevation gain" value={`${Math.round(activity.elevation_gain)} m`} />
            <DetailMetric label="Elevation loss" value={`${Math.round(activity.elevation_loss)} m`} />
            <DetailMetric label="Route processed" value={activity.is_processed ? 'Yes' : 'No'} />
          </View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0E0F',
    paddingHorizontal: 22,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0,
  },
  header: { height: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 42, height: 42, justifyContent: 'center', alignItems: 'center' },
  headerButtonsContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cropButton: { width: 42, height: 42, justifyContent: 'center', alignItems: 'center' },
  deleteButton: { width: 42, height: 42, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#F7F7F7', fontSize: 19, fontWeight: '700' },
  headerSpacer: { width: 42 },
  content: { paddingTop: 16, paddingBottom: 38 },
  activityType: { color: '#F7F7F7', fontSize: 32, fontWeight: '700' },
  date: { color: '#A9ADAF', fontSize: 15, marginTop: 5 },
  heroCard: { backgroundColor: '#242627', borderRadius: 26, borderWidth: 1, borderColor: '#393C3E', padding: 22, marginTop: 26 },
  heroLabel: { color: '#A9ADAF', fontSize: 15 },
  distance: { color: '#35C72B', fontSize: 42, fontWeight: '700', marginTop: 5 },
  status: { color: '#A9ADAF', fontSize: 13, marginTop: 10, textTransform: 'capitalize' },
  sectionTitle: { color: '#F7F7F7', fontSize: 21, fontWeight: '700', marginTop: 26, marginBottom: 12 },
  metricsCard: { backgroundColor: '#242627', borderRadius: 22, borderWidth: 1, borderColor: '#393C3E', flexDirection: 'row', flexWrap: 'wrap', padding: 8 },
  metric: { width: '50%', padding: 14 },
  metricLabel: { color: '#A9ADAF', fontSize: 13 },
  metricValue: { color: '#F7F7F7', fontSize: 17, fontWeight: '700', marginTop: 5 },
  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  stateText: { color: '#C4C8C5', fontSize: 16, textAlign: 'center', marginTop: 13 },
  retryButton: { backgroundColor: '#35C72B', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, marginTop: 18 },
  retryText: { color: '#0B0E0F', fontSize: 16, fontWeight: '700' },
});
