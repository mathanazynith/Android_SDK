import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { getBackendErrorMessage } from '../../../service/api';
import { activityAPI, BackendActivity } from '../../../src/services/activityApi';
import ActivityRouteMap from '../../../components/ActivityRouteMap';

const formatDistance = (meters: number) => `${(Math.max(0, meters) / 1000).toFixed(2)} km`;

const formatDuration = (seconds: number) => {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} hr ${minutes % 60} min` : `${minutes} min`;
};

const formatPace = (secondsPerKm: number) => {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '-- /km';
  const totalSeconds = Math.round(secondsPerKm);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')} /km`;
};

const formatActivityType = (activityType: string) =>
  activityType.toLowerCase() === 'walk' ? 'Walk' : 'Run';

const getSectionLabel = (startTime: string) => {
  const date = new Date(startTime);
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));

  if (date >= weekStart) return 'This Week';
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

function ActivityCard({ activity, onPress }: {
  activity: BackendActivity;
  onPress: () => void;
}) {
  const activityName = formatActivityType(activity.activity_type);
  const duration = activity.moving_time || activity.elapsed_time;
  const [encodedPolyline, setEncodedPolyline] = useState(activity.encoded_polyline);

  useEffect(() => {
    if (encodedPolyline) return;

    let isMounted = true;
    void activityAPI.get(activity.id)
      .then((detail) => {
        if (isMounted) setEncodedPolyline(detail.encoded_polyline);
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [activity.id, encodedPolyline]);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.82}>
      <View style={styles.cardContent}>
        <View style={styles.cardDetails}>
          <Text style={styles.activityType}>{activityName}</Text>
          <Text style={styles.activityDate}>
            {new Date(activity.start_time).toLocaleDateString(undefined, {
              weekday: 'short', month: 'short', day: 'numeric',
            })}
          </Text>
          <Text style={styles.distance}>{formatDistance(activity.distance)}</Text>

          <View style={styles.metrics}>
            <View style={styles.metric}>
              <Feather name="clock" size={18} color="#35C72B" />
              <Text style={styles.metricValue}>{formatDuration(duration)}</Text>
              <Text style={styles.metricLabel}>Time</Text>
            </View>
            <View style={styles.metric}>
              <Feather name="compass" size={18} color="#35C72B" />
              <Text style={styles.metricValue}>{formatPace(activity.avg_pace)}</Text>
              <Text style={styles.metricLabel}>Pace</Text>
            </View>
          </View>
        </View>

        <View pointerEvents="none" style={styles.routePreview}>
          <ActivityRouteMap encodedPolyline={encodedPolyline} variant="preview" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function ActivityScreen() {
  const [activities, setActivities] = useState<BackendActivity[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadActivities = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      setError(null);
      setActivities(await activityAPI.list());
    } catch (requestError) {
      setError(getBackendErrorMessage(requestError, 'Unable to load workout history.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadActivities();
    }, [loadActivities]),
  );

  const groupedActivities = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? activities.filter((activity) => formatActivityType(activity.activity_type).toLowerCase().includes(query))
      : activities;

    return filtered.reduce<Record<string, BackendActivity[]>>((groups, activity) => {
      const section = getSectionLabel(activity.start_time);
      (groups[section] ??= []).push(activity);
      return groups;
    }, {});
  }, [activities, search]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.heading}>
        <Text style={styles.title}>Workout History</Text>
        <Text style={styles.subtitle}>Your completed runs and walks</Text>
      </View>

      <View style={styles.searchBox}>
        <Feather name="search" size={22} color="#A9ADAF" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search workouts..."
          placeholderTextColor="#74787B"
          style={styles.searchInput}
          accessibilityLabel="Search workout history"
        />
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#35C72B" />
          <Text style={styles.stateText}>Loading workout history...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Feather name="alert-circle" size={32} color="#FFB020" />
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void loadActivities()}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadActivities(true)} tintColor="#35C72B" />}
        >
          {Object.entries(groupedActivities).map(([section, sectionActivities]) => (
            <View key={section} style={styles.section}>
              <Text style={styles.sectionTitle}>{section}</Text>
              {sectionActivities.map((activity) => (
                <ActivityCard
                  key={String(activity.id)}
                  activity={activity}
                  onPress={() => router.push(`/(app)/activity/${activity.id}` as any)}
                />
              ))}
            </View>
          ))}
          {activities.length === 0 && <Text style={styles.empty}>No completed workouts yet.</Text>}
          {activities.length > 0 && Object.keys(groupedActivities).length === 0 && <Text style={styles.empty}>No workouts match your search.</Text>}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E0F', paddingHorizontal: 22 },
  heading: { paddingTop: 20, paddingBottom: 18 },
  title: { color: '#F7F7F7', fontSize: 31, fontWeight: '700' },
  subtitle: { color: '#A9ADAF', fontSize: 15, marginTop: 4 },
  searchBox: { height: 58, backgroundColor: '#242627', borderRadius: 18, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, marginBottom: 24 },
  searchInput: { flex: 1, color: '#F7F7F7', fontSize: 17, marginLeft: 12, height: '100%' },
  scrollContent: { paddingBottom: 36 },
  section: { marginBottom: 24 },
  sectionTitle: { color: '#F7F7F7', fontSize: 24, fontWeight: '700', marginBottom: 13 },
  card: { backgroundColor: '#242627', borderRadius: 26, padding: 21, marginBottom: 14, borderWidth: 1, borderColor: '#393C3E' },
  cardContent: { flexDirection: 'row', alignItems: 'stretch' },
  cardDetails: { flex: 1, minWidth: 0, paddingRight: 14 },
  activityType: { color: '#F7F7F7', fontSize: 21, fontWeight: '700' },
  activityDate: { color: '#A9ADAF', fontSize: 14, marginTop: 4 },
  distance: { color: '#35C72B', fontSize: 31, lineHeight: 38, fontWeight: '700', marginTop: 16 },
  metrics: { flexDirection: 'row', marginTop: 18, gap: 10 },
  metric: { flex: 1 },
  metricValue: { color: '#F7F7F7', fontSize: 15, fontWeight: '700', marginTop: 7 },
  metricLabel: { color: '#A9ADAF', fontSize: 13, marginTop: 4 },
  routePreview: { width: 124, alignSelf: 'stretch' },
  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  stateText: { color: '#C4C8C5', fontSize: 16, textAlign: 'center', marginTop: 13 },
  retryButton: { backgroundColor: '#35C72B', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, marginTop: 18 },
  retryText: { color: '#0B0E0F', fontSize: 16, fontWeight: '700' },
  empty: { color: '#A9ADAF', textAlign: 'center', fontSize: 16, marginTop: 40 },
});
