import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

//import ActivityRouteMap from '../../../components/ActivityRouteMap';
import ActivityRouteMap from '../../../components/ActivityRouteMap';
import { useTheme } from '../../../contexts/ThemeContext';
import { getBackendErrorMessage } from '../../../service/api';
import { activityAPI, BackendActivity } from '../../../src/services/activityApi';

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

const ActivityCard = memo(function ActivityCard({ activity, onPress }: {
  activity: BackendActivity;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const activityName = formatActivityType(activity.activity_type);
  const duration = activity.moving_time || activity.elapsed_time;
  const [routeData, setRouteData] = useState({
    encodedPolyline: activity.encoded_polyline,
    plannedEncodedPolyline: activity.planned_encoded_polyline,
    extraEncodedPolyline: activity.extra_encoded_polyline,
  });

  useEffect(() => {
    if (routeData.encodedPolyline) return;

    let isMounted = true;
    void activityAPI.get(activity.id)
      .then((detail) => {
        if (isMounted) {
          setRouteData({
            encodedPolyline: detail.encoded_polyline,
            plannedEncodedPolyline: detail.planned_encoded_polyline,
            extraEncodedPolyline: detail.extra_encoded_polyline,
          });
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [activity.id, routeData.encodedPolyline]);

  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={onPress} activeOpacity={0.82}>
      <View style={styles.cardContent}>
        <View style={styles.cardDetails}>
          <Text style={[styles.activityType, { color: colors.text }]}>{activityName}</Text>
          <Text style={[styles.activityDate, { color: colors.textSecondary }]}>
            {new Date(activity.start_time).toLocaleDateString(undefined, {
              weekday: 'short', month: 'short', day: 'numeric',
            })}
          </Text>
          <Text style={styles.distance}>{formatDistance(activity.distance)}</Text>

          <View style={styles.metrics}>
            <View style={styles.metric}>
              <Feather name="clock" size={18} color="#35C72B" />
              <Text style={[styles.metricValue, { color: colors.text }]}>{formatDuration(duration)}</Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Time</Text>
            </View>
            <View style={styles.metric}>
              <Feather name="compass" size={18} color="#35C72B" />
              <Text style={[styles.metricValue, { color: colors.text }]}>{formatPace(activity.avg_pace)}</Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Pace</Text>
            </View>
          </View>
        </View>

        <View pointerEvents="none" style={styles.routePreview}>
          <ActivityRouteMap
            encodedPolyline={routeData.encodedPolyline}
            plannedEncodedPolyline={routeData.plannedEncodedPolyline}
            extraEncodedPolyline={routeData.extraEncodedPolyline}
            variant="preview"
          />
        </View>
      </View>
    </TouchableOpacity>
  );
});

function HistorySkeleton() {
  return (
    <View style={styles.skeletonList}>
      {[1, 2, 3].map((item) => (
        <View key={item} style={styles.skeletonCard}>
          <View style={styles.skeletonMain}>
            <View style={styles.skeletonShort} />
            <View style={styles.skeletonTiny} />
            <View style={styles.skeletonDistance} />
            <View style={styles.skeletonMetrics} />
          </View>
          <View style={styles.skeletonMap} />
        </View>
      ))}
    </View>
  );
}

export default function ActivityScreen() {
  const { colors } = useTheme();
  const [activities, setActivities] = useState<BackendActivity[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const loadingFirstPageRef = useRef(false);
  const requestIdRef = useRef(0);

  const loadFirstPage = useCallback(async (isRefresh = false) => {
    const requestId = ++requestIdRef.current;
    cursorRef.current = null;
    loadingFirstPageRef.current = true;
    setHasMore(true);
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      setError(null);
      const cached = await activityAPI.getCachedFirstPage();
      if (cached && requestId === requestIdRef.current) {
        setActivities(cached.activities);
        setHasMore(cached.hasMore);
        cursorRef.current = cached.nextCursor;
        setLoading(false);
      }
      const result = await activityAPI.listPage(null, 10);
      if (requestId !== requestIdRef.current) return;
      setActivities(result.activities);
      setHasMore(result.hasMore);
      cursorRef.current = result.nextCursor;
    } catch (requestError) {
      if (requestId !== requestIdRef.current) return;
      const message = getBackendErrorMessage(requestError, 'Unable to load workout history.');
      setError(message);
      Alert.alert('Workout history unavailable', message);
    } finally {
      if (requestId === requestIdRef.current) {
        loadingFirstPageRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loadingMoreRef.current || loadingFirstPageRef.current || loading || refreshing) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const cursor = cursorRef.current;
    try {
      const result = await activityAPI.listPage(cursor, 10);
      setActivities((current) => [
        ...current,
        ...result.activities.filter((item) => !current.some((existing) => existing.id === item.id)),
      ]);
      cursorRef.current = result.nextCursor;
      // A repeated cursor would otherwise keep requesting the same page indefinitely.
      setHasMore(result.hasMore && result.nextCursor !== cursor);
    } catch (requestError) {
      Alert.alert('Unable to load more history', getBackendErrorMessage(requestError, 'Please try again.'));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, loading, loadingMore, refreshing]);

  useFocusEffect(
    useCallback(() => {
      void loadFirstPage();
    }, [loadFirstPage]),
  );

  const visibleActivities = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? activities.filter((activity) => formatActivityType(activity.activity_type).toLowerCase().includes(query))
      : activities;
  }, [activities, search]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.background === '#F8FAFC' ? 'dark-content' : 'light-content'} />
      <View style={styles.heading}>
        <Text style={[styles.title, { color: colors.text }]}>Workout History</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Your completed runs and walks</Text>
      </View>

      <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
        <Feather name="search" size={22} color={colors.textSecondary} />
        <TextInput
          value={search}
          onChangeText={(value) => {
            setSearch(value);
          }}
          placeholder="Search workouts..."
          placeholderTextColor={colors.textSecondary}
          style={[styles.searchInput, { color: colors.text }]}
          accessibilityLabel="Search workout history"
        />
      </View>

      {loading ? (
        <HistorySkeleton />
      ) : error ? (
        <View style={styles.centerState}>
          <Feather name="alert-circle" size={32} color="#FFB020" />
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void loadFirstPage()}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={visibleActivities}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ActivityCard
              activity={item}
              onPress={() => router.push(`/(app)/activity/${item.id}` as any)}
            />
          )}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          getItemLayout={(_, index) => ({ length: 234, offset: 234 * index, index })}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore
            ? <ActivityIndicator color="#35C72B" style={styles.footerLoader} />
            : hasMore
              ? null
              : <Text style={styles.endMessage}>You&apos;ve reached the end of your activity history!</Text>}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadFirstPage(true)} tintColor="#35C72B" />}
          ListEmptyComponent={<Text style={styles.empty}>{activities.length === 0 ? 'No completed workouts yet.' : 'No workouts match your search.'}</Text>}
        />
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
  scrollContent: { paddingBottom: 118 },
  section: { marginBottom: 24 },
  sectionTitle: { color: '#F7F7F7', fontSize: 24, fontWeight: '700', marginBottom: 13 },
  card: { height: 220, backgroundColor: '#242627', borderRadius: 26, padding: 21, marginBottom: 14, borderWidth: 1, borderColor: '#393C3E' },
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
  footerLoader: { paddingVertical: 18 },
  endMessage: { color: '#A9ADAF', textAlign: 'center', fontSize: 13, paddingVertical: 18 },
  skeletonList: { paddingTop: 4 },
  skeletonCard: { height: 220, flexDirection: 'row', backgroundColor: '#171A1A', borderRadius: 26, padding: 21, marginBottom: 14, borderWidth: 1, borderColor: '#243C2B' },
  skeletonMain: { flex: 1, paddingRight: 14 },
  skeletonShort: { width: '55%', height: 18, borderRadius: 6, backgroundColor: '#294A32' },
  skeletonTiny: { width: '35%', height: 11, borderRadius: 5, backgroundColor: '#26352A', marginTop: 9 },
  skeletonDistance: { width: '48%', height: 28, borderRadius: 7, backgroundColor: '#245C32', marginTop: 22 },
  skeletonMetrics: { width: '78%', height: 38, borderRadius: 8, backgroundColor: '#202A22', marginTop: 20 },
  skeletonMap: { width: 124, borderRadius: 12, backgroundColor: '#202A22' },
  empty: { color: '#A9ADAF', textAlign: 'center', fontSize: 16, marginTop: 40 },
});
