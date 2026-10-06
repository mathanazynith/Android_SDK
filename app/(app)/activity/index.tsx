import { Alert } from '@/components/ThemedAlert';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, FlatList, LayoutAnimation, Modal, Platform, StatusBar, StyleSheet, Text, TouchableOpacity, UIManager, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

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
type ActivityGroupMode = 'month' | 'week';

type ActivityListRow =
  | { type: 'section'; key: string; title: string; activities: BackendActivity[] }
  | { type: 'activity'; key: string; activity: BackendActivity };

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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

const getActivityGroup = (activity: BackendActivity, mode: ActivityGroupMode) => {
  const date = new Date(activity.start_time);
  if (!Number.isFinite(date.getTime())) {
    return { key: 'unknown-date', title: 'Date unavailable', timestamp: Number.NEGATIVE_INFINITY };
  }

  if (mode === 'month') {
    return {
      key: `month-${date.getFullYear()}-${date.getMonth()}`,
      title: new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date),
      timestamp: new Date(date.getFullYear(), date.getMonth(), 1).getTime(),
    };
  }

  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const yearFormatter = new Intl.DateTimeFormat(undefined, { year: 'numeric' });
  const title = `${dateFormatter.format(start)} – ${dateFormatter.format(end)}, ${yearFormatter.format(end)}`;

  return {
    key: `week-${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`,
    title,
    timestamp: start.getTime(),
  };
};

const buildActivityRows = (
  activities: BackendActivity[],
  groupMode: ActivityGroupMode,
  sortBy: ActivitySortFilter,
): ActivityListRow[] => {
  const groups = new Map<string, { title: string; timestamp: number; activities: BackendActivity[] }>();

  activities.forEach((activity) => {
    const group = getActivityGroup(activity, groupMode);
    const existing = groups.get(group.key);
    if (existing) {
      existing.activities.push(activity);
    } else {
      groups.set(group.key, { title: group.title, timestamp: group.timestamp, activities: [activity] });
    }
  });

  return [...groups.entries()]
    .sort(([, first], [, second]) => {
      const firstHasDate = Number.isFinite(first.timestamp);
      const secondHasDate = Number.isFinite(second.timestamp);
      if (!firstHasDate) return secondHasDate ? 1 : 0;
      if (!secondHasDate) return -1;
      return sortBy === 'oldest'
        ? first.timestamp - second.timestamp
        : second.timestamp - first.timestamp;
    })
    .flatMap(([key, group]) => [
      { type: 'section' as const, key: `section:${key}`, title: group.title, activities: group.activities },
      ...sortActivities(group.activities, sortBy).map((activity) => ({
        type: 'activity' as const,
        key: `activity:${activity.id}`,
        activity,
      })),
    ]);
};

interface ActivityCardProps {
  activity: BackendActivity;
  onPress: () => void;
  onStartSelection: (activityId: BackendActivity['id']) => void;
  reduceMotion: boolean;
  selectionMode: boolean;
  selected: boolean;
  deleting: boolean;
  busy: boolean;
}

const ActivityCard = memo(function ActivityCard({
  activity,
  onPress,
  onStartSelection,
  reduceMotion,
  selectionMode,
  selected,
  deleting,
  busy,
}: ActivityCardProps) {
  const { colors } = useTheme();
  const activityName = formatActivityType(activity.activity_type);
  const activityId = activity.id;
  const duration = activity.moving_time || activity.elapsed_time;
  const [routeData, setRouteData] = useState({
    encodedPolyline: activity.encoded_polyline,
    plannedEncodedPolyline: activity.planned_encoded_polyline,
    extraEncodedPolyline: activity.extra_encoded_polyline,
  });
  const longPressHandledRef = useRef(false);
  const [selectionScale] = useState(() => new Animated.Value(1));
  const [cardEntrance] = useState(() => new Animated.Value(0));
  const holdProgress = useSharedValue(0);
  const holdProgressStyle = useAnimatedStyle(() => ({
    width: `${holdProgress.value * 100}%`,
    opacity: holdProgress.value > 0.03 ? 1 : 0,
  }));

  useEffect(() => {
    Animated.spring(selectionScale, {
      toValue: selected ? 0.99 : 1,
      damping: 18,
      stiffness: 220,
      useNativeDriver: true,
    }).start();
  }, [selected, selectionScale]);

  useEffect(() => {
    Animated.timing(cardEntrance, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [cardEntrance]);

  const handleCardPress = () => {
    if (longPressHandledRef.current) {
      longPressHandledRef.current = false;
      return;
    }
    onPress();
  };

  const handleStartSelection = useCallback(() => {
    longPressHandledRef.current = true;
    onStartSelection(activityId);
    if (Platform.OS === 'android') {
      Vibration.vibrate(12);
    } else {
      void Haptics.selectionAsync()
        .catch((hapticError: unknown) => console.warn('[ActivityHistory] Selection haptic unavailable', hapticError));
    }
  }, [activityId, onStartSelection]);

  // The hold indicator runs on the UI thread and selection begins after the 500 ms long press.
  /* eslint-disable react-hooks/immutability, react-hooks/refs */
  const selectionGesture = useMemo(() => Gesture.LongPress()
      .enabled(!busy)
      .minDuration(500)
      .maxDistance(12)
      .onBegin(() => {
        holdProgress.value = withTiming(1, { duration: 500 });
      })
      .onStart(() => {
        holdProgress.value = withTiming(1, { duration: reduceMotion ? 0 : 80 });
        scheduleOnRN(handleStartSelection);
      })
      .onFinalize(() => {
        holdProgress.value = withTiming(0, { duration: reduceMotion ? 0 : 130 });
      }), [busy, handleStartSelection, holdProgress, reduceMotion]);
  /* eslint-enable react-hooks/immutability, react-hooks/refs */

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
    <GestureDetector gesture={selectionGesture}>
      <Reanimated.View>
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: selected ? '#35C72B' : colors.border },
          {
            opacity: cardEntrance,
            transform: [
              { scale: selectionScale },
              { translateY: cardEntrance.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
            ],
          },
        ]}
      >
      <TouchableOpacity
        style={styles.cardContent}
        accessibilityRole="button"
        accessibilityLabel={`${activityName} activity, ${formatDistance(activity.distance)}, ${formatDuration(duration)}`}
        accessibilityHint={selectionMode ? 'Tap to toggle selection. Long press to select this activity.' : 'Open activity details, or long press to select this activity.'}
        onPress={handleCardPress}
        onPressIn={() => { longPressHandledRef.current = false; }}
        activeOpacity={0.82}
        disabled={busy}
      >
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

          <View style={styles.mapOverlayTop}>
            <View style={styles.mapBadge}>
              <MaterialCommunityIcons
                name={activityName === 'Walk' ? 'walk' : 'run-fast'}
                size={14}
                color="#F7F7F7"
              />
            </View>
          </View>
        </View>
      </TouchableOpacity>
      <Reanimated.View
        pointerEvents="none"
        style={[
          styles.longPressProgressTrack,
          holdProgressStyle,
        ]}
      />
      {selectionMode && (
        <TouchableOpacity
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected, disabled: busy }}
          accessibilityLabel={`${selected ? 'Deselect' : 'Select'} ${activityName.toLowerCase()}`}
          disabled={busy}
          onPress={onPress}
          style={[styles.cardCheckbox, selected && styles.cardCheckboxSelected]}
        >
          {deleting
            ? <ActivityIndicator size="small" color="#FF6B6B" />
            : <Feather name={selected ? 'check-square' : 'square'} size={20} color={selected ? '#35C72B' : '#FFFFFF'} />}
        </TouchableOpacity>
      )}
      </Animated.View>
      </Reanimated.View>
    </GestureDetector>
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
  const reduceMotion = useReducedMotion();
  const [activities, setActivities] = useState<BackendActivity[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedActivityIds, setSelectedActivityIds] = useState<Set<string>>(() => new Set());
  const [groupMode, setGroupMode] = useState<ActivityGroupMode>('month');
  const [selectionToast, setSelectionToast] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [deletingActivityIds, setDeletingActivityIds] = useState<Set<string>>(() => new Set());
  const [isDeletingActivities, setIsDeletingActivities] = useState(false);
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
  const hasLoadedHistoryRef = useRef(false);
  const requestIdRef = useRef(0);
  const selectionToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleteButtonStateProgress] = useState(() => new Animated.Value(0));
  const [deleteTrayOpacity] = useState(() => new Animated.Value(0));
  const [deleteTrayTranslateY] = useState(() => new Animated.Value(24));
  const [deleteSuccessScale] = useState(() => new Animated.Value(0.65));
  const [refreshRotation] = useState(() => new Animated.Value(0));

  const showSelectionToast = useCallback((message: string) => {
    if (selectionToastTimerRef.current) clearTimeout(selectionToastTimerRef.current);
    setSelectionToast(message);
    selectionToastTimerRef.current = setTimeout(() => {
      setSelectionToast(null);
      selectionToastTimerRef.current = null;
    }, 2400);
  }, []);

  useEffect(() => () => {
    if (selectionToastTimerRef.current) clearTimeout(selectionToastTimerRef.current);
    if (deleteSuccessTimerRef.current) clearTimeout(deleteSuccessTimerRef.current);
  }, []);

  useEffect(() => {
    const enabled = selectedActivityIds.size > 0 || deleteSuccess;
    const targetState = deleteSuccess ? 0.55 : enabled ? 0.55 : 0;
    Animated.timing(deleteButtonStateProgress, {
      toValue: targetState,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [deleteButtonStateProgress, deleteSuccess, selectedActivityIds.size]);

  useEffect(() => {
    if (selectionMode) {
      deleteTrayOpacity.setValue(0);
      deleteTrayTranslateY.setValue(24);
      Animated.parallel([
        Animated.timing(deleteTrayOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.spring(deleteTrayTranslateY, {
          toValue: 0,
          damping: 16,
          stiffness: 180,
          useNativeDriver: false,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(deleteTrayOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(deleteTrayTranslateY, {
        toValue: 24,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [deleteTrayOpacity, deleteTrayTranslateY, selectionMode]);

  useEffect(() => {
    Animated.spring(deleteSuccessScale, {
      toValue: deleteSuccess ? 1 : 0.65,
      damping: 14,
      stiffness: 220,
      useNativeDriver: false,
    }).start();
  }, [deleteSuccess, deleteSuccessScale]);

  useEffect(() => {
    if (!refreshing) {
      refreshRotation.setValue(0);
      return;
    }

    refreshRotation.setValue(0);
    const animation = Animated.loop(Animated.timing(refreshRotation, {
      toValue: 1,
      duration: 850,
      easing: Easing.linear,
      useNativeDriver: true,
    }));
    animation.start();
    return () => animation.stop();
  }, [refreshing, refreshRotation]);

  const loadFirstPage = useCallback(async (isRefresh = false) => {
    const requestId = ++requestIdRef.current;
    let hasUsableHistory = hasLoadedHistoryRef.current;
    cursorRef.current = null;
    loadingFirstPageRef.current = true;
    setHasMore(true);
    if (isRefresh) setRefreshing(true);
    else if (!hasUsableHistory) setLoading(true);

    try {
      setError(null);
      const cached = await activityAPI.getCachedFirstPage();
      if (cached && requestId === requestIdRef.current) {
        hasUsableHistory = true;
        hasLoadedHistoryRef.current = true;
        setActivities(cached.activities);
        setHasMore(cached.hasMore);
        setTotalHistoryCount(cached.totalCount ?? cached.activities.length);
        cursorRef.current = cached.nextCursor;
        setLoading(false);
      }
      const result = await fetchHistoryPageSkippingEmptyPages(null);
      if (requestId !== requestIdRef.current) return;
      hasLoadedHistoryRef.current = true;
      setActivities(result.activities);
      setHasMore(result.hasMore);
      setTotalHistoryCount(result.totalCount ?? result.activities.length);
      cursorRef.current = result.nextCursor;
    } catch (requestError) {
      if (requestId !== requestIdRef.current) return;
      if (hasUsableHistory || hasLoadedHistoryRef.current) {
        console.warn('[ActivityHistory] Refresh failed; keeping the currently loaded history.', requestError);
        showSelectionToast('Could not refresh. Showing saved history.');
      } else {
        const message = getBackendErrorMessage(requestError, 'Unable to load workout history.');
        setError(message);
        Alert.alert('Workout history unavailable', message);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        loadingFirstPageRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [showSelectionToast]);

  const refreshHistory = useCallback(() => {
    if (refreshing || loading || loadingMore || selectionMode || isDeletingActivities || loadingFirstPageRef.current) return;
    void loadFirstPage(true);
  }, [isDeletingActivities, loadFirstPage, loading, loadingMore, refreshing, selectionMode]);

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
      setActivities((current) => {
        const knownIds = new Set(current.map((activity) => String(activity.id)));
        const newActivities = result.activities.filter((activity) => {
          const id = String(activity.id);
          if (knownIds.has(id)) return false;
          knownIds.add(id);
          return true;
        });
        return newActivities.length > 0 ? [...current, ...newActivities] : current;
      });
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
    if (selectedType !== 'all') count += 1;
    if (selectedDateRange !== 'all') count += 1;
    if (selectedDistanceRange !== 'all') count += 1;
    if (sortBy !== 'newest') count += 1;
    return count;
  }, [selectedDateRange, selectedDistanceRange, selectedType, sortBy]);

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
    let filtered = [...activities];

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
  }, [activities, rangeEndDate, rangeStartDate, selectedDateRange, selectedDayDate, selectedDistanceRange, selectedType, sortBy]);

  const activityRows = useMemo(
    () => buildActivityRows(visibleActivities, groupMode, sortBy),
    [groupMode, sortBy, visibleActivities],
  );

  const selectedActivities = useMemo(
    () => activities.filter((activity) => selectedActivityIds.has(String(activity.id))),
    [activities, selectedActivityIds],
  );

  useEffect(() => {
    if (selectionMode) {
      AccessibilityInfo.announceForAccessibility(`${selectedActivities.length} ${selectedActivities.length === 1 ? 'activity' : 'activities'} selected.`);
    }
  }, [selectedActivities.length, selectionMode]);

  const toggleActivitySelection = useCallback((activityId: BackendActivity['id']) => {
    const key = String(activityId);
    setSelectedActivityIds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const startActivitySelection = useCallback((activityId: BackendActivity['id']) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectionMode(true);
    setSelectedActivityIds((current) => new Set(current).add(String(activityId)));
  }, []);

  const cancelActivitySelection = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectionMode(false);
    setSelectedActivityIds(new Set());
  }, []);

  const toggleGroupSelection = useCallback((groupActivities: BackendActivity[]) => {
    const groupIds = groupActivities.map((activity) => String(activity.id));
    setSelectedActivityIds((current) => {
      const allSelected = groupIds.length > 0 && groupIds.every((id) => current.has(id));
      const next = new Set(current);
      if (allSelected) groupIds.forEach((id) => next.delete(id));
      else groupIds.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const toggleAllVisibleSelection = useCallback(() => {
    const visibleIds = visibleActivities.map((activity) => String(activity.id));
    if (visibleIds.length === 0) return;
    setSelectedActivityIds((current) => {
      if (visibleIds.every((id) => current.has(id))) return new Set();
      const next = new Set(current);
      visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }, [visibleActivities]);

  const deleteActivities = useCallback(async (targets: BackendActivity[]) => {
    if (targets.length === 0 || isDeletingActivities) return;

    if (deleteSuccessTimerRef.current) {
      clearTimeout(deleteSuccessTimerRef.current);
      deleteSuccessTimerRef.current = null;
    }
    setDeleteSuccess(false);
    const targetIds = new Set(targets.map((activity) => String(activity.id)));
    setIsDeletingActivities(true);
    setDeletingActivityIds(targetIds);

    const results: PromiseSettledResult<string>[] = [];
    for (let index = 0; index < targets.length; index += 4) {
      const batch = targets.slice(index, index + 4);
      results.push(...await Promise.allSettled(batch.map(async (activity) => {
        try {
          return await activityAPI.delete(activity.id);
        } catch (deleteError: any) {
          try {
            await activityAPI.get(activity.id);
          } catch (verificationError: any) {
            if (verificationError?.response?.status === 404) {
              return 'Activity deleted successfully.';
            }
          }
          throw deleteError;
        }
      })));
    }

    const deletedIds = new Set<string>();
    let firstFailure: any = null;
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        deletedIds.add(String(targets[index].id));
      } else if (!firstFailure) {
        firstFailure = result.reason;
      }
    });

    if (deletedIds.size > 0) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActivities((current) => current.filter((activity) => !deletedIds.has(String(activity.id))));
    setTotalHistoryCount((current) => current === null ? null : Math.max(0, current - deletedIds.size));
    setSelectedActivityIds((current) => {
      const next = new Set(current);
      deletedIds.forEach((id) => next.delete(id));
      return next;
    });
    setDeletingActivityIds(new Set());

    const failedCount = targets.length - deletedIds.size;
    if (failedCount > 0) {
      setIsDeletingActivities(false);
      AccessibilityInfo.announceForAccessibility(
        deletedIds.size > 0
          ? `${deletedIds.size} activities deleted. ${failedCount} could not be deleted.`
          : 'Activities could not be deleted.',
      );
      Alert.alert(
        deletedIds.size > 0 ? 'Some workouts could not be deleted' : 'Could not delete workouts',
        deletedIds.size > 0
          ? `${deletedIds.size} deleted, ${failedCount} failed. ${getBackendErrorMessage(firstFailure, 'Failed items remain selected so you can retry.')}`
          : getBackendErrorMessage(firstFailure, 'Please try again.'),
      );
      return;
    }

    if (Platform.OS === 'android') {
      Vibration.vibrate([0, 35, 45, 35]);
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        .catch((hapticError: unknown) => console.warn('[ActivityHistory] Delete success haptic unavailable', hapticError));
    }
    setDeleteSuccess(true);
    AccessibilityInfo.announceForAccessibility(targets.length === 1 ? 'Activity deleted.' : `${targets.length} activities deleted.`);
    showSelectionToast(targets.length === 1 ? 'Workout deleted.' : `${targets.length} workouts deleted.`);
    deleteSuccessTimerRef.current = setTimeout(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      if (selectionMode) {
        setSelectionMode(false);
        setSelectedActivityIds(new Set());
      }
      setDeleteSuccess(false);
      setIsDeletingActivities(false);
      deleteSuccessTimerRef.current = null;
    }, 620);
  }, [isDeletingActivities, selectionMode, showSelectionToast]);

  const confirmDeleteActivities = useCallback((targets: BackendActivity[]) => {
    if (targets.length === 0) {
      showSelectionToast('Please select at least one activity to delete.');
      return;
    }
    const count = targets.length;
    Alert.alert(
      count === 1 ? 'Delete workout?' : 'Delete selected workouts?',
      count === 1
        ? 'Delete this workout from your history? This cannot be undone.'
        : `Delete ${count} workouts from your history? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteActivities(targets);
          },
        },
      ],
      { cancelable: true },
    );
  }, [deleteActivities, showSelectionToast]);

  const confirmDeleteSelected = useCallback(() => {
    confirmDeleteActivities(selectedActivities);
  }, [confirmDeleteActivities, selectedActivities]);

  const renderActivityRow = useCallback(({ item }: { item: ActivityListRow }) => {
    if (item.type === 'section') {
      const selectedCount = item.activities.filter((activity) => selectedActivityIds.has(String(activity.id))).length;
      const allSelected = selectedCount === item.activities.length;
      return (
        <TouchableOpacity
          accessibilityRole={selectionMode ? 'checkbox' : undefined}
          accessibilityState={selectionMode ? { checked: allSelected } : undefined}
          accessibilityLabel={`${item.title}, ${item.activities.length} activities${selectionMode ? `, ${selectedCount} selected` : ''}`}
          activeOpacity={selectionMode ? 0.75 : 1}
          disabled={!selectionMode || isDeletingActivities}
          onPress={() => toggleGroupSelection(item.activities)}
          style={styles.sectionHeader}
        >
          {selectionMode && (
            <Feather
              name={allSelected ? 'check-square' : selectedCount > 0 ? 'minus-square' : 'square'}
              size={20}
              color={allSelected || selectedCount > 0 ? '#35C72B' : colors.textSecondary}
            />
          )}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{item.title}</Text>
          <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>{item.activities.length}</Text>
        </TouchableOpacity>
      );
    }

    const activity = item.activity;
    return (
      <ActivityCard
        activity={activity}
        onPress={() => selectionMode
          ? toggleActivitySelection(activity.id)
          : router.push(`/(app)/activity/${activity.id}` as any)}
        onStartSelection={startActivitySelection}
        reduceMotion={reduceMotion}
        selectionMode={selectionMode}
        selected={selectedActivityIds.has(String(activity.id))}
        deleting={deletingActivityIds.has(String(activity.id))}
        busy={isDeletingActivities}
      />
    );
  }, [
    colors.text,
    colors.textSecondary,
    deletingActivityIds,
    isDeletingActivities,
    reduceMotion,
    selectedActivityIds,
    selectionMode,
    startActivitySelection,
    toggleActivitySelection,
    toggleGroupSelection,
  ]);

  const footerCountText = useMemo(() => {
    const loadedCount = activities.length;
    if (!totalHistoryCount || totalHistoryCount <= loadedCount) {
      return `${loadedCount} loaded`;
    }
    return `${loadedCount} of ${totalHistoryCount} loaded`;
  }, [activities.length, totalHistoryCount]);

  const listExtraData = useMemo(
    () => ({ selectionMode, selectedActivityIds, deletingActivityIds, isDeletingActivities }),
    [deletingActivityIds, isDeletingActivities, selectedActivityIds, selectionMode],
  );

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.screenContent}>
      <StatusBar barStyle={colors.background === '#F8FAFC' ? 'dark-content' : 'light-content'} />
      {selectionMode ? (
        <Animated.View
          style={styles.selectionToolbar}
        >
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Cancel workout selection"
            disabled={isDeletingActivities}
            onPress={cancelActivitySelection}
            style={[styles.selectionToolbarButton, styles.cancelSelectionButton, { borderColor: colors.border }]}
          >
            <Feather name="x" size={19} color="#E53935" />
          </TouchableOpacity>
          <Text style={[styles.selectionCount, { color: colors.text }]}>{selectedActivities.length} selected</Text>
          <View style={styles.groupModeSwitch}>
            {(['month', 'week'] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                accessibilityRole="button"
                accessibilityState={{ selected: groupMode === mode }}
                disabled={isDeletingActivities}
                onPress={() => setGroupMode(mode)}
                style={[styles.groupModeButton, groupMode === mode && styles.groupModeButtonSelected]}
              >
                <Text style={[styles.groupModeText, { color: groupMode === mode ? '#08110A' : '#111827' }]}>
                  {mode === 'month' ? 'Month' : 'Week'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={isDeletingActivities || visibleActivities.length === 0}
            onPress={toggleAllVisibleSelection}
            style={[styles.selectionToolbarButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Text style={[styles.selectionToolbarButtonText, { color: colors.text }]}>
              {visibleActivities.length > 0 && visibleActivities.every((activity) => selectedActivityIds.has(String(activity.id)))
                ? 'Deselect all'
                : 'Select all'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <View style={styles.heading}>
          <Text style={[styles.title, { color: colors.text }]}>Workout History</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Your completed runs and walks</Text>
        </View>
      )}

      <View style={styles.filterHeader}>
        <View style={styles.eventFilterRow}>
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
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={refreshing ? 'Refreshing activity history' : 'Refresh activity history'}
            accessibilityState={{ disabled: refreshing || loading || loadingMore || selectionMode || isDeletingActivities, busy: refreshing }}
            disabled={refreshing || loading || loadingMore || selectionMode || isDeletingActivities}
            onPress={refreshHistory}
            style={[
              styles.refreshButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
              (refreshing || loading || loadingMore || selectionMode || isDeletingActivities) && styles.refreshButtonDisabled,
            ]}
          >
            <Animated.View
              style={{
                transform: [{
                  rotate: refreshRotation.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg'],
                  }),
                }],
              }}
            >
              <Feather name="refresh-cw" size={17} color={colors.text} />
            </Animated.View>
          </TouchableOpacity>
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
          data={activityRows}
          extraData={listExtraData}
          keyExtractor={(item) => item.key}
          renderItem={renderActivityRow}
          initialNumToRender={10}
          maxToRenderPerBatch={4}
          windowSize={7}
          removeClippedSubviews
          updateCellsBatchingPeriod={16}
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
          contentContainerStyle={[
            styles.scrollContent,
            selectionMode && styles.scrollContentWithDeleteTray,
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={styles.empty}>{activities.length === 0 ? 'No completed workouts yet.' : 'No workouts match your current filters.'}</Text>}
        />
      )}
      <Animated.View
        pointerEvents={selectionMode ? 'auto' : 'none'}
        accessibilityElementsHidden={!selectionMode}
        importantForAccessibility={selectionMode ? 'auto' : 'no-hide-descendants'}
        style={[
          styles.deleteTray,
          {
            opacity: deleteTrayOpacity,
            transform: [{ translateY: deleteTrayTranslateY }],
          },
        ]}
      >
          <Animated.View
            style={[
              styles.deleteButton,
              {
                backgroundColor: deleteButtonStateProgress.interpolate({
                  inputRange: [0, 0.55, 1],
                  outputRange: ['#737373', '#E53935', '#B91C1C'],
                }),
                borderColor: deleteButtonStateProgress.interpolate({
                  inputRange: [0, 0.55, 1],
                  outputRange: ['#737373', '#E53935', '#FFFFFF'],
                }),
                opacity: deleteButtonStateProgress.interpolate({
                  inputRange: [0, 0.55],
                  outputRange: [0.62, 1],
                  extrapolate: 'clamp',
                }),
              },
            ]}
          >
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={deleteSuccess
                ? 'Activities deleted successfully'
                : selectedActivities.length > 0
                ? `Delete ${selectedActivities.length} selected activities`
                : 'Delete disabled: no activities selected'}
              accessibilityState={{
                disabled: !selectionMode || isDeletingActivities || deleteSuccess || selectedActivities.length === 0,
                busy: isDeletingActivities && !deleteSuccess,
              }}
              disabled={!selectionMode || isDeletingActivities || deleteSuccess || selectedActivities.length === 0}
              onPress={() => void confirmDeleteSelected()}
              style={styles.deleteButtonAction}
            >
              {deleteSuccess
                ? (
                  <Animated.View style={{ opacity: deleteSuccessScale, transform: [{ scale: deleteSuccessScale }] }}>
                    <Feather name="check-circle" size={23} color="#FFFFFF" />
                  </Animated.View>
                )
                : isDeletingActivities
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Feather name="trash-2" size={23} color="#FFFFFF" />}
              <Text style={styles.deleteButtonText}>
                {deleteSuccess
                  ? 'Deleted'
                  : isDeletingActivities
                    ? 'Deleting…'
                    : `Delete selected · ${selectedActivities.length}`}
              </Text>
            </TouchableOpacity>
          </Animated.View>
      </Animated.View>
      {selectionToast && (
        <View pointerEvents="none" style={styles.toast}>
          <Text style={styles.toastText}>{selectionToast}</Text>
        </View>
      )}
      </View>
    </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: { flex: 1 },
  screenContent: { flex: 1 },
  container: { flex: 1, backgroundColor: '#0B0E0F', paddingHorizontal: 22 },
  heading: { paddingTop: 20, paddingBottom: 18 },
  title: { color: '#F7F7F7', fontSize: 31, fontWeight: '700' },
  subtitle: { color: '#A9ADAF', fontSize: 15, marginTop: 4 },
  selectionToolbar: { minHeight: 72, paddingTop: 14, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  selectionCount: { minWidth: 72, flexGrow: 1, fontSize: 13, fontWeight: '700' },
  selectionToolbarButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 11, borderWidth: 1, borderRadius: 10 },
  cancelSelectionButton: { width: 40, paddingHorizontal: 0, backgroundColor: '#FFFFFF' },
  selectionToolbarButtonText: { fontSize: 12, fontWeight: '700' },
  groupModeSwitch: { flexDirection: 'row', padding: 3, borderRadius: 11, backgroundColor: '#FFFFFF', gap: 2 },
  groupModeButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 8 },
  groupModeButtonSelected: { backgroundColor: '#35C72B' },
  groupModeText: { fontSize: 11, fontWeight: '700' },
  disabledButton: { opacity: 0.45 },
  filterHeader: { marginBottom: 12 },
  eventFilterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  typeChipRow: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  filterLabel: { fontSize: 12, fontWeight: '700', marginRight: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  refreshButton: { width: 42, height: 42, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1 },
  refreshButtonDisabled: { opacity: 0.52 },
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
  scrollContentWithDeleteTray: { paddingBottom: 205 },
  sectionHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12, paddingBottom: 8 },
  sectionTitle: { flex: 1, fontSize: 19, fontWeight: '700' },
  sectionCount: { fontSize: 12, fontWeight: '600' },
  toast: { position: 'absolute', alignSelf: 'center', bottom: 178, maxWidth: '90%', paddingHorizontal: 16, paddingVertical: 11, borderRadius: 22, backgroundColor: '#252A27', borderWidth: 1, borderColor: '#3C4B3F' },
  toastText: { color: '#F7F7F7', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  card: { height: 150, backgroundColor: '#242627', borderRadius: 25, paddingVertical: 14, paddingHorizontal: 15, marginBottom: 5, borderWidth: 1, borderColor: '#393C3E', overflow: 'hidden' },
  longPressProgressTrack: { position: 'absolute', top: 0, left: 0, height: 3, backgroundColor: '#35C72B', borderTopLeftRadius: 25, borderTopRightRadius: 3 },
  deleteTray: { position: 'absolute', left: 22, right: 22, bottom: 96, zIndex: 20, alignItems: 'center' },
  deleteButton: { minWidth: 190, minHeight: 58, borderRadius: 29, backgroundColor: '#E53935', borderWidth: 2, borderColor: '#E53935', elevation: 10, shadowColor: '#E53935', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.25, shadowRadius: 10 },
  deleteButtonAction: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 22, borderRadius: 27 },
  deleteButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  cardContent: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' },
  cardCheckbox: { position: 'absolute', top: 7, right: 7, width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11, 14, 15, 0.78)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', zIndex: 2 },
  cardCheckboxSelected: { backgroundColor: '#132219', borderColor: '#35C72B' },
  cardDetails: { flex: 1.05, minWidth: 0, paddingRight: 8 },
  activityType: { color: '#F7F7F7', fontSize: 18, lineHeight: 22, fontWeight: '800' },
  activityDate: { color: '#A9ADAF', fontSize: 12, lineHeight: 15, marginTop: 2 },
  distance: { color: '#35C72B', fontSize: 24, lineHeight: 28, fontWeight: '900', marginTop: 4 },
  centerMetricsContainer: { flex: 0.95, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  metricRow: { width: 88, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', marginVertical: 3 },
  metricIcon: { width: 20, alignItems: 'center' },
  metricText: { alignItems: 'flex-start', marginLeft: 4, minWidth: 0 },
  metricValue: { color: '#F7F7F7', fontSize: 12, lineHeight: 15, fontWeight: '900' },
  metricLabel: { color: '#A9ADAF', fontSize: 10, lineHeight: 12, marginTop: 1,width: '100%' },
  mapThumbnailContainer: { position: 'relative', width: 132, height: 120, marginLeft: 10, borderRadius: 18, overflow: 'hidden', backgroundColor: '#E5E7EB' },
  mapOverlayTop: { position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', justifyContent: 'flex-start' },
  mapBadge: { backgroundColor: 'rgba(11, 14, 15, 0.58)', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 8, paddingVertical: 4 },
  mapBadgeText: { color: '#F7F7F7', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  stateText: { color: '#C4C8C5', fontSize: 16, textAlign: 'center', marginTop: 13 },
  retryButton: { backgroundColor: '#35C72B', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, marginTop: 18 },
  retryText: { color: '#0B0E0F', fontSize: 16, fontWeight: '700' },
  footerLoaderPill: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, marginVertical: 16, borderRadius: 999, backgroundColor: '#1A261D', borderWidth: 1, borderColor: '#2B5B3A' },
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
