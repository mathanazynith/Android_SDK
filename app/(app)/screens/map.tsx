import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    BackHandler,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import MapView, { Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { ActivityDetectionService } from '../../../src/services/activityDetectionService';
import { LocationQueue } from '../../../src/services/locationQueue';
import { LocationService } from '../../../src/services/locationService';
import { PathProcessor } from '../../../src/services/pathProcessor';
import { RunningApiClient } from '../../../src/services/runningApi';
import { StepDetectionService } from '../../../src/services/stepDetectionService';
import voiceCoach from '../../../src/services/voiceCoach';
import { ActivitySubmissionPayload, RawGpsPayload, RunningGpsPoint, RunningPathPoint } from '../../../src/types/running';
import { calculateDistanceMeters } from '../../../src/utils/distance';
import { formatStepTarget, WorkoutExecutionStep } from '../../../src/utils/workoutPlanBuilder';

const RUNNING_USER_ID = 'USER-1001';

const formatTimerDisplay = (totalSec: number) => {
  const m = Math.floor(Math.max(0, totalSec) / 60);
  const s = Math.max(0, totalSec) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const formatPaceDisplay = (paceVal: number) => {
  if (!paceVal || !isFinite(paceVal) || paceVal <= 0 || paceVal > 30) return '--:--';
  const m = Math.floor(paceVal);
  const s = Math.round((paceVal % 1) * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
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

const formatStepTargetSafe = (step?: WorkoutExecutionStep | null) => {
  if (!step) return '';
  if (typeof formatStepTarget === 'function') {
    return formatStepTarget(step);
  }
  if (step.targetType === 'DURATION' && step.targetDurationSeconds) {
    const mins = Math.floor(step.targetDurationSeconds / 60);
    const secs = step.targetDurationSeconds % 60;
    if (mins > 0 && secs > 0) return `${mins}m ${secs}s`;
    if (mins > 0) return `${mins} min`;
    return `${secs} sec`;
  }
  if (step.targetType === 'DISTANCE' && step.targetDistanceMeters) {
    return `${(step.targetDistanceMeters / 1000).toFixed(2)} km`;
  }
  return 'Open target';
};

interface Coordinate {
  latitude: number;
  longitude: number;
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

export default function MapScreen() {
  const params = useLocalSearchParams<{
    workoutTitle?: string;
    workoutPlan?: string;
  }>();

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

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepStartSeconds, setStepStartSeconds] = useState(0);
  const [stepStartDistanceMeters, setStepStartDistanceMeters] = useState(0);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);

  const currentStepIndexRef = useRef(0);
  const stepStartSecondsRef = useRef(0);
  const stepStartDistanceRef = useRef(0);
  const halfwayAnnouncedRef = useRef(false);
  const executionPlanRef = useRef<WorkoutExecutionStep[]>([]);
  executionPlanRef.current = executionPlan;
  const [loading, setLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<Coordinate[]>([]);
  const [distance, setDistance] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [optimizedStats, setOptimizedStats] = useState({
    rawPointCount: 0,
    optimizedPointCount: 0,
    reductionPercent: 0,
  });
  const [stepCount, setStepCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [pace, setPace] = useState(0); // pace in minutes per km

  const mapRef = useRef<MapView | null>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const activityDetectionRef = useRef<ActivityDetectionService | null>(null);
  const stepDetectionRef = useRef<StepDetectionService | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const previousLocationRef = useRef<RawGpsPayload | null>(null);
  const runIdRef = useRef<string | null>(null);
  const apiClientRef = useRef<RunningApiClient | null>(null);
  const pathProcessorRef = useRef<PathProcessor | null>(null);
  const queueRef = useRef<LocationQueue | null>(null);
  const uploadInProgressRef = useRef(false);
  const distanceRef = useRef(0);
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
  const stepCountRef = useRef(0);
  const movementConfirmedRef = useRef(false);


  const [logs, setLogs] = useState<string[]>([]);
  const addLog = useCallback((value: string) => {
    setLogs((prev) => [...prev, value]);
  }, []);

  const [location, setLocation] = useState<LocationState | null>(null);

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

    // The old 0.002-degree minimum showed roughly 200m and made a room route
    // appear tiny. Keep short routes at the close tracking zoom.
    if (Math.max(routeWidthMeters, routeHeightMeters) < 60) {
      mapRef.current.animateCamera(
        { center: { latitude: midLat, longitude: midLon }, zoom: 20 },
        { duration: 350 }
      );
      console.log('[WorkoutMapView] Short route kept at close indoor zoom (20)');
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

  const requestLocation = useCallback(async () => {
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
        return;
      }

      await LocationService.enableHighAccuracyProvider();

      if (Platform.OS === 'android') {
        const backgroundGranted = await LocationService.requestBackgroundPermissions();
        if (!backgroundGranted) {
          Alert.alert(
            'Background Location',
            'Background location access helps track your run even when the app is in background.'
          );
        }
      }

      setPermissionGranted(true);

      const currentLocation = await LocationService.getCurrentLocation();
      console.log(
        `[LocationManager] incoming sample acc:${currentLocation.accuracy ?? 0}m age:0.0s speed:${currentLocation.speed ?? 0} hasLast:false`
      );

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
    } catch (error) {
      console.error('Location error:', error);
      Alert.alert('Location Error', 'Unable to get your current location. Please make sure GPS is enabled.');
    } finally {
      setLoading(false);
    }
  }, [addLog, moveMapToLocation]);

  useEffect(() => {
    if (hasInitializedLocationRef.current) return;
    hasInitializedLocationRef.current = true;
    void requestLocation();
  }, [requestLocation]);

  useEffect(() => {
    return () => {
      isRunningRef.current = false;
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
      activityDetectionRef.current?.stop();
      activityDetectionRef.current = null;
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
      voiceCoach?.announceWorkoutCompleted?.();
      Alert.alert(
        'Workout Completed!',
        'You have successfully completed all planned steps! Great work! Would you like to stop and save your workout?',
        [
          { text: 'Keep Running', style: 'cancel' },
          { text: 'Stop & Save', onPress: () => stopRunRef.current() },
        ]
      );
    }
  }, [elapsedSeconds]);

  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      if (startTimeRef.current) {
        let elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        
        // Subtract paused duration from elapsed time
        if (pausedTimeRef.current) {
          elapsed -= Math.floor(pausedTimeRef.current / 1000);
        }
        
        setElapsedSeconds(elapsed);

        // Calculate pace (minutes per km)
        if (distanceRef.current > 0) {
          const distanceInKm = distanceRef.current / 1000;
          const elapsedMinutes = elapsed / 60;
          if (elapsedMinutes > 0) {
            const paceValue = elapsedMinutes / distanceInKm;
            setPace(paceValue);
          }
        }

        // Custom Workout Step Completion Check
        const plan = executionPlanRef.current;
        if (plan.length > 0 && !isPausedRef.current) {
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

      const uploadPayload = {
        run_id: runIdRef.current,
        points: batch,
      };

      console.log('[Upload Payload JSON]', JSON.stringify(uploadPayload, null, 2));

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
    (rawGps: RawGpsPayload) => {
      if (!isRunningRef.current) return;

      const timestamp = typeof rawGps.timestamp === 'number'
        ? rawGps.timestamp
        : typeof rawGps.timestamp === 'string'
          ? parseInt(rawGps.timestamp, 10)
          : Date.now();

      const ageSeconds = previousLocationRef.current && typeof previousLocationRef.current.timestamp !== 'undefined'
        ? Math.max(0, (timestamp - (typeof previousLocationRef.current.timestamp === 'number' ? previousLocationRef.current.timestamp : Date.now())) / 1000)
        : 0;

      console.log(
        `[LocationManager] LIVE GPS -> lat:${rawGps.latitude} lon:${rawGps.longitude} accuracy:${rawGps.accuracy ?? 0}m speed:${rawGps.speed ?? 0} heading:${rawGps.heading ?? 0} timestamp:${timestamp}`
      );

      console.log(
        `[LocationManager] incoming sample -> accuracy:${rawGps.accuracy ?? 0}m age:${ageSeconds.toFixed(1)}s speed:${rawGps.speed ?? 0} hasLast:${previousLocationRef.current ? 'true' : 'false'}`
      );

      setLocation({
        coords: {
          latitude: rawGps.latitude,
          longitude: rawGps.longitude,
          accuracy: rawGps.accuracy ?? null,
          altitude: rawGps.altitude ?? null,
          altitudeAccuracy: null,
          heading: rawGps.heading ?? null,
          speed: rawGps.speed ?? null,
        },
        timestamp,
      });

      setAccuracy(rawGps.accuracy ?? null);

      const processor = pathProcessorRef.current;

      if (!processor) return;

      const activityDetection = activityDetectionRef.current;
      const detectedActivity = activityDetection?.getCurrentActivity() ?? 'unknown';
      const hasDetectedMovement = detectedActivity === 'walking' || detectedActivity === 'running';
      const hasStepEvidence = stepCountRef.current >= 3;
      if (activityDetection) {
        console.log(
          `[LocationManager] Activity: ${detectedActivity} (live route requires movement confirmation)`
        );
      }

      if (hasDetectedMovement || hasStepEvidence) {
        movementConfirmedRef.current = true;
      }

      // GPS location changes are not movement proof indoors. Wait for Android
      // activity recognition (walking/running) or several pedometer steps
      // before turning fresh location fixes into a visible route.
      if (!movementConfirmedRef.current) {
        console.log(
          `[LocationManager] Live point held: activity=${detectedActivity}, steps=${stepCountRef.current}; awaiting real movement`
        );
        previousLocationRef.current = rawGps;
        moveMapToLocation(rawGps.latitude, rawGps.longitude);
        return;
      }

      const displayCountBefore = processor.getDisplayPoints().length;
      const retained = processor.ingestRaw(rawGps);

      if (retained) {
        // Match iOS: draw every fresh live location immediately, even when it
        // is later rejected from the saved workout for being inaccurate.
        // The strict save-time filter remains independent of this visual trace.
        const liveCoordinates = processor.getRawPoints().map((point: RunningGpsPoint) => ({
          latitude: point.latitude,
          longitude: point.longitude,
        }));

        setRouteCoordinates(liveCoordinates);
        console.log(`[WorkoutMapView] 📌 Polyline updated: ${liveCoordinates.length} live points`);
        console.log(`[LocationManager] Tiers -> raw:${processor.getRawPoints().length} display:${processor.getDisplayPoints().length}`);
        addLog(`📌 Live polyline: ${liveCoordinates.length} points`);

        const displayPointWasAdded = processor.getDisplayPoints().length > displayCountBefore;
        const latestDisplayPoint = processor.getDisplayPoints().at(-1);
        if (displayPointWasAdded && latestDisplayPoint && lastRetainedCoordinateRef.current) {
          const movementDistance = calculateDistanceMeters(
            lastRetainedCoordinateRef.current,
            { latitude: latestDisplayPoint.latitude, longitude: latestDisplayPoint.longitude }
          );

          if (movementDistance > 0 && movementDistance < 50) {
            const nextDistance = distanceRef.current + movementDistance;
            distanceRef.current = nextDistance;
            setDistance(nextDistance);
          }
        }

        if (displayPointWasAdded && latestDisplayPoint) {
          lastRetainedCoordinateRef.current = {
            latitude: latestDisplayPoint.latitude,
            longitude: latestDisplayPoint.longitude,
          };
        }

        // Live route points stay on-device and unfiltered. They are filtered,
        // simplified, and uploaded once only when the user saves the workout.
      } else {
        console.log('[LocationManager] Rejected: GPS sample did not pass live validation');
        addLog('? GPS point rejected');
      }

      previousLocationRef.current = rawGps;
      console.log(`[WorkoutMapView] Current location: lat=${rawGps.latitude} lon=${rawGps.longitude}`);
      moveMapToLocation(rawGps.latitude, rawGps.longitude);
    },
    [addLog, fitMapToRoute, moveMapToLocation, uploadBatch]
  );

  const startLiveGPS = useCallback(async () => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }

    locationSubscription.current = await LocationService.watchLocation(handleLocationUpdate);
    addLog('?? Live GPS tracking started');
  }, [addLog, handleLocationUpdate]);

  const startRun = async () => {
    if (isStartingRef.current || isRunningRef.current) {
      console.log('[RecordView] Start request ignored: a run is already starting or active');
      return;
    }

    isStartingRef.current = true;
    try {
      if (!permissionGranted) {
        await requestLocation();
        return;
      }

      setRouteCoordinates([]);
      distanceRef.current = 0;
      setDistance(0);
      setElapsedSeconds(0);
      setStepCount(0);
      stepCountRef.current = 0;
      movementConfirmedRef.current = false;
      setPace(0);
      setIsPaused(false);
      setOptimizedStats({ rawPointCount: 0, optimizedPointCount: 0, reductionPercent: 0 });
      setLogs([]);
      previousLocationRef.current = null;
      lastRetainedCoordinateRef.current = null;
      isPausedRef.current = false;
      pausedTimeRef.current = null;
      pauseStartTimeRef.current = null;

      const apiClient = new RunningApiClient();
      apiClientRef.current = apiClient;

      const startedAt = new Date().toISOString();
      startTimeRef.current = Date.now();
      const startResponse = await apiClient.startRun(RUNNING_USER_ID, startedAt);

      if (!startResponse.success || !startResponse.run_id) {
        Alert.alert('Error', 'Failed to start run');
        return;
      }

      const runId = startResponse.run_id;
      runIdRef.current = runId;

      const startPayload = {
        user_id: RUNNING_USER_ID,
        started_at: startedAt,
        run_id: runId,
      };

      console.log('[Start Run Payload JSON]', JSON.stringify(startPayload, null, 2));

      const currentLocation = await LocationService.getCurrentLocation();
      console.log(
        `[LocationManager] First strict point recorded: lat:${currentLocation.latitude}, lon:${currentLocation.longitude}, acc:${currentLocation.accuracy ?? 0}m`
      );

      const startingPoint: Coordinate = {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      };

      const pathProcessor = new PathProcessor(runId);
      pathProcessorRef.current = pathProcessor;
      pathProcessor.reset();

      // The fresh fix acquired at Start is a genuine route sample. Retaining
      // it means Stop can always create a valid final payload even if Android
      // produces no additional indoor fixes during a short workout.
      const startRawPoint = pathProcessor.ingestRaw(currentLocation);
      if (startRawPoint) {
        const initialRoute = pathProcessor.getRawPoints().map((point) => ({
          latitude: point.latitude,
          longitude: point.longitude,
        }));
        setRouteCoordinates(initialRoute);
        lastRetainedCoordinateRef.current = {
          latitude: startRawPoint.latitude,
          longitude: startRawPoint.longitude,
        };
        console.log('[LocationManager] Start coordinate retained as raw point for final payload');
      }

      const activityDetection = new ActivityDetectionService();
      activityDetectionRef.current = activityDetection;
      const stepDetection = new StepDetectionService();
      stepDetectionRef.current = stepDetection;

      const queue = new LocationQueue();
      queueRef.current = queue;

      console.log('[Run Start Coordinate]', JSON.stringify([startingPoint], null, 2));
      console.log('[Run Start Payload]', JSON.stringify({ user_id: RUNNING_USER_ID, started_at: startedAt, run_id: runId }, null, 2));

      console.log('[LocationManager] RUN STARTED');
      console.log(`[RecordView] Recording started at ${startedAt}`);
      isRunningRef.current = true;
      setIsRunning(true);

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

      addLog(`?? Run ${runId} started`);
      if (params.workoutTitle) addLog(`Planned workout: ${params.workoutTitle}`);
      addLog('?? GPS tracking enabled');
      moveMapToLocation(startingPoint.latitude, startingPoint.longitude);

      // GPS is the primary source of truth. Do not await motion activity
      // recognition (or the location watcher setup) before showing the active
      // recording UI: either native request can be slow on Android.
      void startLiveGPS()
        .then(() => console.log('RUN STARTED:', runId))
        .catch((error) => {
          console.error('[LocationManager] GPS watcher failed to start', error);
          addLog('GPS watcher failed to start');
        });

      void activityDetection.start(startTimeRef.current).catch((error) => {
        console.warn('[LocationManager] Activity monitoring startup failed; GPS recording continues', error);
      });
      void stepDetection.start((steps) => {
        stepCountRef.current = steps;
        if (steps >= 3) {
          movementConfirmedRef.current = true;
        }
        setStepCount(steps);
      }).catch((error) => {
        console.warn('[LocationManager] Pedometer startup failed; GPS-only tracking continues', error);
      });
    } catch (error) {
      console.error('Start run error:', error);
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

  const pauseRun = async () => {
    if (isPausingRef.current || !isRunningRef.current || isPausedRef.current) {
      console.log('[RecordView] Pause request ignored: run not active or already paused');
      return;
    }

    isPausingRef.current = true;
    try {
      console.log('[RecordView] Pausing run...');

      // Stop location updates
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }

      // Mark pause start time
      pauseStartTimeRef.current = Date.now();
      isPausedRef.current = true;
      setIsPaused(true);

      console.log('[RecordView] Run paused - tracking stopped');
      addLog('⏸ Run paused - tracking stopped');
    } catch (error) {
      console.error('Pause run error:', error);
      addLog('❌ Failed to pause run');
    } finally {
      isPausingRef.current = false;
    }
  };

  const resumeRun = async () => {
    if (!isPausedRef.current || !isRunningRef.current) {
      console.log('[RecordView] Resume request ignored: run not paused');
      return;
    }

    try {
      console.log('[RecordView] Resuming run...');

      // Add paused duration to total
      if (pauseStartTimeRef.current) {
        const pausedDuration = Date.now() - pauseStartTimeRef.current;
        pausedTimeRef.current = (pausedTimeRef.current || 0) + pausedDuration;
      }

      isPausedRef.current = false;
      setIsPaused(false);

      // Restart location tracking
      await startLiveGPS();

      console.log('[RecordView] Run resumed - tracking restarted');
      addLog('▶ Run resumed - tracking restarted');
    } catch (error) {
      console.error('Resume run error:', error);
      addLog('❌ Failed to resume run');
    }
  };

  const stopRun = async () => {
    if (isStoppingRef.current) {
      console.log('[RecordView] Stop request ignored: finalization already in progress');
      return;
    }

    isStoppingRef.current = true;
    try {
      const stoppedAt = new Date();
      const detectedActivity = activityDetectionRef.current?.getCurrentActivity();
      const hasDetectedMovement = detectedActivity === 'walking' || detectedActivity === 'running';
      const hasStepEvidence = stepCountRef.current >= 3;
      const stationarySession = !movementConfirmedRef.current && !hasDetectedMovement && !hasStepEvidence;
      // Never infer a run from an unknown or stationary state. A run is only
      // submitted when Android activity recognition explicitly reports it.
      const workoutType = detectedActivity === 'running' ? 'run' : 'walk';
      const activityType = workoutType === 'walk' ? 'WALK' : 'RUN';
      console.log(`[RecordView] Recording stopped at ${stoppedAt.toISOString()}`);
      console.log('[RecordView] Stop finalization started');
      isRunningRef.current = false;

      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
      activityDetectionRef.current?.stop();
      activityDetectionRef.current = null;
      stepDetectionRef.current?.stop();
      stepDetectionRef.current = null;

      const processor = pathProcessorRef.current;

      if (stationarySession) {
        console.log(
          `[LocationManager] Stationary session discarded: activity=${detectedActivity ?? 'unknown'}, steps=${stepCountRef.current}; no route or activity upload`
        );
        setRouteCoordinates([]);
        distanceRef.current = 0;
        setDistance(0);
        setOptimizedStats({ rawPointCount: 0, optimizedPointCount: 0, reductionPercent: 0 });
        addLog('No movement detected — route was not saved');

        if (apiClientRef.current && runIdRef.current) {
          await apiClientRef.current.stopRun({
            run_id: runIdRef.current,
            ended_at: stoppedAt.toISOString(),
            final_sequence: 0,
          });
        }
      } else if (processor) {
        console.log('[LocationManager] Raw points collected:', processor.getRawPoints().length);
        console.log('[LocationManager] Filtering started');
        const filteredPoints = processor.filterRawPoints();
        console.log(`[LocationManager] Filtered points: ${filteredPoints.length}`);

        console.log('[LocationManager] RDP optimization started');
        const finalOptimized = processor.simplifyFinal(filteredPoints);
        const rawPointCount = processor.getRawPoints().length;
        const optimizedCount = finalOptimized.length;
        const reductionPercent = rawPointCount > 0 ? Math.round(((rawPointCount - optimizedCount) / rawPointCount) * 100) : 0;

        console.log(`[LocationManager] Optimized points: ${optimizedCount}`);
        console.log(`[LocationManager] Reduction: ${reductionPercent}%`);

        // These coordinates are only for the final backend submission. Never
        // assign them to routeCoordinates: the map must retain its complete
        // live raw trace after Stop & Save.
        const finalCoordinates = finalOptimized.map((point: RunningPathPoint) => ({
          latitude: point.latitude,
          longitude: point.longitude,
        }));

        const displayedRawCoordinates = processor.getRawPoints().map((point) => ({
          latitude: point.latitude,
          longitude: point.longitude,
        }));
        fitMapToRoute(displayedRawCoordinates);
        console.log(`[WorkoutMapView] Live raw polyline preserved after save: ${displayedRawCoordinates.length} points`);

        console.log('[Route Saved]', JSON.stringify(finalCoordinates, null, 2));
        console.log(`[Route Saved] ${finalCoordinates.length} coordinate points finalized`);

        const snapshot = processor.getSnapshot();
        setOptimizedStats({
          rawPointCount: snapshot.rawPointCount,
          optimizedPointCount: snapshot.optimizedPointCount,
          reductionPercent: snapshot.reductionPercent,
        });

        addLog(`?? Final optimization: ${finalOptimized.length} points`);

        const routePayload = {
          workout_type: workoutType,
          start_time: startTimeRef.current ? new Date(startTimeRef.current).toISOString() : new Date().toISOString(),
          end_time: new Date().toISOString(),
          coordinates: finalCoordinates,
          distance: distanceRef.current,
          duration: elapsedSeconds,
          route_points: finalCoordinates.length,
        };

        console.log('[LocationManager] FINAL BACKEND PAYLOAD:');
        console.log(JSON.stringify(routePayload, null, 2));

        // Keep a console payload equivalent to the iOS Activity Payload log.
        // It contains only the points that survived the save-time filtering and
        // optimization, never the unfiltered live-display samples.
        const iosStyleActivityPayload: ActivitySubmissionPayload = {
          gps_points: finalOptimized.map((point) => ({
            longitude: point.longitude,
            latitude: point.latitude,
            heading: point.heading,
            timestamp: new Date(point.timestamp).toISOString(),
            speed: point.speed,
            accuracy: point.accuracy,
            altitude: point.altitude,
          })),
          start_time: startTimeRef.current
            ? new Date(startTimeRef.current).toISOString()
            : new Date().toISOString(),
          end_time: stoppedAt.toISOString(),
          activity_type: activityType,
        };
        console.log('📤 ACTIVITY PAYLOAD (to backend):');
        console.log(JSON.stringify(iosStyleActivityPayload, null, 2));

        if (apiClientRef.current) {
          // Submit the actual final payload in the iOS-compatible shape.
          const activitySubmitted = await apiClientRef.current.submitActivity(iosStyleActivityPayload);

          const stopSucceeded = runIdRef.current
            ? await apiClientRef.current.stopRun({
              run_id: runIdRef.current,
              ended_at: stoppedAt.toISOString(),
              final_sequence: finalOptimized.length,
            })
            : true;

          if (activitySubmitted && stopSucceeded) {
            console.log('Activity submitted successfully');
            console.log('Response:', JSON.stringify({
              success: true,
              run_id: runIdRef.current ?? null,
              route_points: finalOptimized.length,
              distance: distanceRef.current,
              duration: elapsedSeconds,
            }, null, 2));
          }

          addLog(`Run ${runIdRef.current ?? 'activity'} completed`);
        }
      }

      voiceCoach?.stop?.();
      setIsRunning(false);
      isRunningRef.current = false;
      startTimeRef.current = null;
      previousLocationRef.current = null;
      lastRetainedCoordinateRef.current = null;
      runIdRef.current = null;
      queueRef.current = null;
      pathProcessorRef.current = null;
      apiClientRef.current = null;
      isPausedRef.current = false;
      pausedTimeRef.current = null;
      pauseStartTimeRef.current = null;
      setIsPaused(false);

      Alert.alert(
        stationarySession ? 'No movement detected' : 'Run Completed!',
        stationarySession
          ? 'No route was drawn or uploaded because the device remained stationary.'
          : 'Your route has been finalized and saved for upload.'
      );
    } catch (error) {
      console.error('Stop run error:', error);
      setIsRunning(false);
      isRunningRef.current = false;
      Alert.alert('Error', 'Failed to stop run properly.');
    } finally {
      isStoppingRef.current = false;
    }
  };

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
    console.log(`[RecordView] UI recording state -> ${isRunning ? 'LIVE' : 'READY'}; recorder ref -> ${isRunningRef.current ? 'LIVE' : 'READY'}`);
  }, [isRunning]);

  const handleRunAction = () => {
    const recorderIsActive = isRunningRef.current || pathProcessorRef.current !== null;
    console.log(`[RecordView] Primary run action pressed; recorder active: ${recorderIsActive}`);

    if (recorderIsActive) {
      void stopRun();
      return;
    }

    void startRun();
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isRunningRef.current) return false;
      console.log('[RecordView] Hardware Back pressed; saving active run');
      stopRunRef.current();
      return true;
    });

    return () => subscription.remove();
  }, []);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#20D000" />
        <Text style={styles.loadingText}>Getting precise GPS location...</Text>
        <Text style={styles.loadingSubText}>Please wait while we find your location</Text>
      </View>
    );
  }

  const activeStep = executionPlan[currentStepIndex];
  const nextStep = executionPlan[currentStepIndex + 1];
  const activeStepColor = getStepColor(activeStep?.stepType);

  const currentStepElapsedSeconds = Math.max(0, elapsedSeconds - stepStartSeconds);
  const currentStepDistanceMeters = Math.max(0, distance - stepStartDistanceMeters);

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
              console.log('[WorkoutMapView] Camera initialized at close tracking zoom (20)');
            }
          }}
          minZoomLevel={10}
          maxZoomLevel={20}
        >
          {/*
            Keep the route overlay mounted for the map's full lifetime. Android
            Fabric can crash when a Polyline is conditionally inserted while
            native GPS updates are being processed (addViewAt index/count).
          */}
          <Polyline
            coordinates={routeCoordinates}
            strokeWidth={6}
            strokeColor="#20D000"
            lineCap="round"
            lineJoin="round"
            geodesic={true}
          />
        </MapView>

        <View style={styles.zoomControls}>
          <Pressable style={styles.zoomButton} onPress={zoomIn}>
            <Text style={styles.zoomButtonText}>+</Text>
          </Pressable>
          <Pressable style={styles.zoomButton} onPress={zoomOut}>
            <Text style={styles.zoomButtonText}>-</Text>
          </Pressable>
        </View>

        <View style={styles.gpsStatusContainer}>
          <View style={styles.gpsStatus}>
            <View style={[styles.gpsDot, { backgroundColor: isRunning ? '#20D000' : '#FFA500' }]} />
            <Text style={styles.gpsStatusText}>{isRunning ? 'LIVE TRACKING' : 'GPS READY'}</Text>
            <Text style={styles.gpsAccuracyText}>
              {accuracy === null ? 'Locating' : accuracy.toFixed(1) + 'm'}
            </Text>
          </View>
        </View>

        <Pressable
          style={styles.recenterButton}
          onPress={() => {
            if (location) {
              moveMapToLocation(location.coords.latitude, location.coords.longitude);
            }
          }}
        >
          <Feather name="crosshair" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

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

              <Pressable
                style={styles.muteButton}
                onPress={() => {
                  const nextMuted = !isVoiceMuted;
                  setIsVoiceMuted(nextMuted);
                  voiceCoach?.setMuted?.(nextMuted);
                }}
              >
                <Feather
                  name={isVoiceMuted ? 'volume-x' : 'volume-2'}
                  size={18}
                  color={isVoiceMuted ? '#8E8E93' : '#30D158'}
                />
              </Pressable>
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
                        {(currentStepDistanceMeters / 1000).toFixed(2)}
                        <Text style={styles.metricUnit}> km</Text>
                      </Text>
                      <Text style={styles.targetSublabel}>
                        {(remainingStepDistanceMeters / 1000).toFixed(2)} km TO GO
                      </Text>
                    </View>
                    <View style={styles.targetDivider} />
                    <View>
                      <Text style={styles.targetTotalValue}>
                        {(activeStep.targetDistanceMeters / 1000).toFixed(2)}
                        <Text style={styles.metricUnit}> km</Text>
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
                        {(currentStepDistanceMeters / 1000).toFixed(2)}
                        <Text style={styles.metricUnit}> km</Text>
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
                    {activeStep.targetPace ? `${activeStep.targetPace}` : '--:--'}
                  </Text>
                </View>
                <View style={styles.paceDivider} />
                <View style={styles.paceItem}>
                  <Text style={styles.paceLabel}>LIVE PACE</Text>
                  <Text style={styles.paceValue}>
                    {formatPaceDisplay(pace)}
                    <Text style={styles.paceUnit}> /km</Text>
                  </Text>
                </View>
                <View style={styles.paceDivider} />
                <View style={styles.paceItem}>
                  <Text style={styles.paceLabel}>TOTAL DIST</Text>
                  <Text style={styles.paceValue}>
                    {(distance / 1000).toFixed(2)}
                    <Text style={styles.paceUnit}> km</Text>
                  </Text>
                </View>
              </View>

              {/* Up Next Banner */}
              {nextStep ? (
                <View style={styles.upNextBanner}>
                  <Feather name="chevrons-right" size={13} color="#9BA3AF" />
                  <Text style={styles.upNextText} numberOfLines={1}>
                    Up Next: <Text style={styles.upNextHighlight}>{nextStep.title}</Text> ({formatStepTargetSafe(nextStep)})
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

          {/* Action Buttons Row */}
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
                onPress={() => void startRun()}
              >
                <Feather name="play" size={18} color="#000000" />
                <Text style={styles.primaryActionTextDark}>START WORKOUT</Text>
              </Pressable>
            ) : isPaused ? (
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
            )}

            {/* Stop & Save Button */}
            {isRunning && (
              <Pressable
                style={styles.stopActionButton}
                onPress={() => void stopRun()}
              >
                <Feather name="square" size={16} color="#FFFFFF" />
                <Text style={styles.stopActionText}>FINISH</Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : (
        /* Fallback for open running without a custom workout */
        <View style={styles.controlBar}>
          <View style={styles.controlBarContent}>
            <View style={styles.controlStatus}>
              <Text style={styles.controlStatusTitle}>Run</Text>
              <Text style={styles.controlStatusValue}>{isRunning ? (isPaused ? 'Paused' : 'Live') : 'Ready'}</Text>
              <Text style={styles.stepStatus}>Steps {isRunning ? stepCount : 0}</Text>
              {isRunning && distance > 0 && (
                <Text style={styles.paceStatus}>
                  {(distance / 1000).toFixed(2)}km · {Math.floor(pace)}:{String(Math.round((pace % 1) * 60)).padStart(2, '0')}/km
                </Text>
              )}
            </View>

            <View style={styles.actionButtonSlot}>
              {!isRunning ? (
                <Pressable
                  style={styles.startButton}
                  hitSlop={16}
                  android_disableSound
                  onPress={() => {
                    void startRun();
                  }}
                >
                  <Text style={styles.startButtonText}>START RUN</Text>
                </Pressable>
              ) : isPaused ? (
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
              )}
            </View>

            {isRunning && (
              <View style={styles.stopButtonSlot}>
                <Pressable
                  style={styles.stopButton}
                  hitSlop={16}
                  android_disableSound
                  onPress={() => {
                    void stopRun();
                  }}
                >
                  <Text style={styles.stopButtonText}>STOP & SAVE</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  mapContainer: { flex: 1, position: 'relative' },
  mapContainerSplit: { flex: 0.44, position: 'relative' },
  map: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#fff', fontSize: 16, marginTop: 16 },
  loadingSubText: { color: '#bbb', fontSize: 12, marginTop: 6 },
  zoomControls: { position: 'absolute', right: 18, bottom: 18, flexDirection: 'column' },
  zoomButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  zoomButtonText: { color: '#fff', fontSize: 24, fontWeight: '700', lineHeight: 26 },
  gpsStatusContainer: { position: 'absolute', top: 20, right: 18, flexDirection: 'row' },
  gpsStatus: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  gpsDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  gpsStatusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  gpsAccuracyText: { marginLeft: 8, color: '#8BE9A8', fontSize: 10, fontWeight: '700' },
  recenterButton: { position: 'absolute', right: 18, bottom: 108, width: 36, height: 36, borderRadius: 18, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' },
  
  // Custom Workout Runner Dashboard Styles
  dashboardContainer: {
    flex: 0.56,
    backgroundColor: '#121318',
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
    height: 112,
    paddingHorizontal: 16,
    paddingBottom: 18,
    paddingTop: 14,
    backgroundColor: '#000000',
  },
  controlBarContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(20,20,20,0.96)', borderRadius: 24, paddingVertical: 12, paddingHorizontal: 20, gap: 10 },
  actionButtonSlot: { width: 120, height: 48, position: 'relative' },
  stopButtonSlot: { width: 120, height: 48, position: 'relative' },
  controlStatus: { flexDirection: 'column', flex: 1 },
  controlStatusTitle: { color: '#9BA3AF', fontSize: 11, fontWeight: '700' },
  controlStatusValue: { color: '#fff', fontSize: 17, fontWeight: '800' },
  stepStatus: { color: '#8BE9A8', fontSize: 11, fontWeight: '700', marginTop: 2 },
  paceStatus: { color: '#FFB800', fontSize: 10, fontWeight: '700', marginTop: 2 },
  startButton: { position: 'absolute', inset: 0, backgroundColor: '#20D000', borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  startButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  pauseButton: { position: 'absolute', inset: 0, backgroundColor: '#FFB800', borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  pauseButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  resumeButton: { position: 'absolute', inset: 0, backgroundColor: '#20D000', borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  resumeButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  stopButton: { position: 'absolute', inset: 0, backgroundColor: '#F04444', borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  stopButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
