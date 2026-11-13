import { Alert } from '@/components/ThemedAlert';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurTargetView, BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
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
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import ThemedCalendarPicker from '../../../components/common/ThemedCalendarPicker';

import ActivityRouteMap from '../../../components/ActivityRouteMap';
import { RunningLoader } from '../../../components/common/RunningLoader';
import MotionEntrance from '../../../components/MotionEntrance';
import { useTheme } from '../../../contexts/ThemeContext';
import { getBackendErrorMessage, resolveApiUrl } from '../../../service/api';
import { useAuth } from '../../../service/auth';
import { activityAPI, BackendActivity, runRouteAPI } from '../../../src/services/activityApi';
import { shareActivityAsGpx } from '../../../src/services/gpxFileExport';
import {
  getDateFilterStart,
  matchesDateFilter,
  matchesDistanceRange,
  type ActivityDateFilter,
  type ActivityDistanceFilter,
} from '../../../src/utils/activityHistoryFilters';
import {
  formatDistanceFromMeters,
  formatElevationFromMeters,
  formatPaceFromSecondsPerKm,
} from '../../../src/utils/activityUnitFormatters';
import { formatDurationMmSs as formatDuration } from '../../../src/utils/splitFormatters';

const formatActivityType = (activityType: string) =>
  activityType.toLowerCase() === 'walk' ? 'Walk' : 'Run';

const activityDetailRequests = new Map<string, Promise<BackendActivity>>();
const activityDetails = new Map<string, BackendActivity>();
const ACTIVITY_SELECTION_LONG_PRESS_MS = 550;
const getActivityDetailCacheKey = (userId: string | null, activityId: BackendActivity['id']) =>
  `${userId ?? 'anonymous'}:${String(activityId)}`;
const cacheActivityDetail = (key: string, detail: BackendActivity) => {
  activityDetails.delete(key);
  activityDetails.set(key, detail);
  if (activityDetails.size > 6) {
    const oldestKey = activityDetails.keys().next().value;
    if (oldestKey !== undefined) activityDetails.delete(oldestKey);
  }
};
const getNormalizedActivityType = (activityType: string): 'Run' | 'Walk' =>
  activityType.toLowerCase() === 'walk' ? 'Walk' : 'Run';

type ActivityGroupMode = 'month' | 'week';
type FilterPopover = 'type' | 'date' | 'distance';
type ActivityMenuAnchor = { x: number; y: number; width: number; height: number };
type ActivityMenuPosition = { left: number; top: number; width: number };
type FilterPopoverPosition = { left: number; top: number; width: number; maxHeight: number; placement: 'above' | 'below' | 'center'; caretLeft: number; originXPercent: number; originYPercent: number };

type ActivityListRow =
  | { type: 'section'; key: string; title: string; activities: BackendActivity[] }
  | { type: 'day'; key: string; title: string; count: number }
  | { type: 'activity'; key: string; activity: BackendActivity };

const activityDateOptions: { label: string; value: ActivityDateFilter }[] = [
  { label: 'All time', value: 'all' },
  { label: 'Month', value: 'month' },
  { label: 'Year', value: 'year' },
  { label: 'Week', value: 'week' },
  { label: 'Day', value: 'day' },
];

const activityDistanceOptions: { label: string; value: ActivityDistanceFilter }[] = [
  { label: 'Any distance', value: 'all' },
  { label: 'Under 100 m', value: 'under100' },
  { label: '100 m to 1 km', value: 'under1000' },
  { label: 'Over 1 km', value: 'over1000' },
];

const formatDateLabel = (value: Date | null) => {
  if (!value) return 'Select date';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(value);
};

const getLocaleWeekStartDay = () => {
  if (typeof Intl.Locale !== 'function') return 0;

  const locale = new Intl.Locale(new Intl.DateTimeFormat().resolvedOptions().locale) as Intl.Locale & {
    weekInfo?: { firstDay?: number };
    getWeekInfo?: () => { firstDay?: number };
  };
  const firstDay = locale.weekInfo?.firstDay ?? locale.getWeekInfo?.().firstDay;
  return typeof firstDay === 'number' && firstDay >= 1 && firstDay <= 7
    ? firstDay % 7
    : 0;
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
  accountId: string | null;
  blurTarget: RefObject<View | null> | null;
  distanceUnit?: string | null;
  onPress: (activity: BackendActivity) => void;
  onRouteMenu: (activity: BackendActivity, anchor: ActivityMenuAnchor) => void;
  onStartSelection: (activityId: BackendActivity['id']) => void;
  reduceMotion: boolean;
  selectionMode: boolean;
  selected: boolean;
  deleting: boolean;
  busy: boolean;
  savingRoute: boolean;
  isVisible: boolean;
}

const FilterTile = memo(function FilterTile({
  label,
  icon,
  onPress,
  anchorRef,
  accentColor,
  surfaceColor,
  borderColor,
  primaryTextColor,
  isActive,
  showChevron = true,
}: {
  label: string;
  icon: keyof typeof MaterialCommunityIcons['glyphMap'];
  onPress: () => void;
  anchorRef: { current: View | null };
  accentColor: string;
  surfaceColor: string;
  borderColor: string;
  primaryTextColor: string;
  isActive: boolean;
  showChevron?: boolean;
}) {
  return (
    <TouchableOpacity
      ref={anchorRef}
      accessibilityRole="button"
      activeOpacity={0.75}
      onPress={onPress}
      style={[
        styles.filterBarButton,
        {
          backgroundColor: surfaceColor,
          borderColor: isActive ? accentColor : borderColor,
        },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={14} color={isActive ? accentColor : primaryTextColor} />
      <Text numberOfLines={1} style={[styles.filterBarText, { color: primaryTextColor }]}>
        {label}
      </Text>
      {showChevron && <Feather name="chevron-down" size={14} color={primaryTextColor} />}
    </TouchableOpacity>
  );
});

const ActivityCard = memo(function ActivityCard({
  activity,
  accountId,
  blurTarget,
  distanceUnit,
  onPress,
  onRouteMenu,
  onStartSelection,
  reduceMotion,
  selectionMode,
  selected,
  deleting,
  busy,
  savingRoute,
  isVisible,
}: ActivityCardProps) {
  const { colors, isDark } = useTheme();
  const activityName = formatActivityType(activity.activity_type);
  const activityId = activity.id;
  const thumbnailUri = resolveApiUrl(activity.thumbnail_url);
  const isRouteSaved = Boolean(activity.is_saved_to_my_routes || activity.saved_route_id);
  const duration = activity.moving_time || activity.elapsed_time;
  const activityCacheKey = getActivityDetailCacheKey(accountId, activityId);
  const [routeActivity, setRouteActivity] = useState<BackendActivity | null>(() => activityDetails.get(activityCacheKey) ?? null);
  const [failedThumbnailUri, setFailedThumbnailUri] = useState<string | null>(null);
  const thumbnailFailed = thumbnailUri !== null && failedThumbnailUri === thumbnailUri;
  const longPressHandledRef = useRef(false);
  const longPressRecognizedRef = useRef(false);
  const longPressProgressFinishedRef = useRef(false);
  const selectionGestureStartedRef = useRef(false);
  const routeMenuButtonRef = useRef<View>(null);
  const [isLongPressProgressVisible, setIsLongPressProgressVisible] = useState(false);
  const [longPressProgress] = useState(() => new Animated.Value(0));
  const [selectionScale] = useState(() => new Animated.Value(1));
  const [selectionControlOpacity] = useState(() => new Animated.Value(0));
  const [selectionControlScale] = useState(() => new Animated.Value(0.78));
  useEffect(() => () => longPressProgress.stopAnimation(), [longPressProgress]);

  useEffect(() => {
    Animated.spring(selectionScale, {
      toValue: selected ? 0.99 : 1,
      damping: 18,
      stiffness: 220,
      useNativeDriver: true,
    }).start();
  }, [selected, selectionScale]);

  useEffect(() => {
    if (!selectionMode) {
      selectionControlOpacity.setValue(0);
      selectionControlScale.setValue(0.78);
      return;
    }
    if (reduceMotion) {
      selectionControlOpacity.setValue(1);
      selectionControlScale.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.timing(selectionControlOpacity, {
        toValue: 1,
        duration: 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(selectionControlScale, {
        toValue: 1,
        damping: 16,
        stiffness: 240,
        useNativeDriver: true,
      }),
    ]).start();
  }, [reduceMotion, selectionControlOpacity, selectionControlScale, selectionMode]);

  useEffect(() => {
    if (!isVisible || routeActivity || (thumbnailUri && !thumbnailFailed)) return;
    let cancelled = false;
    let activeRequest: Promise<BackendActivity> | null = null;
    const loadRoute = async () => {
      try {
        const key = activityCacheKey;
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
        activeRequest = detailRequest;
        const detail = await detailRequest;
        if (activityDetailRequests.get(key) === detailRequest) cacheActivityDetail(key, detail);
        if (!cancelled) setRouteActivity(detail);
      } catch (error) {
        console.warn('[ActivityHistory] Could not load route thumbnail', error);
      } finally {
        if (activeRequest && activityDetailRequests.get(activityCacheKey) === activeRequest) {
          activityDetailRequests.delete(activityCacheKey);
        }
      }
    };
    void loadRoute();
    return () => { cancelled = true; };
  }, [activityCacheKey, activityId, isVisible, routeActivity, thumbnailFailed, thumbnailUri]);

  const handleCardPress = () => {
    if (longPressHandledRef.current) {
      longPressHandledRef.current = false;
      return;
    }
    onPress(activity);
  };

  const handleStartSelection = useCallback(() => {
    if (selectionGestureStartedRef.current) return;
    selectionGestureStartedRef.current = true;
    longPressHandledRef.current = true;
    setIsLongPressProgressVisible(false);
    onStartSelection(activityId);
    if (Platform.OS === 'android') {
      Vibration.vibrate(12);
    } else {
      void Haptics.selectionAsync()
        .catch((hapticError: unknown) => console.warn('[ActivityHistory] Selection haptic unavailable', hapticError));
    }
  }, [activityId, onStartSelection]);

  const beginLongPressProgress = useCallback(() => {
    longPressRecognizedRef.current = false;
    longPressProgressFinishedRef.current = false;
    selectionGestureStartedRef.current = false;
    setIsLongPressProgressVisible(true);
    longPressProgress.stopAnimation();
    longPressProgress.setValue(0);
    Animated.timing(longPressProgress, {
      toValue: 1,
      duration: ACTIVITY_SELECTION_LONG_PRESS_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      longPressProgressFinishedRef.current = true;
      if (longPressRecognizedRef.current) handleStartSelection();
    });
  }, [handleStartSelection, longPressProgress]);

  const handleLongPressRecognition = useCallback(() => {
    longPressRecognizedRef.current = true;
    longPressHandledRef.current = true;
    if (longPressProgressFinishedRef.current) handleStartSelection();
  }, [handleStartSelection]);

  const finishLongPressProgress = useCallback((success: boolean) => {
    if (success || selectionGestureStartedRef.current) return;

    longPressRecognizedRef.current = false;
    longPressProgressFinishedRef.current = false;
    longPressProgress.stopAnimation();
    Animated.timing(longPressProgress, {
      toValue: 0,
      duration: 120,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setIsLongPressProgressVisible(false);
    });
  }, [longPressProgress]);

  /* eslint-disable react-hooks/immutability, react-hooks/refs */
  const selectionGesture = useMemo(
    () => Gesture.LongPress()
      .enabled(!busy && !selectionMode)
      .minDuration(ACTIVITY_SELECTION_LONG_PRESS_MS)
      .maxDistance(12)
      .onBegin(() => {
        scheduleOnRN(beginLongPressProgress);
      })
      .onStart(() => {
        scheduleOnRN(handleLongPressRecognition);
      })
      .onFinalize((_event, success) => {
        scheduleOnRN(finishLongPressProgress, success);
      }),
    [beginLongPressProgress, busy, finishLongPressProgress, handleLongPressRecognition, selectionMode],
  );
  /* eslint-enable react-hooks/immutability, react-hooks/refs */

  return (
    <GestureDetector gesture={selectionGesture}>
      <View>
      <Animated.View
        style={[
          styles.card,
          isRouteSaved && styles.cardExpanded,
          {
            backgroundColor: 'transparent',
            borderColor: selected ? '#DC2626' : colors.border,
            borderWidth: selected ? 2 : 1,
          },
          {
            transform: [{ scale: selectionScale }],
          },
        ]}
      >
      <BlurView
        intensity={40}
        tint={isDark ? 'dark' : 'light'}
        blurTarget={blurTarget ?? undefined}
        blurMethod={Platform.OS === 'android' ? 'dimezisBlurViewSdk31Plus' : undefined}
        blurReductionFactor={Platform.OS === 'android' ? 3 : undefined}
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: selected
              ? (isDark ? 'rgba(86, 38, 40, 0.62)' : 'rgba(254, 242, 242, 0.72)')
              : (isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(255, 255, 255, 0.48)'),
          },
        ]}
      />
      <TouchableOpacity
        style={[styles.cardContent, styles.cardContentWithMenu]}
        accessibilityRole="button"
        accessibilityLabel={`${activityName} activity, ${formatDistanceFromMeters(activity.distance, distanceUnit)}, ${formatDuration(duration)}, ${formatPaceFromSecondsPerKm(activity.avg_pace, distanceUnit)}, elevation gain ${formatElevationFromMeters(activity.elevation_gain, distanceUnit)}, elevation loss ${formatElevationFromMeters(activity.elevation_loss, distanceUnit)}`}
        accessibilityHint={selectionMode ? 'Tap to select or deselect this activity for deletion.' : 'Open activity details, or long press to select this activity for deletion.'}
        onPress={handleCardPress}
        onPressIn={() => { longPressHandledRef.current = false; }}
        activeOpacity={0.82}
        disabled={busy}
      >
        <View style={styles.cardDetails}>
          <Text style={[styles.activityType, { color: colors.text }]}>{activityName}</Text>
          <Text
            style={[styles.distance, { color: colors.primary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {formatDistanceFromMeters(activity.distance, distanceUnit)}
          </Text>
          <View style={styles.metricSummaryRow}>
            <View style={styles.metricSummaryItem}>
              <Feather name="clock" size={13} color={colors.primary} />
              <Text style={[styles.metricSummaryText, { color: colors.text }]} numberOfLines={1}>
                {formatDuration(duration)}
              </Text>
            </View>
            <View style={styles.metricSummaryItem}>
              <Feather name="compass" size={13} color={colors.primary} />
              <Text style={[styles.metricSummaryText, { color: colors.text }]} numberOfLines={1}>
                {formatPaceFromSecondsPerKm(activity.avg_pace, distanceUnit)}
              </Text>
            </View>
          </View>
          <View style={styles.metricSummaryRow}>
            <View style={styles.metricSummaryItem}>
              <Feather name="trending-up" size={13} color={colors.primary} />
              <Text style={[styles.metricSummaryText, { color: colors.text }]} numberOfLines={1}>
                +{formatElevationFromMeters(activity.elevation_gain, distanceUnit)}
              </Text>
            </View>
            <View style={styles.metricSummaryItem}>
              <Feather name="trending-down" size={13} color={colors.primary} />
              <Text style={[styles.metricSummaryText, { color: colors.text }]} numberOfLines={1}>
                −{formatElevationFromMeters(activity.elevation_loss, distanceUnit)}
              </Text>
            </View>
          </View>
        </View>

        <View pointerEvents="none" style={[styles.mapThumbnailContainer, styles.mapThumbnailWithMenu]}>
          {thumbnailUri && !thumbnailFailed ? (
            <ExpoImage
              source={{ uri: thumbnailUri }}
              style={styles.mapThumbnailImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={reduceMotion ? 0 : 120}
              accessibilityLabel={`${activityName} route map`}
              onError={() => setFailedThumbnailUri(thumbnailUri)}
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
            />
          ) : (
            <View style={styles.mapPreviewPlaceholder}>
              <Feather name="map" size={20} color="#6B7280" />
            </View>
          )}

          <View pointerEvents="none" style={styles.mapOverlayTop}>
            <View style={styles.mapBadge}>
              <MaterialCommunityIcons
                name={activityName === 'Walk' ? 'run' : 'run-fast'}
                size={14}
                color="#F7F7F7"
              />
            </View>
          </View>
        </View>
      </TouchableOpacity>
      {!selectionMode ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={isRouteSaved ? 'Manage saved route' : 'Activity options'}
          accessibilityHint={isRouteSaved
            ? 'Export the workout route or change its visibility.'
            : 'Export the workout route or save it to My Routes.'}
          disabled={busy}
          onPress={(event) => {
            event.stopPropagation();
            routeMenuButtonRef.current?.measureInWindow((x, y, width, height) => {
              onRouteMenu(activity, { x, y, width, height });
            });
          }}
          ref={routeMenuButtonRef}
          style={[styles.routeMenuButton, busy && styles.routeMenuButtonDisabled]}
        >
          {savingRoute
            ? <RunningLoader size={18} fillColor={colors.primary} />
            : (
              <Ionicons
                name={isRouteSaved ? 'bookmark' : 'ellipsis-horizontal-circle-outline'}
                size={21}
                color={isRouteSaved ? colors.primary : colors.textSecondary}
              />
            )}
        </TouchableOpacity>
      ) : null}
      {!selectionMode && isRouteSaved ? (
        <View style={[styles.routeSavedStatus, { borderTopColor: colors.border }]}>
          <Feather name="check-circle" size={15} color={colors.primary} />
          <Text style={[styles.routeSavedText, { color: colors.textSecondary }]}>Saved to My Routes</Text>
        </View>
      ) : null}
      {isLongPressProgressVisible && !selectionMode ? (
        <View
          pointerEvents="none"
          style={[
            styles.longPressProgressTrack,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)' },
          ]}
        >
          <Animated.View
            style={[
              styles.longPressProgressFill,
              {
                backgroundColor: colors.primary,
                transform: [{ scaleX: longPressProgress }],
              },
            ]}
          />
        </View>
      ) : null}
      {selectionMode && (
        <Animated.View
          style={[
            styles.cardCheckboxMotion,
            {
              opacity: selectionControlOpacity,
              transform: [{ scale: selectionControlScale }],
            },
          ]}
        >
          <TouchableOpacity
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected, disabled: busy }}
            accessibilityLabel={`${selected ? 'Deselect' : 'Select'} ${activityName.toLowerCase()} activity for deletion`}
            disabled={busy}
            onPress={() => onPress(activity)}
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
        </Animated.View>
      )}
      </Animated.View>
      </View>
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
  const glassTargetRef = useRef<View | null>(null);
  const { user } = useAuth();
  const weekStartDay = useMemo(() => getLocaleWeekStartDay(), []);
  const userId = user?.id == null ? null : String(user.id);
  const distanceUnit = user?.profile?.distance_unit;
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [activities, setActivities] = useState<BackendActivity[]>([]);
  const [savingActivityIds, setSavingActivityIds] = useState<Set<string>>(() => new Set());
  const [exportingActivityIds, setExportingActivityIds] = useState<Set<string>>(() => new Set());
  const [pendingSaveActivity, setPendingSaveActivity] = useState<BackendActivity | null>(null);
  const [activityOptionsActivity, setActivityOptionsActivity] = useState<BackendActivity | null>(null);
  const [activityOptionsMessage, setActivityOptionsMessage] = useState<string | null>(null);
  const [visibleActivityIds, setVisibleActivityIds] = useState<Set<string>>(() => new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedActivityIds, setSelectedActivityIds] = useState<Set<string>>(() => new Set());
  const [pendingDeleteActivities, setPendingDeleteActivities] = useState<BackendActivity[] | null>(null);
  const groupMode: ActivityGroupMode = 'month';
  const [selectionToast, setSelectionToast] = useState<string | null>(null);
  const [deletingActivityIds, setDeletingActivityIds] = useState<Set<string>>(() => new Set());
  const [isDeletingActivities, setIsDeletingActivities] = useState(false);
  const [selectedType, setSelectedType] = useState('All types');
  const [selectedDateFilter, setSelectedDateFilter] = useState<ActivityDateFilter>('all');
  const [filterDate, setFilterDate] = useState(() => new Date());
  const [selectedDistanceRange, setSelectedDistanceRange] = useState<ActivityDistanceFilter>('all');
  const [showNativeDatePicker, setShowNativeDatePicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalHistoryCount, setTotalHistoryCount] = useState<number | null>(null);
  const cursorRef = useRef<string | null>(null);
  const dateFilterAutoLoadKeyRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const loadingFirstPageRef = useRef(false);
  const hasLoadedHistoryRef = useRef(false);
  const requestIdRef = useRef(0);
  const activeAccountIdRef = useRef(userId);
  const activityListRef = useRef<FlatList<ActivityListRow>>(null);
  const activityViewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 10, minimumViewTime: 80 }), []);
  const selectionToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectionToolbarOpacity] = useState(() => new Animated.Value(0));
  const [selectionToolbarTranslateY] = useState(() => new Animated.Value(8));
  const [activeFilterPopover, setActiveFilterPopover] = useState<FilterPopover | null>(null);
  const [filterPopoverPosition, setFilterPopoverPosition] = useState<FilterPopoverPosition>({ left: 12, top: 72, width: 280, maxHeight: 420, placement: 'below', caretLeft: 24, originXPercent: 50, originYPercent: 50 });
  const [activityOptionsPosition, setActivityOptionsPosition] = useState<ActivityMenuPosition>({ left: 12, top: 72, width: 240 });
  const filterPopoverScale = useRef(new Animated.Value(0.78)).current;
  const filterPopoverOffset = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const typeFilterAnchorRef = useRef<View>(null);
  const dateFilterAnchorRef = useRef<View>(null);
  const distanceFilterAnchorRef = useRef<View>(null);
  const datePickerAnchorRef = useRef<View>(null);
  const activityTypeOptions = useMemo(() => [
    { label: 'All types', value: 'All types' },
    ...Array.from(new Set(activities.map((activity) => getNormalizedActivityType(activity.activity_type))))
      .sort((first, second) => first.localeCompare(second))
      .map((type) => ({ label: type, value: type })),
  ], [activities]);

  useEffect(() => {
    activityListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [filterDate, selectedDateFilter, selectedDistanceRange, selectedType]);

  useEffect(() => {
    if (activeAccountIdRef.current === userId) return;

    activeAccountIdRef.current = userId;
    requestIdRef.current += 1;
    hasLoadedHistoryRef.current = false;
    loadingFirstPageRef.current = false;
    loadingMoreRef.current = false;
    cursorRef.current = null;
    dateFilterAutoLoadKeyRef.current = null;
    activityDetails.clear();
    activityDetailRequests.clear();

    setActivities([]);
    setVisibleActivityIds(new Set());
    setSelectedActivityIds(new Set());
    setSelectionMode(false);
    setTotalHistoryCount(null);
    setHasMore(true);
    setLoadingMore(false);
    setLoading(Boolean(userId));
    setError(null);
  }, [userId]);

  const openFilterPopover = useCallback((filter: FilterPopover, anchorRef: { current: View | null }, contentHeight: number) => {
    anchorRef.current?.measureInWindow((x, y, anchorWidth, anchorHeight) => {
      const horizontalMargin = 12;
      const leftLimit = insets.left + horizontalMargin;
      const rightLimit = windowWidth - insets.right - horizontalMargin;
      const width = Math.min(filter === 'date' ? 310 : 232, rightLimit - leftLimit);
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

      const anchorCenterX = x + anchorWidth / 2;
      const anchorCenterY = y + anchorHeight / 2;
      const modalCenterX = left + width / 2;
      const modalCenterY = top + maxHeight / 2;
      const startTranslateX = (anchorCenterX - modalCenterX) * 1.08;
      const startTranslateY = (anchorCenterY - modalCenterY) * 1.08;
      const originXPercent = Math.min(88, Math.max(12, ((anchorCenterX - left) / width) * 100));
      const originYPercent = Math.min(88, Math.max(12, ((anchorCenterY - top) / maxHeight) * 100));
      const caretLeft = Math.max(12, Math.min(anchorCenterX - left - 8, width - 12));

      filterPopoverScale.setValue(0.94);
      filterPopoverOffset.setValue({ x: startTranslateX, y: startTranslateY });

      Animated.parallel([
        Animated.timing(filterPopoverScale, {
          toValue: 1,
          duration: reduceMotion ? 0 : 160,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(filterPopoverOffset.x, {
          toValue: 0,
          duration: reduceMotion ? 0 : 160,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(filterPopoverOffset.y, {
          toValue: 0,
          duration: reduceMotion ? 0 : 160,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();

      setFilterPopoverPosition({
        left,
        top,
        width,
        maxHeight,
        placement,
        caretLeft,
        originXPercent,
        originYPercent,
      });
      setActiveFilterPopover(filter);
    });
  }, [filterPopoverOffset, filterPopoverScale, insets.bottom, insets.left, insets.right, insets.top, reduceMotion, windowHeight, windowWidth]);

  useEffect(() => {
    if (!activeFilterPopover) {
      filterPopoverScale.setValue(0.94);
      filterPopoverOffset.setValue({ x: 0, y: 0 });
    }
  }, [activeFilterPopover, filterPopoverOffset, filterPopoverScale]);

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
    if (selectionMode) {
      if (reduceMotion) {
        selectionToolbarOpacity.setValue(1);
        selectionToolbarTranslateY.setValue(0);
        return;
      }
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
      ]).start();
      return;
    }

    selectionToolbarOpacity.setValue(0);
    selectionToolbarTranslateY.setValue(8);
  }, [reduceMotion, selectionMode, selectionToolbarOpacity, selectionToolbarTranslateY]);

  const loadFirstPage = useCallback(async () => {
    if (!userId) {
      setActivities([]);
      setLoading(false);
      return;
    }

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
  }, [showSelectionToast, userId]);

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
    const filterStart = getDateFilterStart(selectedDateFilter, filterDate, weekStartDay);
    const needsFullHistory = selectionMode || selectedType !== 'All types' || selectedDistanceRange !== 'all';
    if ((filterStart === null && !needsFullHistory) || !hasMore || loading || loadingMore) return;
    if (filterStart !== null && historyIsLoadedThroughDate(activities, filterStart)) return;

    const attemptKey = `${filterStart ?? 'all'}:${cursorRef.current ?? 'first'}`;
    if (dateFilterAutoLoadKeyRef.current === attemptKey) return;
    dateFilterAutoLoadKeyRef.current = attemptKey;
    void loadMore();
  }, [activities, filterDate, hasMore, loadMore, loading, loadingMore, selectedDateFilter, selectedDistanceRange, selectedType, selectionMode, weekStartDay]);

  const visibleActivities = useMemo(() => {
    if (activeAccountIdRef.current !== userId) return [];
    let filtered = [...activities];

    if (selectedType !== 'All types') {
      filtered = filtered.filter((activity) => getNormalizedActivityType(activity.activity_type) === selectedType);
    }

    if (selectedDateFilter !== 'all') {
      filtered = filtered.filter((activity) => matchesDateFilter(activity, selectedDateFilter, filterDate, weekStartDay));
    }

    if (selectedDistanceRange !== 'all') {
      filtered = filtered.filter((activity) => matchesDistanceRange(activity, selectedDistanceRange));
    }

    return sortActivities(filtered);
  }, [activities, filterDate, selectedDateFilter, selectedDistanceRange, selectedType, userId, weekStartDay]);

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

  const enterActivitySelection = useCallback((activityId?: BackendActivity['id']) => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    selectionToolbarOpacity.setValue(reduceMotion ? 1 : 0);
    selectionToolbarTranslateY.setValue(reduceMotion ? 0 : 8);
    setSelectionMode(true);
    setSelectedActivityIds(activityId === undefined ? new Set() : new Set([String(activityId)]));
  }, [reduceMotion, selectionToolbarOpacity, selectionToolbarTranslateY]);

  const startActivitySelection = useCallback((activityId: BackendActivity['id']) => {
    enterActivitySelection(activityId);
  }, [enterActivitySelection]);

  const cancelActivitySelection = useCallback(() => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectionMode(false);
    setSelectedActivityIds(new Set());
  }, [reduceMotion]);

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

  const saveActivityRoute = useCallback(async (activity: BackendActivity, isPublic: boolean) => {
    const activityKey = String(activity.id);
    if (activity.is_saved_to_my_routes || savingActivityIds.has(activityKey)) return;
    setSavingActivityIds((current) => new Set(current).add(activityKey));
    try {
      const { routeId } = await activityAPI.saveRoute(activity.id);
      if (isPublic && routeId === null) {
        setActivities((current) => current.map((item) => String(item.id) === activityKey
          ? { ...item, is_saved_to_my_routes: true }
          : item));
        setPendingSaveActivity(null);
        Alert.alert(
          'Route saved privately',
          'The route was saved, but the server did not return its route ID, so it could not be published.'
        );
        return;
      }

      if (isPublic && routeId !== null) {
        try {
          await runRouteAPI.setVisibility(routeId, true);
        } catch (visibilityError) {
          setActivities((current) => current.map((item) => String(item.id) === activityKey
            ? { ...item, is_saved_to_my_routes: true, saved_route_id: routeId }
            : item));
          setPendingSaveActivity(null);
          Alert.alert(
            'Route saved privately',
            `The route was saved, but could not be published. ${getBackendErrorMessage(visibilityError, 'Try again from My Routes.')}`
          );
          return;
        }
      }

      setActivities((current) => current.map((item) => String(item.id) === activityKey
        ? { ...item, is_saved_to_my_routes: true, saved_route_id: routeId }
        : item));
      setPendingSaveActivity(null);
      showSelectionToast(`Route saved ${isPublic ? 'publicly' : 'privately'} to My Routes.`);
    } catch (requestError) {
      Alert.alert('Could not save route', getBackendErrorMessage(requestError, 'Please try again.'));
    } finally {
      setSavingActivityIds((current) => {
        const next = new Set(current);
        next.delete(activityKey);
        return next;
      });
    }
  }, [savingActivityIds, showSelectionToast]);

  const updateActivityRouteVisibility = useCallback(async (
    activity: BackendActivity,
    routeId: number,
    isPublic: boolean,
  ) => {
    const activityKey = String(activity.id);
    if (savingActivityIds.has(activityKey)) return;
    setSavingActivityIds((current) => new Set(current).add(activityKey));
    try {
      await runRouteAPI.setVisibility(routeId, isPublic);
      setActivities((current) => current.map((item) => String(item.id) === activityKey
        ? { ...item, is_saved_to_my_routes: true, saved_route_id: routeId, saved_route_is_public: isPublic }
        : item));
      setPendingSaveActivity(null);
      showSelectionToast(`Route made ${isPublic ? 'public' : 'private'}.`);
    } catch (requestError) {
      Alert.alert('Could not change route visibility', getBackendErrorMessage(requestError, 'Please try again.'));
    } finally {
      setSavingActivityIds((current) => {
        const next = new Set(current);
        next.delete(activityKey);
        return next;
      });
    }
  }, [savingActivityIds, showSelectionToast]);

  const exportActivityGpx = useCallback(async (activity: BackendActivity) => {
    const activityKey = String(activity.id);
    if (exportingActivityIds.has(activityKey)) return;
    setExportingActivityIds((current) => new Set(current).add(activityKey));
    try {
      const detail = await activityAPI.get(activity.id);
      await shareActivityAsGpx(detail);
    } catch (exportError) {
      const message = exportError instanceof Error
        ? exportError.message
        : 'Could not export this activity as GPX.';
      Alert.alert('Could not export GPX', message);
    } finally {
      setExportingActivityIds((current) => {
        const next = new Set(current);
        next.delete(activityKey);
        return next;
      });
    }
  }, [exportingActivityIds]);

  const closeActivityOptions = useCallback(() => {
    setActivityOptionsActivity(null);
    setActivityOptionsMessage(null);
  }, []);

  const openActivityRouteMenu = useCallback((activity: BackendActivity, anchor: ActivityMenuAnchor) => {
    const routeId = Number(activity.saved_route_id);
    const hasRouteId = Number.isInteger(routeId) && routeId > 0;
    const menuWidth = Math.min(256, windowWidth - insets.left - insets.right - 24);
    const hasRouteAction = !activity.is_saved_to_my_routes || hasRouteId;
    const menuHeight = hasRouteAction ? 112 : 96;
    const leftLimit = insets.left + 12;
    const rightLimit = windowWidth - insets.right - 12;
    const left = Math.max(leftLimit, Math.min(anchor.x + anchor.width - menuWidth, rightLimit - menuWidth));
    const topLimit = insets.top + 8;
    const bottomLimit = windowHeight - insets.bottom - 8;
    const below = anchor.y + anchor.height + 4;
    const top = below + menuHeight <= bottomLimit
      ? below
      : Math.max(topLimit, anchor.y - menuHeight - 4);
    setActivityOptionsPosition({ left, top, width: menuWidth });
    setActivityOptionsMessage(
      activity.is_saved_to_my_routes && !hasRouteId
        ? 'This route is saved, but its route ID is missing from the History response.'
        : null,
    );
    setActivityOptionsActivity(activity);
  }, [insets.bottom, insets.left, insets.right, insets.top, windowHeight, windowWidth]);

  const changeActivityRouteVisibility = useCallback((activity: BackendActivity) => {
    closeActivityOptions();
    setPendingSaveActivity(activity);
  }, [closeActivityOptions]);

  const deleteActivities = useCallback(async (targets: BackendActivity[]) => {
    if (targets.length === 0 || isDeletingActivities) return;

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
    setIsDeletingActivities(false);
    setSelectionMode(false);
    setSelectedActivityIds(new Set());
    activityListRef.current?.scrollToOffset({ offset: 0, animated: false });
    AccessibilityInfo.announceForAccessibility(targets.length === 1 ? 'Activity deleted.' : `${targets.length} activities deleted.`);
    showSelectionToast(targets.length === 1 ? 'Workout deleted.' : `${targets.length} workouts deleted.`);
  }, [isDeletingActivities, showSelectionToast]);

  const confirmDeleteActivities = useCallback((targets: BackendActivity[]) => {
    if (targets.length === 0) {
      showSelectionToast('Please select at least one activity to delete.');
      return;
    }
    setPendingDeleteActivities(targets);
  }, [showSelectionToast]);

  const confirmDeleteSelected = useCallback(() => {
    confirmDeleteActivities(selectedActivities);
  }, [confirmDeleteActivities, selectedActivities]);

  const handleActivityPress = useCallback((activity: BackendActivity) => {
    if (selectionMode) {
      toggleActivitySelection(activity.id);
      return;
    }
    router.push({
      pathname: '/(app)/activity/[id]',
      params: {
        id: String(activity.id),
        ...(activity.saved_route_id ? { savedRouteId: String(activity.saved_route_id) } : {}),
      },
    } as any);
  }, [selectionMode, toggleActivitySelection]);

  const renderActivityRow = useCallback(({ item }: { item: ActivityListRow }) => {
    if (item.type === 'section') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{item.title}</Text>
          <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>{item.activities.length}</Text>
        </View>
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
        accountId={userId}
        blurTarget={glassTargetRef}
        distanceUnit={distanceUnit}
        onPress={handleActivityPress}
        onRouteMenu={openActivityRouteMenu}
        onStartSelection={startActivitySelection}
        reduceMotion={reduceMotion}
        isVisible={visibleActivityIds.has(String(activity.id))}
        selectionMode={selectionMode}
        selected={selectedActivityIds.has(String(activity.id))}
        deleting={deletingActivityIds.has(String(activity.id))}
        busy={isDeletingActivities || savingActivityIds.has(String(activity.id)) || exportingActivityIds.has(String(activity.id))}
        savingRoute={savingActivityIds.has(String(activity.id))}
      />
    );
  }, [
    colors.text,
    colors.textSecondary,
    colors.textTertiary,
    distanceUnit,
    userId,
    glassTargetRef,
    deletingActivityIds,
    exportingActivityIds,
    isDeletingActivities,
    handleActivityPress,
    openActivityRouteMenu,
    reduceMotion,
    savingActivityIds,
    visibleActivityIds,
    selectedActivityIds,
    selectionMode,
    startActivitySelection,
  ]);

  const footerCountText = useMemo(() => {
    const loadedCount = activities.length;
    if (!totalHistoryCount || totalHistoryCount <= loadedCount) {
      return `${loadedCount} loaded`;
    }
    return `${loadedCount} of ${totalHistoryCount} loaded`;
  }, [activities.length, totalHistoryCount]);

  const listExtraData = useMemo(
    () => ({
      selectionMode,
      selectedActivityIds,
      deletingActivityIds,
      exportingActivityIds,
      isDeletingActivities,
      groupMode,
      selectedType,
      selectedDateFilter,
      filterDate,
      selectedDistanceRange,
      visibleActivities,
    }),
    [
      deletingActivityIds,
      exportingActivityIds,
      groupMode,
      isDeletingActivities,
      filterDate,
      selectedActivityIds,
      selectedDateFilter,
      selectedDistanceRange,
      selectedType,
      selectionMode,
      visibleActivities,
    ],
  );

  const optionsActivity = activityOptionsActivity;
  const optionsRouteId = Number(optionsActivity?.saved_route_id);
  const hasOptionsRouteId = Number.isInteger(optionsRouteId) && optionsRouteId > 0;
  const optionsRouteIsSaved = Boolean(optionsActivity?.is_saved_to_my_routes || hasOptionsRouteId);
  const pendingRouteId = Number(pendingSaveActivity?.saved_route_id);
  const hasPendingRouteId = Number.isInteger(pendingRouteId) && pendingRouteId > 0;
  const pendingRouteIsSaved = Boolean(
    pendingSaveActivity?.is_saved_to_my_routes
    || hasPendingRouteId,
  );
  const pendingVisibilityBusy = Boolean(
    pendingSaveActivity && savingActivityIds.has(String(pendingSaveActivity.id)),
  );

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <BlurTargetView ref={glassTargetRef} pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
      </BlurTargetView>
      <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: 'transparent' }]}>
      <View style={styles.screenContent}>
      <StatusBar barStyle={colors.background === '#F8FAFC' ? 'dark-content' : 'light-content'} />
      <View style={styles.heading}>
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <Text style={[styles.title, { color: colors.text }]}>Workout History</Text>
            {!selectionMode && <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Your completed runs and walks</Text>}
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={selectionMode ? 'Cancel selection' : 'Select workouts to delete'}
            accessibilityState={{ disabled: isDeletingActivities }}
            disabled={isDeletingActivities}
            onPress={selectionMode ? cancelActivitySelection : () => enterActivitySelection()}
            style={styles.selectionModeAction}
          >
            <Text style={[styles.selectionModeActionText, { color: colors.primary }]}>
              {selectionMode ? 'Cancel' : 'Select'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <MotionEntrance delay={45}>
        <View style={styles.filterRowBar}>
          <FilterTile
            label={activityTypeOptions.find((option) => option.value === selectedType)?.label ?? 'All types'}
            icon="run"
            onPress={() => openFilterPopover('type', typeFilterAnchorRef, 210)}
            anchorRef={typeFilterAnchorRef}
            accentColor={colors.primary}
            surfaceColor={colors.surface}
            borderColor={colors.border}
            primaryTextColor={colors.text}
            isActive={selectedType !== 'All types'}
          />
          <FilterTile
            label={activityDateOptions.find((option) => option.value === selectedDateFilter)?.label ?? 'All time'}
            icon="calendar-month"
            onPress={() => openFilterPopover('date', dateFilterAnchorRef, 250)}
            anchorRef={dateFilterAnchorRef}
            accentColor={colors.primary}
            surfaceColor={colors.surface}
            borderColor={colors.border}
            primaryTextColor={colors.text}
            isActive={selectedDateFilter !== 'all'}
          />
          <FilterTile
            label={activityDistanceOptions.find((option) => option.value === selectedDistanceRange)?.label ?? 'Any distance'}
            icon="ruler"
            onPress={() => openFilterPopover('distance', distanceFilterAnchorRef, 280)}
            anchorRef={distanceFilterAnchorRef}
            accentColor={colors.primary}
            surfaceColor={colors.surface}
            borderColor={colors.border}
            primaryTextColor={colors.text}
            isActive={selectedDistanceRange !== 'all'}
          />
          {selectedDateFilter !== 'all' && (
            <FilterTile
              label={formatDateLabel(filterDate)}
              icon="calendar-month"
              onPress={() => setShowNativeDatePicker(true)}
              anchorRef={datePickerAnchorRef}
              accentColor={colors.primary}
              surfaceColor={colors.surface}
              borderColor={colors.border}
              primaryTextColor={colors.text}
              isActive
              showChevron={false}
            />
          )}
        </View>
      </MotionEntrance>

      {selectionMode && (
        <Animated.View
          style={[
            styles.selectionToolbar,
            {
              opacity: selectionToolbarOpacity,
              transform: [{ translateY: selectionToolbarTranslateY }],
            },
          ]}
        >
          <View style={styles.selectionToolbarActions}>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={isDeletingActivities || loadingMore || visibleActivities.length === 0}
              onPress={toggleAllVisibleSelection}
              style={styles.selectionAllButton}
            >
              <Text style={[styles.selectionToolbarButtonText, { color: colors.primary }]}>
                {visibleActivities.length > 0 && visibleActivities.every((activity) => selectedActivityIds.has(String(activity.id)))
                  ? 'Deselect All'
                  : 'Select All'}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.selectionCount, { color: colors.textSecondary }]}>
              {selectedActivities.length} selected
            </Text>
          </View>
          {selectedActivities.length > 0 && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Delete ${selectedActivities.length} selected workouts`}
              accessibilityState={{ disabled: isDeletingActivities, busy: isDeletingActivities }}
              disabled={isDeletingActivities}
              onPress={() => void confirmDeleteSelected()}
              style={styles.deleteSelectedButton}
            >
              {isDeletingActivities
                ? <RunningLoader size={18} fillColor="#FFFFFF" />
                : <Feather name="trash-2" size={18} color="#FFFFFF" />}
              <Text style={styles.deleteSelectedButtonText}>
                {isDeletingActivities ? 'Deleting…' : `Delete ${selectedActivities.length} selected`}
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      <Modal transparent visible={activeFilterPopover === 'type'} animationType="fade" onRequestClose={() => setActiveFilterPopover(null)}>
        <View style={styles.filterPopoverBackdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close activity type filter" onPress={() => setActiveFilterPopover(null)} style={StyleSheet.absoluteFill} />
          <Animated.View style={{
            position: 'absolute',
            left: filterPopoverPosition.left,
            top: filterPopoverPosition.top,
            width: filterPopoverPosition.width,
            maxHeight: filterPopoverPosition.maxHeight,
            transform: [
              { translateX: filterPopoverOffset.x },
              { translateY: filterPopoverOffset.y },
            ],
          }}>
            <Animated.View style={{
              width: filterPopoverPosition.width,
              maxHeight: filterPopoverPosition.maxHeight,
              transform: [{ scale: filterPopoverScale }],
              transformOrigin: `${filterPopoverPosition.originXPercent}% ${filterPopoverPosition.originYPercent}%`,
            }}>
              <View style={[styles.filterPopoverCard, { width: filterPopoverPosition.width, maxHeight: filterPopoverPosition.maxHeight, backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ScrollView style={[styles.filterPopoverScroll, { maxHeight: filterPopoverPosition.maxHeight }]} contentContainerStyle={styles.filterPopoverScrollContent} showsVerticalScrollIndicator={false}>
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
                      style={[styles.optionRow, { backgroundColor: active ? colors.selected : 'transparent' }]}
                    >
                      <Text style={[styles.optionText, { color: active ? colors.primary : colors.text }]}>{option.label}</Text>
                      {active && <Feather name="check" size={16} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {filterPopoverPosition.placement !== 'center' ? (
                <View style={[styles.filterPopoverCaret, filterPopoverPosition.placement === 'above' ? styles.filterPopoverCaretBelow : styles.filterPopoverCaretAbove, { left: filterPopoverPosition.caretLeft, backgroundColor: colors.surface }]} />
              ) : null}
              </View>
            </Animated.View>
          </Animated.View>
        </View>
      </Modal>

      <Modal transparent visible={activeFilterPopover === 'date'} animationType="fade" onRequestClose={() => setActiveFilterPopover(null)}>
        <View style={styles.filterPopoverBackdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close date filter" onPress={() => setActiveFilterPopover(null)} style={StyleSheet.absoluteFill} />
          <Animated.View style={{
            position: 'absolute',
            left: filterPopoverPosition.left,
            top: filterPopoverPosition.top,
            width: filterPopoverPosition.width,
            maxHeight: filterPopoverPosition.maxHeight,
            transform: [
              { translateX: filterPopoverOffset.x },
              { translateY: filterPopoverOffset.y },
            ],
          }}>
            <Animated.View style={{
              width: filterPopoverPosition.width,
              maxHeight: filterPopoverPosition.maxHeight,
              transform: [{ scale: filterPopoverScale }],
              transformOrigin: `${filterPopoverPosition.originXPercent}% ${filterPopoverPosition.originYPercent}%`,
            }}>
              <View style={[styles.filterPopoverCard, { width: filterPopoverPosition.width, maxHeight: filterPopoverPosition.maxHeight, backgroundColor: colors.surface, borderColor: colors.border }]}>
                <ScrollView
                  style={[styles.filterPopoverScroll, { maxHeight: filterPopoverPosition.maxHeight }]}
                  contentContainerStyle={styles.filterPopoverScrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  {activityDateOptions.map((option) => {
                    const active = selectedDateFilter === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        activeOpacity={0.8}
                        onPress={() => {
                          setSelectedDateFilter(option.value);
                          setActiveFilterPopover(null);
                        }}
                        style={[styles.optionRow, { backgroundColor: active ? colors.selected : 'transparent' }]}
                      >
                        <Text style={[styles.optionText, { color: active ? colors.primary : colors.text }]}>{option.label}</Text>
                        {active && <Feather name="check" size={16} color={colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                {filterPopoverPosition.placement !== 'center' ? (
                  <View style={[styles.filterPopoverCaret, filterPopoverPosition.placement === 'above' ? styles.filterPopoverCaretBelow : styles.filterPopoverCaretAbove, { left: filterPopoverPosition.caretLeft, backgroundColor: colors.surface }]} />
                ) : null}
              </View>
            </Animated.View>
          </Animated.View>
        </View>
      </Modal>

      <Modal transparent visible={activeFilterPopover === 'distance'} animationType="fade" onRequestClose={() => setActiveFilterPopover(null)}>
        <View style={styles.filterPopoverBackdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close distance filter" onPress={() => setActiveFilterPopover(null)} style={StyleSheet.absoluteFill} />
          <Animated.View style={{
            position: 'absolute',
            left: filterPopoverPosition.left,
            top: filterPopoverPosition.top,
            width: filterPopoverPosition.width,
            maxHeight: filterPopoverPosition.maxHeight,
            transform: [
              { translateX: filterPopoverOffset.x },
              { translateY: filterPopoverOffset.y },
            ],
          }}>
            <Animated.View style={{
              width: filterPopoverPosition.width,
              maxHeight: filterPopoverPosition.maxHeight,
              transform: [{ scale: filterPopoverScale }],
              transformOrigin: `${filterPopoverPosition.originXPercent}% ${filterPopoverPosition.originYPercent}%`,
            }}>
              <View style={[styles.filterPopoverCard, { width: filterPopoverPosition.width, maxHeight: filterPopoverPosition.maxHeight, backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ScrollView style={[styles.filterPopoverScroll, { maxHeight: filterPopoverPosition.maxHeight }]} contentContainerStyle={styles.filterPopoverScrollContent} showsVerticalScrollIndicator={false}>
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
                      style={[styles.optionRow, { backgroundColor: active ? colors.selected : 'transparent' }]}
                    >
                      <Text style={[styles.optionText, { color: active ? colors.primary : colors.text }]}>{option.label}</Text>
                      {active && <Feather name="check" size={16} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {filterPopoverPosition.placement !== 'center' ? (
                <View style={[styles.filterPopoverCaret, filterPopoverPosition.placement === 'above' ? styles.filterPopoverCaretBelow : styles.filterPopoverCaretAbove, { left: filterPopoverPosition.caretLeft, backgroundColor: colors.surface }]} />
              ) : null}
              </View>
            </Animated.View>
          </Animated.View>
        </View>
      </Modal>

      {showNativeDatePicker && (
        <ThemedCalendarPicker
          title="Select activity date"
          value={filterDate}
          onCancel={() => setShowNativeDatePicker(false)}
          onConfirm={(selectedDate) => {
            setShowNativeDatePicker(false);
            setFilterDate(selectedDate);
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
          ref={activityListRef}
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
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={(
            <Text style={styles.empty}>
              {activities.length === 0
                ? 'No completed workouts yet.'
                : loadingMore
                  ? 'Searching older workouts…'
                  : 'No workouts match your current filters.'}
            </Text>
          )}
        />
      )}
      {selectionToast && (
        <View pointerEvents="none" style={styles.toast}>
          <Text style={styles.toastText}>{selectionToast}</Text>
        </View>
      )}
      <Modal
        visible={optionsActivity !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeActivityOptions}
      >
        <View style={styles.activityOptionsBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close activity options"
            onPress={closeActivityOptions}
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
          />
          {optionsActivity && (
            <View style={[styles.activityOptionsMenu, {
              left: activityOptionsPosition.left,
              top: activityOptionsPosition.top,
              width: activityOptionsPosition.width,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }]}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => {
                  closeActivityOptions();
                  void exportActivityGpx(optionsActivity);
                }}
                style={styles.activityOptionsMenuItem}
              >
                {exportingActivityIds.has(String(optionsActivity.id))
                  ? <RunningLoader size={16} fillColor={colors.text} />
                  : <Feather name="upload" size={17} color={colors.textSecondary} />}
                <Text style={[styles.activityOptionsMenuText, { color: colors.text }]}>Export GPX</Text>
              </TouchableOpacity>
              {optionsRouteIsSaved && hasOptionsRouteId ? (
                <>
                  <View style={[styles.activityOptionsDivider, { backgroundColor: colors.border }]} />
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => changeActivityRouteVisibility(optionsActivity)}
                    style={styles.activityOptionsMenuItem}
                  >
                    <Feather name="globe" size={17} color={colors.textSecondary} />
                    <Text style={[styles.activityOptionsMenuText, { color: colors.text }]}>Change Visibility</Text>
                  </TouchableOpacity>
                </>
              ) : !optionsRouteIsSaved ? (
                <>
                  <View style={[styles.activityOptionsDivider, { backgroundColor: colors.border }]} />
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => {
                      closeActivityOptions();
                      const routeProcessingComplete = optionsActivity.is_processed === true
                        || (optionsActivity.is_processed == null && optionsActivity.processing_status.toUpperCase() === 'COMPLETED');
                      if (!routeProcessingComplete || !optionsActivity.route_generated) {
                        Alert.alert('Route not ready', 'This activity needs to finish processing its route before it can be saved.');
                        return;
                      }
                      setPendingSaveActivity(optionsActivity);
                    }}
                    style={styles.activityOptionsMenuItem}
                  >
                    <Feather name="bookmark" size={17} color={colors.textSecondary} />
                    <Text style={[styles.activityOptionsMenuText, { color: colors.text }]}>Save to My Routes</Text>
                  </TouchableOpacity>
                </>
              ) : null}
              {activityOptionsMessage && (
                <Text style={[styles.activityOptionsMessage, { color: colors.textSecondary }]}>
                  {activityOptionsMessage}
                </Text>
              )}
            </View>
          )}
        </View>
      </Modal>
      <Modal
        visible={pendingDeleteActivities !== null}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setPendingDeleteActivities(null)}
      >
        <View style={[styles.actionSheetBackdrop, { backgroundColor: colors.overlay, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel delete confirmation"
            onPress={() => setPendingDeleteActivities(null)}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.deleteConfirmationSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.saveRouteTitle, { color: colors.text }]}>
              Delete {pendingDeleteActivities?.length ?? 0} workouts?
            </Text>
            <Text style={[styles.saveRouteMessage, { color: colors.textSecondary }]}>
              This action cannot be undone.
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                if (!pendingDeleteActivities) return;
                const targets = pendingDeleteActivities;
                setPendingDeleteActivities(null);
                void deleteActivities(targets);
              }}
              style={styles.deleteConfirmationAction}
            >
              <Text style={styles.deleteConfirmationActionText}>
                Delete {pendingDeleteActivities?.length ?? 0} workouts
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setPendingDeleteActivities(null)}
              style={[styles.deleteConfirmationCancel, { backgroundColor: colors.surfaceRaised }]}
            >
              <Text style={[styles.deleteConfirmationCancelText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal
        visible={pendingSaveActivity !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!pendingSaveActivity || savingActivityIds.has(String(pendingSaveActivity.id))) return;
          setPendingSaveActivity(null);
        }}
      >
        <View style={[styles.saveRouteBackdrop, { backgroundColor: colors.overlay, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close route visibility options"
            disabled={pendingVisibilityBusy}
            onPress={() => setPendingSaveActivity(null)}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.saveRouteDialog, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.saveRouteTitle, { color: colors.text }]}>
              {pendingRouteIsSaved ? 'Change route visibility' : 'Save route to My Routes?'}
            </Text>
            <Text style={[styles.saveRouteMessage, { color: colors.textSecondary }]}>
              {pendingRouteIsSaved
                ? 'Choose who can view this route.'
                : 'Private keeps the route visible only to you. Public lets other signed-in Zy-Run users view it.'}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={pendingSaveActivity === null || pendingVisibilityBusy || (pendingRouteIsSaved && !hasPendingRouteId)}
              onPress={() => {
                if (!pendingSaveActivity) return;
                if (pendingRouteIsSaved && hasPendingRouteId) {
                  void updateActivityRouteVisibility(pendingSaveActivity, pendingRouteId, false);
                } else if (!pendingRouteIsSaved) {
                  void saveActivityRoute(pendingSaveActivity, false);
                }
              }}
              style={[styles.saveVisibilityButton, {
                backgroundColor: pendingSaveActivity?.saved_route_is_public === false ? colors.selected : colors.surfaceRaised,
                borderColor: pendingSaveActivity?.saved_route_is_public === false ? colors.primary : colors.border,
              }]}
            >
              {pendingVisibilityBusy
                ? <RunningLoader size={16} fillColor={colors.text} />
                : <Feather name="lock" size={16} color={colors.text} />}
              <Text style={[styles.saveVisibilityText, { color: colors.text }]}>
                {pendingRouteIsSaved ? 'Make Private' : 'Save Privately'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={pendingSaveActivity === null || pendingVisibilityBusy || (pendingRouteIsSaved && !hasPendingRouteId)}
              onPress={() => {
                if (!pendingSaveActivity) return;
                if (pendingRouteIsSaved && hasPendingRouteId) {
                  void updateActivityRouteVisibility(pendingSaveActivity, pendingRouteId, true);
                } else if (!pendingRouteIsSaved) {
                  void saveActivityRoute(pendingSaveActivity, true);
                }
              }}
              style={[styles.saveVisibilityButton, {
                backgroundColor: pendingSaveActivity?.saved_route_is_public === true ? colors.selected : colors.surfaceRaised,
                borderColor: pendingSaveActivity?.saved_route_is_public === true ? colors.primary : colors.border,
              }]}
            >
              {pendingVisibilityBusy
                ? <RunningLoader size={16} fillColor={colors.text} />
                : <Feather name="globe" size={16} color={colors.text} />}
              <Text style={[styles.saveVisibilityText, { color: colors.text }]}>
                {pendingRouteIsSaved ? 'Make Public' : 'Save Publicly'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={pendingVisibilityBusy}
              onPress={() => setPendingSaveActivity(null)}
              style={styles.saveRouteCancel}
            >
              <Text style={[styles.saveRouteCancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  headingCopy: { flex: 1, minWidth: 0 },
  title: { color: '#F7F7F7', fontSize: 31, fontWeight: '700' },
  subtitle: { color: '#A9ADAF', fontSize: 15, marginTop: 4 },
  selectionModeAction: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 4 },
  selectionModeActionText: { fontSize: 15, fontWeight: '600' },
  selectionToolbar: { paddingTop: 4, paddingBottom: 10, gap: 10 },
  selectionToolbarActions: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectionAllButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 },
  selectionToolbarButtonText: { fontSize: 14, fontWeight: '600' },
  selectionCount: { fontSize: 13, fontWeight: '500' },
  deleteSelectedButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#E53935' },
  deleteSelectedButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  filterRowBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 },
  filterBarButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1, minHeight: 36 },
  filterPopoverBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.12)' },
  filterPopoverCard: { position: 'absolute', borderWidth: 1, borderRadius: 14, padding: 8, overflow: 'visible', elevation: 18, shadowColor: '#000000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 14 },
  filterPopoverScroll: { flexGrow: 0, flexShrink: 1 },
  filterPopoverScrollContent: { flexGrow: 0 },
  filterPopoverCaret: { position: 'absolute', width: 14, height: 14, zIndex: 2, transform: [{ rotate: '45deg' }] },
  filterPopoverCaretAbove: { bottom: -6 },
  filterPopoverCaretBelow: { top: -6 },
  filterBarText: { flexShrink: 1, fontSize: 13, fontWeight: '600' },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 2 },
  optionText: { fontSize: 14, fontWeight: '600' },
  scrollContent: { paddingBottom: 118 },
  sectionHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12, paddingBottom: 8 },
  sectionTitle: { flex: 1, fontSize: 19, fontWeight: '700' },
  sectionCount: { fontSize: 12, fontWeight: '600' },
  dayHeader: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 12, paddingRight: 4, marginTop: 2 },
  dayTitle: { fontSize: 14, fontWeight: '700' },
  dayCount: { fontSize: 11, fontWeight: '600' },
  toast: { position: 'absolute', alignSelf: 'center', bottom: 118, maxWidth: '90%', paddingHorizontal: 16, paddingVertical: 11, borderRadius: 22, backgroundColor: '#252A27', borderWidth: 1, borderColor: '#3C4B3F' },
  toastText: { color: '#F7F7F7', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  card: { minHeight: 0, backgroundColor: '#242627', borderRadius: 25, paddingVertical: 10, paddingHorizontal: 15, marginBottom: 5, borderWidth: 1, borderColor: '#393C3E', overflow: 'hidden' },
  cardExpanded: { minHeight: 136 },
  cardContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardContentWithMenu: { paddingRight: 40 },
  mapThumbnailWithMenu: { width: '29%' },
  routeMenuButton: { position: 'absolute', right: 6, top: '50%', marginTop: -24, width: 40, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  routeMenuButtonDisabled: { opacity: 0.5 },
  routeSavedStatus: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10, paddingTop: 9, borderTopWidth: StyleSheet.hairlineWidth },
  routeSavedText: { fontSize: 12, fontWeight: '600' },
  longPressProgressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, overflow: 'hidden', zIndex: 4 },
  longPressProgressFill: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', transformOrigin: 'left center' },
  activityOptionsBackdrop: { flex: 1 },
  activityOptionsMenu: { position: 'absolute', borderWidth: 1, borderRadius: 14, padding: 6, elevation: 18, shadowColor: '#000000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 14 },
  activityOptionsMenuItem: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, borderRadius: 9 },
  activityOptionsMenuText: { fontSize: 14, fontWeight: '600' },
  activityOptionsDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 8, marginVertical: 4 },
  activityOptionsMessage: { fontSize: 11, lineHeight: 15, paddingHorizontal: 10, paddingTop: 4, paddingBottom: 6 },
  actionSheetBackdrop: { flex: 1, justifyContent: 'flex-end' },
  deleteConfirmationSheet: { width: '100%', maxWidth: 520, alignSelf: 'center', borderWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingTop: 24 },
  deleteConfirmationAction: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, marginTop: 8, backgroundColor: '#E53935' },
  deleteConfirmationActionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  deleteConfirmationCancel: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, marginTop: 8 },
  deleteConfirmationCancelText: { fontSize: 15, fontWeight: '600' },
  saveRouteBackdrop: { flex: 1, justifyContent: 'flex-end' },
  saveRouteDialog: { width: '100%', maxWidth: 520, alignSelf: 'center', borderWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingTop: 24 },
  saveRouteTitle: { fontSize: 17, fontWeight: '800' },
  saveRouteMessage: { fontSize: 13, lineHeight: 18, marginTop: 6, marginBottom: 12 },
  saveVisibilityButton: { minHeight: 48, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 10, paddingHorizontal: 14, marginTop: 8 },
  saveVisibilityText: { fontSize: 14, fontWeight: '700' },
  saveRouteCancel: { minHeight: 38, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  saveRouteCancelText: { fontSize: 13, fontWeight: '600' },
  cardCheckboxMotion: { position: 'absolute', top: 7, right: 7, zIndex: 2 },
  cardCheckbox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  cardDetails: { flex: 1, minWidth: 0, paddingRight: 8 },
  activityType: { color: '#F7F7F7', fontSize: 14, lineHeight: 17, fontWeight: '800' },
  distance: { color: '#35C72B', fontSize: 20, lineHeight: 24, fontWeight: '900', marginTop: 1 },
  metricSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  metricSummaryItem: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 },
  metricSummaryText: { fontSize: 12, lineHeight: 15, fontWeight: '700', flexShrink: 1 },
  mapThumbnailContainer: { position: 'relative', width: '34%', aspectRatio: 1, flexShrink: 0, minWidth: 0, marginLeft: 8, borderRadius: 18, overflow: 'hidden', backgroundColor: '#E5E7EB' },
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
  skeletonCard: { minHeight: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#171A1A', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 12, borderWidth: 1, borderColor: '#243C2B' },
  skeletonMain: { flex: 1, minWidth: 0, paddingRight: 6 },
  skeletonShort: { width: '55%', height: 12, borderRadius: 5, backgroundColor: '#294A32' },
  skeletonTiny: { width: '35%', height: 8, borderRadius: 4, backgroundColor: '#26352A', marginTop: 4 },
  skeletonDistance: { width: '48%', height: 18, borderRadius: 6, backgroundColor: '#245C32', marginTop: 7 },
  skeletonMetrics: { width: '78%', height: 14, borderRadius: 7, backgroundColor: '#202A22', marginTop: 5 },
  skeletonMap: { width: '34%', aspectRatio: 1, minWidth: 0, borderRadius: 18, overflow: 'hidden', backgroundColor: '#202A22' },
  empty: { color: '#A9ADAF', textAlign: 'center', fontSize: 16, marginTop: 40 },
});
