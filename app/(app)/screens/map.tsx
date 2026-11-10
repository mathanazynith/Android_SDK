import { Alert } from '@/components/ThemedAlert';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { RunningLoader } from '../../../components/common/RunningLoader';
import { usePauseSettings } from '../../../contexts/PauseSettingsContext';
import { BRAND_GREEN, useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../service/auth';
import { workoutPlanService } from '../../../service/workoutPlan';
import { beginActiveRunJournal, clearActiveRunJournal, flushActiveRunJournal, readActiveRunJournal } from '../../../src/services/activeRunJournal';
import { ActivityDetectionService } from '../../../src/services/activityDetectionService';
import { activityDistanceOverrides } from '../../../src/services/activityDistanceOverrides';
import { activityTimingOverrides } from '../../../src/services/activityTimingOverrides';
import {
  clearBackgroundLocationSession,
  flushBackgroundLocationTask,
  getBackgroundLocationSession,
  persistBackgroundLocationSession,
  setBackgroundLocationListener,
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
} from '../../../src/services/backgroundLocationTask';
import {
  LIVE_TRACKING_PAUSE_ACTION,
  LIVE_TRACKING_RESUME_ACTION,
  LIVE_TRACKING_STOP_ACTION,
  publishWorkoutSummaryNotification,
  startLiveTrackingNotification,
  stopLiveTrackingNotification,
  updateLiveTrackingNotificationMessage,
  updateLiveTrackingNotification,
} from '../../../src/services/liveTrackingNotification';
import { LocationQueue } from '../../../src/services/locationQueue';
import { LocationService } from '../../../src/services/locationService';
import { PathProcessor } from '../../../src/services/pathProcessor';
import { RunningApiClient } from '../../../src/services/runningApi';
import { shareActivityPayloadAsJson } from '../../../src/services/gpxFileExport';
import { DistanceSplitEngine } from '../../../src/services/splitEngine';
import { StepDetectionService } from '../../../src/services/stepDetectionService';
import voiceCoach from '../../../src/services/voiceCoach';
import { WorkoutEngine } from '../../../src/services/workoutEngine';
import { WorkoutVoiceService } from '../../../src/services/workoutVoiceService';
import { SPLIT_DISTANCE_METERS } from '../../../src/types/activity';
import { ActivityExtraPayload, ActivityGpsPointPayload, ActivityLapPayload, ActivityPauseEventPayload, ActivityRecoveryPayload, ActivitySegmentPayload, ActivitySubmissionPayload, RawGpsPayload, RunningGpsPoint, RunningPathPoint } from '../../../src/types/running';
import { BackendWorkout, WorkoutEngineSnapshot } from '../../../src/types/workout';
import { isReliableRoutePoint } from '../../../src/utils/activityRouteGroups';
import { offlineWorkoutQueue } from '../../../src/services/offlineWorkoutQueue';
import { calculateDistanceMeters } from '../../../src/utils/distance';
import {
  formatDistanceFromMeters,
  formatPaceFromSecondsPerKm,
} from '../../../src/utils/activityUnitFormatters';
import { decodePolyline } from '../../../src/utils/polylineDecoder';
import {
  calculateAcceptedRouteDistance,
  calculateRouteDistanceBreakdown,
  filterRoutePointsByMaximumJump,
} from '../../../src/utils/routeDistance';
import { formatStepTarget, WorkoutExecutionStep } from '../../../src/utils/workoutPlanBuilder';

const formatTimerDisplay = (totalSec: number) => {
  const m = Math.floor(Math.max(0, totalSec) / 60);
  const s = Math.max(0, totalSec) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const formatPaceDisplay = (paceMinutesPerKm: number | null | undefined) => {
  if (!Number.isFinite(paceMinutesPerKm) || paceMinutesPerKm === null || paceMinutesPerKm === undefined || paceMinutesPerKm <= 0) {
    return '0:00';
  }
  const totalSeconds = Math.round(paceMinutesPerKm * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const getStepColor = (stepType?: string) => {
  switch (stepType) {
    case 'Warmup':
      return '#FF453A';
    case 'Run':
      return '#0A84FF';
    case 'Rest':
      return '#30D158';
    case 'Cooldown':
      return '#BF5AF2';
    default:
      return '#0A84FF';
  }
};

const formatStepTargetSafe = (step?: WorkoutExecutionStep | null, distanceUnit?: string | null) => {
  if (!step) return '';
  if (typeof formatStepTarget === 'function') {
    if (step.targetType !== 'DISTANCE' || !step.targetDistanceMeters) {
      return formatStepTarget(step).toLowerCase();
    }
  }
  if (step.targetType === 'DURATION' && step.targetDurationSeconds) {
    const mins = Math.floor(step.targetDurationSeconds / 60);
    const secs = step.targetDurationSeconds % 60;
    if (mins > 0 && secs > 0) return `${mins}m ${secs}s`;
    if (mins > 0) return `${mins} min`;
    return `${secs} sec`;
  }
  if (step.targetType === 'DISTANCE' && step.targetDistanceMeters) {
    return formatDistanceFromMeters(step.targetDistanceMeters, distanceUnit);
  }
  return 'Open target';
};

const formatTargetPace = (pace: string | undefined, sourceDistanceUnit: string | undefined, displayDistanceUnit: string | null | undefined) => {
  if (!pace) return '--:--';
  const paceMatch = pace.match(/(\d{1,3}):([0-5]\d)/);
  if (!paceMatch) return pace.replace(/MIN\/KM/gi, 'min/km').replace(/MIN\/MI/gi, 'min/mi');

  const minutes = Number(paceMatch[1]);
  const seconds = Number(paceMatch[2]);
  const explicitlyUsesMiles = /(?:\/|per\s*)mi(?:le)?\b/i.test(pace);
  const sourceIsMiles = explicitlyUsesMiles || (!/\/km\b/i.test(pace) && /mi/i.test(sourceDistanceUnit ?? ''));
  const secondsPerSourceUnit = minutes * 60 + seconds;
  const secondsPerKm = sourceIsMiles ? secondsPerSourceUnit / 1.609344 : secondsPerSourceUnit;
  return formatPaceFromSecondsPerKm(secondsPerKm, displayDistanceUnit);
};

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface RouteSegment {
  id: number;
  traceType: 'active' | 'pause' | 'extra';
  coordinates: Coordinate[];
}

interface PauseMarker {
  id: number;
  type: 'pause' | 'resume';
  coordinate: Coordinate;
}

interface PauseEvent {
  paused_at: string;
  resumed_at: string | null;
  duration_s: number | null;
  pause_location: Coordinate | null;
  resume_location: Coordinate | null;
}

interface LocationState {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    altitude: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
}

type MovementState = 'STATIONARY' | 'STARTING' | 'MOVING' | 'STOPPING';

const MOVEMENT_CONFIRMATION_SAMPLES = 3;
const STATIONARY_CONFIRMATION_SAMPLES = 3;
const AUTO_PAUSE_STATIONARY_DURATION_MS = 5_000;
const WORKOUT_CHECKPOINT_STALE_AFTER_MS = 30_000;
// A 30m GPS radius is too large for indoor distance: the displayed point can
// be several rooms away from the user. Reject low-confidence fixes before
// they reach the route processor instead of adding false distance.
const MAX_MOVEMENT_ACCURACY_METERS = 15;
// Individual GPS fixes can wander by a few metres while the phone is still.
// Require a displacement outside the fix's uncertainty, and meaningful speed,
// before a live sample can confirm movement.
const MIN_MOVEMENT_DISTANCE_METERS = 3;
const MIN_MOVEMENT_SPEED_METERS_PER_SECOND = 0.8;
const ROUTE_ON_DISTANCE_METERS = 20;
const ROUTE_WARNING_DISTANCE_METERS = 75;

const distanceToRoute = (location: Coordinate, route: Coordinate[]) => {
  if (route.length === 0) return Number.POSITIVE_INFINITY;
  if (route.length === 1) return calculateDistanceMeters(location, route[0]);

  const longitudeScale = Math.cos((location.latitude * Math.PI) / 180) * 111320;
  const latitudeScale = 111320;
  const toMeters = (point: Coordinate) => ({
    x: (point.longitude - location.longitude) * longitudeScale,
    y: (point.latitude - location.latitude) * latitudeScale,
  });
  const current = { x: 0, y: 0 };
  let closest = Number.POSITIVE_INFINITY;

  for (let index = 1; index < route.length; index += 1) {
    const start = toMeters(route[index - 1]);
    const end = toMeters(route[index]);
    const segmentX = end.x - start.x;
    const segmentY = end.y - start.y;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
    const progress = segmentLengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((current.x - start.x) * segmentX + (current.y - start.y) * segmentY) / segmentLengthSquared));
    const nearestPoint = {
      latitude: route[index - 1].latitude + (route[index].latitude - route[index - 1].latitude) * progress,
      longitude: route[index - 1].longitude + (route[index].longitude - route[index - 1].longitude) * progress,
    };
    closest = Math.min(closest, calculateDistanceMeters(location, nearestPoint));
  }

  return closest;
};

export default function MapScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<{
    workoutTitle?: string;
    workoutPlan?: string;
    workoutType?: string;
    activityType?: string;
    assignedRoute?: string;
    runId?: string;
    notificationAction?: string;
    actionNonce?: string;
    recoveryReview?: string;
  }>();

  const assignedRoute = useMemo(() => {
    if (!params.assignedRoute) return null;
    try {
      return JSON.parse(params.assignedRoute) as { encoded_polyline?: string | null };
    } catch {
      return null;
    }
  }, [params.assignedRoute]);

  const assignedRoutePoints = useMemo(() => {
    if (!assignedRoute?.encoded_polyline) return [];
    try {
      return decodePolyline(assignedRoute.encoded_polyline);
    } catch {
      return [];
    }
  }, [assignedRoute]);

  const executionPlan: WorkoutExecutionStep[] = useMemo(() => {
    if (!params.workoutPlan) return [];
    try {
      const parsed = JSON.parse(params.workoutPlan);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('[MapScreen] Failed to parse workoutPlan:', e);
      return [];
    }
  }, [params.workoutPlan]);

  const serializedWorkout: BackendWorkout | null = useMemo(() => {
    if (executionPlan.length === 0) return null;
    return {
      title: params.workoutTitle || 'Structured Workout',
      duration: null,
      distance: null,
      target_pace: null,
      pace_unit: null,
      segments: executionPlan.map((step, index) => ({
        segment_order: index + 1,
        segment_type: step.stepType,
        repeats: 1,
        rep_distance: step.targetType === 'DISTANCE' ? step.targetDistanceMeters ?? null : null,
        duration: step.targetType === 'DURATION' ? step.targetDurationSeconds ?? null : null,
        target_pace: step.targetPace ?? null,
        pace_unit: step.unit ?? null,
        rest_duration: null,
        notes: step.notes ?? null,
      })),
    };
  }, [executionPlan, params.workoutTitle]);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepStartSeconds, setStepStartSeconds] = useState(0);
  const [stepStartDistanceMeters, setStepStartDistanceMeters] = useState(0);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const {
    autoPauseEnabled,
    isLoaded: pauseSettingsLoaded,
    manualPauseEnabled,
    voiceAlertsEnabled,
  } = usePauseSettings();

  const currentStepIndexRef = useRef(0);
  const stepStartSecondsRef = useRef(0);
  const stepStartDistanceRef = useRef(0);
  const halfwayAnnouncedRef = useRef(false);
  const executionPlanRef = useRef<WorkoutExecutionStep[]>([]);
  useEffect(() => {
    executionPlanRef.current = executionPlan;
  }, [executionPlan]);
  const [loading, setLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [floatingOverlayHeight, setFloatingOverlayHeight] = useState(216);
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([]);
  const [distance, setDistance] = useState(0);
  const [workoutDistance, setWorkoutDistance] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [pace, setPace] = useState(0); // pace in minutes per km
  const [isPlannedWorkout, setIsPlannedWorkout] = useState(false);
  const [workoutSnapshot, setWorkoutSnapshot] = useState<WorkoutEngineSnapshot | null>(null);
  const [voiceCoachNoticeVisible, setVoiceCoachNoticeVisible] = useState(false);
  const [recoveryPromptVisible, setRecoveryPromptVisible] = useState(false);
  const [recoveryCheckpointAt, setRecoveryCheckpointAt] = useState<number | null>(null);
  const [completionPromptVisible, setCompletionPromptVisible] = useState(
    params.notificationAction === LIVE_TRACKING_STOP_ACTION,
  );

  const isStructuredOrPlannedWorkout = useMemo(() => {
    return Boolean(
      params.workoutPlan ||
      params.workoutTitle ||
      executionPlan.length > 0
    );
  }, [params.workoutPlan, params.workoutTitle, executionPlan.length]);

  const initialActivityType: 'RUN' | 'WALK' = useMemo(() => {
    // For training plans and custom workouts, default strictly to RUN
    if (params.workoutPlan || params.workoutTitle || executionPlan.length > 0) {
      return 'RUN';
    }
    const raw = (params.workoutType || params.activityType || '').toLowerCase();
    return raw.includes('walk') ? 'WALK' : 'RUN';
  }, [params.activityType, params.workoutPlan, params.workoutTitle, params.workoutType, executionPlan.length]);

  const [selectedActivityType, setSelectedActivityType] = useState<'RUN' | 'WALK'>(initialActivityType);
  const selectedActivityTypeRef = useRef<'RUN' | 'WALK'>(initialActivityType);
  const [isActivityModalVisible, setIsActivityModalVisible] = useState(false);

  useEffect(() => {
    selectedActivityTypeRef.current = initialActivityType;
    setSelectedActivityType(initialActivityType);
  }, [initialActivityType]);

  const voiceCoachNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const activityDetectionRef = useRef<ActivityDetectionService | null>(null);
  const stepDetectionRef = useRef<StepDetectionService | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const recoveredElapsedBaseRef = useRef<number | null>(null);
  const recoveredResumeAtRef = useRef<number | null>(null);
  const recoveredPausedBaselineRef = useRef(0);
  const previousLocationRef = useRef<RawGpsPayload | null>(null);
  const processedLocationKeysRef = useRef<Set<string>>(new Set());
  const runIdRef = useRef<string | null>(null);
  const restoredRunIdRef = useRef<string | null>(null);
  const apiClientRef = useRef<RunningApiClient | null>(null);
  const pathProcessorRef = useRef<PathProcessor | null>(null);
  const queueRef = useRef<LocationQueue | null>(null);
  const uploadInProgressRef = useRef(false);
  const distanceRef = useRef(0);
  const extraDistanceRef = useRef(0);
  const recordedDistanceRef = useRef(0);
  const lastRetainedCoordinateRef = useRef<Coordinate | null>(null);
  const isRunningRef = useRef(false);
  const lastCameraUpdateRef = useRef(0);
  const hasInitializedLocationRef = useRef(false);
  const stopRunRef = useRef<() => void>(() => {});
  const isStoppingRef = useRef(false);
  const isStartingRef = useRef(false);
  const isPausedRef = useRef(false);
  const pausedTimeRef = useRef<number | null>(null); // Tracks cumulative paused duration
  const pauseStartTimeRef = useRef<number | null>(null); // When pause started
  const isPausingRef = useRef(false);
  const isAutoPausedRef = useRef(false);
  const autoPauseEnabledRef = useRef(false);
  const voiceAlertsEnabledRef = useRef(false);
  const lastMovementTimestampRef = useRef<number | null>(null);
  const autoPauseActionRef = useRef<() => void>(() => {});
  const autoResumeActionRef = useRef<() => void>(() => {});
  const stepCountRef = useRef(0);
  const lastStepTimestampRef = useRef<number | null>(null);
  const movementConfirmedRef = useRef(false);
  const movementStateRef = useRef<MovementState>('STATIONARY');
  const consecutiveMovementRef = useRef(0);
  const consecutiveStationaryRef = useRef(0);
  const resumeMovementPendingRef = useRef(false);
  const workoutEngineRef = useRef<WorkoutEngine | null>(null);
  const workoutVoiceRef = useRef<WorkoutVoiceService | null>(null);
  const splitEngineRef = useRef(new DistanceSplitEngine());
  const previousWorkoutPointRef = useRef<RunningGpsPoint | null>(null);
  const routeSegmentsRef = useRef<RouteSegment[]>([]);
  const pauseEventsRef = useRef<PauseEvent[]>([]);
  const workoutCompletionPromptShownRef = useRef(false);
  const handledNativeRunActionRef = useRef<string | null>(null);
  const saveConfirmationOpenRef = useRef(false);

  useEffect(() => () => {
    if (voiceCoachNoticeTimerRef.current) clearTimeout(voiceCoachNoticeTimerRef.current);
  }, []);

  const logsRef = useRef<string[]>([]);
  const [pauseMarkers, setPauseMarkers] = useState<PauseMarker[]>([]);
  const [location, setLocation] = useState<LocationState | null>(null);

  useEffect(() => {
    autoPauseEnabledRef.current = pauseSettingsLoaded && autoPauseEnabled;
    if (
      pauseSettingsLoaded
      && autoPauseEnabled
      && !manualPauseEnabled
      && isRunningRef.current
      && isPausedRef.current
      && !isAutoPausedRef.current
    ) {
      isAutoPausedRef.current = true;
      movementStateRef.current = 'STATIONARY';
      consecutiveMovementRef.current = 0;
      consecutiveStationaryRef.current = 0;
      resumeMovementPendingRef.current = true;
      void persistBackgroundLocationSession({
        active: true,
        paused: true,
        autoPaused: true,
        runId: runIdRef.current,
        userId: user?.id ? String(user.id) : null,
        startedAt: startTimeRef.current ? new Date(startTimeRef.current).toISOString() : null,
        updatedAt: pauseStartTimeRef.current,
        movementConfirmed: movementConfirmedRef.current,
        pauseEvents: pauseEventsRef.current,
      });
    }
  }, [autoPauseEnabled, manualPauseEnabled, pauseSettingsLoaded, user?.id]);

  useEffect(() => {
    const enabled = pauseSettingsLoaded && voiceAlertsEnabled;
    voiceAlertsEnabledRef.current = enabled;
    voiceCoach?.setMuted?.(!enabled || isVoiceMuted);
    workoutVoiceRef.current?.setEnabled(enabled);
  }, [isVoiceMuted, pauseSettingsLoaded, voiceAlertsEnabled]);

  const plannedRouteCoordinates = useMemo(() => {
    return assignedRoutePoints;
  }, [assignedRoutePoints]);

  const routeStatus = useMemo(() => {
    if (!location || plannedRouteCoordinates.length === 0) {
      return { label: 'ROUTE LOCATING', color: '#9CA3AF', distanceMeters: null };
    }

    const nearestDistance = distanceToRoute(location.coords, plannedRouteCoordinates);

    if (nearestDistance <= ROUTE_ON_DISTANCE_METERS) {
      return { label: 'ON ROUTE', color: '#0A84FF', distanceMeters: nearestDistance };
    }
    if (nearestDistance <= ROUTE_WARNING_DISTANCE_METERS) {
      return { label: 'ROUTE WARNING', color: '#FFD60A', distanceMeters: nearestDistance };
    }
    return { label: 'OFF ROUTE', color: '#FF453A', distanceMeters: nearestDistance };
  }, [location, plannedRouteCoordinates]);

  const addLog = useCallback((value: string) => {
    logsRef.current.push(value);
    if (logsRef.current.length > 200) logsRef.current.shift();
  }, []);

  const requestFinish = useCallback(() => {
    if (!isRunningRef.current || isStoppingRef.current) return;
    setCompletionPromptVisible(true);
  }, []);

  const prepareMovementGateForResume = useCallback(() => {
    if (!movementConfirmedRef.current) return;
    movementStateRef.current = 'STARTING';
    consecutiveMovementRef.current = MOVEMENT_CONFIRMATION_SAMPLES - 1;
    consecutiveStationaryRef.current = 0;
    resumeMovementPendingRef.current = true;
  }, []);

  const continueAfterCompletion = useCallback(() => {
    setCompletionPromptVisible(false);
    if (workoutEngineRef.current) {
      workoutEngineRef.current.continue();
      setWorkoutSnapshot(workoutEngineRef.current.getSnapshot());
      void workoutVoiceRef.current?.workoutCompleted();
      prepareMovementGateForResume();
    }
  }, [prepareMovementGateForResume]);

  const region = useMemo(
    () => location ? {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      latitudeDelta: 0.0007,
      longitudeDelta: 0.0007,
    } : undefined,
    [location]
  );

  const moveMapToLocation = useCallback((latitude: number, longitude: number) => {
    if (!mapRef.current || !isMapReady) return;

    const now = Date.now();
    if (now - lastCameraUpdateRef.current < 700) return;
    lastCameraUpdateRef.current = now;

    mapRef.current.animateCamera(
      {
        center: { latitude, longitude },
        zoom: 20,
      },
      { duration: 600 }
    );
  }, [isMapReady]);

  const fitMapToRoute = useCallback((coordinates: Coordinate[]) => {
    if (!mapRef.current || !isMapReady || coordinates.length === 0) return;

    if (coordinates.length < 2) {
      const first = coordinates[0];
      if (first) {
        moveMapToLocation(first.latitude, first.longitude);
      }
      return;
    }

    const lats = coordinates.map((point) => point.latitude);
    const lons = coordinates.map((point) => point.longitude);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const midLat = (minLat + maxLat) / 2;
    const midLon = (minLon + maxLon) / 2;

    const routeWidthMeters = calculateDistanceMeters(
      { latitude: midLat, longitude: minLon },
      { latitude: midLat, longitude: maxLon }
    );
    const routeHeightMeters = calculateDistanceMeters(
      { latitude: minLat, longitude: midLon },
      { latitude: maxLat, longitude: midLon }
    );

    // The old 0.002-degree minimum showed roughly 200m and made a room route appear tiny. Keep short routes at the close tracking zoom.
    if (Math.max(routeWidthMeters, routeHeightMeters) < 60) {
      mapRef.current.animateCamera(
        { center: { latitude: midLat, longitude: midLon }, zoom: 20 },
        { duration: 350 }
      );
      return;
    }

    const latDelta = Math.max(0.00015, (maxLat - minLat) * 1.2);
    const lonDelta = Math.max(0.00015, (maxLon - minLon) * 1.2);

    mapRef.current.animateToRegion(
      {
        latitude: midLat,
        longitude: midLon,
        latitudeDelta: latDelta,
        longitudeDelta: lonDelta,
      },
      350
    );
  }, [isMapReady, moveMapToLocation]);

  useEffect(() => {
    if (!isMapReady || plannedRouteCoordinates.length < 2) return;
    fitMapToRoute(plannedRouteCoordinates);
  }, [fitMapToRoute, isMapReady, plannedRouteCoordinates]);

  const zoomIn = useCallback(() => {
    if (!mapRef.current) return;
    mapRef.current.getCamera().then((camera) => {
      mapRef.current?.animateCamera(
        {
          zoom: (camera.zoom || 16) + 1,
        },
        { duration: 300 }
      );
    });
  }, []);

  const zoomOut = useCallback(() => {
    if (!mapRef.current) return;
    mapRef.current.getCamera().then((camera) => {
      mapRef.current?.animateCamera(
        {
          zoom: Math.max((camera.zoom || 16) - 1, 10),
        },
        { duration: 300 }
      );
    });
  }, []);

  const appendRoutePoint = useCallback((point: Coordinate, traceType: RouteSegment['traceType']) => {
    const current = routeSegmentsRef.current;
    const previous = current.at(-1);
    if (previous?.traceType === traceType) {
      routeSegmentsRef.current = [
        ...current.slice(0, -1),
        { ...previous, coordinates: [...previous.coordinates, point] },
      ];
    } else {
      const boundary = previous?.coordinates.at(-1);
      const coordinates = boundary
        && (boundary.latitude !== point.latitude || boundary.longitude !== point.longitude)
        ? [boundary, point]
        : [point];
      routeSegmentsRef.current = [
        ...current,
        { id: Date.now() + current.length, traceType, coordinates },
      ];
    }

    setRouteSegments(routeSegmentsRef.current);
  }, []);

  const requestLocation = useCallback(async (): Promise<boolean> => {
    try {
      setLoading(true);

      const granted = await LocationService.requestForegroundPermissions();
      if (!granted) {
        setPermissionGranted(false);
        Alert.alert(
          'Location Permission Required',
          'Please allow precise location access to track your runs.',
          [
            { text: 'OK', style: 'default' },
            {
              text: 'Settings',
              onPress: () => Location.requestForegroundPermissionsAsync(),
            },
          ]
        );
        return false;
      }

      await LocationService.enableHighAccuracyProvider();

      setPermissionGranted(true);

      const currentLocation = await LocationService.getCurrentLocation();

      const timestamp = typeof currentLocation.timestamp === 'number'
        ? currentLocation.timestamp
        : typeof currentLocation.timestamp === 'string'
          ? parseInt(currentLocation.timestamp, 10)
          : Date.now();

      setLocation({
        coords: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          accuracy: currentLocation.accuracy ?? null,
          altitude: currentLocation.altitude ?? null,
          altitudeAccuracy: null,
          heading: currentLocation.heading ?? null,
          speed: currentLocation.speed ?? null,
        },
        timestamp,
      });

      setAccuracy(currentLocation.accuracy ?? null);
      moveMapToLocation(currentLocation.latitude, currentLocation.longitude);
      addLog('?? Precise location access granted');
      addLog(`?? Accuracy: ${(currentLocation.accuracy ?? 0).toFixed(1)}m`);
      return true;
    } catch (error) {
      console.error('Location error:', error);
      Alert.alert('Location Error', 'Unable to get your current location. Please make sure GPS is enabled.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [addLog, moveMapToLocation]);

  useEffect(() => {
    if (hasInitializedLocationRef.current) return;
    hasInitializedLocationRef.current = true;
    void getBackgroundLocationSession().then((session) => {
      if (session?.active && session.runId) {
        setPermissionGranted(true);
        return;
      }
      void requestLocation();
    });
  }, [params.notificationAction, requestLocation]);

  useEffect(() => {
    return () => {
      isRunningRef.current = false;
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
      activityDetectionRef.current?.stop();
      activityDetectionRef.current = null;
      workoutVoiceRef.current?.stop();
      workoutVoiceRef.current = null;
      splitEngineRef.current.reset();
    };
  }, []);

  const advanceToNextStep = useCallback(() => {
    const plan = executionPlanRef.current;
    if (!plan || plan.length === 0) return;

    const currentIdx = currentStepIndexRef.current;
    const nextIdx = currentIdx + 1;

    if (nextIdx < plan.length) {
      const finishedStep = plan[currentIdx];
      const nextStep = plan[nextIdx];

      currentStepIndexRef.current = nextIdx;
      stepStartSecondsRef.current = elapsedSeconds;
      stepStartDistanceRef.current = distanceRef.current;
      halfwayAnnouncedRef.current = false;

      setCurrentStepIndex(nextIdx);
      setStepStartSeconds(elapsedSeconds);
      setStepStartDistanceMeters(distanceRef.current);

      voiceCoach?.announceStepTransition?.(finishedStep, nextStep);
    } else {
      if (!workoutCompletionPromptShownRef.current) {
        workoutCompletionPromptShownRef.current = true;
        setCompletionPromptVisible(true);
      }
    }
  }, [elapsedSeconds]);

  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      if (startTimeRef.current) {
        let elapsed: number;
        if (recoveredElapsedBaseRef.current !== null) {
          const continuedSeconds = recoveredResumeAtRef.current === null
            ? 0
            : (Date.now() - recoveredResumeAtRef.current) / 1000;
          const pausedAfterRecovery = Math.max(0, (pausedTimeRef.current ?? 0) - recoveredPausedBaselineRef.current) / 1000;
          elapsed = Math.floor(recoveredElapsedBaseRef.current + continuedSeconds - pausedAfterRecovery);
        } else {
          elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
          if (pausedTimeRef.current) elapsed -= Math.floor(pausedTimeRef.current / 1000);
        }
        
        setElapsedSeconds(elapsed);

        // Calculate total pace from the same accepted distance shown on screen.
        const totalAcceptedDistance = recordedDistanceRef.current;
        if (totalAcceptedDistance > 0) {
          const distanceInKm = totalAcceptedDistance / 1000;
          const elapsedMinutes = elapsed / 60;
          if (elapsedMinutes > 0) {
            const paceValue = elapsedMinutes / distanceInKm;
            setPace(paceValue);
          }
        }

        // Custom Workout Step Completion Check
        const plan = executionPlanRef.current;
        if (plan.length > 0 && !isPausedRef.current && !workoutEngineRef.current) {
          const currentIdx = currentStepIndexRef.current;
          const step = plan[currentIdx];
          if (step) {
            const stepElapsed = elapsed - stepStartSecondsRef.current;
            const stepDist = distanceRef.current - stepStartDistanceRef.current;

            // Check Duration target
            if (step.targetType === 'DURATION' && step.targetDurationSeconds) {
              if (
                !halfwayAnnouncedRef.current &&
                stepElapsed >= Math.floor(step.targetDurationSeconds / 2) &&
                step.targetDurationSeconds >= 20
              ) {
                halfwayAnnouncedRef.current = true;
                voiceCoach?.announceHalfway?.(step);
              }

              if (stepElapsed >= step.targetDurationSeconds) {
                advanceToNextStep();
              }
            }

            // Check Distance target
            if (step.targetType === 'DISTANCE' && step.targetDistanceMeters) {
              if (
                !halfwayAnnouncedRef.current &&
                stepDist >= Math.floor(step.targetDistanceMeters / 2) &&
                step.targetDistanceMeters >= 200
              ) {
                halfwayAnnouncedRef.current = true;
                voiceCoach?.announceHalfway?.(step);
              }

              if (stepDist >= step.targetDistanceMeters) {
                advanceToNextStep();
              }
            }
          }
        }
        const workoutEngine = workoutEngineRef.current;
        if (workoutEngine) {
          workoutEngine.tick();
          setWorkoutSnapshot(workoutEngine.getSnapshot());
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, advanceToNextStep]);

  const uploadBatch = useCallback(
    async (batch: RunningPathPoint[]) => {
      if (batch.length === 0) return;
      if (uploadInProgressRef.current) return;
      if (!runIdRef.current || !apiClientRef.current) return;

      uploadInProgressRef.current = true;

      try {
        addLog(`?? Uploading ${batch.length} points`);
        await apiClientRef.current.uploadBatch(runIdRef.current, batch);
        addLog(`? ${batch.length} points uploaded`);
      } catch (error) {
        console.error('Batch upload failed:', error);
        addLog('? Batch upload failed');
      } finally {
        uploadInProgressRef.current = false;
      }
    },
    [addLog]
  );

  const handleLocationUpdate = useCallback(
    (rawGps: RawGpsPayload, capturedPaused?: boolean, fromDurableJournal = false, fromBackgroundTask = false) => {
      if (!isRunningRef.current) return;

      const isSimulator = !Device.isDevice || (rawGps as any)?.mocked === true;
      const effectiveAccuracy = isSimulator
        ? (typeof rawGps.accuracy === 'number' && Number.isFinite(rawGps.accuracy) && rawGps.accuracy > 0 && rawGps.accuracy <= 15
            ? rawGps.accuracy
            : 5)
        : (rawGps.accuracy ?? Number.POSITIVE_INFINITY);
      const effectiveGps: RawGpsPayload = isSimulator
        ? { ...rawGps, accuracy: effectiveAccuracy, isSimulator: true }
        : rawGps;

      const timestamp = typeof rawGps.timestamp === 'number'
        ? rawGps.timestamp
        : typeof rawGps.timestamp === 'string'
          ? parseInt(rawGps.timestamp, 10)
          : Date.now();
      const pointKey = `${timestamp}|${rawGps.latitude}|${rawGps.longitude}`;
      if (processedLocationKeysRef.current.has(pointKey)) return;
      processedLocationKeysRef.current.add(pointKey);

      const processor = pathProcessorRef.current;

      setAccuracy(Number.isFinite(effectiveAccuracy) ? effectiveAccuracy : null);

      const publishLocation = () => setLocation({
        coords: {
          latitude: effectiveGps.latitude,
          longitude: effectiveGps.longitude,
          accuracy: Number.isFinite(effectiveAccuracy) ? effectiveAccuracy : null,
          altitude: effectiveGps.altitude ?? null,
          altitudeAccuracy: null,
          heading: effectiveGps.heading ?? null,
          speed: effectiveGps.speed ?? null,
        },
        timestamp,
      });

      if (!processor) {
        publishLocation();
        return;
      }

      const activityDetection = activityDetectionRef.current;
      const detectedActivity = activityDetection?.getCurrentActivity() ?? 'unknown';
      const hasDetectedMovement = detectedActivity === 'walking' || detectedActivity === 'running';
      const hasRecentStepEvidence = lastStepTimestampRef.current !== null
        && timestamp - lastStepTimestampRef.current <= 5_000;
      const previousPointDistance = previousLocationRef.current
        ? calculateDistanceMeters(previousLocationRef.current, effectiveGps)
        : 0;
      const accuracy = effectiveAccuracy;
      const hasGoodAccuracy = isSimulator ? true : (Number.isFinite(accuracy) && accuracy <= MAX_MOVEMENT_ACCURACY_METERS);
      const speed = rawGps.speed ?? 0;
      const previousTimestampValue = previousLocationRef.current?.timestamp;
      const previousTimestamp = typeof previousTimestampValue === 'number'
        ? previousTimestampValue
        : typeof previousTimestampValue === 'string'
          ? Number.isFinite(Number(previousTimestampValue)) ? Number(previousTimestampValue) : Date.parse(previousTimestampValue)
          : timestamp;
      const sampleElapsedSeconds = previousLocationRef.current
        ? Math.max(0.25, (timestamp - (Number.isFinite(previousTimestamp) ? previousTimestamp : timestamp)) / 1_000)
        : 0;
      const displacementSpeed = sampleElapsedSeconds > 0 ? previousPointDistance / sampleElapsedSeconds : 0;
      const requiredDisplacement = Math.max(
        MIN_MOVEMENT_DISTANCE_METERS,
        Number.isFinite(accuracy) ? accuracy * 0.5 : MIN_MOVEMENT_DISTANCE_METERS,
      );
      const hasMovementMagnitude = isSimulator
        ? (previousLocationRef.current === null || previousPointDistance >= 0.5 || speed >= 0.2)
        : previousLocationRef.current !== null
          && (speed >= MIN_MOVEMENT_SPEED_METERS_PER_SECOND
            || (previousPointDistance >= requiredDisplacement
              && displacementSpeed >= MIN_MOVEMENT_SPEED_METERS_PER_SECOND));
      const hasMotionEvidence = isSimulator || hasDetectedMovement || hasRecentStepEvidence;
      const hasExplicitResumeMovement = resumeMovementPendingRef.current
        && hasGoodAccuracy
        && hasMovementMagnitude;
      const hasMovementObservation = hasGoodAccuracy
        && hasMovementMagnitude
        && (fromDurableJournal || hasMotionEvidence || hasExplicitResumeMovement);
      const isLiveMovementSample = !fromDurableJournal || fromBackgroundTask;
      if (hasMovementObservation) {
        if (isLiveMovementSample && capturedPaused !== true) {
          lastMovementTimestampRef.current = timestamp;
        }
        consecutiveMovementRef.current += 1;
        consecutiveStationaryRef.current = 0;
        if (isSimulator || movementStateRef.current === 'STATIONARY') {
          movementStateRef.current = isSimulator ? 'MOVING' : 'STARTING';
        }
        if (
          isSimulator
          || (movementStateRef.current === 'STARTING'
          && consecutiveMovementRef.current >= MOVEMENT_CONFIRMATION_SAMPLES)
        ) {
          movementStateRef.current = 'MOVING';
          movementConfirmedRef.current = true;
        } else if (movementStateRef.current === 'STOPPING') {
          movementStateRef.current = 'MOVING';
        }
        if (movementStateRef.current === 'MOVING') {
          resumeMovementPendingRef.current = false;
        }
      } else {
        if (!resumeMovementPendingRef.current) consecutiveMovementRef.current = 0;
        consecutiveStationaryRef.current += 1;
        if (movementStateRef.current === 'MOVING') {
          movementStateRef.current = 'STOPPING';
        }
        if (
          (movementStateRef.current === 'STARTING' || movementStateRef.current === 'STOPPING')
          && consecutiveStationaryRef.current >= STATIONARY_CONFIRMATION_SAMPLES
        ) {
          movementStateRef.current = 'STATIONARY';
          if (!movementConfirmedRef.current) movementConfirmedRef.current = false;
        }
      }

      if (fromDurableJournal && !fromBackgroundTask && hasMovementObservation) {
        movementConfirmedRef.current = true;
        movementStateRef.current = 'MOVING';
        consecutiveStationaryRef.current = 0;
        resumeMovementPendingRef.current = false;
      }

      const movementState = movementStateRef.current;
      previousLocationRef.current = effectiveGps;
      // Keep the blue location dot anchored during GPS wander. The same
      // movement state gates route and distance below.
      if (movementState === 'MOVING') publishLocation();
      if (isLiveMovementSample && autoPauseEnabledRef.current) {
        if (
          isAutoPausedRef.current
          && isPausedRef.current
          && movementState === 'MOVING'
          && hasMovementObservation
          && hasGoodAccuracy
          && hasMovementMagnitude
          && (hasMotionEvidence || hasExplicitResumeMovement)
        ) {
          autoResumeActionRef.current();
        } else if (capturedPaused !== true
          && !isPausedRef.current
          && (!workoutEngineRef.current || workoutEngineRef.current.getSnapshot().state !== 'waiting')
          && movementState === 'STATIONARY'
          && hasGoodAccuracy
          && speed < MIN_MOVEMENT_SPEED_METERS_PER_SECOND
          && lastMovementTimestampRef.current !== null
          && timestamp - lastMovementTimestampRef.current >= AUTO_PAUSE_STATIONARY_DURATION_MS
        ) {
          autoPauseActionRef.current();
        }
      }

      const shouldProcessRoute = movementState === 'MOVING'
        || (fromDurableJournal && capturedPaused !== true && hasGoodAccuracy);
      previousLocationRef.current = rawGps;
      if (!shouldProcessRoute) {
        previousWorkoutPointRef.current = null;
        if (movementStateRef.current === 'MOVING') {
          moveMapToLocation(effectiveGps.latitude, effectiveGps.longitude);
        }
        return;
      }

      // Only movement-gated points enter the existing Kalman/RDP path.
      const displayCountBefore = processor.getDisplayPoints().length;
      const retained = processor.ingestRaw(effectiveGps);
      const workoutEngine = workoutEngineRef.current;
      const isPausePoint = capturedPaused ?? isPausedRef.current;
      const countsWorkoutDistance = isPausePoint
        ? false
        : workoutEngine?.isDistanceCounting() ?? !isPausedRef.current;
      const traceType: RouteSegment['traceType'] = isPausePoint
        ? 'pause'
        : workoutEngine?.shouldUseLightPolyline()
          ? 'extra'
          : 'active';

      // A pause/rest boundary must never be bridged by the next accepted
      // point after tracking resumes; the movement gate still controls which
      // points are allowed into the route pipeline.
      if (workoutEngine && !countsWorkoutDistance) {
        previousWorkoutPointRef.current = null;
        previousLocationRef.current = effectiveGps;
      }

      if (retained) {
        // A polyline requires two coordinates. The first movement-gated point
        // establishes the route; later accepted points extend it.
        const displayPointWasAdded = processor.getDisplayPoints().length > displayCountBefore;
        const latestDisplayPoint = processor.getDisplayPoints().at(-1);
        if (displayPointWasAdded && latestDisplayPoint && (isSimulator || isReliableRoutePoint(latestDisplayPoint))) {
          appendRoutePoint(
            { latitude: latestDisplayPoint.latitude, longitude: latestDisplayPoint.longitude },
            traceType,
          );

        }
        if (__DEV__) {
          addLog(`📌 Live polyline: ${processor.getRawPoints().length} points`);
        }

        if (displayPointWasAdded && latestDisplayPoint && lastRetainedCoordinateRef.current) {
          const movementDistance = calculateDistanceMeters(
            lastRetainedCoordinateRef.current,
            { latitude: latestDisplayPoint.latitude, longitude: latestDisplayPoint.longitude }
          );

          const maxJumpDistance = isSimulator ? 500 : 50;
          if (movementDistance > 0 && movementDistance < maxJumpDistance) {
            if (countsWorkoutDistance) {
              const nextDistance = distanceRef.current + movementDistance;
              distanceRef.current = nextDistance;
              setWorkoutDistance(nextDistance);
              const completedSplits = splitEngineRef.current.addAcceptedDistance(movementDistance, latestDisplayPoint.timestamp);
              completedSplits.forEach((split) => {
                void workoutVoiceRef.current?.splitCompleted(split.splitNumber * SPLIT_DISTANCE_METERS);
              });
              // The segment receives this exact accepted delta, so its
              // 0/10m-style progress and the SDK total advance together.
              if (workoutEngine) {
                workoutEngine.ingestAcceptedDistance(movementDistance, latestDisplayPoint);
                previousWorkoutPointRef.current = latestDisplayPoint;
                const snapshot = workoutEngine.getSnapshot();
                setWorkoutSnapshot(snapshot);
              }
            } else if (workoutEngine && (workoutEngine.getSnapshot().state === 'waiting' || workoutEngine.getSnapshot().state === 'completed')) {
              extraDistanceRef.current += movementDistance;
              const completedSplits = splitEngineRef.current.addAcceptedDistance(movementDistance, latestDisplayPoint.timestamp);
              completedSplits.forEach((split) => {
                void workoutVoiceRef.current?.splitCompleted(split.splitNumber * SPLIT_DISTANCE_METERS);
              });
            }
          }
        }

        if (displayPointWasAdded && latestDisplayPoint) {
          lastRetainedCoordinateRef.current = {
            latitude: latestDisplayPoint.latitude,
            longitude: latestDisplayPoint.longitude,
          };
        }

        const completedLaps = workoutEngine?.getSnapshot().completedLaps ?? [];
        const routeBoundaries = [
          ...pauseEventsRef.current.flatMap((event) => [
            Date.parse(event.paused_at),
            event.resumed_at ? Date.parse(event.resumed_at) : Number.NaN,
          ]),
          ...completedLaps.flatMap((lap) => [lap.startedAt, lap.completedAt]),
        ].filter((boundary): boundary is number => (
          typeof boundary === 'number' && Number.isFinite(boundary)
        ));
        const filteredPoints = processor.filterRawPoints(routeBoundaries);
        const reliableRoutePoints: RunningGpsPoint[] = Device.isDevice
          ? filteredPoints.filter(isReliableRoutePoint)
          : filteredPoints;
        const maximumJumpDistance = Device.isDevice ? 50 : 500;
        const uploadRoutePoints = filterRoutePointsByMaximumJump(
          reliableRoutePoints,
          maximumJumpDistance,
        );
        const pauseIntervals = pauseEventsRef.current
          .map((event) => ({
            startedAt: Date.parse(event.paused_at),
            endedAt: event.resumed_at ? Date.parse(event.resumed_at) : Number.POSITIVE_INFINITY,
          }))
          .filter(({ startedAt, endedAt }) => (
            Number.isFinite(startedAt)
            && (Number.isFinite(endedAt) || endedAt === Number.POSITIVE_INFINITY)
          ));
        const restIntervals = completedLaps
          .filter((lap) => lap.segmentType === 'Rest')
          .map((lap) => ({
            startedAt: lap.startedAt,
            endedAt: lap.completedAt ?? timestamp,
          }));
        const nonCountingIntervals = [
          ...pauseIntervals,
          ...restIntervals,
        ];
        const submittedRoutePoints = uploadRoutePoints.filter((point) => !pauseIntervals.some((interval) => (
          point.timestamp >= interval.startedAt && point.timestamp <= interval.endedAt
        )));
        const extraRouteCoordinates = routeSegmentsRef.current
          .filter((segment) => segment.traceType === 'extra')
          .flatMap((segment) => segment.coordinates);
        const isExtraDistancePoint = (point: RunningGpsPoint) => extraRouteCoordinates.some((coordinate) => (
          coordinate.latitude === point.latitude
          && coordinate.longitude === point.longitude
        ));
        const { totalDistance } = calculateRouteDistanceBreakdown(
          submittedRoutePoints,
          nonCountingIntervals,
          isExtraDistancePoint,
        );
        recordedDistanceRef.current = totalDistance;
        setDistance(totalDistance);
      } else {
        if (__DEV__) {
          addLog('? GPS point rejected');
        }
      }

      if (movementState === 'MOVING') moveMapToLocation(effectiveGps.latitude, effectiveGps.longitude);
    },
    [addLog, appendRoutePoint, fitMapToRoute, moveMapToLocation, uploadBatch]
  );

  const reconcileJournaledPoints = useCallback(async () => {
    if (!isRunningRef.current) return;
    await flushBackgroundLocationTask();
    await flushActiveRunJournal();
    const journal = await readActiveRunJournal();
    if (!journal?.active || journal.runId !== runIdRef.current) return;

    [
      ...journal.points.map((point) => ({ point, paused: false })),
      ...(journal.pausePoints ?? []).map((point) => ({ point, paused: true })),
    ]
      .sort((left, right) => Number(left.point.timestamp ?? 0) - Number(right.point.timestamp ?? 0))
      .forEach(({ point, paused }) => handleLocationUpdate(point, paused, true));
  }, [handleLocationUpdate]);

  const startLiveGPS = useCallback(async () => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }

    locationSubscription.current = await LocationService.watchLocation(handleLocationUpdate);
    // This supplements the untouched watcher only after the workout starts.
    setBackgroundLocationListener((point, paused, fromDurableJournal) => (
      handleLocationUpdate(point, paused, fromDurableJournal, true)
    ));
    // Android only permits a location foreground service to be created while
    // this app is visible. If the user backgrounds during startup, the active
    // AppState listener below retries when they return instead of treating the
    // working foreground watcher as a failure.
    if (AppState.currentState === 'active') {
      try {
        await startBackgroundLocationTracking();
      } catch (error) {
        console.warn('[BackgroundLocationTask] Foreground service start deferred', error);
      }
    }
    await reconcileJournaledPoints();
    addLog('?? Live GPS tracking started');
  }, [addLog, handleLocationUpdate, reconcileJournaledPoints]);

  const continueRecoveredWorkout = async () => {
    if (!runIdRef.current || isRunningRef.current || isStartingRef.current) return;
    isStartingRef.current = true;
    try {
      const activityDetection = new ActivityDetectionService();
      activityDetectionRef.current = activityDetection;
      void activityDetection.start().catch((error) => {
        console.warn('[MapScreen] Recovered activity monitoring unavailable', error);
      });
      const stepDetection = new StepDetectionService();
      stepDetectionRef.current = stepDetection;
      void stepDetection.start((steps) => {
        lastStepTimestampRef.current = Date.now();
        stepCountRef.current = steps;
      }).catch((error) => {
        console.warn('[MapScreen] Recovered pedometer unavailable', error);
      });

      isRunningRef.current = true;
      setIsRunning(true);
      lastMovementTimestampRef.current = isPausedRef.current ? null : Date.now();
      await startLiveGPS();
      recoveredResumeAtRef.current = isPausedRef.current ? null : Date.now();
      recoveredPausedBaselineRef.current = pausedTimeRef.current ?? 0;
      await startLiveTrackingNotification({
        runId: runIdRef.current,
        distanceKm: distanceRef.current / 1000,
        elapsedSeconds,
        paceMinutesPerKm: pace,
        status: isPausedRef.current ? 'paused' : 'running',
        startedAt: startTimeRef.current ? new Date(startTimeRef.current).toISOString() : null,
      });
      setRecoveryPromptVisible(false);
    } catch (error) {
      isRunningRef.current = false;
      setIsRunning(false);
      setBackgroundLocationListener(undefined);
      locationSubscription.current?.remove();
      locationSubscription.current = null;
      void stopBackgroundLocationTracking().catch((stopError) => {
        console.warn('[BackgroundLocationTask] Could not stop after resume failure', stopError);
      });
      activityDetectionRef.current?.stop();
      activityDetectionRef.current = null;
      stepDetectionRef.current?.stop();
      stepDetectionRef.current = null;
      console.warn('[MapScreen] Could not continue recovered workout', error);
      Alert.alert('Could not resume workout', 'Your checkpoint is still saved. Check location access and try again.');
    } finally {
      isStartingRef.current = false;
    }
  };

  useEffect(() => {
    if (!isRunning) return;
    const startedAt = startTimeRef.current ? new Date(startTimeRef.current).toISOString() : null;
    void persistBackgroundLocationSession({
      active: true,
      paused: isPaused,
      autoPaused: isAutoPausedRef.current,
      runId: runIdRef.current,
      userId: user?.id ? String(user.id) : null,
      startedAt,
      updatedAt: Date.now(),
      distanceKm: distance / 1000,
      elapsedSeconds,
      paceMinutesPerKm: pace,
      movementConfirmed: movementConfirmedRef.current,
      confirmationPromptVisible: completionPromptVisible,
      pauseEvents: pauseEventsRef.current,
    });
    updateLiveTrackingNotification({
      runId: runIdRef.current,
      distanceKm: distance / 1000,
      elapsedSeconds,
      paceMinutesPerKm: pace,
      status: isPaused ? 'paused' : 'running',
      startedAt,
    });
  }, [completionPromptVisible, distance, elapsedSeconds, isPaused, isRunning, pace, user?.id]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void reconcileJournaledPoints();
      if (isRunningRef.current && !locationSubscription.current) {
        void startLiveGPS().catch((error) => {
          console.warn('[LocationManager] GPS watcher retry failed after resume', error);
        });
      } else if (isRunningRef.current) {
        void startBackgroundLocationTracking().catch((error) => {
          console.warn('[BackgroundLocationTask] Foreground service retry failed', error);
        });
      }
    });
    return () => subscription.remove();
  }, [reconcileJournaledPoints, startLiveGPS]);

  useEffect(() => {
    let cancelled = false;
    const restoreActiveRun = async () => {
      await flushActiveRunJournal();
      const [session, journal] = await Promise.all([
        getBackgroundLocationSession(),
        readActiveRunJournal(),
      ]);
      if (
        cancelled
        || !session?.active
        || !session.runId
        || !journal?.active
        || journal.runId !== session.runId
        || (session.userId && String(session.userId) !== String(user?.id ?? ''))
      ) return;
      if (params.runId && params.runId !== session.runId) return;
      if (isRunningRef.current || isStartingRef.current) return;
      if (restoredRunIdRef.current === session.runId) return;
      restoredRunIdRef.current = session.runId;

      const processor = new PathProcessor(session.runId);
      pathProcessorRef.current = processor;
      runIdRef.current = session.runId;
      apiClientRef.current = new RunningApiClient();
      startTimeRef.current = session.startedAt ? new Date(session.startedAt).getTime() : Date.now();
      isPausedRef.current = Boolean(session.paused);
      isAutoPausedRef.current = Boolean(session.autoPaused);
      lastMovementTimestampRef.current = session.paused ? null : Date.now();
      setIsPaused(Boolean(session.paused));
      if (session.activityType === 'WALK' || session.activityType === 'RUN') {
        selectedActivityTypeRef.current = session.activityType;
        setSelectedActivityType(session.activityType);
      }
      pauseEventsRef.current = session.pauseEvents ?? [];
      pausedTimeRef.current = pauseEventsRef.current.reduce((total, event) => {
        const startedAt = Date.parse(event.paused_at);
        const endedAt = event.resumed_at ? Date.parse(event.resumed_at) : Number.NaN;
        return Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt >= startedAt
          ? total + endedAt - startedAt
          : total;
      }, 0);
      const openPauseEvent = pauseEventsRef.current.at(-1);
      const openPauseStart = openPauseEvent && !openPauseEvent.resumed_at
        ? Date.parse(openPauseEvent.paused_at)
        : Number.NaN;
      pauseStartTimeRef.current = Number.isFinite(openPauseStart) ? openPauseStart : null;

      const restoredPoints = [
        ...journal.points.map((point) => ({ ...point, pauseSequence: undefined })),
        ...(journal.pausePoints ?? []),
      ].sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0));
      restoredPoints.forEach((point) => {
        const timestamp = typeof point.timestamp === 'number'
          ? point.timestamp
          : typeof point.timestamp === 'string'
            ? parseInt(point.timestamp, 10)
            : Date.now();
        processedLocationKeysRef.current.add(`${timestamp}|${point.latitude}|${point.longitude}`);
        processor.ingestRaw(point);
      });
      previousLocationRef.current = restoredPoints.at(-1) ?? null;
      const displayPoints = processor.getDisplayPoints();
      movementConfirmedRef.current = session.movementConfirmed ?? displayPoints.length > 0;
      movementStateRef.current = movementConfirmedRef.current ? 'MOVING' : 'STATIONARY';
      if (session.paused && session.autoPaused) {
        movementStateRef.current = 'STATIONARY';
        resumeMovementPendingRef.current = true;
      }
      if (displayPoints.length > 0) {
        const restoredSegments: RouteSegment[] = [];
        restoredPoints.forEach((point) => {
          if (Device.isDevice && !isReliableRoutePoint(point)) return;
          const traceType: RouteSegment['traceType'] = point.pauseSequence ? 'pause' : 'active';
          const coordinate = { latitude: point.latitude, longitude: point.longitude };
          const previousSegment = restoredSegments.at(-1);
          if (previousSegment?.traceType === traceType) {
            previousSegment.coordinates.push(coordinate);
          } else {
            const boundary = previousSegment?.coordinates.at(-1);
            restoredSegments.push({
              id: Date.now() + restoredSegments.length,
              traceType,
              coordinates: boundary
                && (boundary.latitude !== coordinate.latitude || boundary.longitude !== coordinate.longitude)
                ? [boundary, coordinate]
                : [coordinate],
            });
          }
        });
        routeSegmentsRef.current = restoredSegments;
        setRouteSegments(routeSegmentsRef.current);
        const lastPoint = displayPoints.at(-1);
        if (lastPoint) {
          lastRetainedCoordinateRef.current = { latitude: lastPoint.latitude, longitude: lastPoint.longitude };
          setLocation({
            coords: {
              latitude: lastPoint.latitude,
              longitude: lastPoint.longitude,
              accuracy: lastPoint.accuracy,
              altitude: lastPoint.altitude,
              altitudeAccuracy: null,
              heading: lastPoint.heading,
              speed: lastPoint.speed,
            },
            timestamp: lastPoint.timestamp,
          });
        }
      }

      const restoredDistance = (session.distanceKm ?? calculateAcceptedRouteDistance(displayPoints)) * (session.distanceKm === undefined ? 1 / 1000 : 1);
      distanceRef.current = restoredDistance * 1000;
      recordedDistanceRef.current = distanceRef.current;
      setWorkoutDistance(distanceRef.current);
      setDistance(distanceRef.current);
      const restoredElapsed = session.elapsedSeconds ?? Math.max(0, (Date.now() - startTimeRef.current) / 1000);
      setElapsedSeconds(restoredElapsed);
      recoveredElapsedBaseRef.current = restoredElapsed;
      recoveredResumeAtRef.current = null;
      recoveredPausedBaselineRef.current = pausedTimeRef.current ?? 0;
      setPace(session.paceMinutesPerKm ?? (distanceRef.current > 0 ? restoredElapsed / 60 / (distanceRef.current / 1000) : 0));
      setCompletionPromptVisible(
        Boolean(session.confirmationPromptVisible)
          || params.notificationAction === LIVE_TRACKING_STOP_ACTION,
      );
      const shouldWaitForRecoveryChoice = params.recoveryReview === '1'
        || session.updatedAt == null
        || Date.now() - session.updatedAt >= WORKOUT_CHECKPOINT_STALE_AFTER_MS;
      if (shouldWaitForRecoveryChoice) {
        setRecoveryCheckpointAt(session.updatedAt ?? null);
        setRecoveryPromptVisible(true);
      }

      queueRef.current = new LocationQueue();
      if (shouldWaitForRecoveryChoice) {
        isRunningRef.current = false;
        setIsRunning(false);
        return;
      }

      const activityDetection = new ActivityDetectionService();
      activityDetectionRef.current = activityDetection;
      void activityDetection.start().catch((error) => {
        console.warn('[MapScreen] Restored activity monitoring unavailable', error);
      });
      const stepDetection = new StepDetectionService();
      stepDetectionRef.current = stepDetection;
      void stepDetection.start((steps) => {
        lastStepTimestampRef.current = Date.now();
        stepCountRef.current = steps;
      }).catch((error) => {
        console.warn('[MapScreen] Restored pedometer unavailable', error);
      });
      isRunningRef.current = true;
      setIsRunning(true);
      lastMovementTimestampRef.current = session.paused ? null : Date.now();
      try {
        await startLiveGPS();
        recoveredResumeAtRef.current = session.paused ? null : Date.now();
        recoveredPausedBaselineRef.current = pausedTimeRef.current ?? 0;
        await startLiveTrackingNotification({
          runId: session.runId,
          distanceKm: distanceRef.current / 1000,
          elapsedSeconds: restoredElapsed,
          paceMinutesPerKm: session.paceMinutesPerKm ?? 0,
          status: session.paused ? 'paused' : 'running',
          startedAt: session.startedAt,
        });
      } catch (error) {
        console.warn('[MapScreen] Active run restored without background service', error);
      }
      addLog('Active run restored after process restart');
    };
    void restoreActiveRun();
    return () => { cancelled = true; };
  }, [addLog, handleLocationUpdate, params.notificationAction, params.recoveryReview, params.runId, startLiveGPS, user?.id]);

  const startRun = async (overrideType?: 'RUN' | 'WALK') => {
    if (isStartingRef.current || isRunningRef.current) {
      return;
    }

    const activityTypeToUse: 'RUN' | 'WALK' = overrideType || selectedActivityTypeRef.current || 'RUN';
    selectedActivityTypeRef.current = activityTypeToUse;
    setSelectedActivityType(activityTypeToUse);

    isStartingRef.current = true;
    let backgroundServiceStartedForAttempt = false;
    try {
      if (!user?.id) {
        Alert.alert('Account unavailable', 'Please sign in again before starting a run.');
        return;
      }

      if (!permissionGranted) {
        const foregroundLocationGranted = await requestLocation();
        if (!foregroundLocationGranted) return;
      }

      let selectedWorkout: BackendWorkout | null = null;

      routeSegmentsRef.current = [];
      pauseEventsRef.current = [];
      restoredRunIdRef.current = null;
      processedLocationKeysRef.current = new Set();
      setRouteSegments([]);
      setPauseMarkers([]);
      distanceRef.current = 0;
      extraDistanceRef.current = 0;
      recordedDistanceRef.current = 0;
      splitEngineRef.current.reset();
      setWorkoutDistance(0);
      setDistance(0);
      setElapsedSeconds(0);
      stepCountRef.current = 0;
      lastStepTimestampRef.current = null;
      isAutoPausedRef.current = false;
      lastMovementTimestampRef.current = null;
      movementConfirmedRef.current = false;
      movementStateRef.current = 'STATIONARY';
      consecutiveMovementRef.current = 0;
      consecutiveStationaryRef.current = 0;
      resumeMovementPendingRef.current = false;
      setPace(0);
      setIsPaused(false);
      logsRef.current = [];
      previousLocationRef.current = null;
      lastRetainedCoordinateRef.current = null;
      isPausedRef.current = false;
      pausedTimeRef.current = null;
      pauseStartTimeRef.current = null;
      previousWorkoutPointRef.current = null;
      workoutVoiceRef.current?.stop();
      workoutVoiceRef.current = null;
      workoutEngineRef.current = null;
      workoutCompletionPromptShownRef.current = false;
      setWorkoutSnapshot(null);

      const apiClient = new RunningApiClient();
      apiClientRef.current = apiClient;

      const startedAt = new Date().toISOString();
      startTimeRef.current = new Date(startedAt).getTime();
      recoveredElapsedBaseRef.current = null;
      recoveredResumeAtRef.current = null;
      recoveredPausedBaselineRef.current = 0;
      const userId = String(user?.id ?? '1');
      let runId = 'RUN-' + Date.now() + '-OFFLINE';
      try {
        const startResponse = await apiClient.startRun(userId, startedAt);
        if (startResponse && startResponse.success && startResponse.run_id) {
          runId = startResponse.run_id;
        }
      } catch (startError) {
        console.warn('[MapScreen] Offline start run fallback:', startError);
      }

      runIdRef.current = runId;
      runIdRef.current = runId;
      await beginActiveRunJournal(runId, startedAt);
      await persistBackgroundLocationSession({
        active: true,
        paused: false,
        autoPaused: false,
        runId,
        userId,
        startedAt,
        updatedAt: new Date(startedAt).getTime(),
        pauseEvents: pauseEventsRef.current,
        activityType: activityTypeToUse,
      });

      // Start the location foreground service while the app is visible. This
      // supports an active run with foreground permission without requiring
      // the separate all-the-time permission.
      try {
        await startBackgroundLocationTracking();
        backgroundServiceStartedForAttempt = true;
      } catch (error) {
        console.warn('[BackgroundLocationTask] Unable to start background tracking; foreground GPS will continue', error);
        Alert.alert(
          'Background GPS unavailable',
          'Your workout will record while Zy-Run is open, but location tracking may stop if you switch apps or turn off the screen.'
        );
      }

      // Only query backend training plan if this is NOT a custom workout execution plan.
      if (params.workoutTitle && !params.workoutPlan && executionPlan.length === 0) {
        try {
          const plan = await workoutPlanService.getCurrent();
          selectedWorkout = plan?.weeks
            ?.flatMap((week) => week.workouts)
            ?.find((workout) => workout.title === params.workoutTitle) ?? null;
          if (!selectedWorkout) {
            console.warn('[MapScreen] Workout not found in backend plan:', params.workoutTitle);
          }
        } catch (planError) {
          console.warn('[MapScreen] Failed to fetch backend training plan (proceeding without backend plan):', planError);
        }
      }
      setIsPlannedWorkout(selectedWorkout !== null);

      const currentLocation = await LocationService.getCurrentLocation();

      const startingPoint: Coordinate = {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      };

      const pathProcessor = new PathProcessor(runId);
      pathProcessorRef.current = pathProcessor;
      pathProcessor.reset();

      // Do not seed Kalman/RDP or the map with the initial fix. The movement
      // gate will admit the first route point only after motion is confirmed.
      const startRoutePoint = null;

      const structuredWorkout = selectedWorkout ?? serializedWorkout;
      if (structuredWorkout) {
        const voice = new WorkoutVoiceService();
        voice.setEnabled(voiceAlertsEnabledRef.current);
        let engine: WorkoutEngine;
        engine = new WorkoutEngine({
          onSegmentStarted: (segment) => {
            voice.segmentStarted(segment);
            const stepIndex = segment.segmentOrder - 1;
            if (stepIndex >= 0 && stepIndex < executionPlanRef.current.length) {
              currentStepIndexRef.current = stepIndex;
              setCurrentStepIndex(stepIndex);
              const currentElapsed = startTimeRef.current
                ? Math.max(0, (Date.now() - startTimeRef.current) / 1000)
                : 0;
              stepStartSecondsRef.current = currentElapsed;
              setStepStartSeconds(currentElapsed);
              stepStartDistanceRef.current = distanceRef.current;
              setStepStartDistanceMeters(distanceRef.current);
            }
            setWorkoutSnapshot(engine.getSnapshot());
          },
          onSegmentCompleted: (lap) => {
            void voice.segmentCompleted(lap).then(() => {
              if (!isRunningRef.current) return;
              const state = engine.getSnapshot().state;
              if (state !== 'completed') {
                // Planned segments continue without interrupting the runner.
                engine.continue();
                setWorkoutSnapshot(engine.getSnapshot());
                return;
              }

              if (workoutCompletionPromptShownRef.current) return;
              workoutCompletionPromptShownRef.current = true;
              setCompletionPromptVisible(true);
            });
            setWorkoutSnapshot(engine.getSnapshot());
          },
          onWorkoutCompleted: () => {
            if (workoutCompletionPromptShownRef.current) {
              setWorkoutSnapshot(engine.getSnapshot());
              return;
            }
            workoutCompletionPromptShownRef.current = true;
            setCompletionPromptVisible(true);
            setWorkoutSnapshot(engine.getSnapshot());
          },
        });
        workoutVoiceRef.current = voice;
        workoutEngineRef.current = engine;
        engine.loadWorkout(structuredWorkout);
        voice.workoutStarted(structuredWorkout);
        engine.start(startRoutePoint);
        previousWorkoutPointRef.current = startRoutePoint;
        setWorkoutSnapshot(engine.getSnapshot());
      }

      const activityDetection = new ActivityDetectionService();
      activityDetectionRef.current = activityDetection;
      const stepDetection = new StepDetectionService();
      stepDetectionRef.current = stepDetection;

      const queue = new LocationQueue();
      queueRef.current = queue;


      isRunningRef.current = true;
      setIsRunning(true);
      if (voiceAlertsEnabledRef.current) {
        setVoiceCoachNoticeVisible(true);
        if (voiceCoachNoticeTimerRef.current) clearTimeout(voiceCoachNoticeTimerRef.current);
        voiceCoachNoticeTimerRef.current = setTimeout(() => {
          setVoiceCoachNoticeVisible(false);
          voiceCoachNoticeTimerRef.current = null;
        }, 8000);
      }
      lastMovementTimestampRef.current = Date.now();

      if (executionPlan.length > 0) {
        currentStepIndexRef.current = 0;
        stepStartSecondsRef.current = 0;
        stepStartDistanceRef.current = 0;
        halfwayAnnouncedRef.current = false;
        setCurrentStepIndex(0);
        setStepStartSeconds(0);
        setStepStartDistanceMeters(0);
        voiceCoach?.announceStepStart?.(executionPlan[0]);
      }

      addLog(`🚀 ${activityTypeToUse === 'WALK' ? 'Walk' : 'Run'} ${runId} started`);
      if (params.workoutTitle) addLog(`Planned workout: ${params.workoutTitle}`);
      addLog('?? GPS tracking enabled');
      moveMapToLocation(startingPoint.latitude, startingPoint.longitude);

      // GPS is the primary source of truth. Do not await motion activity
      // recognition (or the location watcher setup) before showing the active
      // recording UI: either native request can be slow on Android.
      void startLiveGPS()
        .then(async () => {
          try {
            await startLiveTrackingNotification({
              runId,
              distanceKm: 0,
              elapsedSeconds: 0,
              paceMinutesPerKm: 0,
              status: 'running',
              startedAt,
            });
          } catch (notificationError) {
            console.warn('[LiveTrackingNotification] Unable to start live notification', notificationError);
          }
        })
        .catch((error) => {
          console.error('[LocationManager] GPS watcher failed to start', error);
          addLog('GPS watcher failed to start');
        });

      void activityDetection.start().catch((error) => {
        console.warn('[LocationManager] Activity monitoring startup failed; GPS recording continues', error);
      });
      void stepDetection.start((steps) => {
        lastStepTimestampRef.current = Date.now();
        stepCountRef.current = steps;
      }).catch((error) => {
        console.warn('[LocationManager] Pedometer startup failed; movement gate will require activity recognition and GPS evidence', error);
      });
    } catch (error) {
      console.error('Start run error:', error);
      if (runIdRef.current) {
        await persistBackgroundLocationSession({
          active: false,
          runId: runIdRef.current,
          userId: user?.id ? String(user.id) : null,
          startedAt: startTimeRef.current ? new Date(startTimeRef.current).toISOString() : null,
          updatedAt: Date.now(),
          movementConfirmed: false,
          pauseEvents: pauseEventsRef.current,
        });
      }
      if (backgroundServiceStartedForAttempt) {
        await stopBackgroundLocationTracking().catch((stopError) => {
          console.warn('[BackgroundLocationTask] Unable to clean up foreground service after failed start', stopError);
        });
      }
      await flushBackgroundLocationTask();
      await clearBackgroundLocationSession();
      await clearActiveRunJournal();
      setBackgroundLocationListener(undefined);
      locationSubscription.current?.remove();
      locationSubscription.current = null;
      pathProcessorRef.current = null;
      runIdRef.current = null;
      restoredRunIdRef.current = null;
      apiClientRef.current = null;
      activityDetectionRef.current?.stop();
      activityDetectionRef.current = null;
      stepDetectionRef.current?.stop();
      stepDetectionRef.current = null;
      isRunningRef.current = false;
      setIsRunning(false);
      Alert.alert('Error', 'Failed to start run. Please check your location settings.');
    } finally {
      isStartingRef.current = false;
    }
  };

  const handleSelectActivityAndStart = async (type: 'RUN' | 'WALK') => {
    setIsActivityModalVisible(false);
    selectedActivityTypeRef.current = type;
    setSelectedActivityType(type);
    await startRun(type);
  };

  const pauseRun = useCallback(async () => {
    if (isPausingRef.current || !isRunningRef.current || isPausedRef.current) {
      return;
    }

    isPausingRef.current = true;
    try {

      // Keep the single GPS watcher active. This movement is displayed in a
      // light colour but is excluded from the active lap's distance.
      workoutEngineRef.current?.pause();
      setWorkoutSnapshot(workoutEngineRef.current?.getSnapshot() ?? null);

      // Keep an auditable pause record even while the GPS watcher continues.
      const pausedAt = Date.now();
      resumeMovementPendingRef.current = false;
      const pauseLocation = location
        ? { latitude: location.coords.latitude, longitude: location.coords.longitude }
        : null;
      pauseStartTimeRef.current = pausedAt;
      pauseEventsRef.current.push({
        paused_at: new Date(pausedAt).toISOString(),
        resumed_at: null,
        duration_s: null,
        pause_location: pauseLocation,
        resume_location: null,
      });
      if (pauseLocation) {
        setPauseMarkers((markers) => [
          ...markers,
          { id: Date.now(), type: 'pause', coordinate: pauseLocation },
        ]);
 
      // if (pauseLocation) {
      //   setPauseMarkers((markers) => [...markers, {
      //     id: pausedAt,
      //     type: 'pause',
      //     coordinate: pauseLocation,
      //     timestamp: pausedAt,
      //   }]);
      }
      isPausedRef.current = true;
      setIsPaused(true);
      await persistBackgroundLocationSession({
        active: true,
        paused: true,
        autoPaused: isAutoPausedRef.current,
        runId: runIdRef.current,
        userId: user?.id ? String(user.id) : null,
        startedAt: startTimeRef.current ? new Date(startTimeRef.current).toISOString() : null,
        updatedAt: pauseStartTimeRef.current,
        movementConfirmed: movementConfirmedRef.current,
        pauseEvents: pauseEventsRef.current,
      });

      addLog('⏸ Run paused - tracking stopped');
    } catch (error) {
      console.error('Pause run error:', error);
      addLog('❌ Failed to pause run');
    } finally {
      isPausingRef.current = false;
    }
  }, [addLog, elapsedSeconds, location, pace, user]);

  const resumeRun = useCallback(async () => {
    if (!isPausedRef.current || !isRunningRef.current) {
      return;
    }

    try {

      const resumedAt = Date.now();
      const resumeLocation = location
        ? { latitude: location.coords.latitude, longitude: location.coords.longitude }
        : null;
      // Add paused duration to total and finalize the most recent pause event.
      if (pauseStartTimeRef.current) {
        const pausedDuration = resumedAt - pauseStartTimeRef.current;
        pausedTimeRef.current = (pausedTimeRef.current || 0) + pausedDuration;
        const pauseEvent = pauseEventsRef.current.at(-1);
        if (pauseEvent && pauseEvent.resumed_at === null) {
          pauseEvent.resumed_at = new Date(resumedAt).toISOString();
          pauseEvent.duration_s = Math.round(pausedDuration / 1000);
          pauseEvent.resume_location = resumeLocation;
        }
      }
      if (resumeLocation) {
        setPauseMarkers((markers) => [
          ...markers,
          { id: Date.now(), type: 'resume', coordinate: resumeLocation },
        ]);
      // if (resumeLocation) {
      //   setPauseMarkers((markers) => [...markers, {
      //     id: resumedAt,
      //     type: 'resume',
      //     coordinate: resumeLocation,
      //     timestamp: resumedAt,
      //   }]);
      }

      isPausedRef.current = false;
      isAutoPausedRef.current = false;
      lastMovementTimestampRef.current = resumedAt;
      setIsPaused(false);
      if (recoveredElapsedBaseRef.current !== null) {
        recoveredResumeAtRef.current = resumedAt;
        recoveredPausedBaselineRef.current = pausedTimeRef.current ?? 0;
      }
      prepareMovementGateForResume();
      await persistBackgroundLocationSession({
        active: true,
        paused: false,
        autoPaused: false,
        runId: runIdRef.current,
        userId: user?.id ? String(user.id) : null,
        startedAt: startTimeRef.current ? new Date(startTimeRef.current).toISOString() : null,
        updatedAt: startTimeRef.current,
        movementConfirmed: movementConfirmedRef.current,
        pauseEvents: pauseEventsRef.current,
      });

      // The watcher was never stopped; only active-distance accounting resumes.
      workoutEngineRef.current?.resume();
      setWorkoutSnapshot(workoutEngineRef.current?.getSnapshot() ?? null);

      addLog('▶ Run resumed - tracking restarted');
    } catch (error) {
      console.error('Resume run error:', error);
      addLog('❌ Failed to resume run');
    }
  }, [addLog, elapsedSeconds, location, pace, user]);

  const triggerAutoPause = useCallback(async () => {
    if (
      !autoPauseEnabledRef.current
      || !pauseSettingsLoaded
      ||
      !isRunningRef.current
      || isPausedRef.current
      || isPausingRef.current
      || isAutoPausedRef.current
    ) return;

    isAutoPausedRef.current = true;
    await pauseRun();
    if (!isPausedRef.current) {
      isAutoPausedRef.current = false;
      return;
    }

    movementStateRef.current = 'STATIONARY';
    consecutiveMovementRef.current = 0;
    consecutiveStationaryRef.current = 0;
    resumeMovementPendingRef.current = true;
    lastMovementTimestampRef.current = null;
    addLog('Auto-paused after 5 seconds without movement');
  }, [addLog, pauseRun, pauseSettingsLoaded]);

  const triggerAutoResume = useCallback(async () => {
    if (
      !autoPauseEnabledRef.current
      || !pauseSettingsLoaded
      || !isRunningRef.current
      || !isPausedRef.current
      || !isAutoPausedRef.current
      || isPausingRef.current
    ) return;

    isAutoPausedRef.current = false;
    await resumeRun();
    if (isPausedRef.current) {
      isAutoPausedRef.current = true;
      return;
    }
    addLog('Auto-resumed after movement was detected');
  }, [addLog, pauseSettingsLoaded, resumeRun]);

  useEffect(() => {
    autoPauseActionRef.current = () => { void triggerAutoPause(); };
    autoResumeActionRef.current = () => { void triggerAutoResume(); };
  }, [triggerAutoPause, triggerAutoResume]);

  const stopRun = async ({ discard = false }: { discard?: boolean } = {}) => {
    if (isStoppingRef.current) {
      return;
    }

    isStoppingRef.current = true;
    updateLiveTrackingNotificationMessage(
      discard
        ? { title: 'ZYRun · Discarding workout', body: 'Discarding this workout without saving.' }
        : { title: 'ZYRun · Saving workout', body: 'Finalizing and saving your workout.' },
      {
        runId: runIdRef.current,
        distanceKm: recordedDistanceRef.current / 1000,
        elapsedSeconds,
        paceMinutesPerKm: pace,
        status: isPausedRef.current ? 'paused' : 'running',
        startedAt: startTimeRef.current ? new Date(startTimeRef.current).toISOString() : null,
      },
    );
    let shouldPublishSummary = false;
    let activitySubmitted = false;
    let runSessionCleared = false;
    let payloadForExport: ActivitySubmissionPayload | null = null;
    let savedActivityId: string | number | null = null;
    let payloadQueuedOffline = false;
    let summaryMetrics = {
      distanceKm: recordedDistanceRef.current / 1000,
      elapsedSeconds,
      paceMinutesPerKm: pace,
      status: 'paused' as const,
      startedAt: startTimeRef.current ? new Date(startTimeRef.current).toISOString() : null,
    };
    try {
      const stoppedAt = new Date();
      // A Stop & Save while paused has no resume action, so close that pause
      // at the stop timestamp before constructing the final payload.
      const openPauseEvent = pauseEventsRef.current.at(-1);
      if (openPauseEvent && openPauseEvent.resumed_at === null && pauseStartTimeRef.current) {
        const stoppedAtMs = stoppedAt.getTime();
        const pausedDuration = stoppedAtMs - pauseStartTimeRef.current;
        pausedTimeRef.current = (pausedTimeRef.current || 0) + pausedDuration;
        openPauseEvent.resumed_at = stoppedAt.toISOString();
        openPauseEvent.duration_s = Math.round(pausedDuration / 1000);
        openPauseEvent.resume_location = location
          ? { latitude: location.coords.latitude, longitude: location.coords.longitude }
          : null;
      }
      const detectedActivity = activityDetectionRef.current?.getCurrentActivity();
      const hasDetectedMovement = detectedActivity === 'walking' || detectedActivity === 'running';
      const hasStepEvidence = stepCountRef.current >= 3;
      const hasMeaningfulDistance = distanceRef.current > 2;
      let stationarySession = !movementConfirmedRef.current
        || (!hasDetectedMovement && !hasStepEvidence && !hasMeaningfulDistance);
      // Strictly respect user's selected activity type (RUN or WALK).
      // Even if pace is slow like walking, a chosen RUN is saved as RUN.
      // Even if pace is fast like running, a chosen WALK is saved as WALK.
      const chosenActivityType: 'RUN' | 'WALK' = selectedActivityTypeRef.current === 'WALK' ? 'WALK' : 'RUN';
      const workoutType: 'run' | 'walk' = chosenActivityType === 'WALK' ? 'walk' : 'run';
      const activityType: 'RUN' | 'WALK' = chosenActivityType;
      const elapsedTimeSeconds = recoveredElapsedBaseRef.current !== null
        ? Math.max(0, recoveredElapsedBaseRef.current
          + (recoveredResumeAtRef.current === null ? 0 : (stoppedAt.getTime() - recoveredResumeAtRef.current) / 1000)
          + Math.max(0, pausedTimeRef.current ?? 0) / 1000)
        : startTimeRef.current
          ? Math.max(0, (stoppedAt.getTime() - startTimeRef.current) / 1000)
          : Math.max(0, elapsedSeconds);
      const pausedTimeSeconds = Number(((pausedTimeRef.current ?? 0) / 1000).toFixed(3));
      const movingTimeSeconds = Number(Math.max(0, elapsedTimeSeconds - pausedTimeSeconds).toFixed(3));
      const movingTimePayloadSeconds = Math.round(movingTimeSeconds);
      const elapsedTimePayloadSeconds = Math.round(elapsedTimeSeconds);
      isRunningRef.current = false;
      setIsRunning(false);
      setCompletionPromptVisible(false);

      await persistBackgroundLocationSession({
        active: false,
        paused: isPausedRef.current,
        autoPaused: isAutoPausedRef.current,
        runId: runIdRef.current,
        userId: user?.id ? String(user.id) : null,
        startedAt: startTimeRef.current ? new Date(startTimeRef.current).toISOString() : null,
        updatedAt: Date.now(),
        distanceKm: recordedDistanceRef.current / 1000,
        elapsedSeconds,
        paceMinutesPerKm: pace,
        movementConfirmed: movementConfirmedRef.current,
        pauseEvents: pauseEventsRef.current,
        activityType: chosenActivityType,
      });
      try {
        await stopBackgroundLocationTracking();
      } catch (stopError) {
        console.warn('[BackgroundLocationTask] Unable to stop service at finish start', stopError);
      }
      await flushBackgroundLocationTask();
      await flushActiveRunJournal();
      await persistBackgroundLocationSession({
        active: false,
        paused: isPausedRef.current,
        autoPaused: isAutoPausedRef.current,
        runId: runIdRef.current,
        userId: user?.id ? String(user.id) : null,
        startedAt: startTimeRef.current ? new Date(startTimeRef.current).toISOString() : null,
        updatedAt: stoppedAt.getTime(),
        distanceKm: recordedDistanceRef.current / 1000,
        elapsedSeconds,
        paceMinutesPerKm: pace,
        movementConfirmed: movementConfirmedRef.current,
        pauseEvents: pauseEventsRef.current,
      });
      const finalJournal = await readActiveRunJournal();
      const hasDurableRouteMovement = finalJournal?.runId === runIdRef.current
        && finalJournal.points.length >= 2;
      if (hasDurableRouteMovement) movementConfirmedRef.current = true;
      stationarySession = !movementConfirmedRef.current
        || (!hasDetectedMovement && !hasStepEvidence && !hasMeaningfulDistance && !hasDurableRouteMovement);

      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }

      activityDetectionRef.current?.stop();
      activityDetectionRef.current = null;
      stepDetectionRef.current?.stop();
      stepDetectionRef.current = null;

      const processor = pathProcessorRef.current;

      if (discard) {
        distanceRef.current = 0;
        extraDistanceRef.current = 0;
        recordedDistanceRef.current = 0;
        setWorkoutDistance(0);
        setDistance(0);
        setElapsedSeconds(0);
        addLog('Workout discarded without saving');
        if (apiClientRef.current && runIdRef.current) {
          try {
            await apiClientRef.current.stopRun({
              run_id: runIdRef.current,
              ended_at: stoppedAt.toISOString(),
              final_sequence: 0,
            });
          } catch (stopError) {
            console.warn('[MapScreen] Unable to close discarded workout run', stopError);
          }
        }
      } else if (stationarySession) {
        distanceRef.current = 0;
        extraDistanceRef.current = 0;
        recordedDistanceRef.current = 0;
        setWorkoutDistance(0);
        setDistance(0);
        addLog('No movement detected — route was not saved');

        if (apiClientRef.current && runIdRef.current) {
          await apiClientRef.current.stopRun({
            run_id: runIdRef.current,
            ended_at: stoppedAt.toISOString(),
            final_sequence: 0,
          });
        }
      } else if (processor) {
        if (finalJournal?.runId === runIdRef.current) {
          processor.mergeRawPoints([
            ...finalJournal.points,
            ...(finalJournal.pausePoints ?? []),
          ]);
        }
        const completedLaps = workoutEngineRef.current?.getSnapshot().completedLaps ?? [];
        const routeBoundaries = [
          ...pauseEventsRef.current.flatMap((event) => [
            Date.parse(event.paused_at),
            event.resumed_at ? Date.parse(event.resumed_at) : Number.NaN,
          ]),
          ...completedLaps.flatMap((lap) => [lap.startedAt, lap.completedAt]),
        ].filter((timestamp): timestamp is number => (
          typeof timestamp === 'number' && Number.isFinite(timestamp)
        ));
        const filteredPoints = processor.filterRawPoints(routeBoundaries);

        const finalOptimized = processor.simplifyFinal(filteredPoints);
        const extraRouteCoordinates = routeSegmentsRef.current
          .filter((segment) => segment.traceType === 'extra')
          .flatMap((segment) => segment.coordinates);
        // Keep the live route responsive, but use the stricter save-time GPS
        // filter for persisted geometry so compact indoor drift is removed.
        // RDP is for display only; submit every reliable save-filtered fix.
        const reliableRoutePoints: RunningGpsPoint[] = Device.isDevice
          ? filteredPoints.filter(isReliableRoutePoint)
          : filteredPoints;
        const uploadRoutePoints = filterRoutePointsByMaximumJump(
          reliableRoutePoints,
          Device.isDevice ? 50 : 500,
        );

        const routeGeometryPoints = uploadRoutePoints;
        const displayedRouteCoordinates = routeGeometryPoints.map((point) => ({
          latitude: point.latitude,
          longitude: point.longitude,
        }));
        const displayRouteCoordinates = processor.simplifyLivePolyline(displayedRouteCoordinates);
        const simplifiedRouteSegments = routeSegmentsRef.current.map((segment) => ({
          ...segment,
          coordinates: processor.simplifyLivePolyline(segment.coordinates),
        }));
        if (simplifiedRouteSegments.length > 0) {
          routeSegmentsRef.current = simplifiedRouteSegments;
          setRouteSegments(simplifiedRouteSegments);
        } else if (displayRouteCoordinates.length > 0) {
          const renderedSegment: RouteSegment = {
            id: Date.now(),
            traceType: 'active',
            coordinates: displayRouteCoordinates,
          };
          routeSegmentsRef.current = [renderedSegment];
          setRouteSegments([renderedSegment]);
        }
        fitMapToRoute(displayRouteCoordinates.length > 0 ? displayRouteCoordinates : displayedRouteCoordinates);


        addLog(`✅ Final optimization: ${finalOptimized.length} points`);

        const pauseIntervals = pauseEventsRef.current
          .map((event, index) => ({
            event,
            sequence: index + 1,
            startedAt: Date.parse(event.paused_at),
            endedAt: event.resumed_at ? Date.parse(event.resumed_at) : Number.POSITIVE_INFINITY,
          }))
          .filter(({ startedAt, endedAt }) => (
            Number.isFinite(startedAt)
            && (Number.isFinite(endedAt) || endedAt === Number.POSITIVE_INFINITY)
          ));
        const getPauseSequence = (point: RunningGpsPoint): number | null => {
          const interval = pauseIntervals.find(({ startedAt, endedAt }) => (
            point.timestamp >= startedAt && point.timestamp <= endedAt
          ));
          return interval?.sequence ?? null;
        };
        const isExtraDistancePoint = (point: RunningGpsPoint): boolean => (
          extraRouteCoordinates.some((coordinate) => (
            coordinate.latitude === point.latitude
            && coordinate.longitude === point.longitude
          ))
        );
        const submittedRoutePoints = routeGeometryPoints
          .filter((point) => getPauseSequence(point) === null);
        const restIntervals = completedLaps
          .filter((lap) => lap.segmentType === 'Rest')
          .map((lap) => ({
            startedAt: lap.startedAt,
            endedAt: lap.completedAt ?? stoppedAt.getTime(),
          }));
        const nonCountingIntervals = [
          ...pauseIntervals.map(({ startedAt, endedAt }) => ({ startedAt, endedAt })),
          ...restIntervals,
        ];
        const { totalDistance, additionalDistance, workoutDistance } = calculateRouteDistanceBreakdown(
          submittedRoutePoints,
          nonCountingIntervals,
          isExtraDistancePoint,
        );
        distanceRef.current = workoutDistance;
        extraDistanceRef.current = additionalDistance;
        recordedDistanceRef.current = totalDistance;
        setWorkoutDistance(workoutDistance);
        setDistance(totalDistance);
        const paceSecondsPerKm = totalDistance > 0
          ? movingTimeSeconds / (totalDistance / 1000)
          : 0;
        const pointCounts = {
          processorRaw: processor.getRawPoints().length,
          saveFiltered: filteredPoints.length,
          reliableForUpload: routeGeometryPoints.length,
          sentTopLevel: submittedRoutePoints.length,
        };
        console.info('[GPS_POINT_COUNTS] Android route', JSON.stringify(pointCounts));
        addLog(
          `GPS points: ${pointCounts.processorRaw} processor-raw, ${pointCounts.saveFiltered} save-filtered, ${pointCounts.sentTopLevel} sent`
        );
        const pointPayload = (point: RunningGpsPoint, isExtraDistance: boolean): ActivityGpsPointPayload => {
          const pauseSequence = getPauseSequence(point);
          return {
            longitude: point.longitude,
            latitude: point.latitude,
            heading: point.heading ?? 0,
            timestamp: new Date(point.timestamp).toISOString(),
            speed: point.speed ?? 0,
            accuracy: point.accuracy,
            altitude: point.altitude ?? 0,
            is_extra_distance: isExtraDistance,
            is_paused: pauseSequence !== null,
            pause_sequence: pauseSequence,
          };
        };
        const pauseEventPayload: ActivityPauseEventPayload[] = pauseIntervals.map((interval) => ({
          ...interval.event,
          sequence: interval.sequence,
          paused_points: uploadRoutePoints
            .filter((point) => point.timestamp >= interval.startedAt && point.timestamp <= interval.endedAt)
            .map((point) => pointPayload(point, isExtraDistancePoint(point))),
        }));
        const laps: ActivityLapPayload[] = completedLaps.map((lap) => ({
          segment_order: lap.segmentOrder,
          segment_type: lap.segmentType,
          repeat_number: lap.repeatNumber,
          total_repeats: lap.totalRepeats,
          distance_meters: lap.distanceMeters,
          duration_seconds: lap.elapsedSeconds,
          pace_seconds_per_km: lap.distanceMeters > 0
            ? lap.elapsedSeconds / (lap.distanceMeters / 1000)
            : null,
          completed: lap.completed,
        }));
        const pointsBetween = (start: number, end: number | null, nextStart: number | undefined) => uploadRoutePoints
          .filter((point) => point.timestamp >= start
            && (end === null || point.timestamp <= end)
            && (nextStart === undefined || point.timestamp < nextStart)
            && getPauseSequence(point) === null);
        const trimPointsToDistance = (points: RunningGpsPoint[], maximumDistance: number | null) => {
          if (!Number.isFinite(maximumDistance) || maximumDistance === null || maximumDistance <= 0 || points.length < 2) return points;
          const trimmed = [points[0]];
          let distance = 0;
          for (let index = 1; index < points.length; index += 1) {
            const previous = points[index - 1];
            const current = points[index];
            const segmentDistance = calculateDistanceMeters(previous, current);
            if (!Number.isFinite(segmentDistance) || segmentDistance <= 0) continue;
            if (distance + segmentDistance <= maximumDistance) {
              trimmed.push(current);
              distance += segmentDistance;
              continue;
            }
            const remaining = maximumDistance - distance;
            if (remaining > 0) {
              const ratio = Math.min(1, remaining / segmentDistance);
              trimmed.push({
                ...previous,
                latitude: previous.latitude + (current.latitude - previous.latitude) * ratio,
                longitude: previous.longitude + (current.longitude - previous.longitude) * ratio,
                altitude: previous.altitude !== null && current.altitude !== null
                  ? previous.altitude + (current.altitude - previous.altitude) * ratio
                  : previous.altitude,
                timestamp: previous.timestamp + (current.timestamp - previous.timestamp) * ratio,
              });
            }
            break;
          }
          return trimmed;
        };
        const lapTime = (lap: typeof completedLaps[number]) => Math.max(0, lap.elapsedSeconds);
        const lapPace = (lap: typeof completedLaps[number]) => lap.distanceMeters > 0
          ? lapTime(lap) / (lap.distanceMeters / 1000)
          : 0;
        const segmentType = (type: typeof completedLaps[number]['segmentType']): 'WARM_UP' | 'RUN' | 'COOLDOWN' => {
          if (type === 'Warmup') return 'WARM_UP';
          if (type === 'Cooldown') return 'COOLDOWN';
          return 'RUN';
        };
        const segmentPayloads: ActivitySegmentPayload[] = [];
        let payloadSequence = 1;
        completedLaps.forEach((lap, index) => {
          if (lap.segmentType === 'Rest') return;
          const nextLap = completedLaps[index + 1];
          const segmentPoints = trimPointsToDistance(
            pointsBetween(lap.startedAt, lap.completedAt, nextLap?.startedAt),
            lap.targetDistanceMeters,
          );
          const segmentDistance = lap.targetDistanceMeters !== null
            ? Math.min(lap.distanceMeters, lap.targetDistanceMeters)
            : lap.distanceMeters;
          const segmentTime = segmentPoints.length > 1
            ? Math.max(0, (segmentPoints.at(-1)!.timestamp - segmentPoints[0].timestamp) / 1000)
            : lapTime(lap);
          const segment: ActivitySegmentPayload = {
            sequence: payloadSequence,
            type: segmentType(lap.segmentType),
            planned_distance_m: lap.targetDistanceMeters ?? 0,
            planned_time_s: lap.targetDurationSeconds ?? 0,
            completed_distance_m: segmentDistance,
            actual_time_s: Math.round(segmentTime),
            actual_pace_s_per_km: segmentDistance > 0 ? segmentTime / (segmentDistance / 1000) : 0,
            gps_points: segmentPoints.map((point) => pointPayload(point, isExtraDistancePoint(point))),
          };
          const recovery = nextLap?.segmentType === 'Rest' ? nextLap : null;
          if (recovery) {
            const recoveryPoints = pointsBetween(
              recovery.startedAt,
              recovery.completedAt,
              completedLaps[index + 2]?.startedAt,
            ).map((point) => pointPayload(point, isExtraDistancePoint(point)));
            const recoveryPayload: ActivityRecoveryPayload = {
              sequence: payloadSequence + 1,
              type: 'RECOVERY',
              planned_time_s: recovery.targetDurationSeconds ?? 0,
              actual_time_s: Math.round(lapTime(recovery)),
              distance_m: recovery.distanceMeters,
              pace_s_per_km: lapPace(recovery),
              gps_points: recoveryPoints,
            };
            segment.recovery = recoveryPayload;
            payloadSequence += 2;
          } else {
            payloadSequence += 1;
          }
          segmentPayloads.push(segment);
        });
        const extraPoints = uploadRoutePoints
          .filter((point) => isExtraDistancePoint(point) && getPauseSequence(point) === null)
          .map((point) => pointPayload(point, true));
        const extraPayload: ActivityExtraPayload | null = extraPoints.length > 0
          ? {
            type: 'EXTRA',
            distance_m: extraDistanceRef.current,
            actual_time_s: extraPoints.length > 1
              ? Math.round(Math.max(0, (new Date(extraPoints.at(-1)?.timestamp ?? '').getTime() - new Date(extraPoints[0]?.timestamp ?? '').getTime()) / 1000))
              : 0,
            pace_s_per_km: 0,
            gps_points: extraPoints,
          }
          : null;
        const iosStyleActivityPayload: ActivitySubmissionPayload = {
          gps_points: submittedRoutePoints
            .map((point) => pointPayload(point, isExtraDistancePoint(point))),
          start_time: startTimeRef.current
            ? new Date(startTimeRef.current).toISOString()
            : new Date().toISOString(),
          end_time: stoppedAt.toISOString(),
          moving_time: movingTimePayloadSeconds,
          elapsed_time: elapsedTimePayloadSeconds,
          moving_time_s: movingTimePayloadSeconds,
          elapsed_time_s: elapsedTimePayloadSeconds,
          activity_type: activityType,
          // Send the authoritative SDK values in the actual request, not only
          // in console logs. The server can use this total instead of deriving
          // a different distance from noisy GPS geometry.
          distance: Number(totalDistance.toFixed(2)),
          distance_meters: Number(totalDistance.toFixed(2)),
          workout_distance_meters: Number(workoutDistance.toFixed(2)),
          additional_distance_meters: Number(additionalDistance.toFixed(2)),
          total_distance_meters: Number(totalDistance.toFixed(2)),
          split_distance_m: SPLIT_DISTANCE_METERS,
          avg_pace: Number(paceSecondsPerKm.toFixed(2)),
          pace_seconds_per_km: Number(paceSecondsPerKm.toFixed(2)),
          laps,
          segments: segmentPayloads,
          extra: extraPayload,
          pause_events: pauseEventPayload,
          pause_count: pauseEventPayload.length,
          paused_time_s: Math.round((pausedTimeRef.current ?? 0) / 1000),
        };
        payloadForExport = iosStyleActivityPayload;
        activitySubmitted = false;
        if (apiClientRef.current) {
          try {
            // Submit the actual final payload in the iOS-compatible shape.
            const activitySubmission = await apiClientRef.current.submitActivity(iosStyleActivityPayload);
            activitySubmitted = activitySubmission.success;
            if (activitySubmitted) {
              savedActivityId = activitySubmission.activityId;
            }
            if (activitySubmitted && activitySubmission.activityId !== null) {
              try {
                await activityDistanceOverrides.save(activitySubmission.activityId, totalDistance);
                await activityTimingOverrides.save(activitySubmission.activityId, {
                  moving_time: movingTimePayloadSeconds,
                  elapsed_time: elapsedTimePayloadSeconds,
                  moving_time_s: movingTimePayloadSeconds,
                  elapsed_time_s: elapsedTimePayloadSeconds,
                  paused_time_s: Math.round(pausedTimeSeconds),
                  pause_count: pauseEventsRef.current.length,
                });
              } catch (overrideError) {
              }

              if (runIdRef.current && !runIdRef.current.startsWith('RUN-') && !runIdRef.current.includes('-OFFLINE')) {
                try {
                  await apiClientRef.current.stopRun({
                    run_id: runIdRef.current,
                    ended_at: stoppedAt.toISOString(),
                    final_sequence: uploadRoutePoints.length,
                  });
                } catch (stopError) {
                  console.warn('[MapScreen] stopRun failed:', stopError);
                }
              }
            }
          } catch (submitError: any) {
            console.warn('[MapScreen] submitActivity offline/failed, queuing locally:', submitError?.message || submitError);
            activitySubmitted = false;
          }

          if (!activitySubmitted) {
            try {
              await offlineWorkoutQueue.enqueue({
                runId: runIdRef.current,
                userId: user?.id ? String(user.id) : null,
                workoutTitle: params.workoutTitle ?? (activityType === 'WALK' ? 'Outdoor Walk' : 'Outdoor Run'),
                payload: iosStyleActivityPayload,
                totalDistance,
                movingTimePayloadSeconds,
                elapsedTimePayloadSeconds,
                pausedTimeSeconds,
                pauseCount: pauseEventsRef.current.length,
              });
              payloadQueuedOffline = true;
              addLog('Workout saved to offline queue — will sync automatically when online');
            } catch (enqueueErr) {
              console.warn('[MapScreen] Failed to enqueue offline workout:', enqueueErr);
            }
          }

          summaryMetrics = {
            distanceKm: totalDistance / 1000,
            elapsedSeconds,
            paceMinutesPerKm: paceSecondsPerKm / 60,
            status: 'paused',
            startedAt: startTimeRef.current ? new Date(startTimeRef.current).toISOString() : null,
          };
          shouldPublishSummary = true;

          addLog(`${activityType === 'WALK' ? 'Walk' : 'Run'} ${(runIdRef.current ?? 'activity')} completed`);
        }
      }

      voiceCoach?.stop?.();
      setBackgroundLocationListener(undefined);
      await clearBackgroundLocationSession();
      runSessionCleared = true;
      await clearActiveRunJournal();
      setIsRunning(false);
      isRunningRef.current = false;
      startTimeRef.current = null;
      recoveredElapsedBaseRef.current = null;
      recoveredResumeAtRef.current = null;
      recoveredPausedBaselineRef.current = 0;
      previousLocationRef.current = null;
      lastRetainedCoordinateRef.current = null;
      runIdRef.current = null;
      restoredRunIdRef.current = null;
      queueRef.current = null;
      pathProcessorRef.current = null;
      apiClientRef.current = null;
      workoutVoiceRef.current?.stop();
      workoutVoiceRef.current = null;
      workoutEngineRef.current = null;
      splitEngineRef.current.reset();
      previousWorkoutPointRef.current = null;
      movementStateRef.current = 'STATIONARY';
      consecutiveMovementRef.current = 0;
      consecutiveStationaryRef.current = 0;
      movementConfirmedRef.current = false;
      resumeMovementPendingRef.current = false;
      setWorkoutSnapshot(null);
      setIsPlannedWorkout(false);
      isPausedRef.current = false;
      pausedTimeRef.current = null;
      pauseStartTimeRef.current = null;
      setIsPaused(false);

      if (discard) {
        router.replace('/(app)/dashboard');
        return;
      }

      const isCustomWorkout = executionPlanRef.current.length > 0 || Boolean(params.workoutPlan);
      if (isCustomWorkout && savedActivityId) {
        router.replace({
          pathname: '/(app)/activity/[id]',
          params: { id: String(savedActivityId), autoOpenSplits: 'true' },
        });
        return;
      }

      router.replace('/(app)/dashboard');

      const completionMessage = stationarySession
        ? 'No route was drawn or uploaded because the device remained stationary.'
        : activitySubmitted
          ? 'Your route has been finalized and saved to your account.'
          : 'Your route has been saved offline and will automatically sync when connected to the internet.';
      const exportPayload = (isPending: boolean) => {
        if (!payloadForExport) return;
        void shareActivityPayloadAsJson(
          payloadForExport,
          isPending ? null : savedActivityId,
        ).catch((exportError) => {
          const message = exportError instanceof Error
            ? exportError.message
            : 'Could not export this workout payload.';
          Alert.alert('Unable to Export Payload', message);
        });
      };

      const completionTitle = activityType === 'WALK' ? 'Walk Completed!' : 'Run Completed!';
      if (activitySubmitted && payloadForExport) {
        Alert.alert(completionTitle, completionMessage, [
          { text: 'Export Payload JSON', onPress: () => exportPayload(false) },
          { text: 'Done', style: 'cancel' },
        ]);
      } else if (payloadQueuedOffline && payloadForExport) {
        Alert.alert(completionTitle, completionMessage, [
          { text: 'Export Pending Payload JSON', onPress: () => exportPayload(true) },
          { text: 'Done', style: 'cancel' },
        ]);
      } else {
        Alert.alert(completionTitle, completionMessage);
      }
    } catch (error: any) {
      const backendData = error?.response?.data;
      const backendMessage = typeof backendData === 'string'
        ? backendData
        : backendData?.message
          ?? backendData?.detail
          ?? (backendData && typeof backendData === 'object' ? JSON.stringify(backendData) : null);
      if (!runSessionCleared && !discard) {
        setIsRunning(true);
        isRunningRef.current = true;
        await persistBackgroundLocationSession({
          active: true,
          paused: isPausedRef.current,
          autoPaused: isAutoPausedRef.current,
          runId: runIdRef.current,
          userId: user?.id ? String(user.id) : null,
          startedAt: startTimeRef.current ? new Date(startTimeRef.current).toISOString() : null,
          updatedAt: Date.now(),
          distanceKm: recordedDistanceRef.current / 1000,
          elapsedSeconds,
          paceMinutesPerKm: pace,
          pauseEvents: pauseEventsRef.current,
        });
        try {
          await startLiveTrackingNotification({
            runId: runIdRef.current,
            distanceKm: recordedDistanceRef.current / 1000,
            elapsedSeconds,
            paceMinutesPerKm: pace,
            status: isPausedRef.current ? 'paused' : 'running',
            startedAt: startTimeRef.current ? new Date(startTimeRef.current).toISOString() : null,
          });
        } catch (notificationError) {
          console.warn('[LiveTrackingNotification] Unable to restore live notification after save failure', notificationError);
        }
      }
      Alert.alert(
        discard ? 'Could not discard workout' : 'Could not save activity',
        backendMessage || (discard
          ? 'The workout could not be fully discarded. Please try again.'
          : 'The activity could not be uploaded. Your route is still available for retry.'),
      );
    } finally {
      setBackgroundLocationListener(undefined);
      try {
        await stopBackgroundLocationTracking();
      } catch (stopError) {
        console.warn('[BackgroundLocationTask] Unable to stop Android foreground service', stopError);
      }
      if (shouldPublishSummary) {
        try {
          await publishWorkoutSummaryNotification(summaryMetrics, payloadQueuedOffline ? 'queued' : 'saved');
        } catch (notificationError) {
          console.warn('[RecordView] Workout summary notification failed', notificationError);
        }
      } else {
        await stopLiveTrackingNotification();
      }
      isStoppingRef.current = false;
    }
  };

  const discardRecoveredWorkout = async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    isRunningRef.current = false;
    setRecoveryPromptVisible(false);
    setIsRunning(false);
    setIsPaused(false);
    setCompletionPromptVisible(false);
    setBackgroundLocationListener(undefined);

    try {
      if (runIdRef.current && apiClientRef.current && !runIdRef.current.startsWith('RUN-') && !runIdRef.current.includes('-OFFLINE')) {
        await apiClientRef.current.stopRun({
          run_id: runIdRef.current,
          ended_at: new Date().toISOString(),
          final_sequence: 0,
        }).catch((error) => {
          console.warn('[MapScreen] Could not close discarded backend run', error);
        });
      }
      locationSubscription.current?.remove();
      locationSubscription.current = null;
      activityDetectionRef.current?.stop();
      activityDetectionRef.current = null;
      stepDetectionRef.current?.stop();
      stepDetectionRef.current = null;
      workoutVoiceRef.current?.stop();
      workoutVoiceRef.current = null;
      workoutEngineRef.current = null;
      await stopBackgroundLocationTracking();
      await flushBackgroundLocationTask();
      await clearBackgroundLocationSession();
      await clearActiveRunJournal();
      await stopLiveTrackingNotification();

      startTimeRef.current = null;
      recoveredElapsedBaseRef.current = null;
      recoveredResumeAtRef.current = null;
      recoveredPausedBaselineRef.current = 0;
      runIdRef.current = null;
      restoredRunIdRef.current = null;
      pathProcessorRef.current = null;
      queueRef.current = null;
      apiClientRef.current = null;
      previousLocationRef.current = null;
      lastRetainedCoordinateRef.current = null;
      routeSegmentsRef.current = [];
      pauseEventsRef.current = [];
      distanceRef.current = 0;
      extraDistanceRef.current = 0;
      pausedTimeRef.current = null;
      pauseStartTimeRef.current = null;
      isPausedRef.current = false;
      isAutoPausedRef.current = false;
      splitEngineRef.current.reset();
      setRouteSegments([]);
      setPauseMarkers([]);
      setDistance(0);
      setElapsedSeconds(0);
      setPace(0);
      setWorkoutSnapshot(null);
      setIsPlannedWorkout(false);
      router.replace('/(app)/dashboard');
    } catch (error) {
      console.warn('[MapScreen] Could not discard recovered workout cleanly', error);
      Alert.alert('Could not discard workout', 'Please try again. Your saved checkpoint is still available.');
      isRunningRef.current = true;
      setIsRunning(true);
    } finally {
      isStoppingRef.current = false;
    }
  };

  const requestSaveAndExit = () => {
    if (!isRunningRef.current || isStoppingRef.current || saveConfirmationOpenRef.current) {
      return;
    }

    saveConfirmationOpenRef.current = true;
    const shouldResumeAfterCancel = !isPausedRef.current;
    setCompletionPromptVisible(false);

    function showConfirmation() {
      Alert.alert(
        'Save and Exit',
        'Whether you want to save this record?',
        [
          {
            text: 'Discard',
            style: 'cancel',
            onPress: showDiscardConfirmation,
          },
          {
            text: 'Confirm',
            onPress: () => {
              saveConfirmationOpenRef.current = false;
              void stopRun();
            },
          },
        ],
        { cancelable: false },
      );
    }

    function showDiscardConfirmation() {
      Alert.alert(
        'Discard Workout',
        'Are you sure you want to cancel this recorded workout?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: showConfirmation,
          },
          {
            text: 'Confirm',
            style: 'destructive',
            onPress: () => {
              saveConfirmationOpenRef.current = false;
              void stopRun({ discard: true });
            },
          },
        ],
        { cancelable: false },
      );
    }

    if (shouldResumeAfterCancel) {
      void pauseRun().then(showConfirmation);
    } else {
      showConfirmation();
    }
  };

  useEffect(() => {
    const action = params.notificationAction;
    const requestedRunId = params.runId;
    if (!action || !requestedRunId || !isRunning || runIdRef.current !== requestedRunId) return;
    if (
      !pauseSettingsLoaded
      && (action === LIVE_TRACKING_PAUSE_ACTION || action === LIVE_TRACKING_RESUME_ACTION)
    ) return;

    const actionKey = `${requestedRunId}:${action}:${params.actionNonce ?? ''}`;
    if (handledNativeRunActionRef.current === actionKey) return;

    if (action === LIVE_TRACKING_PAUSE_ACTION) {
      handledNativeRunActionRef.current = actionKey;
      if (manualPauseEnabled && !isPausedRef.current) void pauseRun();
    } else if (action === LIVE_TRACKING_RESUME_ACTION) {
      handledNativeRunActionRef.current = actionKey;
      if (manualPauseEnabled && isPausedRef.current) void resumeRun();
    } else if (action === LIVE_TRACKING_STOP_ACTION) {
      handledNativeRunActionRef.current = actionKey;
      requestFinish();
    }
  }, [
    isPaused,
    isRunning,
    manualPauseEnabled,
    pauseSettingsLoaded,
    pauseRun,
    params.actionNonce,
    params.notificationAction,
    params.runId,
    resumeRun,
    requestFinish,
  ]);

  // A physical Android Back press is a reliable escape hatch if an OEM map
  // implementation ever consumes the visible Stop control's touch.
  useEffect(() => {
    stopRunRef.current = () => {
      void stopRun();
    };
  }, [stopRun]);

  // This exposes a React/Fast Refresh state reset immediately in the Metro log.
  // The recorder ref remains the authoritative source for the button action.
  useEffect(() => {
  }, [isRunning]);

  const handleRunAction = () => {
    const recorderIsActive = isRunningRef.current || pathProcessorRef.current !== null;

    if (recorderIsActive) {
      void stopRun();
      return;
    }

    void startRun();
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isRunningRef.current || !pathname.endsWith('/screens/map')) return false;
      router.push('/(app)/dashboard');
      return true;
    });

    return () => subscription.remove();
  }, [pathname, router]);

  const activeStep = executionPlan[currentStepIndex];
  const nextStep = executionPlan[currentStepIndex + 1];
  const activeStepColor = getStepColor(activeStep?.stepType);
  const workoutSegment = workoutSnapshot?.currentSegment;
  const controlStatusValue = isPlannedWorkout && workoutSegment
    ? `${workoutSegment.segmentType} ${workoutSegment.repeatNumber}/${workoutSegment.totalRepeats}`
    : isRunning ? (isPaused ? 'Paused' : 'Live') : 'Ready';

  const currentStepElapsedSeconds = Math.max(0, elapsedSeconds - stepStartSeconds);
  const currentStepDistanceMeters = Math.max(0, workoutDistance - stepStartDistanceMeters);
  const renderedRouteSegments = useMemo(
    () => routeSegments.map((segment) => ({
      ...segment,
      coordinates: PathProcessor.simplifyLivePolyline(segment.coordinates),
    })),
    [routeSegments],
  );

  const remainingStepDuration =
    activeStep?.targetType === 'DURATION' && activeStep.targetDurationSeconds
      ? Math.max(0, activeStep.targetDurationSeconds - currentStepElapsedSeconds)
      : 0;

  const stepDurationProgress =
    activeStep?.targetType === 'DURATION' && activeStep.targetDurationSeconds
      ? Math.min(1, currentStepElapsedSeconds / activeStep.targetDurationSeconds)
      : 0;

  const remainingStepDistanceMeters =
    activeStep?.targetType === 'DISTANCE' && activeStep.targetDistanceMeters
      ? Math.max(0, activeStep.targetDistanceMeters - currentStepDistanceMeters)
      : 0;

  const stepDistanceProgress =
    activeStep?.targetType === 'DISTANCE' && activeStep.targetDistanceMeters
      ? Math.min(1, currentStepDistanceMeters / activeStep.targetDistanceMeters)
      : 0;

  return (
    <View style={styles.container}>
      <View style={executionPlan.length > 0 ? styles.mapContainerSplit : styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={region}
          showsUserLocation={true}
          showsMyLocationButton={true}
          showsCompass={true}
          showsBuildings={true}
          showsTraffic={false}
          rotateEnabled={true}
          pitchEnabled={true}
          zoomEnabled={true}
          scrollEnabled={true}
          zoomControlEnabled={false}
          onMapReady={() => {
            setIsMapReady(true);
            if (location && mapRef.current) {
              lastCameraUpdateRef.current = Date.now();
              mapRef.current.animateCamera(
                {
                  center: {
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                  },
                  zoom: 20,
                },
                { duration: 0 }
              );
            }
          }}
          minZoomLevel={10}
          maxZoomLevel={20}
        >
          {renderedRouteSegments.map((segment) => (
            <Polyline
              key={segment.id}
              coordinates={segment.coordinates}
              strokeWidth={3}
              strokeColor={segment.traceType === 'extra'
                ? '#9CA3AF'
                : segment.traceType === 'pause'
                  ? '#EF4444'
                  : '#20D000'}
              lineCap="round"
              lineJoin="round"
              geodesic={true}
            />
          ))}
          {plannedRouteCoordinates.length > 1 && (
            <Polyline
              key="assigned-route"
              coordinates={plannedRouteCoordinates}
              strokeWidth={4}
              strokeColor={routeStatus.color}
              lineDashPattern={[10, 7]}
              lineCap="round"
              lineJoin="round"
              geodesic={true}
            />
          )}
          {pauseMarkers.map((marker) => (
            <Marker key={marker.id} coordinate={marker.coordinate} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={[styles.pauseMarker, marker.type === 'resume' && styles.resumeMarker]} />
            </Marker>
          ))}
        </MapView>

        {/*
          Keep the MapView mounted while permissions and the first GPS fix are
          resolving. Replacing it with a loading screen changes the native
          child tree while Android Fabric is mounting map overlays.
        */}
        {loading && (
          <View style={styles.mapLoadingOverlay} pointerEvents="auto">
            <RunningLoader
              size={64}
              label="Getting precise GPS location..."
            />
            <Text style={styles.loadingSubText}>Please wait while we find your location</Text>
          </View>
        )}

        {voiceCoachNoticeVisible && isRunning && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voice Coach is on. You can turn it off anytime in Settings. Dismiss message."
            accessibilityLiveRegion="polite"
            onPress={() => {
              setVoiceCoachNoticeVisible(false);
              if (voiceCoachNoticeTimerRef.current) {
                clearTimeout(voiceCoachNoticeTimerRef.current);
                voiceCoachNoticeTimerRef.current = null;
              }
            }}
            style={[
              styles.voiceCoachNotice,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Feather name="volume-2" size={18} color={colors.primary} />
            <Text style={[styles.voiceCoachNoticeText, { color: colors.text }]}>
              Voice Coach is on. You can turn it off anytime in Settings.
            </Text>
            <Feather name="x" size={16} color={colors.textSecondary} />
          </Pressable>
        )}

        {recoveryPromptVisible && !isRunning && (
          <View style={styles.recoveryOverlay}>
            <View style={styles.recoveryBackdrop} />
            <View style={styles.recoveryPanel}>
              <Text style={styles.recoveryEyebrow}>Workout Recovery</Text>
              <View style={styles.recoveryTitleRow}>
                <Feather name="corner-up-left" size={25} color="#111827" />
                <Text style={styles.recoveryTitle}>Unfinished workout found</Text>
              </View>
              <Text style={styles.recoveryMessage}>
                {recoveryCheckpointAt
                  ? `Your last saved checkpoint is from ${new Date(recoveryCheckpointAt).toLocaleString()}.`
                  : 'Your last saved workout checkpoint is ready to recover.'}
              </Text>
              <View style={styles.recoveryMetrics}>
                <View style={styles.recoveryMetric}>
                  <Text style={styles.recoveryMetricLabel}>Distance</Text>
                  <Text style={styles.recoveryMetricValue}>{(distance / 1000).toFixed(2)} km</Text>
                </View>
                <View style={styles.recoveryMetric}>
                  <Text style={styles.recoveryMetricLabel}>Duration</Text>
                  <Text style={styles.recoveryMetricValue}>{formatTimerDisplay(elapsedSeconds)}</Text>
                </View>
                <View style={styles.recoveryMetric}>
                  <Text style={styles.recoveryMetricLabel}>Route points</Text>
                  <Text style={styles.recoveryMetricValue}>{routeSegments.reduce((total, segment) => total + segment.coordinates.length, 0)}</Text>
                </View>
              </View>
              <Text style={styles.recoveryPace}>Average pace: {formatPaceDisplay(pace)} min/km</Text>
              <Pressable style={styles.recoverySaveButton} onPress={() => void continueRecoveredWorkout()}>
                <Text style={styles.recoverySaveText}>Continue Workout</Text>
              </Pressable>
              <Pressable
                style={styles.recoveryStopButton}
                onPress={() => {
                  setRecoveryPromptVisible(false);
                  void stopRun();
                }}
              >
                <Text style={styles.recoveryStopText}>Stop &amp; Save Activity</Text>
              </Pressable>
              <Pressable style={styles.recoveryDiscardButton} onPress={() => void discardRecoveredWorkout()}>
                <Text style={styles.recoveryDiscardText}>Discard Workout</Text>
              </Pressable>
              <Pressable style={styles.recoveryLaterButton} onPress={() => router.replace('/(app)/dashboard')}>
                <Text style={styles.recoveryLaterText}>Not Now</Text>
              </Pressable>
            </View>
          </View>
        )}

        {completionPromptVisible && isRunning && (
          <View style={styles.completionOverlay}>
            <View style={styles.completionPanel}>
              <Text style={styles.completionTitle}>Workout complete</Text>
              <Text style={styles.completionMessage}>Save this activity or keep tracking extra distance.</Text>
              <View style={styles.completionActions}>
                <Pressable style={styles.continueActionButton} onPress={continueAfterCompletion}>
                  <Text style={styles.continueActionText}>CONTINUE</Text>
                </Pressable>
                <Pressable
                  style={styles.saveExitActionButton}
                  onPress={requestSaveAndExit}
                >
                  <Text style={styles.saveExitActionText}>SAVE AND EXIT</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        <View
          style={[styles.mapControlsWrapper, { bottom: floatingOverlayHeight + 40 }]}
          pointerEvents="box-none"
        >
          <Pressable style={styles.mapControlButton} onPress={() => {
            if (location) {
              moveMapToLocation(location.coords.latitude, location.coords.longitude);
            }
          }}>
            <Feather name="crosshair" size={20} color="#FFFFFF" />
          </Pressable>
          <Pressable style={styles.mapControlButton} onPress={zoomIn}>
            <Text style={styles.zoomButtonText}>+</Text>
          </Pressable>
          <Pressable style={styles.mapControlButton} onPress={zoomOut}>
            <Text style={styles.zoomButtonText}>-</Text>
          </Pressable>
        </View>
        <View style={styles.gpsStatusContainer}>
          <View style={styles.gpsStatus}>
            <View style={[styles.gpsDot, { backgroundColor: plannedRouteCoordinates.length > 0 ? routeStatus.color : isRunning ? '#20D000' : '#FFA500' }]} />
            <View>
              <Text style={[styles.gpsStatusText, plannedRouteCoordinates.length > 0 && { color: routeStatus.color }]}>
                {plannedRouteCoordinates.length > 0 ? routeStatus.label : isRunning ? 'LIVE TRACKING' : 'GPS READY'}
              </Text>
              {plannedRouteCoordinates.length > 0 && routeStatus.distanceMeters !== null ? (
                <Text style={styles.routeDistanceStatusText}>{Math.round(routeStatus.distanceMeters)}m from route</Text>
              ) : null}
            </View>
            <Text style={styles.gpsAccuracyText}>
              {accuracy === null ? 'Locating' : accuracy.toFixed(1) + 'm'}
            </Text>
          </View>
        </View>

      <View
        style={styles.floatingOverlayWrapper}
        onLayout={(event) => setFloatingOverlayHeight(event.nativeEvent.layout.height)}
      >
        {/* Lower Portion: Custom Workout Execution Dashboard */}
        {executionPlan.length > 0 ? (
        <View style={styles.dashboardContainer}>
          {/* Header */}
          <View style={styles.dashboardHeader}>
            <View style={styles.dashboardTitleRow}>
              <View style={[styles.stepTypeDot, { backgroundColor: activeStepColor }]} />
              <Text style={styles.dashboardWorkoutTitle} numberOfLines={1}>
                {params.workoutTitle || 'Custom Workout'}
              </Text>
            </View>

            <View style={styles.headerRightActions}>
              <View style={styles.stepCounterBadge}>
                <Text style={styles.stepCounterText}>
                  STEP {currentStepIndex + 1} / {executionPlan.length}
                </Text>
              </View>

          {isRunning && (!isPlannedWorkout || workoutSnapshot?.state === 'completed') && (
            <View style={styles.stopButtonSlot}>
              <Pressable
                style={styles.muteButton}
                onPress={() => {
                  const nextMuted = !isVoiceMuted;
                  setIsVoiceMuted(nextMuted);
                  voiceCoach?.setMuted?.(!voiceAlertsEnabledRef.current || nextMuted);
                }}
              >
                <Feather
                  name={isVoiceMuted || !voiceAlertsEnabled ? 'volume-x' : 'volume-2'}
                  size={18}
                  color={isVoiceMuted || !voiceAlertsEnabled ? '#8E8E93' : '#30D158'}
                />
              </Pressable>
            </View>
          )}
          </View>
          </View>

          {/* Active Step Card */}
          {activeStep && (
            <View style={[styles.activeStepCard, { borderLeftColor: activeStepColor }]}>
              <View style={styles.activeStepTopRow}>
                <Text style={styles.activeStepTitle} numberOfLines={1}>
                  {activeStep.title}
                </Text>
                <View style={[styles.stepTypePill, { backgroundColor: activeStepColor + '25' }]}>
                  <Text style={[styles.stepTypePillText, { color: activeStepColor }]}>
                    {activeStep.stepType.toUpperCase()}
                  </Text>
                </View>
              </View>

              {/* Dynamic Target Calculation Display */}
              {activeStep.targetType === 'DURATION' && activeStep.targetDurationSeconds ? (
                <View style={styles.targetCalculationBlock}>
                  <View style={styles.targetMetricsRow}>
                    <View>
                      <Text style={styles.countdownValue}>
                        {formatTimerDisplay(remainingStepDuration)}
                      </Text>
                      <Text style={styles.targetSublabel}>REMAINING</Text>
                    </View>
                    <View style={styles.targetDivider} />
                    <View>
                      <Text style={styles.targetTotalValue}>
                        {formatTimerDisplay(activeStep.targetDurationSeconds)}
                      </Text>
                      <Text style={styles.targetSublabel}>TARGET TIME</Text>
                    </View>
                  </View>

                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${Math.min(100, Math.round(stepDurationProgress * 100))}%`,
                          backgroundColor: activeStepColor,
                        },
                      ]}
                    />
                  </View>
                </View>
              ) : activeStep.targetType === 'DISTANCE' && activeStep.targetDistanceMeters ? (
                <View style={styles.targetCalculationBlock}>
                  <View style={styles.targetMetricsRow}>
                    <View>
                      <Text style={styles.countdownValue}>
                        {formatDistanceFromMeters(currentStepDistanceMeters, user?.profile?.distance_unit)}
                      </Text>
                      <Text style={styles.targetSublabel}>
                        {formatDistanceFromMeters(remainingStepDistanceMeters, user?.profile?.distance_unit)} TO GO
                      </Text>
                    </View>
                    <View style={styles.targetDivider} />
                    <View>
                      <Text style={styles.targetTotalValue}>
                        {formatDistanceFromMeters(activeStep.targetDistanceMeters, user?.profile?.distance_unit)}
                      </Text>
                      <Text style={styles.targetSublabel}>TARGET DISTANCE</Text>
                    </View>
                  </View>

                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${Math.min(100, Math.round(stepDistanceProgress * 100))}%`,
                          backgroundColor: activeStepColor,
                        },
                      ]}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.targetCalculationBlock}>
                  <View style={styles.targetMetricsRow}>
                    <View>
                      <Text style={styles.countdownValue}>
                        {formatTimerDisplay(currentStepElapsedSeconds)}
                      </Text>
                      <Text style={styles.targetSublabel}>TIME IN STEP</Text>
                    </View>
                    <View style={styles.targetDivider} />
                    <View>
                      <Text style={styles.targetTotalValue}>
                        {formatDistanceFromMeters(currentStepDistanceMeters, user?.profile?.distance_unit)}
                      </Text>
                      <Text style={styles.targetSublabel}>DISTANCE</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Pace Comparison Row */}
              <View style={styles.paceComparisonRow}>
                <View style={styles.paceItem}>
                  <Text style={styles.paceLabel}>TARGET PACE</Text>
                  <Text style={styles.paceValue}>
                    {formatTargetPace(activeStep.targetPace, activeStep.unit, user?.profile?.distance_unit)}
                  </Text>
                </View>
                <View style={styles.paceDivider} />
                <View style={styles.paceItem}>
                  <Text style={styles.paceLabel}>LIVE PACE</Text>
                  <Text style={styles.paceValue}>
                    {formatPaceFromSecondsPerKm(pace * 60, user?.profile?.distance_unit)}
                  </Text>
                </View>
                <View style={styles.paceDivider} />
                <View style={styles.paceItem}>
                  <Text style={styles.paceLabel}>TOTAL DIST</Text>
                  <Text style={styles.paceValue}>
                    {formatDistanceFromMeters(distance, user?.profile?.distance_unit)}
                  </Text>
                </View>
              </View>

              {/* Up Next Banner */}
              {nextStep ? (
                <View style={styles.upNextBanner}>
                  <Feather name="chevrons-right" size={13} color="#9BA3AF" />
                  <Text style={styles.upNextText} numberOfLines={1}>
                    Up Next: <Text style={styles.upNextHighlight}>{nextStep.title}</Text> ({formatStepTargetSafe(nextStep, user?.profile?.distance_unit)})
                  </Text>
                </View>
              ) : (
                <View style={styles.upNextBanner}>
                  <Feather name="flag" size={13} color="#FFD60A" />
                  <Text style={[styles.upNextText, { color: '#FFD60A' }]}>
                    Final Step! Finish strong!
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.dashboardActionsRow}>
            {/* Skip Step Button */}
            {isRunning && currentStepIndex < executionPlan.length - 1 && (
              <Pressable
                style={styles.skipStepButton}
                onPress={advanceToNextStep}
              >
                <Feather name="skip-forward" size={16} color="#FFFFFF" />
                <Text style={styles.skipStepText}>SKIP</Text>
              </Pressable>
            )}

            {/* Primary Action Button (Start / Pause / Resume) */}
            {!isRunning ? (
              <Pressable
                style={[styles.primaryActionButton, styles.startBtnBg]}
                onPress={() => void startRun('RUN')}
              >
                <Feather name="play" size={18} color="#000000" />
                <Text style={styles.primaryActionTextDark}>START WORKOUT</Text>
              </Pressable>
            ) : manualPauseEnabled ? (
              isPaused ? (
                <Pressable
                  style={[styles.primaryActionButton, styles.resumeBtnBg]}
                  onPress={() => void resumeRun()}
                >
                  <Feather name="play" size={18} color="#000000" />
                  <Text style={styles.primaryActionTextDark}>RESUME</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.primaryActionButton, styles.pauseBtnBg]}
                  onPress={() => void pauseRun()}
                >
                  <Feather name="pause" size={18} color="#000000" />
                  <Text style={styles.primaryActionTextDark}>PAUSE</Text>
                </Pressable>
              )
            ) : (
              <View style={[styles.primaryActionButton, styles.autoPauseMode]}>
                <Text style={styles.autoPauseModeText}>{isPaused ? 'AUTO-PAUSED' : 'AUTO-PAUSE ON'}</Text>
              </View>
            )}

            {/* Stop & Save Button */}
            {isRunning && (
              <Pressable
                style={styles.stopActionButton}
                onPress={requestSaveAndExit}
              >
                <Feather name="square" size={16} color="#FFFFFF" />
                <Text style={styles.stopActionText}>SAVE AND EXIT</Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : (
        /* Fallback for open running without a custom workout */
        <>
          <View style={styles.controlBar}>
            <View style={styles.controlBarContent}>
            <View style={styles.controlStatus}>
              <View style={styles.liveMetricRow}>
                <View style={styles.liveMetricItem}>
                  <Text style={styles.liveMetricLabel} numberOfLines={1}>DISTANCE:</Text>
                  <Text style={styles.liveMetricValue} numberOfLines={1} adjustsFontSizeToFit>{formatDistanceFromMeters(distance, user?.profile?.distance_unit)}</Text>
                </View>
                <View style={styles.liveMetricItem}>
                  <Text style={styles.liveMetricLabel} numberOfLines={1}>AVG PACE:</Text>
                  <Text style={styles.liveMetricValue} numberOfLines={1} adjustsFontSizeToFit>{formatPaceFromSecondsPerKm(pace * 60, user?.profile?.distance_unit)}</Text>
                </View>
              </View>
              <View style={styles.liveMetricDivider} />
              <View style={styles.liveMetricRow}>
                <View style={styles.liveMetricItem}>
                  <Text style={styles.liveMetricLabel} numberOfLines={1}>TIME:</Text>
                  <Text style={styles.liveMetricValue} numberOfLines={1}>{formatTimerDisplay(elapsedSeconds)}</Text>
                </View>
                <Text style={styles.liveMetricStatus}>{isRunning ? `${selectedActivityType} · ${isPaused ? 'PAUSED' : 'LIVE'}` : `${selectedActivityType} · READY`}</Text>
              </View>
            </View>

            {!isRunning && !isStructuredOrPlannedWorkout && (
              <View style={styles.activitySelectorBar}>
                <Pressable
                  style={[
                    styles.activityTypeChip,
                    selectedActivityType === 'RUN' && styles.activityTypeChipActiveRun,
                  ]}
                  onPress={() => {
                    selectedActivityTypeRef.current = 'RUN';
                    setSelectedActivityType('RUN');
                  }}
                >
                  <MaterialCommunityIcons
                    name="run-fast"
                    size={15}
                    color={selectedActivityType === 'RUN' ? '#081009' : '#8E8E93'}
                  />
                  <Text
                    style={[
                      styles.activityTypeChipText,
                      selectedActivityType === 'RUN' && styles.activityTypeChipTextActive,
                    ]}
                  >
                    RUN
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.activityTypeChip,
                    selectedActivityType === 'WALK' && styles.activityTypeChipActiveWalk,
                  ]}
                  onPress={() => {
                    selectedActivityTypeRef.current = 'WALK';
                    setSelectedActivityType('WALK');
                  }}
                >
                  <MaterialCommunityIcons
                    name="walk"
                    size={15}
                    color={selectedActivityType === 'WALK' ? '#FFFFFF' : '#8E8E93'}
                  />
                  <Text
                    style={[
                      styles.activityTypeChipText,
                      selectedActivityType === 'WALK' && styles.activityTypeChipTextActiveWalk,
                    ]}
                  >
                    WALK
                  </Text>
                </Pressable>
              </View>
            )}

            <View style={styles.controlActionsRow}>
              <View style={styles.actionButtonSlot}>
                {!isRunning ? (
                  <Pressable
                    style={styles.startButton}
                    hitSlop={16}
                    android_disableSound
                    onPress={() => {
                      if (isStructuredOrPlannedWorkout) {
                        void startRun('RUN');
                      } else {
                        setIsActivityModalVisible(true);
                      }
                    }}
                  >
                    <Feather name="play" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.startButtonText}>START WORKOUT</Text>
                  </Pressable>
                ) : manualPauseEnabled ? (
                  isPaused ? (
                    <Pressable
                      style={styles.resumeButton}
                      hitSlop={16}
                      android_disableSound
                      onPress={() => {
                        void resumeRun();
                      }}
                    >
                      <Text style={styles.resumeButtonText}>RESUME</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={styles.pauseButton}
                      hitSlop={16}
                      android_disableSound
                      onPress={() => {
                        void pauseRun();
                      }}
                    >
                      <Text style={styles.pauseButtonText}>PAUSE</Text>
                    </Pressable>
                  )
                ) : (
                  <View style={styles.autoPauseStatus}>
                    <Text style={styles.autoPauseModeText}>{isPaused ? 'AUTO-PAUSED' : 'AUTO-PAUSE ON'}</Text>
                  </View>
                )}
              </View>

              {isRunning && (
                <View style={styles.stopButtonSlot}>
                  <Pressable
                    style={styles.stopButton}
                    hitSlop={16}
                    android_disableSound
                    onPress={requestSaveAndExit}
                  >
                    <Text style={styles.stopButtonText}>SAVE AND EXIT</Text>
                  </Pressable>
                </View>
              )}
            </View>
            </View>
          </View>
        </>
        )}
      </View>
      </View>

      {/* Activity Type Selection Modal (Walk or Run) */}
      <Modal
        visible={isActivityModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsActivityModalVisible(false)}
      >
        <Pressable
          style={styles.activityModalOverlay}
          onPress={() => setIsActivityModalVisible(false)}
        >
          <Pressable style={styles.activityModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.activityModalHeader}>
              <View>
                <Text style={styles.activityModalTitle}>START WORKOUT</Text>
                <Text style={styles.activityModalSubtitle}>
                  Choose your activity type to begin
                </Text>
              </View>
              <Pressable
                style={styles.activityModalCloseBtn}
                onPress={() => setIsActivityModalVisible(false)}
                hitSlop={12}
              >
                <Feather name="x" size={20} color="#8E8E93" />
              </Pressable>
            </View>

            <View style={styles.activityOptionCardsRow}>
              {/* RUN Option Card */}
              <Pressable
                style={({ pressed }) => [
                  styles.activityOptionCard,
                  styles.activityOptionCardRun,
                  selectedActivityType === 'RUN' && styles.activityOptionCardSelectedRun,
                  pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                ]}
                onPress={() => void handleSelectActivityAndStart('RUN')}
              >
                <View style={[styles.activityIconCircle, { backgroundColor: '#30D158' }]}>
                  <MaterialCommunityIcons name="run-fast" size={28} color="#081009" />
                </View>
                <Text style={styles.activityOptionTitle}>RUN</Text>
                <Text style={styles.activityOptionDesc}>
                  Outdoor running, jogging, intervals. Recorded & saved as RUN.
                </Text>
                <View style={[styles.activityOptionStartBadge, { backgroundColor: 'rgba(48, 209, 88, 0.2)' }]}>
                  <Text style={[styles.activityOptionStartText, { color: '#30D158' }]}>
                    START RUN
                  </Text>
                  <Feather name="arrow-right" size={13} color="#30D158" />
                </View>
              </Pressable>

              {/* WALK Option Card */}
              <Pressable
                style={({ pressed }) => [
                  styles.activityOptionCard,
                  styles.activityOptionCardWalk,
                  selectedActivityType === 'WALK' && styles.activityOptionCardSelectedWalk,
                  pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                ]}
                onPress={() => void handleSelectActivityAndStart('WALK')}
              >
                <View style={[styles.activityIconCircle, { backgroundColor: '#0A84FF' }]}>
                  <MaterialCommunityIcons name="walk" size={28} color="#FFFFFF" />
                </View>
                <Text style={styles.activityOptionTitle}>WALK</Text>
                <Text style={styles.activityOptionDesc}>
                  Outdoor walking, brisk walk, stroll. Recorded & saved as WALK.
                </Text>
                <View style={[styles.activityOptionStartBadge, { backgroundColor: 'rgba(10, 132, 255, 0.2)' }]}>
                  <Text style={[styles.activityOptionStartText, { color: '#0A84FF' }]}>
                    START WALK
                  </Text>
                  <Feather name="arrow-right" size={13} color="#0A84FF" />
                </View>
              </Pressable>
            </View>

            <View style={styles.activityNoteRow}>
              <Feather name="info" size={12} color="#8E8E93" />
              <Text style={styles.activityNoteText}>
                Your workout will be saved strictly as chosen, regardless of your pace.
              </Text>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mapContainer: { flex: 1, position: 'relative' },
  mapContainerSplit: { flex: 1, position: 'relative' },
  map: { flex: 1, width: '100%', height: '100%' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0E0F',
    padding: 20,
    zIndex: 30,
  },
  loadingText: { color: '#fff', fontSize: 16, marginTop: 16 },
  loadingSubText: { color: '#bbb', fontSize: 12, marginTop: 6 },
  mapControlsWrapper: {
    position: 'absolute',
    right: 16,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    zIndex: 20,
  },
  mapControlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(24, 24, 27, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  zoomButtonText: { color: '#fff', fontSize: 24, fontWeight: '700', lineHeight: 26 },
  gpsStatusContainer: { position: 'absolute', top: 20, right: 18, flexDirection: 'row' },
  gpsStatus: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  gpsDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  gpsStatusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  routeDistanceStatusText: { color: '#D1D5DB', fontSize: 9, fontWeight: '600', marginTop: 2 },
  gpsAccuracyText: { marginLeft: 8, color: '#8BE9A8', fontSize: 10, fontWeight: '700' },
  voiceCoachNotice: {
    position: 'absolute',
    top: 62,
    left: 16,
    right: 16,
    zIndex: 25,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  voiceCoachNoticeText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  floatingOverlayWrapper: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: 'transparent',
    flexDirection: 'column',
    gap: 12,
    zIndex: 10,
  },
  
  // Custom Workout Runner Dashboard Styles
  dashboardContainer: {
    backgroundColor: 'transparent',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    justifyContent: 'space-between',
  },
  dashboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  dashboardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  stepTypeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dashboardWorkoutTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepCounterBadge: {
    backgroundColor: '#1C1D24',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  stepCounterText: {
    color: '#9BA3AF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  muteButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1C1D24',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeStepCard: {
    backgroundColor: '#1A1C23',
    borderRadius: 16,
    padding: 12,
    borderLeftWidth: 4,
  },
  activeStepTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  activeStepTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
    marginRight: 8,
  },
  stepTypePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  stepTypePillText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  targetCalculationBlock: {
    backgroundColor: '#13141A',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  targetMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 6,
  },
  countdownValue: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  targetTotalValue: {
    color: '#9BA3AF',
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  metricUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  targetSublabel: {
    color: '#6B7280',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 2,
  },
  targetDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#2A2D37',
  },
  progressBarTrack: {
    height: 5,
    backgroundColor: '#222530',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  paceComparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#13141A',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 6,
    marginBottom: 6,
  },
  paceItem: {
    alignItems: 'center',
    flex: 1,
  },
  paceLabel: {
    color: '#6B7280',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  paceValue: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  paceUnit: {
    fontSize: 9,
    fontWeight: '600',
    color: '#9BA3AF',
  },
  paceDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#2A2D37',
  },
  upNextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  upNextText: {
    color: '#9BA3AF',
    fontSize: 10,
    fontWeight: '600',
    flex: 1,
  },
  upNextHighlight: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  recoveryOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    zIndex: 30,
  },
  recoveryBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
  },
  recoveryPanel: {
    paddingTop: 22,
    paddingHorizontal: 22,
    paddingBottom: 28,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: '#F8FAFC',
  },
  recoveryEyebrow: { color: '#6B7280', fontSize: 15, fontWeight: '700', textAlign: 'center', marginBottom: 28 },
  recoveryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recoveryTitle: { flex: 1, color: '#111827', fontSize: 21, fontWeight: '800' },
  recoveryMessage: { color: '#6B7280', fontSize: 14, lineHeight: 21, marginTop: 18 },
  recoveryMetrics: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 18 },
  recoveryMetric: { flex: 1, minWidth: 0 },
  recoveryMetricLabel: { color: '#6B7280', fontSize: 12, marginBottom: 5 },
  recoveryMetricValue: { color: '#111827', fontSize: 15, fontWeight: '700' },
  recoveryPace: { color: '#111827', fontSize: 14, marginTop: 20, marginBottom: 24 },
  recoverySaveButton: { minHeight: 52, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A84FF' },
  recoverySaveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  recoveryStopButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  recoveryStopText: { color: '#111827', fontSize: 16, fontWeight: '700' },
  recoveryDiscardButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  recoveryDiscardText: { color: '#EF4444', fontSize: 16, fontWeight: '600' },
  recoveryLaterButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  recoveryLaterText: { color: '#6B7280', fontSize: 15 },
  completionPanel: {
    backgroundColor: '#1C1D24',
    borderRadius: 14,
    padding: 12,
    width: '90%',
    alignItems: 'center',
  },
  completionOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    zIndex: 20,
  },
  completionTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', textAlign: 'center' },
  completionMessage: { color: '#A1A1AA', fontSize: 11, marginTop: 3, textAlign: 'center' },
  completionActions: { flexDirection: 'row', gap: 8, marginTop: 10, width: '100%' },
  continueActionButton: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A2D37',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueActionText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  saveExitActionButton: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF453A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveExitActionText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  dashboardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  skipStepButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#2A2D37',
    paddingHorizontal: 12,
    height: 46,
    borderRadius: 23,
  },
  skipStepText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  primaryActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: 23,
  },
  startBtnBg: {
    backgroundColor: '#30D158',
  },
  resumeBtnBg: {
    backgroundColor: '#30D158',
  },
  pauseBtnBg: {
    backgroundColor: '#FF9F0A',
  },
  autoPauseMode: {
    backgroundColor: '#26332A',
    borderWidth: 1,
    borderColor: '#35C72B',
  },
  autoPauseModeText: {
    color: '#D9F5DD',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  primaryActionTextDark: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  stopActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FF453A',
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 23,
  },
  stopActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // Classic Control Bar Styles
  controlBar: {
    position: 'relative',
    height: 200,
    paddingHorizontal: 0,
    paddingBottom: 0,
    paddingTop: 0,
    backgroundColor: 'transparent',
  },
  controlBarContent: { flex: 1, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'space-between', backgroundColor: 'transparent', gap: 12 },
  controlActionsRow: { flexDirection: 'row', width: '100%', gap: 8 },
  actionButtonSlot: { flex: 1, height: 54, position: 'relative' },
  autoPauseStatus: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 54, borderRadius: 30, borderWidth: 1, borderColor: '#35C72B', backgroundColor: '#17231B' },
  stopButtonSlot: { flex: 1, height: 54, position: 'relative' },
  controlStatus: { flex: 0, minWidth: 0, minHeight: 74, justifyContent: 'center', padding: 14, borderRadius: 16, backgroundColor: 'rgba(0, 0, 0, 0.65)', borderWidth: 1, borderColor: 'rgba(0, 255, 0, 0.3)' },
  liveMetricRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 },
  liveMetricItem: { flex: 1, minWidth: 0 },
  liveMetricLabel: { color: '#8DBA99', fontSize: 8, fontWeight: '800', letterSpacing: 0.1 },
  liveMetricValue: { color: '#F4F7F4', fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'], marginTop: 1 },
  liveMetricUnit: { color: '#B7C5BA', fontSize: 11, fontWeight: '700' },
  liveMetricDivider: { height: 1, marginVertical: 5, backgroundColor: '#35C72B', shadowColor: '#35C72B', shadowOpacity: 0.9, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
  liveMetricStatus: { color: '#35C72B', fontSize: 8, fontWeight: '900', letterSpacing: 0.5, paddingTop: 10 },
  controlStatusValue: { color: '#fff', fontSize: 17, fontWeight: '800' },
  paceStatus: { color: '#FFB800', fontSize: 11, fontWeight: '700', marginTop: 3 },
  startButton: { position: 'absolute', inset: 0, backgroundColor: '#20D000', borderRadius: 30, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 6 },
  startButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  pauseButton: { position: 'absolute', inset: 0, backgroundColor: '#FFB800', borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  pauseButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  resumeButton: { position: 'absolute', inset: 0, backgroundColor: '#20D000', borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  resumeButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  stopButton: { position: 'absolute', inset: 0, backgroundColor: '#F04444', borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  stopButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  activitySelectorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  activityTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  activityTypeChipActiveRun: {
    backgroundColor: '#30D158',
    borderColor: '#30D158',
  },
  activityTypeChipActiveWalk: {
    backgroundColor: '#0A84FF',
    borderColor: '#0A84FF',
  },
  activityTypeChipText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  activityTypeChipTextActive: {
    color: '#081009',
  },
  activityTypeChipTextActiveWalk: {
    color: '#FFFFFF',
  },
  activityModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  activityModalContent: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#16191D',
    borderRadius: 24,
    borderWidth: 1.25,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 22,
    gap: 16,
  },
  activityModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activityModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  activityModalSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    marginTop: 2,
  },
  activityModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityOptionCardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  activityOptionCard: {
    flex: 1,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: '#1E232A',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 180,
  },
  activityOptionCardRun: {
    borderColor: 'rgba(48, 209, 88, 0.35)',
  },
  activityOptionCardWalk: {
    borderColor: 'rgba(10, 132, 255, 0.35)',
  },
  activityOptionCardSelectedRun: {
    borderColor: '#30D158',
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
  },
  activityOptionCardSelectedWalk: {
    borderColor: '#0A84FF',
    backgroundColor: 'rgba(10, 132, 255, 0.12)',
  },
  activityIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  activityOptionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  activityOptionDesc: {
    fontSize: 10,
    fontWeight: '500',
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 14,
    flex: 1,
  },
  activityOptionStartBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 8,
  },
  activityOptionStartText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  activityNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
    justifyContent: 'center',
  },
  activityNoteText: {
    fontSize: 10,
    color: '#8E8E93',
    fontWeight: '500',
    textAlign: 'center',
  },
   pauseMarker: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#D1D5DB' },
  resumeMarker: { backgroundColor: '#FFFFFF' },
  controlBars: {
    position: 'relative',
    height: 118,
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 8,
    backgroundColor: '#000000',
  },
});
