import { Alert } from '@/components/ThemedAlert';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import ActivityRouteMap from '../../../components/ActivityRouteMap';
import ActivitySplitsModal from '../../../components/ActivitySplitsModal';
import { RunningLoader } from '../../../components/common/RunningLoader';
import { WorkoutFlyover3DModal } from '../../../components/flyover/WorkoutFlyover3DModal';
import MotionEntrance from '../../../components/MotionEntrance';
import {
  getActivityLaunchParams,
  launchFromView,
  type DashboardLaunchOrigin,
} from '../../../components/navigation/dashboardLaunchTransition';
import OriginZoomModal from '../../../components/navigation/OriginZoomModal';
import { WorkoutShareStudioModal } from '../../../components/share/WorkoutShareStudioModal';
import { useTheme } from '../../../contexts/ThemeContext';
import { getBackendErrorMessage } from '../../../service/api';
import { useAuth } from '../../../service/auth';
import { activityAPI, BackendActivity, normalizeActivitySplits, runRouteAPI } from '../../../src/services/activityApi';
import { shareActivityAsGpx } from '../../../src/services/gpxFileExport';
import { socialAPI, type SocialPostVisibility } from '../../../src/services/socialApi';
import { ActivityExtraSplits, ActivityLapRecord, ActivitySegmentSplits } from '../../../src/types/activity';
import {
  formatDistanceFromMeters,
  formatElevationFromMeters,
  formatPaceFromSecondsPerKm,
  formatSpeedFromKilometersPerHour,
  formatSpeedFromMetersPerSecond,
} from '../../../src/utils/activityUnitFormatters';
import { getActivityExtraDistanceMeters } from '../../../src/utils/extraDistance';
import { formatDurationMmSs as formatDuration } from '../../../src/utils/splitFormatters';

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

type ShareOptionsPosition = {
  left: number;
  top: number;
  width: number;
  originXPercent: number;
  originYPercent: number;
  originScaleX: number;
  originScaleY: number;
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
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const distanceUnit = user?.profile?.distance_unit;
  const { id, cropStart, cropEnd, savedRouteId: savedRouteIdParam, autoOpenSplits } = useLocalSearchParams<{
    id: string;
    cropStart?: string;
    cropEnd?: string;
    savedRouteId?: string;
    autoOpenSplits?: string;
  }>();
  const autoOpenedSplitsRef = useRef(false);
  const cropButtonRef = useRef<View>(null);
  const splitsButtonRef = useRef<View>(null);
  const shareCardButtonRef = useRef<View>(null);
  const postWorkoutButtonRef = useRef<View>(null);
  const [activity, setActivity] = useState<BackendActivity | null>(null);
  const [savedRouteId, setSavedRouteId] = useState<number | null>(null);
  const [savedRouteIsPublic, setSavedRouteIsPublic] = useState<boolean | null>(null);
  const [isUpdatingRouteVisibility, setIsUpdatingRouteVisibility] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [exportingGpx, setExportingGpx] = useState(false);
  const [shareOptionsVisible, setShareOptionsVisible] = useState(false);
  const [shareOptionsPosition, setShareOptionsPosition] = useState<ShareOptionsPosition>({
    left: 12,
    top: 72,
    width: 240,
    originXPercent: 50,
    originYPercent: 50,
    originScaleX: 0.02,
    originScaleY: 0.02,
  });
  const [shareOptionsScaleX] = useState(() => new Animated.Value(0.82));
  const [shareOptionsScaleY] = useState(() => new Animated.Value(0.82));
  const [shareOptionsOpacity] = useState(() => new Animated.Value(0));
  const shareOptionsAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const shareOptionsClosingRef = useRef(false);
  const [shareCardVisible, setShareCardVisible] = useState(false);
  const [shareCardLaunchOrigin, setShareCardLaunchOrigin] = useState<DashboardLaunchOrigin>();
  const [postWorkoutVisible, setPostWorkoutVisible] = useState(false);
  const [postWorkoutLaunchOrigin, setPostWorkoutLaunchOrigin] = useState<DashboardLaunchOrigin>();
  const [postWorkoutBusy, setPostWorkoutBusy] = useState(false);
  const [postWorkoutError, setPostWorkoutError] = useState<string | null>(null);
  const [postWorkoutComplete, setPostWorkoutComplete] = useState(false);
  const [postVisibilityDraft, setPostVisibilityDraft] = useState<SocialPostVisibility | null>(null);
  const [flyoverVisible, setFlyoverVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splitsVisible, setSplitsVisible] = useState(false);
  const [splitsLaunchOrigin, setSplitsLaunchOrigin] = useState<DashboardLaunchOrigin>();
  const [splitsLoading, setSplitsLoading] = useState(false);
  const [splitsError, setSplitsError] = useState<string | null>(null);
  const [splitSegments, setSplitSegments] = useState<ActivitySegmentSplits[]>([]);
  const [lapRecords, setLapRecords] = useState<ActivityLapRecord[]>([]);
  const [extraSplits, setExtraSplits] = useState<ActivityExtraSplits['splits']>([]);
  const [extraLapRecords, setExtraLapRecords] = useState<ActivityLapRecord[]>([]);
  const cropStartIndex = cropStart === undefined ? undefined : Number(cropStart);
  const cropEndIndex = cropEnd === undefined ? undefined : Number(cropEnd);
  const extraDistanceMeters = getActivityExtraDistanceMeters(activity);

  useEffect(() => () => {
    shareOptionsAnimationRef.current?.stop();
  }, []);

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
      setSplitSegments(loadedActivity.segments ?? []);
      setExtraSplits(loadedActivity.extra?.splits ?? []);
      setExtraLapRecords(loadedActivity.extra?.laps ?? []);
      if (autoOpenSplits === 'true' && !autoOpenedSplitsRef.current) {
        autoOpenedSplitsRef.current = true;
        setSplitsVisible(true);
      }
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
  }, [id, savedRouteIdParam, autoOpenSplits]);

  const exportActivityGpx = useCallback(async () => {
    if (!activity) return;
    setExportingGpx(true);
    try {
      await shareActivityAsGpx(activity);
    } catch (exportError) {
      const message = exportError instanceof Error
        ? exportError.message
        : 'Could not export this workout as GPX.';
      Alert.alert('Could not export GPX', message);
    } finally {
      setExportingGpx(false);
    }
  }, [activity]);

  const closeShareOptions = useCallback((afterClose?: () => void) => {
    if (!shareOptionsVisible) {
      afterClose?.();
      return;
    }
    if (shareOptionsClosingRef.current) return;

    shareOptionsClosingRef.current = true;
    shareOptionsAnimationRef.current?.stop();

    const finishClose = ({ finished }: { finished: boolean }) => {
      if (!finished) return;
      shareOptionsClosingRef.current = false;
      setShareOptionsVisible(false);
      afterClose?.();
    };

    if (reduceMotion) {
      finishClose({ finished: true });
      return;
    }

    const animation = Animated.parallel([
      Animated.timing(shareOptionsScaleX, {
        toValue: shareOptionsPosition.originScaleX,
        duration: 160,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(shareOptionsScaleY, {
        toValue: shareOptionsPosition.originScaleY,
        duration: 160,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(shareOptionsOpacity, {
        toValue: 0,
        duration: 140,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    shareOptionsAnimationRef.current = animation;
    animation.start(finishClose);
  }, [reduceMotion, shareOptionsOpacity, shareOptionsPosition.originScaleX, shareOptionsPosition.originScaleY, shareOptionsScaleX, shareOptionsScaleY, shareOptionsVisible]);

  const shareWorkoutImage = useCallback(() => {
    closeShareOptions(() => launchFromView(shareCardButtonRef.current, (origin) => {
      setShareCardLaunchOrigin(origin);
      setShareCardVisible(true);
    }));
  }, [closeShareOptions]);

  const shareWorkoutGpx = useCallback(() => {
    closeShareOptions(() => void exportActivityGpx());
  }, [closeShareOptions, exportActivityGpx]);

  const openShareOptions = useCallback(() => {
    if (shareOptionsVisible) {
      closeShareOptions();
      return;
    }

    shareCardButtonRef.current?.measureInWindow((x, y, width, height) => {
      const menuWidth = Math.min(256, windowWidth - insets.left - insets.right - 24);
      const menuHeight = 112;
      const leftLimit = insets.left + 12;
      const rightLimit = windowWidth - insets.right - 12;
      const left = Math.max(leftLimit, Math.min(x + width - menuWidth, rightLimit - menuWidth));
      const topLimit = insets.top + 8;
      const bottomLimit = windowHeight - insets.bottom - 8;
      const below = y + height + 4;
      const top = below + menuHeight <= bottomLimit
        ? below
        : Math.max(topLimit, y - menuHeight - 4);
      const anchorCenterX = x + width / 2;
      const anchorCenterY = y + height / 2;
      const originXPercent = ((anchorCenterX - left) / menuWidth) * 100;
      const originYPercent = ((anchorCenterY - top) / menuHeight) * 100;
      const originScaleX = Math.min(1, width / menuWidth);
      const originScaleY = Math.min(1, height / menuHeight);

      shareOptionsAnimationRef.current?.stop();
      shareOptionsClosingRef.current = false;
      shareOptionsScaleX.setValue(reduceMotion ? 1 : originScaleX);
      shareOptionsScaleY.setValue(reduceMotion ? 1 : originScaleY);
      shareOptionsOpacity.setValue(reduceMotion ? 1 : 0);
      setShareOptionsPosition({ left, top, width: menuWidth, originXPercent, originYPercent, originScaleX, originScaleY });
      setShareOptionsVisible(true);
    });
  }, [insets.bottom, insets.left, insets.right, insets.top, reduceMotion, shareOptionsOpacity, shareOptionsScaleX, shareOptionsScaleY, shareOptionsVisible, closeShareOptions, windowHeight, windowWidth]);

  const animateShareOptionsIn = useCallback(() => {
    shareOptionsAnimationRef.current?.stop();
    shareOptionsClosingRef.current = false;
    if (reduceMotion) {
      shareOptionsScaleX.setValue(1);
      shareOptionsScaleY.setValue(1);
      shareOptionsOpacity.setValue(1);
      return;
    }
    const animation = Animated.parallel([
      Animated.timing(shareOptionsScaleX, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(shareOptionsScaleY, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(shareOptionsOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    shareOptionsAnimationRef.current = animation;
    animation.start();
  }, [reduceMotion, shareOptionsOpacity, shareOptionsScaleX, shareOptionsScaleY]);

  const openPostWorkout = () => {
    setPostWorkoutError(null);
    setPostWorkoutComplete(false);
    const existingPostId = Number(activity?.post_id);
    setPostVisibilityDraft(Number.isInteger(existingPostId) && existingPostId > 0
      ? activity?.share_audience === 'ALL' ? 'PUBLIC'
        : activity?.share_audience === 'FOLLOWERS' ? 'FOLLOWERS'
        : 'ONLY_ME'
      : null);
    launchFromView(postWorkoutButtonRef.current, (origin) => {
      setPostWorkoutLaunchOrigin(origin);
      setPostWorkoutVisible(true);
    });
  };

  const postSavedWorkout = async (visibility: SocialPostVisibility) => {
    if (!activity || postWorkoutBusy) return;
    setPostVisibilityDraft(visibility);
    setPostWorkoutBusy(true);
    setPostWorkoutError(null);
    try {
      const existingPostId = Number(activity.post_id);
      const response = Number.isInteger(existingPostId) && existingPostId > 0
        ? await socialAPI.updateWorkoutPost(existingPostId, { visibility })
        : await socialAPI.createWorkoutPost({ activity_id: Number(activity.id), visibility });
      setActivity((current) => current ? {
        ...current,
        post_id: response.data.data.id,
        share_audience: visibility === 'PUBLIC' ? 'ALL' : visibility === 'FOLLOWERS' ? 'FOLLOWERS' : 'NONE',
      } : current);
      setPostWorkoutComplete(true);
    } catch (requestError) {
      setPostWorkoutError(getBackendErrorMessage(requestError, 'Could not post this workout.'));
    } finally {
      setPostWorkoutBusy(false);
    }
  };

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
      setLapRecords(splitData.laps);
      setExtraSplits(splitData.extra?.splits ?? []);
      setExtraLapRecords(splitData.extra?.laps ?? []);
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
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={[styles.headerTitle, { color: colors.text }]}
        >
          Activity Details
        </Text>
        {activity ? (
          <View style={styles.headerButtonsContainer}>
            <TouchableOpacity
              ref={cropButtonRef}
              accessibilityLabel="Crop workout"
              onPress={() => launchFromView(cropButtonRef.current, (origin) => {
                router.push({
                  pathname: '/(app)/activity/crop/[id]',
                  params: {
                    id: String(activity.id),
                    ...(getActivityLaunchParams(origin) ?? {}),
                  },
                } as any);
              })}
              style={styles.cropButton}
            >
              <Feather name="scissors" size={20} color="#FFB020" />
            </TouchableOpacity>
            <TouchableOpacity
              ref={splitsButtonRef}
              accessibilityLabel="Open split details"
              onPress={() => launchFromView(splitsButtonRef.current, (origin) => {
                setSplitsLaunchOrigin(origin);
                void loadSplits();
              })}
              style={styles.splitButton}
            >
              <Feather name="list" size={20} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              ref={shareCardButtonRef}
              accessibilityRole="button"
              accessibilityLabel="Share"
              accessibilityHint="Open workout image and GPX sharing options."
              accessibilityState={{ expanded: shareOptionsVisible }}
              disabled={exportingGpx}
              onPress={openShareOptions}
              style={styles.exportButton}
            >
              {exportingGpx
                ? <RunningLoader size={18} fillColor={colors.primary} />
                : <Feather name="share-2" size={20} color={colors.primary} />}
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
            <View style={styles.routeHeaderRow}>
              <Text style={[styles.sectionTitle, styles.routeTitle, { color: colors.text }]}>Route</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="3D Flyover Video"
                onPress={() => setFlyoverVisible(true)}
                style={styles.routeFlyoverPill}
              >
                <Feather name="play" size={12} color="#22C55E" />
                <Text style={styles.routeFlyoverPillText}>3D Flyover</Text>
              </TouchableOpacity>
            </View>
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
              distanceUnit={distanceUnit}
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

            <TouchableOpacity
              ref={postWorkoutButtonRef}
              accessibilityRole="button"
              accessibilityLabel={activity.post_id ? 'Change workout post audience' : 'Post saved workout to Connections'}
              onPress={openPostWorkout}
              style={[styles.postWorkoutButton, { backgroundColor: colors.primary }]}
            >
              <Feather name={activity.post_id ? 'users' : 'send'} size={17} color={colors.primaryText} />
              <View style={styles.postWorkoutButtonCopy}>
                <Text style={[styles.postWorkoutButtonTitle, { color: colors.primaryText }]}>
                  {activity.post_id ? 'Change post audience' : 'Post to Connections'}
                </Text>
                <Text style={[styles.postWorkoutButtonSubtitle, { color: colors.primaryText }]}>
                  {activity.post_id
                    ? `Currently ${activity.share_audience === 'ALL' ? 'Everyone' : activity.share_audience === 'FOLLOWERS' ? 'Followers' : 'Only me'}`
                    : 'Post this saved workout to My Posts or Connections'}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.primaryText} />
            </TouchableOpacity>

            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <DetailMetric label="Distance" value={formatDistanceFromMeters(activity.distance, distanceUnit)} />
              <DetailMetric label="Moving time" value={formatDuration(activity.moving_time)} />
              <DetailMetric label="Average pace" value={formatPaceFromSecondsPerKm(activity.avg_pace, distanceUnit)} />
              <DetailMetric label="Calories" value={`${Math.round(activity.calories)} kcal`} />
            </View>

            <Text style={[styles.sectionTitle, { color: colors.text }]}>Distance breakdown</Text>
            <View style={[styles.metricsCard, styles.verticalMetricsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <DetailMetric fullWidth label="Distance" value={formatDistanceFromMeters(activity.distance, distanceUnit)} />
              {extraDistanceMeters !== null && (
                <DetailMetric fullWidth label="Extra distance" value={formatDistanceFromMeters(extraDistanceMeters, distanceUnit)} />
              )}
              <DetailMetric fullWidth label="Elapsed time" value={formatDuration(activity.elapsed_time)} />
                <DetailMetric fullWidth label="Moving time" value={formatDuration(activity.moving_time)} />
              <DetailMetric fullWidth label="Average pace" value={formatPaceFromSecondsPerKm(activity.avg_pace, distanceUnit)} />
              <DetailMetric fullWidth label="Average speed" value={formatSpeedFromKilometersPerHour(activity.avg_speed, distanceUnit)} />
              <DetailMetric fullWidth label="Max speed" value={formatSpeedFromMetersPerSecond(activity.max_speed, distanceUnit)} />
              <DetailMetric fullWidth label="Calories" value={`${Math.round(activity.calories)} kcal`} />
              <DetailMetric fullWidth label="Elevation gain" value={formatElevationFromMeters(activity.elevation_gain, distanceUnit)} />
              <DetailMetric fullWidth label="Elevation loss" value={formatElevationFromMeters(activity.elevation_loss, distanceUnit)} />
              <DetailMetric fullWidth singleLine label="Recorded" value={formatRecordedDate(activity.end_time)} />
            </View>
            </MotionEntrance>
          </ScrollView>
        </View>
      ) : null}
      <Modal
        visible={shareOptionsVisible}
        transparent
        animationType="none"
        statusBarTranslucent
        onShow={animateShareOptionsIn}
        onRequestClose={() => closeShareOptions()}
      >
        <Animated.View style={[styles.shareOptionsBackdrop, { opacity: shareOptionsOpacity }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close share options"
            onPress={() => closeShareOptions()}
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
          />
          <Animated.View
            style={[
              styles.shareOptionsMenu,
              {
                left: shareOptionsPosition.left,
                top: shareOptionsPosition.top,
                width: shareOptionsPosition.width,
                backgroundColor: colors.surface,
                borderColor: colors.border,
                transformOrigin: [
                  `${shareOptionsPosition.originXPercent}%`,
                  `${shareOptionsPosition.originYPercent}%`,
                  0,
                ],
                transform: [{ scaleX: shareOptionsScaleX }, { scaleY: shareOptionsScaleY }],
              },
            ]}
          >
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Share workout image"
              onPress={shareWorkoutImage}
              style={styles.shareOptionsMenuItem}
            >
              <Feather name="image" size={17} color={colors.textSecondary} />
              <Text style={[styles.shareOptionsMenuText, { color: colors.text }]}>Share Image</Text>
            </TouchableOpacity>
            <View style={[styles.shareOptionsDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Share workout GPX file"
              disabled={exportingGpx}
              onPress={shareWorkoutGpx}
              style={styles.shareOptionsMenuItem}
            >
              {exportingGpx
                ? <RunningLoader size={16} fillColor={colors.text} />
                : <Feather name="upload" size={17} color={colors.textSecondary} />}
              <Text style={[styles.shareOptionsMenuText, { color: colors.text }]}>Share GPX</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Modal>
      <OriginZoomModal
        visible={postWorkoutVisible}
        transparent
        launchOrigin={postWorkoutLaunchOrigin}
        onExitComplete={() => setPostWorkoutLaunchOrigin(undefined)}
        onRequestClose={() => !postWorkoutBusy && setPostWorkoutVisible(false)}
      >
        <View style={styles.postAudienceBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} disabled={postWorkoutBusy} onPress={() => setPostWorkoutVisible(false)} />
          <View style={[styles.postAudienceDialog, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.postAudienceHeader}>
              <View style={[styles.postAudienceIcon, { backgroundColor: colors.background }]}>
                <Feather name={postWorkoutComplete ? 'check' : 'send'} size={19} color={colors.primary} />
              </View>
              <View style={styles.postAudienceHeaderCopy}>
                <Text style={[styles.postAudienceTitle, { color: colors.text }]}>
                  {postWorkoutComplete ? 'Workout posted' : 'Post saved workout'}
                </Text>
                <Text style={[styles.postAudienceSubtitle, { color: colors.textSecondary }]}>
                  {postWorkoutComplete
                    ? `${postVisibilityDraft === 'ONLY_ME' ? 'Only you' : postVisibilityDraft === 'FOLLOWERS' ? 'Your followers' : 'Everyone'} can see this workout.`
                    : 'Choose who can see this workout post.'}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close post options"
                disabled={postWorkoutBusy}
                onPress={() => setPostWorkoutVisible(false)}
                style={styles.postAudienceClose}
              >
                <Feather name="x" size={19} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {!postWorkoutComplete ? ([
              { value: 'ONLY_ME' as const, label: 'Only me', description: 'Keep the post on My Posts, out of the Connections feed.', icon: 'lock' as const },
              { value: 'FOLLOWERS' as const, label: 'Followers', description: 'Visible to people who follow you.', icon: 'users' as const },
              { value: 'PUBLIC' as const, label: 'Everyone', description: 'Visible to everyone in Connections.', icon: 'globe' as const },
            ].map((option) => {
              const selected = postVisibilityDraft === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: postWorkoutBusy }}
                  disabled={postWorkoutBusy}
                  onPress={() => void postSavedWorkout(option.value)}
                  style={[styles.postAudienceOption, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? (isDark ? 'rgba(16,185,129,0.12)' : '#E8F7EE') : colors.background, opacity: postWorkoutBusy && !selected ? 0.55 : 1 }]}
                >
                  <View style={[styles.postAudienceOptionIcon, { backgroundColor: isDark ? colors.surfaceRaised : '#E8F7EE' }]}>
                    <Feather name={option.icon} size={16} color={colors.primary} />
                  </View>
                  <View style={styles.postAudienceOptionCopy}>
                    <Text style={[styles.postAudienceOptionTitle, { color: colors.text }]}>{option.label}</Text>
                    <Text style={[styles.postAudienceOptionDescription, { color: colors.textSecondary }]}>{option.description}</Text>
                  </View>
                  {postWorkoutBusy && selected
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Feather name={selected ? 'check-circle' : 'circle'} size={18} color={selected ? colors.primary : colors.textTertiary} />}
                </TouchableOpacity>
              );
            })) : (
              <TouchableOpacity onPress={() => setPostWorkoutVisible(false)} style={[styles.postAudienceDone, { backgroundColor: colors.primary }]}>
                <Text style={[styles.postAudienceDoneText, { color: colors.primaryText }]}>Done</Text>
              </TouchableOpacity>
            )}
            {postWorkoutError ? <Text style={styles.postAudienceError}>{postWorkoutError}</Text> : null}
          </View>
        </View>
      </OriginZoomModal>
      <ActivitySplitsModal
        visible={splitsVisible}
        loading={splitsLoading}
        error={splitsError}
        segments={splitSegments}
        laps={lapRecords}
        extraSplits={extraSplits}
        extraLaps={extraLapRecords}
        extraDistanceMeters={extraDistanceMeters}
        distanceUnit={distanceUnit}
        launchOrigin={splitsLaunchOrigin}
        onExitComplete={() => setSplitsLaunchOrigin(undefined)}
        onClose={() => setSplitsVisible(false)}
        onRetry={() => void loadSplits()}
      />
      <WorkoutShareStudioModal
        visible={shareCardVisible}
        onClose={() => setShareCardVisible(false)}
        activity={activity}
        distanceUnit={distanceUnit}
        launchOrigin={shareCardLaunchOrigin}
        onExitComplete={() => setShareCardLaunchOrigin(undefined)}
      />
      <WorkoutFlyover3DModal
        visible={flyoverVisible}
        onClose={() => setFlyoverVisible(false)}
        activity={activity}
        points={activity?.route?.points ?? activity?.gps_points ?? activity?.points ?? []}
        encodedPolyline={activity?.encoded_polyline}
        title={activity?.activity_type?.toUpperCase() === 'WALK' ? 'Walk 3D Flyover' : 'Run 3D Flyover'}
        totalDistanceMeters={activity?.distance}
        totalDurationSeconds={activity?.moving_time || activity?.elapsed_time}
        elevationGainMeters={activity?.elevation_gain ?? undefined}
        avatarUrl={user?.profile?.profile_picture_url || user?.profile?.profile_picture}
        mapboxToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN || process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN}
        maptilerKey={process.env.EXPO_PUBLIC_MAPTILER_KEY}
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
  backButton: { width: 36, height: 42, justifyContent: 'center', alignItems: 'center' },
  headerButtonsContainer: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  cropButton: { width: 32, height: 42, justifyContent: 'center', alignItems: 'center' },
  splitButton: { width: 32, height: 42, justifyContent: 'center', alignItems: 'center' },
  exportButton: { width: 32, height: 42, justifyContent: 'center', alignItems: 'center' },
  flyoverButton: { width: 36, height: 42, justifyContent: 'center', alignItems: 'center' },
  deleteButton: { width: 32, height: 42, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  headerSpacer: { width: 36 },
  shareOptionsBackdrop: { flex: 1 },
  shareOptionsMenu: { position: 'absolute', borderWidth: 1, borderRadius: 14, padding: 6, elevation: 18, shadowColor: '#000000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 14 },
  shareOptionsMenuItem: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, borderRadius: 9 },
  shareOptionsMenuText: { fontSize: 14, fontWeight: '600' },
  shareOptionsDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 8, marginVertical: 4 },
  activityBody: { flex: 1, minHeight: 0 },
  routePanel: { flexShrink: 0, paddingTop: 12 },
  routeHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  routeFlyoverPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.35)',
  },
  routeFlyoverPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#22C55E',
  },
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
  postWorkoutButton: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 15, marginTop: 16, paddingHorizontal: 14 },
  postWorkoutButtonCopy: { flex: 1, minWidth: 0, gap: 2 },
  postWorkoutButtonTitle: { fontSize: 13, fontWeight: '800' },
  postWorkoutButtonSubtitle: { fontSize: 10, opacity: 0.86 },
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
  postAudienceBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  postAudienceDialog: { width: '100%', maxWidth: 400, alignSelf: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, padding: 16, gap: 9 },
  postAudienceHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 5 },
  postAudienceIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  postAudienceHeaderCopy: { flex: 1, minWidth: 0, gap: 3 },
  postAudienceTitle: { fontSize: 16, fontWeight: '800' },
  postAudienceSubtitle: { fontSize: 11, lineHeight: 15 },
  postAudienceClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  postAudienceOption: { minHeight: 62, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  postAudienceOptionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  postAudienceOptionCopy: { flex: 1, minWidth: 0, gap: 2 },
  postAudienceOptionTitle: { fontSize: 13, lineHeight: 17, fontWeight: '700' },
  postAudienceOptionDescription: { fontSize: 10, lineHeight: 14 },
  postAudienceError: { fontSize: 11, lineHeight: 16, marginTop: 2, color: '#D9424A' },
  postAudienceDone: { minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  postAudienceDoneText: { fontSize: 13, fontWeight: '700' },
});
