import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useFocusEffect } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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

const getNormalizedActivityType = (activityType: string): 'run' | 'walk' =>
  activityType.toLowerCase() === 'walk' ? 'walk' : 'run';

type ActivityTypeFilter = 'all' | 'run' | 'walk';
type ActivityDateFilter = 'all' | '7d' | '30d' | '90d' | 'year' | 'single' | 'range';
type ActivityDistanceFilter = 'all' | 'under1' | 'under2' | 'short' | 'medium' | 'long';
type ActivitySortFilter = 'newest' | 'oldest' | 'longest' | 'fastest';
type DatePickerTarget = 'start' | 'end';

const activityTypeOptions: { label: string; value: ActivityTypeFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Run', value: 'run' },
  { label: 'Walk', value: 'walk' },
];

const activityDateOptions: { label: string; value: ActivityDateFilter }[] = [
  { label: 'All', value: 'all' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
  { label: 'Year', value: 'year' },
  { label: 'Single', value: 'single' },
  { label: 'Range', value: 'range' },
];

const activityDistanceOptions: { label: string; value: ActivityDistanceFilter }[] = [
  { label: 'All', value: 'all' },
  { label: '<1 km', value: 'under1' },
  { label: '<2 km', value: 'under2' },
  { label: '<5 km', value: 'short' },
  { label: '5–10 km', value: 'medium' },
  { label: '10+ km', value: 'long' },
];

const activitySortOptions: { label: string; value: ActivitySortFilter }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'Longest', value: 'longest' },
  { label: 'Fastest', value: 'fastest' },
];

const formatDateLabel = (value: Date | null) => {
  if (!value) return 'Select date';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(value);
};

const matchesDateRange = (
  activity: BackendActivity,
  range: ActivityDateFilter,
  selectedDay?: Date | null,
  rangeStart?: Date | null,
  rangeEnd?: Date | null,
): boolean => {
  if (range === 'all') return true;

  const activityDate = new Date(activity.start_time).getTime();
  if (!Number.isFinite(activityDate)) return true;

  if (range === 'single') {
    if (!selectedDay) return false;
    const start = new Date(selectedDay).setHours(0, 0, 0, 0);
    const end = new Date(selectedDay).setHours(23, 59, 59, 999);
    return activityDate >= start && activityDate <= end;
  }

  if (range === 'range') {
    if (!rangeStart || !rangeEnd) return false;
    const startValue = Math.min(new Date(rangeStart).getTime(), new Date(rangeEnd).getTime());
    const endValue = Math.max(new Date(rangeStart).getTime(), new Date(rangeEnd).getTime());
    const start = new Date(startValue).setHours(0, 0, 0, 0);
    const end = new Date(endValue).setHours(23, 59, 59, 999);
    return activityDate >= start && activityDate <= end;
  }

  const now = Date.now();
  const rangeMs = {
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
  }[range];

  return now - activityDate <= rangeMs;
};

const matchesDistanceRange = (activity: BackendActivity, range: ActivityDistanceFilter): boolean => {
  if (range === 'all') return true;

  const distanceKm = (Number(activity.distance) || 0) / 1000;
  if (range === 'under1') return distanceKm < 1;
  if (range === 'under2') return distanceKm < 2;
  if (range === 'short') return distanceKm < 5;
  if (range === 'medium') return distanceKm >= 5 && distanceKm < 10;
  return distanceKm >= 10;
};

const sortActivities = (items: BackendActivity[], sortBy: ActivitySortFilter) => {
  const cloned = [...items];

  cloned.sort((a, b) => {
    const aDate = new Date(a.start_time).getTime();
    const bDate = new Date(b.start_time).getTime();
    const aDistance = Number(a.distance) || 0;
    const bDistance = Number(b.distance) || 0;
    const aPace = Number(a.avg_pace) || Number.POSITIVE_INFINITY;
    const bPace = Number(b.avg_pace) || Number.POSITIVE_INFINITY;

    switch (sortBy) {
      case 'oldest':
        return aDate - bDate;
      case 'longest':
        return bDistance - aDistance;
      case 'fastest':
        return aPace - bPace;
      case 'newest':
      default:
        return bDate - aDate;
    }
  });

  return cloned;
};

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
        </View>

        <View style={styles.centerMetricsContainer}>
          <View style={styles.metricRow}>
            <View style={styles.metricIcon}>
              <Feather name="clock" size={17} color="#35C72B" />
            </View>
            <View style={styles.metricText}>
              <Text style={[styles.metricValue, { color: colors.text }]}>{formatDuration(duration)}</Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Time</Text>
            </View>
          </View>
          <View style={styles.metricRow}>
            <View style={styles.metricIcon}>
              <Feather name="compass" size={17} color="#35C72B" />
            </View>
            <View style={styles.metricText}>
              <Text style={[styles.metricValue, { color: colors.text }]}>{formatPace(activity.avg_pace)}</Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Pace</Text>
            </View>
          </View>
        </View>

        <View pointerEvents="none" style={styles.mapThumbnailContainer}>
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

const MAX_EMPTY_HISTORY_PAGES = 5;

async function fetchHistoryPageSkippingEmptyPages(cursor: string | null) {
  let nextCursor = cursor;
  let emptyPages = 0;

  while (true) {
    const result = await activityAPI.listPage(nextCursor, 10);
    if (result.activities.length > 0) return result;

    emptyPages += 1;
    const cursorAdvanced = result.nextCursor !== null && result.nextCursor !== nextCursor;
    if (!result.hasMore || !cursorAdvanced) return result;

    if (emptyPages >= MAX_EMPTY_HISTORY_PAGES) {
      console.warn(
        '[ActivityHistory] Stopped auto-continuing after 5 empty filtered pages.',
        { cursor: result.nextCursor },
      );
      return { ...result, hasMore: true };
    }

    nextCursor = result.nextCursor;
  }
}

export default function ActivityScreen() {
  const { colors } = useTheme();
  const [activities, setActivities] = useState<BackendActivity[]>([]);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<ActivityTypeFilter>('all');
  const [selectedDateRange, setSelectedDateRange] = useState<ActivityDateFilter>('all');
  const [selectedDistanceRange, setSelectedDistanceRange] = useState<ActivityDistanceFilter>('all');
  const [sortBy, setSortBy] = useState<ActivitySortFilter>('newest');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDistanceSheet, setShowDistanceSheet] = useState(false);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [showNativeDatePicker, setShowNativeDatePicker] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<DatePickerTarget>('start');
  const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null);
  const [rangeStartDate, setRangeStartDate] = useState<Date | null>(null);
  const [rangeEndDate, setRangeEndDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalHistoryCount, setTotalHistoryCount] = useState<number | null>(null);
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
        setTotalHistoryCount(cached.totalCount ?? cached.activities.length);
        cursorRef.current = cached.nextCursor;
        setLoading(false);
      }
      const result = await fetchHistoryPageSkippingEmptyPages(null);
      if (requestId !== requestIdRef.current) return;
      setActivities(result.activities);
      setHasMore(result.hasMore);
      setTotalHistoryCount(result.totalCount ?? result.activities.length);
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
    if (__DEV__) {
      console.log('[ActivityHistory] onEndReached', {
        cursor: cursorRef.current,
        hasMore,
        loadingMore,
        loading,
        refreshing,
      });
    }
    if (loadingMore || !hasMore || loadingMoreRef.current || loadingFirstPageRef.current || loading || refreshing) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const cursor = cursorRef.current;
    try {
      const result = await fetchHistoryPageSkippingEmptyPages(cursor);
      setActivities((current) => [
        ...current,
        ...result.activities.filter((item) => !current.some((existing) => existing.id === item.id)),
      ]);
      setTotalHistoryCount((current) => result.totalCount ?? current ?? 0);
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

  const dateSummary = useMemo(() => {
    if (selectedDateRange === 'all') return 'All dates';
    if (selectedDateRange === 'single') {
      return selectedDayDate ? formatDateLabel(selectedDayDate) : 'Select date';
    }
    if (selectedDateRange === 'range') {
      if (rangeStartDate && rangeEndDate) {
        return `${formatDateLabel(rangeStartDate)} – ${formatDateLabel(rangeEndDate)}`;
      }
      if (rangeStartDate || rangeEndDate) {
        return rangeStartDate ? `From ${formatDateLabel(rangeStartDate)}` : `Until ${formatDateLabel(rangeEndDate)}`;
      }
      return 'Select range';
    }
    return activityDateOptions.find((option) => option.value === selectedDateRange)?.label ?? 'Date';
  }, [rangeEndDate, rangeStartDate, selectedDateRange, selectedDayDate]);

  const distanceSummary = useMemo(() => {
    if (selectedDistanceRange === 'all') return 'Distance';
    return activityDistanceOptions.find((option) => option.value === selectedDistanceRange)?.label ?? 'Distance';
  }, [selectedDistanceRange]);

  const sortSummary = useMemo(() => {
    return activitySortOptions.find((option) => option.value === sortBy)?.label ?? 'Newest';
  }, [sortBy]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count += 1;
    if (selectedType !== 'all') count += 1;
    if (selectedDateRange !== 'all') count += 1;
    if (selectedDistanceRange !== 'all') count += 1;
    if (sortBy !== 'newest') count += 1;
    return count;
  }, [search, selectedDateRange, selectedDistanceRange, selectedType, sortBy]);

  const hasActiveFilters = activeFilterCount > 0;

  const activeFilterSummary = useMemo(() => {
    const labels: string[] = [];
    if (selectedType !== 'all') labels.push(activityTypeOptions.find((option) => option.value === selectedType)?.label ?? 'Event');
    if (selectedDateRange !== 'all') labels.push(dateSummary);
    if (selectedDistanceRange !== 'all') labels.push(distanceSummary);
    if (sortBy !== 'newest') labels.push(sortSummary);
    return labels;
  }, [dateSummary, distanceSummary, selectedDateRange, selectedDistanceRange, selectedType, sortBy, sortSummary]);

  const visibleActivities = useMemo(() => {
    const query = search.trim().toLowerCase();
    let filtered = [...activities];

    if (query) {
      filtered = filtered.filter((activity) => {
        const typeLabel = formatActivityType(activity.activity_type).toLowerCase();
        return typeLabel.includes(query);
      });
    }

    if (selectedType !== 'all') {
      filtered = filtered.filter((activity) => getNormalizedActivityType(activity.activity_type) === selectedType);
    }

    if (selectedDateRange !== 'all') {
      filtered = filtered.filter((activity) => matchesDateRange(activity, selectedDateRange, selectedDayDate, rangeStartDate, rangeEndDate));
    }

    if (selectedDistanceRange !== 'all') {
      filtered = filtered.filter((activity) => matchesDistanceRange(activity, selectedDistanceRange));
    }

    return sortActivities(filtered, sortBy);
  }, [activities, rangeEndDate, rangeStartDate, search, selectedDateRange, selectedDayDate, selectedDistanceRange, selectedType, sortBy]);

  const renderActivityCard = useCallback(({ item }: { item: BackendActivity }) => (
    <ActivityCard
      activity={item}
      onPress={() => router.push(`/(app)/activity/${item.id}` as any)}
    />
  ), []);

  const footerCountText = useMemo(() => {
    const loadedCount = activities.length;
    if (!totalHistoryCount || totalHistoryCount <= loadedCount) {
      return `${loadedCount} loaded`;
    }
    return `${loadedCount} of ${totalHistoryCount} loaded`;
  }, [activities.length, totalHistoryCount]);

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
          onChangeText={setSearch}
          placeholder="Search workouts..."
          placeholderTextColor={colors.textSecondary}
          style={[styles.searchInput, { color: colors.text }]}
          accessibilityLabel="Search workout history"
        />
      </View>

      <View style={styles.filterHeader}>
        <View style={styles.typeChipRow}>
          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Event</Text>
          {activityTypeOptions.map((option) => {
            const active = selectedType === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                activeOpacity={0.85}
                onPress={() => setSelectedType(option.value)}
                style={[styles.typeChip, active && styles.typeChipSelected, { backgroundColor: active ? '#35C72B' : colors.surface, borderColor: colors.border }]}
              >
                <Text style={[styles.typeChipText, active && styles.typeChipTextSelected, { color: active ? '#08110A' : colors.text }]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {hasActiveFilters && (
        <View style={styles.activeFilterSummaryRow}>
          <View style={[styles.activeFilterBadge, { backgroundColor: '#23372A', borderColor: '#2C4B38' }]}>
            <Text style={styles.activeFilterBadgeText}>{activeFilterCount} active</Text>
          </View>
          {activeFilterSummary.slice(0, 3).map((label) => (
            <View key={label} style={[styles.activeFilterPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.activeFilterPillText, { color: colors.text }]}>{label}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.filterRowBar}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            setShowDatePicker(true);
          }}
          style={[styles.filterBarButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Feather name="calendar" size={15} color={colors.text} />
          <Text style={[styles.filterBarText, { color: colors.text }]}>{dateSummary}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setShowDistanceSheet(true)}
          style={[styles.filterBarButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Feather name="map-pin" size={15} color={colors.text} />
          <Text style={[styles.filterBarText, { color: colors.text }]}>{distanceSummary}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setShowSortSheet(true)}
          style={[styles.filterBarButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Feather name="bar-chart-2" size={15} color={colors.text} />
          <Text style={[styles.filterBarText, { color: colors.text }]}>{sortSummary}</Text>
        </TouchableOpacity>
      </View>

      {hasActiveFilters && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            setSearch('');
            setSelectedType('all');
            setSelectedDateRange('all');
            setSelectedDayDate(null);
            setRangeStartDate(null);
            setRangeEndDate(null);
            setSelectedDistanceRange('all');
            setSortBy('newest');
          }}
          style={styles.resetButton}
        >
          <Text style={styles.resetButtonText}>Reset filters</Text>
        </TouchableOpacity>
      )}

      <Modal transparent visible={showDatePicker} animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderBadge}>
                <Feather name="calendar" size={14} color="#35C72B" />
              </View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Date filter</Text>
            </View>

            <Text style={[styles.modalSectionLabel, { color: colors.textSecondary }]}>Quick ranges</Text>
            <View style={styles.modalPresetRow}>
              {activityDateOptions.filter((option) => option.value !== 'single' && option.value !== 'range').map((option) => (
                <TouchableOpacity
                  key={option.value}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedDateRange(option.value);
                    setSelectedDayDate(null);
                    setRangeStartDate(null);
                    setRangeEndDate(null);
                    setShowDatePicker(false);
                  }}
                  style={[styles.presetButton, { backgroundColor: selectedDateRange === option.value ? '#35C72B' : colors.background, borderColor: colors.border }]}
                >
                  <Text style={[styles.presetButtonText, { color: selectedDateRange === option.value ? '#08110A' : colors.text }]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.modalSectionLabel, { color: colors.textSecondary }]}>Selection mode</Text>
            <View style={styles.segmentedRow}>
              {(['single', 'range'] as const).map((mode) => {
                const active = (selectedDateRange === 'single' && mode === 'single') || (selectedDateRange === 'range' && mode === 'range');
                return (
                  <TouchableOpacity
                    key={mode}
                    activeOpacity={0.8}
                    onPress={() => {
                      setSelectedDateRange(mode);
                      if (mode === 'single') {
                        setRangeStartDate(null);
                        setRangeEndDate(null);
                      } else {
                        setSelectedDayDate(null);
                      }
                    }}
                    style={[styles.segmentedButton, { backgroundColor: active ? '#35C72B' : colors.background, borderColor: active ? '#35C72B' : colors.border }]}
                  >
                    <Text style={[styles.segmentedButtonText, { color: active ? '#08110A' : colors.text }]}>{mode === 'single' ? 'Single date' : 'Date range'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedDateRange === 'single' ? (
              <View style={styles.dateSelectionRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setShowNativeDatePicker(true);
                    setDatePickerTarget('start');
                  }}
                  style={[styles.dateValueBox, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
                  <Text style={[styles.dateValueLabel, { color: colors.textSecondary }]}>Date</Text>
                  <Text style={[styles.dateValueText, { color: colors.text }]}>{selectedDayDate ? formatDateLabel(selectedDayDate) : 'Select date'}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.dateSelectionRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setDatePickerTarget('start');
                    setShowNativeDatePicker(true);
                  }}
                  style={[styles.dateValueBox, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
                  <Text style={[styles.dateValueLabel, { color: colors.textSecondary }]}>Start</Text>
                  <Text style={[styles.dateValueText, { color: colors.text }]}>{rangeStartDate ? formatDateLabel(rangeStartDate) : 'Select start'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setDatePickerTarget('end');
                    setShowNativeDatePicker(true);
                  }}
                  style={[styles.dateValueBox, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
                  <Text style={[styles.dateValueLabel, { color: colors.textSecondary }]}>End</Text>
                  <Text style={[styles.dateValueText, { color: colors.text }]}>{rangeEndDate ? formatDateLabel(rangeEndDate) : 'Select end'}</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  setSelectedDateRange('all');
                  setSelectedDayDate(null);
                  setRangeStartDate(null);
                  setRangeEndDate(null);
                  setShowDatePicker(false);
                }}
                style={[styles.modalActionButton, { backgroundColor: colors.background, borderColor: colors.border }]}
              >
                <Text style={[styles.modalActionText, { color: colors.text }]}>Clear</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  if (selectedDateRange === 'single' && selectedDayDate) {
                    setShowDatePicker(false);
                    return;
                  }
                  if (selectedDateRange === 'range' && rangeStartDate && rangeEndDate) {
                    setShowDatePicker(false);
                    return;
                  }
                  setShowDatePicker(false);
                }}
                style={[styles.modalActionButton, { backgroundColor: '#35C72B', borderColor: '#35C72B' }]}
              >
                <Text style={[styles.modalActionText, { color: '#08110A' }]}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={showDistanceSheet} animationType="slide" onRequestClose={() => setShowDistanceSheet(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderBadge}>
                <Feather name="map-pin" size={14} color="#35C72B" />
              </View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Distance</Text>
            </View>

            <Text style={[styles.modalSectionLabel, { color: colors.textSecondary }]}>Choose range</Text>
            {activityDistanceOptions.map((option) => {
              const active = selectedDistanceRange === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedDistanceRange(option.value);
                    setShowDistanceSheet(false);
                  }}
                  style={[styles.optionRow, { backgroundColor: active ? '#35C72B' : colors.background, borderColor: active ? '#35C72B' : colors.border }]}
                >
                  <Text style={[styles.optionText, { color: active ? '#08110A' : colors.text }]}>{option.label}</Text>
                  {active && <Feather name="check" size={16} color="#08110A" />}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                setSelectedDistanceRange('all');
                setShowDistanceSheet(false);
              }}
              style={[styles.sheetClearButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            >
              <Text style={[styles.sheetClearText, { color: colors.text }]}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={showSortSheet} animationType="slide" onRequestClose={() => setShowSortSheet(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderBadge}>
                <Feather name="bar-chart-2" size={14} color="#35C72B" />
              </View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Sort by</Text>
            </View>

            <Text style={[styles.modalSectionLabel, { color: colors.textSecondary }]}>Choose order</Text>
            {activitySortOptions.map((option) => {
              const active = sortBy === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSortBy(option.value);
                    setShowSortSheet(false);
                  }}
                  style={[styles.optionRow, { backgroundColor: active ? '#35C72B' : colors.background, borderColor: active ? '#35C72B' : colors.border }]}
                >
                  <Text style={[styles.optionText, { color: active ? '#08110A' : colors.text }]}>{option.label}</Text>
                  {active && <Feather name="check" size={16} color="#08110A" />}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                setSortBy('newest');
                setShowSortSheet(false);
              }}
              style={[styles.sheetClearButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            >
              <Text style={[styles.sheetClearText, { color: colors.text }]}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {showNativeDatePicker && (
        <DateTimePicker
          value={datePickerTarget === 'start' ? (selectedDateRange === 'range' ? rangeStartDate ?? new Date() : selectedDayDate ?? new Date()) : (selectedDateRange === 'range' ? rangeEndDate ?? new Date() : selectedDayDate ?? new Date())}
          mode="date"
          display="spinner"
          onChange={(_, selectedDate) => {
            setShowNativeDatePicker(false);
            if (!selectedDate) return;

            if (selectedDateRange === 'single') {
              setSelectedDayDate(selectedDate);
              setSelectedDateRange('single');
            } else {
              if (datePickerTarget === 'start') {
                setRangeStartDate(selectedDate);
                if (rangeEndDate && selectedDate > rangeEndDate) {
                  setRangeEndDate(selectedDate);
                }
              } else {
                setRangeEndDate(selectedDate);
                if (rangeStartDate && selectedDate < rangeStartDate) {
                  setRangeStartDate(selectedDate);
                }
              }
              setSelectedDateRange('range');
            }

            setShowDatePicker(true);
          }}
        />
      )}

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
          renderItem={renderActivityCard}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews
          updateCellsBatchingPeriod={50}
          getItemLayout={(_, index) => ({ length: 162, offset: 162 * index, index })}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore
            ? (
              <View style={styles.footerLoaderPill}>
                <ActivityIndicator color="#35C72B" size="small" />
                <Text style={styles.footerCountText}>{footerCountText}</Text>
              </View>
            )
            : hasMore
              ? null
              : <Text style={styles.endMessage}>You&apos;ve reached the end of your activity history!</Text>}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadFirstPage(true)} tintColor="#35C72B" />}
          ListEmptyComponent={<Text style={styles.empty}>{activities.length === 0 ? 'No completed workouts yet.' : hasActiveFilters ? 'No workouts match your current filters.' : 'No workouts match your search.'}</Text>}
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
  searchBox: { height: 58, backgroundColor: '#242627', borderRadius: 18, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, marginBottom: 14 },
  searchInput: { flex: 1, color: '#F7F7F7', fontSize: 17, marginLeft: 12, height: '100%' },
  filterHeader: { marginBottom: 12 },
  typeChipRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  filterLabel: { fontSize: 12, fontWeight: '700', marginRight: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  typeChipSelected: { backgroundColor: '#35C72B' },
  typeChipText: { fontSize: 13, fontWeight: '600' },
  typeChipTextSelected: { color: '#08110A' },
  activeFilterSummaryRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  activeFilterBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  activeFilterBadgeText: { color: '#D9F9DB', fontSize: 11, fontWeight: '700' },
  activeFilterPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  activeFilterPillText: { fontSize: 11, fontWeight: '600' },
  filterRowBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  filterBarButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1, minHeight: 42 },
  filterBarText: { fontSize: 12, fontWeight: '600' },
  resetButton: { alignSelf: 'flex-start', marginBottom: 12, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: '#23372A' },
  resetButtonText: { color: '#D9F9DB', fontSize: 12, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 18, paddingBottom: 20 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  modalHeaderBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1A261D', borderWidth: 1, borderColor: '#2B5B3A', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalSectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8 },
  modalPresetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  presetButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  presetButtonText: { fontSize: 12, fontWeight: '600' },
  segmentedRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  segmentedButton: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  segmentedButtonText: { fontSize: 13, fontWeight: '700' },
  customDateRow: { marginBottom: 14 },
  customDateButton: { borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  customDateButtonText: { fontSize: 13, fontWeight: '700' },
  dateSelectionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  dateValueBox: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 62 },
  dateValueLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  dateValueText: { fontSize: 12, fontWeight: '600' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalActionButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  modalActionText: { fontSize: 13, fontWeight: '700' },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  optionText: { fontSize: 14, fontWeight: '600' },
  sheetClearButton: { borderWidth: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center', marginTop: 4 },
  sheetClearText: { fontSize: 13, fontWeight: '700'},
  scrollContent: { paddingBottom: 118 },
  section: { marginBottom: 24 },
  sectionTitle: { color: '#F7F7F7', fontSize: 24, fontWeight: '700', marginBottom: 13 },
  card: { height: 150, backgroundColor: '#242627', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 12, borderWidth: 1, borderColor: '#393C3E', overflow: 'hidden' },
  cardContent: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' },
  cardDetails: { flex: 1, minWidth: 0, paddingRight: 8 },
  activityType: { color: '#F7F7F7', fontSize: 18, lineHeight: 22, fontWeight: '700' },
  activityDate: { color: '#A9ADAF', fontSize: 12, lineHeight: 15, marginTop: 2 },
  distance: { color: '#35C72B', fontSize: 23, lineHeight: 28, fontWeight: '700', marginTop: 4 },
  centerMetricsContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  metricRow: { width: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', marginVertical: 3 },
  metricIcon: { width: 22, alignItems: 'center' },
  metricText: { alignItems: 'flex-start', marginLeft: 4, minWidth: 0 },
  metricValue: { color: '#F7F7F7', fontSize: 12, lineHeight: 15, fontWeight: '700' },
  metricLabel: { color: '#A9ADAF', fontSize: 10, lineHeight: 12, marginTop: 1 },
  mapThumbnailContainer: { width: 105, height: 105, marginLeft: 12, borderRadius: 18, overflow: 'hidden', backgroundColor: '#E5E7EB', borderWidth: 1, borderColor: '#D1D5DB' },
  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  stateText: { color: '#C4C8C5', fontSize: 16, textAlign: 'center', marginTop: 13 },
  retryButton: { backgroundColor: '#35C72B', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, marginTop: 18 },
  retryText: { color: '#0B0E0F', fontSize: 16, fontWeight: '700' },
  footerLoaderPill: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, marginVertical: 16, borderRadius: 999, backgroundColor: '#1A261D', borderWidth: 1, borderColor: '#2B5B3A', shadowColor: '#35C72B', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  footerCountText: { color: '#D9F9DB', fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  endMessage: { color: '#A9ADAF', textAlign: 'center', fontSize: 13, paddingVertical: 18 },
  skeletonList: { paddingTop: 4 },
  skeletonCard: { height: 150, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden', backgroundColor: '#171A1A', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 12, borderWidth: 1, borderColor: '#243C2B' },
  skeletonMain: { width: '70%', paddingRight: 6 },
  skeletonShort: { width: '55%', height: 12, borderRadius: 5, backgroundColor: '#294A32' },
  skeletonTiny: { width: '35%', height: 8, borderRadius: 4, backgroundColor: '#26352A', marginTop: 4 },
  skeletonDistance: { width: '48%', height: 18, borderRadius: 6, backgroundColor: '#245C32', marginTop: 7 },
  skeletonMetrics: { width: '78%', height: 24, borderRadius: 7, backgroundColor: '#202A22', marginTop: 7 },
  skeletonMap: { width: 105, height: 105, borderRadius: 18, overflow: 'hidden', backgroundColor: '#202A22' },
  empty: { color: '#A9ADAF', textAlign: 'center', fontSize: 16, marginTop: 40 },
});
