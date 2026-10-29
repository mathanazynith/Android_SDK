import { Alert } from '@/components/ThemedAlert';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Directory, File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  FlatList,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  Vibration,
  View,
  type ViewToken
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import ThemedCalendarPicker from '../../../components/common/ThemedCalendarPicker';

import ActivityRouteMap from '../../../components/ActivityRouteMap';
import { RunningLoader } from '../../../components/common/RunningLoader';
import MotionEntrance from '../../../components/MotionEntrance';
import { useTheme } from '../../../contexts/ThemeContext';
import { getBackendErrorMessage, resolveApiUrl } from '../../../service/api';
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

const activityThumbnailDirectory = new Directory(Paths.document, 'activity-map-thumbnails');
const activityDetailRequests = new Map<string, Promise<BackendActivity>>();
const activityDetails = new Map<string, BackendActivity>();
const cacheActivityDetail = (key: string, detail: BackendActivity) => {
  activityDetails.delete(key);
  activityDetails.set(key, detail);
  if (activityDetails.size > 6) {
    const oldestKey = activityDetails.keys().next().value;
    if (oldestKey !== undefined) activityDetails.delete(oldestKey);
  }
};
const getActivityThumbnailFile = (activityId: BackendActivity['id']) => {
  const safeId = encodeURIComponent(String(activityId)).replace(/%/g, '_');
  return new File(activityThumbnailDirectory, `${safeId}.jpg`);
};

const getNormalizedActivityType = (activityType: string): 'run' | 'walk' =>
  activityType.toLowerCase() === 'walk' ? 'walk' : 'run';

type ActivityTypeFilter = 'all' | 'run' | 'walk';
type ActivityDateFilter = 'all' | '7d' | '30d' | '90d' | 'month' | 'year' | 'single' | 'range';
type ActivityDistanceFilter = 'all' | 'under1' | 'under2' | 'short' | 'medium' | 'long';
type DatePickerTarget = 'start' | 'end';
type ActivityGroupMode = 'month' | 'week';
type FilterPopover = 'type' | 'date' | 'distance';
type FilterPopoverPosition = { left: number; top: number; width: number; maxHeight: number; placement: 'above' | 'below' | 'center'; caretLeft: number };

type ActivityListRow =
  | { type: 'section'; key: string; title: string; activities: BackendActivity[] }
  | { type: 'day'; key: string; title: string; count: number }
  | { type: 'activity'; key: string; activity: BackendActivity };

const activityTypeOptions: { label: string; value: ActivityTypeFilter }[] = [
  { label: 'All Types', value: 'all' },
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

const monthOptions = Array.from({ length: 12 }, (_, month) => ({
  label: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(2020, month, 1)),
  value: month,
}));

const activityDistanceOptions: { label: string; value: ActivityDistanceFilter }[] = [
  { label: 'All', value: 'all' },
  { label: '<1 km', value: 'under1' },
  { label: '<2 km', value: 'under2' },
  { label: '<5 km', value: 'short' },
  { label: '5–10 km', value: 'medium' },
  { label: '10+ km', value: 'long' },
];

const formatDateLabel = (value: Date | null) => {
  if (!value) return 'Select date';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(value);
};

const formatMonthLabel = (value: Date | null) => {
  if (!value) return 'Select month';
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(value);
};

const matchesDateRange = (
  activity: BackendActivity,
  range: ActivityDateFilter,
  selectedDay?: Date | null,
  rangeStart?: Date | null,
  rangeEnd?: Date | null,
  selectedMonth?: Date | null,
): boolean => {
  if (range === 'all') return true;

  const activityDate = new Date(activity.start_time).getTime();
  if (!Number.isFinite(activityDate)) return false;

  if (range === 'month') {
    if (!selectedMonth) return false;
    const monthStart = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1).getTime();
    const nextMonthStart = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1).getTime();
    return activityDate >= monthStart && activityDate < nextMonthStart;
  }

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

const sortActivities = (items: BackendActivity[]) => {
  const cloned = [...items];
  cloned.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
  return cloned;
};

const historyIsLoadedThroughDate = (items: BackendActivity[], date: number) => {
  let previousDate = Number.POSITIVE_INFINITY;
  for (const activity of items) {
    const activityDate = new Date(activity.start_time).getTime();
    if (!Number.isFinite(activityDate) || activityDate > previousDate) return false;
    previousDate = activityDate;
  }
  return previousDate < date;
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

const getActivityDay = (activity: BackendActivity) => {
  const date = new Date(activity.start_time);
  if (!Number.isFinite(date.getTime())) {
    return { key: 'unknown-date', title: 'Date unavailable', timestamp: Number.NEGATIVE_INFINITY };
  }

  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const title = day.getTime() === today.getTime()
    ? 'Today'
    : day.getTime() === yesterday.getTime()
      ? 'Yesterday'
      : new Intl.DateTimeFormat(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}),
      }).format(date);

  return {
    key: `day-${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`,
    title,
    timestamp: day.getTime(),
  };
};

const buildActivityRows = (
  activities: BackendActivity[],
  groupMode: ActivityGroupMode,
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
      return second.timestamp - first.timestamp;
    })
    .flatMap(([key, group]) => {
      const dayGroups = new Map<string, { title: string; timestamp: number; activities: BackendActivity[] }>();
      group.activities.forEach((activity) => {
        const day = getActivityDay(activity);
        const dayGroup = dayGroups.get(day.key);
        if (dayGroup) {
          dayGroup.activities.push(activity);
        } else {
          dayGroups.set(day.key, { title: day.title, timestamp: day.timestamp, activities: [activity] });
        }
      });

      const orderedDays = [...dayGroups.entries()].sort(([, first], [, second]) => {
        if (!Number.isFinite(first.timestamp)) return Number.isFinite(second.timestamp) ? 1 : 0;
        if (!Number.isFinite(second.timestamp)) return -1;
        return second.timestamp - first.timestamp;
      });

      return [
        { type: 'section' as const, key: `section:${key}`, title: group.title, activities: group.activities },
        ...orderedDays.flatMap(([dayKey, day]) => [
          { type: 'day' as const, key: `day:${key}:${dayKey}`, title: day.title, count: day.activities.length },
          ...sortActivities(day.activities).map((activity) => ({
            type: 'activity' as const,
            key: `activity:${activity.id}`,
            activity,
          })),
        ]),
      ];
    });
};

interface ActivityCardProps {
  activity: BackendActivity;
  onPress: (activityId: BackendActivity['id']) => void;
  onStartSelection: (activityId: BackendActivity['id']) => void;
  reduceMotion: boolean;
  selectionMode: boolean;
  selected: boolean;
  deleting: boolean;
  busy: boolean;
  isVisible: boolean;
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
  isVisible,
}: ActivityCardProps) {
  const { colors, isDark } = useTheme();
  const activityName = formatActivityType(activity.activity_type);
  const activityId = activity.id;
  const duration = activity.moving_time || activity.elapsed_time;
  const thumbnailUri = resolveApiUrl(activity.thumbnail_url);
  const [savedThumbnailUri, setSavedThumbnailUri] = useState<string | null>(null);
  const [routeActivity, setRouteActivity] = useState<BackendActivity | null>(null);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const longPressHandledRef = useRef(false);
  const [selectionScale] = useState(() => new Animated.Value(1));
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
    setThumbnailFailed(false);
  }, [thumbnailUri]);

  useEffect(() => {
    if (!isVisible || (thumbnailUri && !thumbnailFailed)) return;
    let cancelled = false;
    const thumbnailFile = getActivityThumbnailFile(activityId);
    const loadRoute = async () => {
      try {
        await activityThumbnailDirectory.create({ idempotent: true, intermediates: true });
        if (thumbnailFile.exists) {
          if (!cancelled) setSavedThumbnailUri(thumbnailFile.uri);
          return;
        }
        const key = String(activityId);
        const cachedDetail = activityDetails.get(key);
        if (cachedDetail) {
          if (!cancelled) setRouteActivity(cachedDetail);
          return;
        }
        let detailRequest = activityDetailRequests.get(key);
        if (!detailRequest) {
          detailRequest = activityAPI.get(activityId);
          activityDetailRequests.set(key, detailRequest);
        }
        const detail = await detailRequest;
        cacheActivityDetail(key, detail);
        if (!cancelled) setRouteActivity(detail);
      } catch (error) {
        console.warn('[ActivityHistory] Could not load route thumbnail', error);
      } finally {
        activityDetailRequests.delete(String(activityId));
      }
    };
    const cachedDetail = activityDetails.get(String(activityId));
    if (cachedDetail) setRouteActivity(cachedDetail);
    void loadRoute();
    return () => { cancelled = true; };
  }, [activityId, isVisible, thumbnailFailed, thumbnailUri]);

  const saveRouteThumbnail = useCallback(async (snapshotUri: string) => {
    try {
      await activityThumbnailDirectory.create({ idempotent: true, intermediates: true });
      const destination = getActivityThumbnailFile(activityId);
      await new File(snapshotUri).copy(destination, { overwrite: true });
      setSavedThumbnailUri(destination.uri);
    } catch (error) {
      console.warn('[ActivityHistory] Could not save route thumbnail', error);
    }
  }, [activityId]);

  const handleCardPress = () => {
    if (longPressHandledRef.current) {
      longPressHandledRef.current = false;
      return;
    }
    onPress(activityId);
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

  return (
    <GestureDetector gesture={selectionGesture}>
      <Reanimated.View>
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: selected ? (isDark ? '#351F20' : '#FEF2F2') : colors.surface,
            borderColor: selected ? '#DC2626' : colors.border,
            borderWidth: selected ? 2 : 1,
          },
          {
            transform: [{ scale: selectionScale }],
          },
        ]}
      >
      <TouchableOpacity
        style={styles.cardContent}
        accessibilityRole="button"
        accessibilityLabel={`${activityName} activity, ${formatDistance(activity.distance)}, ${formatDuration(duration)}`}
        accessibilityHint={selectionMode ? 'Tap to select or deselect this activity for deletion.' : 'Open activity details, or long press to select this activity for deletion.'}
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
          <Text
            style={[styles.distance, { color: colors.primary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {formatDistance(activity.distance)}
          </Text>
        </View>

        <View style={styles.centerMetricsContainer}>
          <View style={styles.metricRow}>
            <View style={styles.metricIcon}>
              <Feather name="clock" size={17} color={colors.primary} />
            </View>
            <View style={styles.metricText}>
              <Text style={[styles.metricValue, { color: colors.text }]}>{formatDuration(duration)}</Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Time</Text>
            </View>
          </View>
          <View style={styles.metricRow}>
            <View style={styles.metricIcon}>
              <Feather name="compass" size={17} color={colors.primary} />
            </View>
            <View style={styles.metricText}>
              <Text style={[styles.metricValue, { color: colors.text }]}>{formatPace(activity.avg_pace)}</Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Pace</Text>
            </View>
          </View>
        </View>

        <View pointerEvents="none" style={styles.mapThumbnailContainer}>
          {thumbnailUri && !thumbnailFailed ? (
            <ExpoImage
              source={{ uri: thumbnailUri }}
              style={styles.mapThumbnailImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={reduceMotion ? 0 : 120}
              accessibilityLabel={`${activityName} route map`}
              onError={() => setThumbnailFailed(true)}
            />
          ) : savedThumbnailUri ? (
            <ExpoImage
              source={{ uri: savedThumbnailUri }}
              style={styles.mapThumbnailImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              accessibilityLabel={`${activityName} route map`}
            />
          ) : routeActivity ? (
            <ActivityRouteMap
              variant="preview"
              enableFullScreen={false}
              encodedPolyline={routeActivity.encoded_polyline}
              plannedEncodedPolyline={routeActivity.planned_encoded_polyline}
              extraEncodedPolyline={routeActivity.extra_encoded_polyline}
              savedGpsPoints={routeActivity.gps_points ?? routeActivity.points ?? routeActivity.coordinates}
              runningRoutes={routeActivity.route?.running_routes}
              pauseRoutes={routeActivity.route?.pause_routes}
              pauseEvents={routeActivity.pause_events ?? routeActivity.pauses ?? routeActivity.route?.pause_events ?? routeActivity.route?.pauses}
              pausePoints={routeActivity.route?.pause_points}
              onPreviewSnapshot={saveRouteThumbnail}
            />
          ) : (
            <View style={styles.mapPreviewPlaceholder}>
              <Feather name="map" size={20} color="#6B7280" />
            </View>
          )}

          <View pointerEvents="none" style={styles.mapOverlayTop}>
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
          accessibilityLabel={`${selected ? 'Deselect' : 'Select'} ${activityName.toLowerCase()} activity for deletion`}
          disabled={busy}
          onPress={() => onPress(activityId)}
          style={[
            styles.cardCheckbox,
            { backgroundColor: selected ? '#DC2626' : isDark ? '#111827' : '#FFFFFF' },
            { borderColor: selected ? '#FFFFFF' : colors.border },
          ]}
        >
          {deleting
            ? <RunningLoader size={18} fillColor="#FF6B6B" />
            : selected
              ? <Feather name="check" size={21} color="#FFFFFF" />
              : <Feather name="square" size={20} color={colors.textSecondary} />}
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
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [activities, setActivities] = useState<BackendActivity[]>([]);
  const [visibleActivityIds, setVisibleActivityIds] = useState<Set<string>>(() => new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedActivityIds, setSelectedActivityIds] = useState<Set<string>>(() => new Set());
  const [groupMode, setGroupMode] = useState<ActivityGroupMode>('month');
  const [selectionToast, setSelectionToast] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [deletingActivityIds, setDeletingActivityIds] = useState<Set<string>>(() => new Set());
  const [isDeletingActivities, setIsDeletingActivities] = useState(false);
  const [selectedType, setSelectedType] = useState<ActivityTypeFilter>('all');
  const [selectedDateRange, setSelectedDateRange] = useState<ActivityDateFilter>('all');
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date | null>(null);
  const [selectedDistanceRange, setSelectedDistanceRange] = useState<ActivityDistanceFilter>('all');
  const [showNativeDatePicker, setShowNativeDatePicker] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<DatePickerTarget>('start');
  const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null);
  const [rangeStartDate, setRangeStartDate] = useState<Date | null>(null);
  const [rangeEndDate, setRangeEndDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalHistoryCount, setTotalHistoryCount] = useState<number | null>(null);
  const cursorRef = useRef<string | null>(null);
  const monthAutoLoadKeyRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const loadingFirstPageRef = useRef(false);
  const hasLoadedHistoryRef = useRef(false);
  const requestIdRef = useRef(0);
  const activityViewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 10, minimumViewTime: 80 }), []);
  const selectionToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleteButtonStateProgress] = useState(() => new Animated.Value(0));
  const [deleteTrayOpacity] = useState(() => new Animated.Value(0));
  const [deleteTrayTranslateY] = useState(() => new Animated.Value(24));
  const [deleteSuccessScale] = useState(() => new Animated.Value(0.65));
  const [selectionToolbarOpacity] = useState(() => new Animated.Value(0));
  const [selectionToolbarTranslateY] = useState(() => new Animated.Value(8));
  const [selectionFiltersProgress] = useState(() => new Animated.Value(1));
  const [activeFilterPopover, setActiveFilterPopover] = useState<FilterPopover | null>(null);
  const [filterPopoverPosition, setFilterPopoverPosition] = useState<FilterPopoverPosition>({ left: 12, top: 72, width: 280, maxHeight: 420, placement: 'below', caretLeft: 24 });
  const typeFilterAnchorRef = useRef<View>(null);
  const dateFilterAnchorRef = useRef<View>(null);
  const distanceFilterAnchorRef = useRef<View>(null);

  const openFilterPopover = useCallback((filter: FilterPopover, anchorRef: { current: View | null }, contentHeight: number) => {
    anchorRef.current?.measureInWindow((x, y, anchorWidth, anchorHeight) => {
      const horizontalMargin = 12;
      const leftLimit = insets.left + horizontalMargin;
      const rightLimit = windowWidth - insets.right - horizontalMargin;
      const width = Math.min(310, rightLimit - leftLimit);
      const left = Math.max(leftLimit, Math.min(x + anchorWidth / 2 - width / 2, rightLimit - width));
      const topLimit = insets.top + 8;
      const bottomLimit = windowHeight - insets.bottom - 8;
      const availableAbove = Math.max(0, y - topLimit - 8);
      const availableBelow = Math.max(0, bottomLimit - (y + anchorHeight) - 8);
      const available = Math.max(availableAbove, availableBelow);
      let placement: FilterPopoverPosition['placement'] = availableBelow >= availableAbove ? 'below' : 'above';
      const maxHeight = Math.max(180, Math.min(contentHeight, available || windowHeight - insets.top - insets.bottom - 32));
      let top = placement === 'below' ? y + anchorHeight + 8 : y - maxHeight - 8;

      if (available < 180) {
        placement = 'center';
        top = topLimit + Math.max(0, (bottomLimit - topLimit - maxHeight) / 2);
      } else {
        top = Math.max(topLimit, Math.min(top, bottomLimit - maxHeight));
      }

      setFilterPopoverPosition({
        left,
        top,
        width,
        maxHeight,
        placement,
        caretLeft: Math.max(16, Math.min(x + anchorWidth / 2 - left - 7, width - 16)),
      });
      setActiveFilterPopover(filter);
    });
  }, [insets.bottom, insets.left, insets.right, insets.top, windowHeight, windowWidth]);

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

  const handleViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const nextVisibleIds = new Set(viewableItems.flatMap(({ item }) => {
      const row = item as ActivityListRow;
      return row.type === 'activity' ? [String(row.activity.id)] : [];
    }));
    setVisibleActivityIds((current) => current.size === nextVisibleIds.size
      && [...current].every((id) => nextVisibleIds.has(id)) ? current : nextVisibleIds);
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
      if (reduceMotion) {
        selectionToolbarOpacity.setValue(1);
        selectionToolbarTranslateY.setValue(0);
        selectionFiltersProgress.setValue(1);
      } else {
        selectionToolbarOpacity.setValue(0);
        selectionToolbarTranslateY.setValue(8);
        selectionFiltersProgress.setValue(0);
        Animated.parallel([
          Animated.timing(selectionToolbarOpacity, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(selectionToolbarTranslateY, {
            toValue: 0,
            damping: 18,
            stiffness: 190,
            useNativeDriver: true,
          }),
          Animated.timing(selectionFiltersProgress, {
            toValue: 1,
            duration: 240,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start();
      }
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

    selectionToolbarOpacity.setValue(0);
    selectionToolbarTranslateY.setValue(8);
    selectionFiltersProgress.setValue(1);
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
  }, [
    deleteTrayOpacity,
    deleteTrayTranslateY,
    reduceMotion,
    selectionFiltersProgress,
    selectionMode,
    selectionToolbarOpacity,
    selectionToolbarTranslateY,
  ]);

  useEffect(() => {
    Animated.spring(deleteSuccessScale, {
      toValue: deleteSuccess ? 1 : 0.65,
      damping: 14,
      stiffness: 220,
      useNativeDriver: false,
    }).start();
  }, [deleteSuccess, deleteSuccessScale]);

  const loadFirstPage = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    let hasUsableHistory = hasLoadedHistoryRef.current;
    cursorRef.current = null;
    loadingFirstPageRef.current = true;
    setHasMore(true);
    if (!hasUsableHistory) setLoading(true);

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
      }
    }
  }, [showSelectionToast]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loadingMoreRef.current || loadingFirstPageRef.current || loading) return;
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
  }, [hasMore, loading, loadingMore]);

  useFocusEffect(
    useCallback(() => {
      void loadFirstPage();
    }, [loadFirstPage]),
  );

  useEffect(() => {
    if (selectedDateRange !== 'month' || !selectedMonthDate || !hasMore || loading || loadingMore) return;

    const monthStart = new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth(), 1).getTime();
    if (historyIsLoadedThroughDate(activities, monthStart)) return;

    const attemptKey = `${monthStart}:${cursorRef.current ?? 'first'}`;
    if (monthAutoLoadKeyRef.current === attemptKey) return;
    monthAutoLoadKeyRef.current = attemptKey;
    void loadMore();
  }, [activities, hasMore, loadMore, loading, loadingMore, selectedDateRange, selectedMonthDate]);

  const dateSummary = useMemo(() => {
    if (selectedDateRange === 'all') return 'All dates';
    if (selectedDateRange === 'month') return formatMonthLabel(selectedMonthDate);
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
  }, [rangeEndDate, rangeStartDate, selectedDateRange, selectedDayDate, selectedMonthDate]);

  const distanceSummary = useMemo(() => {
    if (selectedDistanceRange === 'all') return 'Distance';
    return activityDistanceOptions.find((option) => option.value === selectedDistanceRange)?.label ?? 'Distance';
  }, [selectedDistanceRange]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedType !== 'all') count += 1;
    if (selectedDateRange !== 'all') count += 1;
    if (selectedDistanceRange !== 'all') count += 1;
    return count;
  }, [selectedDateRange, selectedDistanceRange, selectedType]);

  const hasActiveFilters = activeFilterCount > 0;

  const activeFilterSummary = useMemo(() => {
    const labels: string[] = [];
    if (selectedType !== 'all') labels.push(activityTypeOptions.find((option) => option.value === selectedType)?.label ?? 'Event');
    if (selectedDateRange !== 'all') labels.push(dateSummary);
    if (selectedDistanceRange !== 'all') labels.push(distanceSummary);
    return labels;
  }, [dateSummary, distanceSummary, selectedDateRange, selectedDistanceRange, selectedType]);

  const visibleActivities = useMemo(() => {
    let filtered = [...activities];

    if (selectedType !== 'all') {
      filtered = filtered.filter((activity) => getNormalizedActivityType(activity.activity_type) === selectedType);
    }

    if (selectedDateRange !== 'all') {
      filtered = filtered.filter((activity) => matchesDateRange(
        activity,
        selectedDateRange,
        selectedDayDate,
        rangeStartDate,
        rangeEndDate,
        selectedMonthDate,
      ));
    }

    if (selectedDistanceRange !== 'all') {
      filtered = filtered.filter((activity) => matchesDistanceRange(activity, selectedDistanceRange));
    }

    return sortActivities(filtered);
  }, [activities, rangeEndDate, rangeStartDate, selectedDateRange, selectedDayDate, selectedDistanceRange, selectedMonthDate, selectedType]);

  const activityRows = useMemo(
    () => buildActivityRows(visibleActivities, groupMode),
    [groupMode, visibleActivities],
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
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    selectionToolbarOpacity.setValue(reduceMotion ? 1 : 0);
    selectionToolbarTranslateY.setValue(reduceMotion ? 0 : 8);
    selectionFiltersProgress.setValue(reduceMotion ? 1 : 0);
    setSelectionMode(true);
    setSelectedActivityIds((current) => new Set(current).add(String(activityId)));
  }, [reduceMotion, selectionFiltersProgress, selectionToolbarOpacity, selectionToolbarTranslateY]);

  const cancelActivitySelection = useCallback(() => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectionMode(false);
    setSelectedActivityIds(new Set());
  }, [reduceMotion]);

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

  const handleActivityPress = useCallback((activityId: BackendActivity['id']) => {
    if (selectionMode) {
      toggleActivitySelection(activityId);
      return;
    }
    router.push(`/(app)/activity/${activityId}` as any);
  }, [selectionMode, toggleActivitySelection]);

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
    if (item.type === 'day') {
      return (
        <View style={styles.dayHeader}>
          <Text style={[styles.dayTitle, { color: colors.textSecondary }]}>{item.title}</Text>
          <Text style={[styles.dayCount, { color: colors.textTertiary }]}>{item.count}</Text>
        </View>
      );
    }

    const activity = item.activity;
    return (
      <ActivityCard
        activity={activity}
        onPress={handleActivityPress}
        onStartSelection={startActivitySelection}
        reduceMotion={reduceMotion}
        isVisible={visibleActivityIds.has(String(activity.id))}
        selectionMode={selectionMode}
        selected={selectedActivityIds.has(String(activity.id))}
        deleting={deletingActivityIds.has(String(activity.id))}
        busy={isDeletingActivities}
      />
    );
  }, [
    colors.text,
    colors.textSecondary,
    colors.textTertiary,
    deletingActivityIds,
    isDeletingActivities,
    handleActivityPress,
    reduceMotion,
    visibleActivityIds,
    selectedActivityIds,
    selectionMode,
    startActivitySelection,
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
      <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.screenContent}>
      <StatusBar barStyle={colors.background === '#F8FAFC' ? 'dark-content' : 'light-content'} />
      {selectionMode ? (
        <Animated.View
          style={[
            styles.selectionToolbar,
            {
              opacity: selectionToolbarOpacity,
              transform: [{ translateY: selectionToolbarTranslateY }],
            },
          ]}
        >
          <View style={styles.selectionToolbarHeader}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Cancel workout selection"
              disabled={isDeletingActivities}
              onPress={cancelActivitySelection}
              style={[styles.selectionToolbarButton, styles.cancelSelectionButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Feather name="x" size={19} color="#E53935" />
            </TouchableOpacity>
            <View style={styles.selectionTitleGroup}>
              <Text style={[styles.selectionTitle, { color: colors.text }]}>Select activities to delete</Text>
              <Text style={[styles.selectionCount, { color: colors.textSecondary }]}>
                {selectedActivities.length} selected · Tap cards to toggle
              </Text>
            </View>
          </View>
          <View style={styles.selectionToolbarActions}>
            <View style={[styles.groupModeSwitch, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              {(['month', 'week'] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  accessibilityRole="button"
                  accessibilityState={{ selected: groupMode === mode }}
                  disabled={isDeletingActivities}
                  onPress={() => setGroupMode(mode)}
                  style={[styles.groupModeButton, { backgroundColor: groupMode === mode ? colors.primary : 'transparent' }]}
                >
                  <Text style={[styles.groupModeText, { color: groupMode === mode ? colors.primaryText : colors.textSecondary }]}>
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
          </View>
        </Animated.View>
      ) : (
        <View style={styles.heading}>
          <Text style={[styles.title, { color: colors.text }]}>Workout History</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Your completed runs and walks</Text>
        </View>
      )}

      <Animated.View
        style={{
          opacity: selectionFiltersProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.92, 1],
          }),
          transform: [{
            translateY: selectionFiltersProgress.interpolate({
              inputRange: [0, 1],
              outputRange: [-6, 0],
            }),
          }],
        }}
      >
      {hasActiveFilters && (
        <View style={styles.activeFilterSummaryRow}>
          <View style={[styles.activeFilterBadge, { backgroundColor: colors.selected, borderColor: colors.border }]}>
            <Text style={[styles.activeFilterBadgeText, { color: colors.primary }]}>{activeFilterCount} active</Text>
          </View>
          {activeFilterSummary.slice(0, 3).map((label) => (
            <View key={label} style={[styles.activeFilterPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.activeFilterPillText, { color: colors.text }]}>{label}</Text>
            </View>
          ))}
        </View>
      )}

      <MotionEntrance delay={45}>
        <View style={styles.filterRowBar}>
        <TouchableOpacity
          ref={typeFilterAnchorRef}
          accessibilityRole="button"
          accessibilityLabel={`Activity type: ${activityTypeOptions.find((option) => option.value === selectedType)?.label ?? 'All Types'}`}
          accessibilityHint="Choose which activity types to show"
          activeOpacity={0.85}
          onPress={() => openFilterPopover('type', typeFilterAnchorRef, 300)}
          style={[styles.filterBarButton, styles.compactFilterButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Feather name="activity" size={14} color={colors.primary} />
          <Text numberOfLines={1} style={[styles.filterBarText, styles.compactFilterText, { color: colors.text }]}>
            {activityTypeOptions.find((option) => option.value === selectedType)?.label ?? 'All Types'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          ref={dateFilterAnchorRef}
          accessibilityRole="button"
          activeOpacity={0.85}
          onPress={() => openFilterPopover('date', dateFilterAnchorRef, 620)}
          style={[styles.filterBarButton, styles.compactFilterButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Feather name="calendar" size={14} color={colors.primary} />
          <Text numberOfLines={1} style={[styles.filterBarText, styles.compactFilterText, { color: colors.text }]}>
            {selectedDateRange === 'all' ? 'Date' : dateSummary}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          ref={distanceFilterAnchorRef}
          accessibilityRole="button"
          activeOpacity={0.85}
          onPress={() => openFilterPopover('distance', distanceFilterAnchorRef, 420)}
          style={[styles.filterBarButton, styles.compactFilterButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Feather name="map-pin" size={14} color={colors.primary} />
          <Text numberOfLines={1} style={[styles.filterBarText, styles.compactFilterText, { color: colors.text }]}>
            {selectedDistanceRange === 'all' ? 'Distance' : distanceSummary}
          </Text>
        </TouchableOpacity>

        </View>
      </MotionEntrance>

      {hasActiveFilters && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            setSelectedType('all');
            setSelectedDateRange('all');
            setSelectedMonthDate(null);
            setSelectedDayDate(null);
            setRangeStartDate(null);
            setRangeEndDate(null);
            setSelectedDistanceRange('all');
          }}
          style={[styles.resetButton, { backgroundColor: colors.selected }]}
        >
          <Text style={[styles.resetButtonText, { color: colors.primary }]}>Reset filters</Text>
        </TouchableOpacity>
      )}
      </Animated.View>

      <Modal transparent visible={activeFilterPopover === 'type'} animationType="fade" onRequestClose={() => setActiveFilterPopover(null)}>
        <View style={styles.filterPopoverBackdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close activity type filter" onPress={() => setActiveFilterPopover(null)} style={StyleSheet.absoluteFill} />
          <View style={[styles.filterPopoverCard, { left: filterPopoverPosition.left, top: filterPopoverPosition.top, width: filterPopoverPosition.width, maxHeight: filterPopoverPosition.maxHeight, backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeaderRow}>
              <View style={[styles.modalHeaderBadge, { backgroundColor: colors.selected, borderColor: colors.border }]}>
                <Feather name="activity" size={14} color={colors.primary} />
              </View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Activity type</Text>
            </View>

            <ScrollView style={[styles.filterPopoverScroll, { maxHeight: filterPopoverPosition.maxHeight - 60 }]} contentContainerStyle={styles.filterPopoverScrollContent} showsVerticalScrollIndicator={false}>
            <Text style={[styles.modalSectionLabel, { color: colors.textSecondary }]}>Show activities</Text>
            {activityTypeOptions.map((option) => {
              const active = selectedType === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedType(option.value);
                    setActiveFilterPopover(null);
                  }}
                  style={[styles.optionRow, { backgroundColor: active ? colors.selected : colors.surfaceRaised, borderColor: active ? colors.primary : colors.border }]}
                >
                  <Text style={[styles.optionText, { color: active ? colors.primary : colors.text }]}>{option.label}</Text>
                  {active && <Feather name="check" size={16} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.85}
              onPress={() => {
                setSelectedType('all');
                setActiveFilterPopover(null);
              }}
              style={[styles.sheetClearButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            >
              <Text style={[styles.sheetClearText, { color: '#EF4444' }]}>Clear</Text>
            </TouchableOpacity>
            </ScrollView>
            {filterPopoverPosition.placement !== 'center' ? (
              <View style={[styles.filterPopoverCaret, filterPopoverPosition.placement === 'above' ? styles.filterPopoverCaretBelow : styles.filterPopoverCaretAbove, { left: filterPopoverPosition.caretLeft, backgroundColor: colors.surface }]} />
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal transparent visible={activeFilterPopover === 'date'} animationType="fade" onRequestClose={() => setActiveFilterPopover(null)}>
        <View style={styles.filterPopoverBackdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close date filter" onPress={() => setActiveFilterPopover(null)} style={StyleSheet.absoluteFill} />
          <View style={[styles.filterPopoverCard, { left: filterPopoverPosition.left, top: filterPopoverPosition.top, width: filterPopoverPosition.width, maxHeight: filterPopoverPosition.maxHeight, backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeaderRow}>
              <View style={[styles.modalHeaderBadge, { backgroundColor: colors.selected, borderColor: colors.border }]}>
                <Feather name="calendar" size={14} color={colors.primary} />
              </View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Date filter</Text>
            </View>

            <ScrollView style={[styles.filterPopoverScroll, { maxHeight: filterPopoverPosition.maxHeight - 112 }]} contentContainerStyle={styles.filterPopoverScrollContent} showsVerticalScrollIndicator={false}>
            <Text style={[styles.modalSectionLabel, { color: colors.textSecondary }]}>Quick ranges</Text>
            <View style={styles.modalPresetRow}>
              {activityDateOptions.filter((option) => option.value !== 'single' && option.value !== 'range').map((option) => (
                <TouchableOpacity
                  key={option.value}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedDateRange(option.value);
                    setSelectedMonthDate(null);
                    setSelectedDayDate(null);
                    setRangeStartDate(null);
                    setRangeEndDate(null);
                    setActiveFilterPopover(null);
                  }}
                  style={[styles.presetButton, { backgroundColor: selectedDateRange === option.value ? colors.selected : colors.surfaceRaised, borderColor: selectedDateRange === option.value ? colors.primary : colors.border }]}
                >
                  <Text style={[styles.presetButtonText, { color: selectedDateRange === option.value ? colors.primary : colors.text }]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.modalSectionLabel, { color: colors.textSecondary }]}>Selection mode</Text>
            <View style={styles.segmentedRow}>
              {(['month', 'single', 'range'] as const).map((mode) => {
                const active = selectedDateRange === mode;
                return (
                  <TouchableOpacity
                    key={mode}
                    activeOpacity={0.8}
                    onPress={() => {
                      setSelectedDateRange(mode);
                      if (mode === 'month') {
                        setSelectedMonthDate((current) => current ?? new Date());
                        setSelectedDayDate(null);
                        setRangeStartDate(null);
                        setRangeEndDate(null);
                      } else if (mode === 'single') {
                        setSelectedMonthDate(null);
                        setRangeStartDate(null);
                        setRangeEndDate(null);
                      } else {
                        setSelectedMonthDate(null);
                        setSelectedDayDate(null);
                      }
                    }}
                    style={[styles.segmentedButton, { backgroundColor: active ? colors.selected : colors.surfaceRaised, borderColor: active ? colors.primary : colors.border }]}
                  >
                    <Text style={[styles.segmentedButtonText, { color: active ? colors.primary : colors.text }]}>
                      {mode === 'month' ? 'Month' : mode === 'single' ? 'Single date' : 'Date range'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedDateRange === 'month' ? (
              <View style={styles.monthPicker}>
                <View style={styles.monthYearRow}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Previous year"
                    onPress={() => setSelectedMonthDate((current) => {
                      const date = current ?? new Date();
                      return new Date(date.getFullYear() - 1, date.getMonth(), 1);
                    })}
                    style={[styles.monthYearButton, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
                  >
                    <Feather name="chevron-left" size={18} color={colors.text} />
                  </TouchableOpacity>
                  <Text style={[styles.monthYearText, { color: colors.text }]}>{selectedMonthDate?.getFullYear()}</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Next year"
                    onPress={() => setSelectedMonthDate((current) => {
                      const date = current ?? new Date();
                      return new Date(date.getFullYear() + 1, date.getMonth(), 1);
                    })}
                    style={[styles.monthYearButton, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
                  >
                    <Feather name="chevron-right" size={18} color={colors.text} />
                  </TouchableOpacity>
                </View>
                <View style={styles.monthGrid}>
                  {monthOptions.map((month) => {
                    const active = selectedMonthDate?.getMonth() === month.value;
                    return (
                      <TouchableOpacity
                        key={month.value}
                        accessibilityRole="button"
                        accessibilityLabel={`${month.label} ${selectedMonthDate?.getFullYear()}`}
                        accessibilityState={{ selected: active }}
                        onPress={() => setSelectedMonthDate((current) =>
                          new Date(current?.getFullYear() ?? new Date().getFullYear(), month.value, 1))}
                        style={[styles.monthOption, { backgroundColor: active ? colors.selected : colors.surfaceRaised, borderColor: active ? colors.primary : colors.border }]}
                      >
                        <Text style={[styles.monthOptionText, { color: active ? colors.primary : colors.text }]}>{month.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : selectedDateRange === 'single' ? (
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
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  setSelectedDateRange('all');
                  setSelectedMonthDate(null);
                  setSelectedDayDate(null);
                  setRangeStartDate(null);
                  setRangeEndDate(null);
                  setActiveFilterPopover(null);
                }}
                style={[styles.modalActionButton, { backgroundColor: colors.background, borderColor: colors.border }]}
              >
                <Text style={[styles.modalActionText, { color: '#EF4444' }]}>Clear</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  if (selectedDateRange === 'single' && selectedDayDate) {
                    setActiveFilterPopover(null);
                    return;
                  }
                  if (selectedDateRange === 'range' && rangeStartDate && rangeEndDate) {
                    setActiveFilterPopover(null);
                    return;
                  }
                  setActiveFilterPopover(null);
                }}
                style={[styles.modalActionButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              >
                <Text style={[styles.modalActionText, { color: colors.primaryText }]}>Apply</Text>
              </TouchableOpacity>
            </View>
            {filterPopoverPosition.placement !== 'center' ? (
              <View style={[styles.filterPopoverCaret, filterPopoverPosition.placement === 'above' ? styles.filterPopoverCaretBelow : styles.filterPopoverCaretAbove, { left: filterPopoverPosition.caretLeft, backgroundColor: colors.surface }]} />
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal transparent visible={activeFilterPopover === 'distance'} animationType="fade" onRequestClose={() => setActiveFilterPopover(null)}>
        <View style={styles.filterPopoverBackdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close distance filter" onPress={() => setActiveFilterPopover(null)} style={StyleSheet.absoluteFill} />
          <View style={[styles.filterPopoverCard, { left: filterPopoverPosition.left, top: filterPopoverPosition.top, width: filterPopoverPosition.width, maxHeight: filterPopoverPosition.maxHeight, backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeaderRow}>
              <View style={[styles.modalHeaderBadge, { backgroundColor: colors.selected, borderColor: colors.border }]}>
                <Feather name="map-pin" size={14} color={colors.primary} />
              </View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Distance</Text>
            </View>

            <ScrollView style={[styles.filterPopoverScroll, { maxHeight: filterPopoverPosition.maxHeight - 60 }]} contentContainerStyle={styles.filterPopoverScrollContent} showsVerticalScrollIndicator={false}>
            <Text style={[styles.modalSectionLabel, { color: colors.textSecondary }]}>Choose range</Text>
            {activityDistanceOptions.map((option) => {
              const active = selectedDistanceRange === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedDistanceRange(option.value);
                    setActiveFilterPopover(null);
                  }}
                  style={[styles.optionRow, { backgroundColor: active ? colors.selected : colors.surfaceRaised, borderColor: active ? colors.primary : colors.border }]}
                >
                  <Text style={[styles.optionText, { color: active ? colors.primary : colors.text }]}>{option.label}</Text>
                  {active && <Feather name="check" size={16} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                setSelectedDistanceRange('all');
                setActiveFilterPopover(null);
              }}
              style={[styles.sheetClearButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            >
              <Text style={[styles.sheetClearText, { color: '#EF4444' }]}>Clear</Text>
            </TouchableOpacity>
            </ScrollView>
            {filterPopoverPosition.placement !== 'center' ? (
              <View style={[styles.filterPopoverCaret, filterPopoverPosition.placement === 'above' ? styles.filterPopoverCaretBelow : styles.filterPopoverCaretAbove, { left: filterPopoverPosition.caretLeft, backgroundColor: colors.surface }]} />
            ) : null}
          </View>
        </View>
      </Modal>

      {showNativeDatePicker && (
        <ThemedCalendarPicker
          title={selectedDateRange === 'single' ? 'Select activity date' : `Select ${datePickerTarget} date`}
          value={datePickerTarget === 'start' ? (selectedDateRange === 'range' ? rangeStartDate ?? new Date() : selectedDayDate ?? new Date()) : (selectedDateRange === 'range' ? rangeEndDate ?? new Date() : selectedDayDate ?? new Date())}
          onCancel={() => setShowNativeDatePicker(false)}
          onConfirm={(selectedDate) => {
            setShowNativeDatePicker(false);
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
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews
          updateCellsBatchingPeriod={16}
          viewabilityConfig={activityViewabilityConfig}
          onViewableItemsChanged={handleViewableItemsChanged}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore
            ? (
              <View style={styles.footerLoaderPill}>
                <RunningLoader size={20} fillColor="#35C72B" />
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
                ? <RunningLoader size={20} fillColor="#FFFFFF" />
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
  selectionToolbar: { paddingTop: 12, paddingBottom: 12, gap: 9 },
  selectionToolbarHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectionTitleGroup: { flex: 1, minWidth: 0 },
  selectionTitle: { fontSize: 14, fontWeight: '800' },
  selectionCount: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  selectionToolbarActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  selectionToolbarButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 11, borderWidth: 1, borderRadius: 10 },
  cancelSelectionButton: { width: 40, paddingHorizontal: 0, backgroundColor: '#FFFFFF' },
  selectionToolbarButtonText: { fontSize: 12, fontWeight: '700' },
  groupModeSwitch: { flexDirection: 'row', padding: 3, borderRadius: 11, backgroundColor: '#FFFFFF', gap: 2 },
  groupModeButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 8 },
  groupModeButtonSelected: { backgroundColor: '#35C72B' },
  groupModeText: { fontSize: 11, fontWeight: '700' },
  disabledButton: { opacity: 0.45 },
  activeFilterSummaryRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  activeFilterBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  activeFilterBadgeText: { color: '#D9F9DB', fontSize: 11, fontWeight: '700' },
  activeFilterPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  activeFilterPillText: { fontSize: 11, fontWeight: '600' },
  filterRowBar: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: 8, marginBottom: 10 },
  filterBarButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1, minHeight: 42 },
  filterPopoverBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.12)' },
  filterPopoverCard: { position: 'absolute', borderWidth: 1, borderRadius: 16, padding: 14, overflow: 'visible', elevation: 18, shadowColor: '#000000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.24, shadowRadius: 18 },
  filterPopoverScroll: { flexGrow: 0, flexShrink: 1 },
  filterPopoverScrollContent: { flexGrow: 0 },
  filterPopoverCaret: { position: 'absolute', width: 14, height: 14, zIndex: 2, transform: [{ rotate: '45deg' }] },
  filterPopoverCaretAbove: { bottom: -6 },
  filterPopoverCaretBelow: { top: -6 },
  filterBarText: { fontSize: 12, fontWeight: '600' },
  compactFilterButton: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  compactFilterText: { flexShrink: 1, minWidth: 0, fontSize: 12 },
  resetButton: { alignSelf: 'flex-start', marginBottom: 12, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: '#23372A' },
  resetButtonText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
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
  monthPicker: { marginBottom: 14 },
  monthYearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 10 },
  monthYearButton: { width: 34, height: 34, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  monthYearText: { minWidth: 56, textAlign: 'center', fontSize: 14, fontWeight: '700' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  monthOption: { flexBasis: '22%', flexGrow: 1, minWidth: 48, borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  monthOptionText: { fontSize: 12, fontWeight: '600' },
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
  dayHeader: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 12, paddingRight: 4, marginTop: 2 },
  dayTitle: { fontSize: 14, fontWeight: '700' },
  dayCount: { fontSize: 11, fontWeight: '600' },
  toast: { position: 'absolute', alignSelf: 'center', bottom: 178, maxWidth: '90%', paddingHorizontal: 16, paddingVertical: 11, borderRadius: 22, backgroundColor: '#252A27', borderWidth: 1, borderColor: '#3C4B3F' },
  toastText: { color: '#F7F7F7', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  card: { minHeight: 150, backgroundColor: '#242627', borderRadius: 25, paddingVertical: 14, paddingHorizontal: 15, marginBottom: 5, borderWidth: 1, borderColor: '#393C3E' },
  longPressProgressTrack: { position: 'absolute', top: 0, left: 0, height: 3, backgroundColor: '#35C72B', borderTopLeftRadius: 25, borderTopRightRadius: 3 },
  deleteTray: { position: 'absolute', left: 22, right: 22, bottom: 96, zIndex: 20, alignItems: 'center' },
  deleteButton: { minWidth: 190, minHeight: 58, borderRadius: 29, backgroundColor: '#E53935', borderWidth: 2, borderColor: '#E53935', elevation: 10, shadowColor: '#E53935', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.25, shadowRadius: 10 },
  deleteButtonAction: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 22, borderRadius: 27 },
  deleteButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  cardContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardCheckbox: { position: 'absolute', top: 7, right: 7, width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, zIndex: 2 },
  cardDetails: { flex: 1.05, minWidth: 0, paddingRight: 8 },
  activityType: { color: '#F7F7F7', fontSize: 18, lineHeight: 22, fontWeight: '800' },
  activityDate: { color: '#A9ADAF', fontSize: 12, lineHeight: 15, marginTop: 2 },
  distance: { color: '#35C72B', fontSize: 24, lineHeight: 28, fontWeight: '900', marginTop: 4 },
  centerMetricsContainer: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  metricRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', marginVertical: 3 },
  metricIcon: { width: 20, alignItems: 'center' },
  metricText: { flex: 1, alignItems: 'flex-start', marginLeft: 4, minWidth: 0 },
  metricValue: { color: '#F7F7F7', fontSize: 12, lineHeight: 15, fontWeight: '900' },
  metricLabel: { color: '#A9ADAF', fontSize: 10, lineHeight: 12, marginTop: 1,width: '100%' },
  mapThumbnailContainer: { position: 'relative', width: '34%', aspectRatio: 1, minWidth: 0, marginLeft: 8, borderRadius: 18, overflow: 'hidden', backgroundColor: '#E5E7EB' },
  mapThumbnailImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  mapPreviewPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5E7EB' },
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
  skeletonCard: { minHeight: 150, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#171A1A', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 12, borderWidth: 1, borderColor: '#243C2B' },
  skeletonMain: { flex: 1, minWidth: 0, paddingRight: 6 },
  skeletonShort: { width: '55%', height: 12, borderRadius: 5, backgroundColor: '#294A32' },
  skeletonTiny: { width: '35%', height: 8, borderRadius: 4, backgroundColor: '#26352A', marginTop: 4 },
  skeletonDistance: { width: '48%', height: 18, borderRadius: 6, backgroundColor: '#245C32', marginTop: 7 },
  skeletonMetrics: { width: '78%', height: 24, borderRadius: 7, backgroundColor: '#202A22', marginTop: 7 },
  skeletonMap: { width: '34%', aspectRatio: 1, minWidth: 0, borderRadius: 18, overflow: 'hidden', backgroundColor: '#202A22' },
  empty: { color: '#A9ADAF', textAlign: 'center', fontSize: 16, marginTop: 40 },
});
