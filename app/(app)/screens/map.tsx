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
import { workoutPlanService } from '../../../service/workoutPlan';
import { ActivityDetectionService } from '../../../src/services/activityDetectionService';
import { LocationQueue } from '../../../src/services/locationQueue';
import { LocationService } from '../../../src/services/locationService';
import { PathProcessor } from '../../../src/services/pathProcessor';
import { RunningApiClient } from '../../../src/services/runningApi';
import { StepDetectionService } from '../../../src/services/stepDetectionService';
import { WorkoutEngine } from '../../../src/services/workoutEngine';
import { WorkoutVoiceService } from '../../../src/services/workoutVoiceService';
import { ActivityLapPayload, ActivitySubmissionPayload, RawGpsPayload, RunningGpsPoint, RunningPathPoint } from '../../../src/types/running';
import { BackendWorkout, WorkoutEngineSnapshot } from '../../../src/types/workout';
import { calculateDistanceMeters } from '../../../src/utils/distance';

const RUNNING_USER_ID = 'USER-1001';

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface RouteSegment {
  id: number;
  isLight: boolean;
  coordinates: Coordinate[];
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

const calculateRouteDistance = (points: RunningGpsPoint[]): number => {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const distance = calculateDistanceMeters(points[index - 1], points[index]);
    if (Number.isFinite(distance) && distance > 0 && distance < 50) {
      total += distance;
    }
  }
  return total;
};

export default function MapScreen() {
  const plannedWorkout = useLocalSearchParams<{ workoutTitle?: string }>();
  const [loading, setLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([]);
  const [distance, setDistance] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [optimizedStats, setOptimizedStats] = useState({
    rawPointCount: 0,
    optimizedPointCount: 0,
    reductionPercent: 0,
  });
  const [isPaused, setIsPaused] = useState(false);
  const [pace, setPace] = useState(0); // pace in minutes per km
  const [isPlannedWorkout, setIsPlannedWorkout] = useState(false);
  const [workoutSnapshot, setWorkoutSnapshot] = useState<WorkoutEngineSnapshot | null>(null);

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
  const extraDistanceRef = useRef(0);
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
  const lastStepTimestampRef = useRef<number | null>(null);
  const movementConfirmedRef = useRef(false);
  const workoutEngineRef = useRef<WorkoutEngine | null>(null);
  const workoutVoiceRef = useRef<WorkoutVoiceService | null>(null);
  const previousWorkoutPointRef = useRef<RunningGpsPoint | null>(null);
  const routeSegmentsRef = useRef<RouteSegment[]>([]);


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

  const appendRoutePoint = useCallback((point: Coordinate, isLight: boolean) => {
    const current = routeSegmentsRef.current;
    const previous = current.at(-1);
    const next = previous && previous.isLight === isLight
      ? [...current.slice(0, -1), { ...previous, coordinates: [...previous.coordinates, point] }]
      : [...current, { id: Date.now() + current.length, isLight, coordinates: [point] }];

    routeSegmentsRef.current = next;
    setRouteSegments(next);
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

        const workoutEngine = workoutEngineRef.current;
        if (workoutEngine) {
          workoutEngine.tick();
          setWorkoutSnapshot(workoutEngine.getSnapshot());
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning]);

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
      const stepDetection = stepDetectionRef.current;
      const detectedActivity = activityDetection?.getCurrentActivity() ?? 'unknown';
      const hasDetectedMovement = detectedActivity === 'walking' || detectedActivity === 'running';
      const hasRecentStepEvidence = lastStepTimestampRef.current !== null
        && timestamp - lastStepTimestampRef.current <= 5_000;
      // A past step count is not sufficient: each visible/countable GPS point
      // must have fresh physical-motion evidence, not merely GPS's estimated
      // speed (which can jitter when a phone is handled while stationary).
      // Activity recognition and the pedometer are optional Android services.
      // If neither subscription is usable, do not turn their absence into a
      // permanent GPS rejection: GPS remains the tracking source of truth.
      const hasMovementEvidenceSource = (activityDetection?.isAvailable() ?? false)
        || (stepDetection?.isAvailable() ?? false);
      const hasCurrentMovement = !hasMovementEvidenceSource
        || hasDetectedMovement
        || hasRecentStepEvidence;
      if (activityDetection) {
        console.log(
          `[LocationManager] Activity: ${detectedActivity} (live route requires movement confirmation)`
        );
      }

      if (hasCurrentMovement) {
        movementConfirmedRef.current = true;
      }

      // The complete raw GPS trace is retained regardless of whether this is
      // an active lap, rest, pause, or the confirmation popup.
      const displayCountBefore = processor.getDisplayPoints().length;
      const retained = processor.ingestRaw(rawGps);
      const workoutEngine = workoutEngineRef.current;
      const lightTrace = workoutEngine?.shouldUseLightPolyline() ?? isPausedRef.current;
      const countsWorkoutDistance = workoutEngine?.isDistanceCounting() ?? !isPausedRef.current;

      console.log(
        `[WorkoutMapView] Route color=${lightTrace ? 'gray' : 'green'} `
        + `segment=${workoutEngine?.getSnapshot().currentSegment?.segmentType ?? 'extra'} `
        + `state=${workoutEngine?.getSnapshot().state ?? 'free-run'}`
      );

      if (retained && workoutEngine && hasCurrentMovement) {
        if (countsWorkoutDistance) {
          workoutEngine.ingestDistancePoint(previousWorkoutPointRef.current, retained);
          previousWorkoutPointRef.current = retained;
        } else {
          previousWorkoutPointRef.current = null;
        }
        setWorkoutSnapshot(workoutEngine.getSnapshot());
      }

      // GPS location changes are not movement proof indoors. Wait for Android
      // activity recognition (walking/running) or several pedometer steps
      // before turning fresh location fixes into a visible route.
      if (!hasCurrentMovement) {
        console.log(
          `[LocationManager] Live point held: activity=${detectedActivity}, recentSteps=${hasRecentStepEvidence}; no current movement evidence`
        );
        previousLocationRef.current = rawGps;
        previousWorkoutPointRef.current = null;
        moveMapToLocation(rawGps.latitude, rawGps.longitude);
        return;
      }

      if (retained) {
        // Keep raw points for saving and diagnostics, but draw only points that
        // pass the live display interval and movement gate.
        const displayPointWasAdded = processor.getDisplayPoints().length > displayCountBefore;
        const latestDisplayPoint = processor.getDisplayPoints().at(-1);
        if (displayPointWasAdded && latestDisplayPoint) {
          appendRoutePoint(
            { latitude: latestDisplayPoint.latitude, longitude: latestDisplayPoint.longitude },
            lightTrace,
          );
        }
        console.log(`[WorkoutMapView] 📌 Polyline updated: ${processor.getRawPoints().length} live raw points`);
        console.log(`[LocationManager] Tiers -> raw:${processor.getRawPoints().length} display:${processor.getDisplayPoints().length}`);
        addLog(`📌 Live polyline: ${processor.getRawPoints().length} points`);

        if (displayPointWasAdded && latestDisplayPoint && lastRetainedCoordinateRef.current) {
          const movementDistance = calculateDistanceMeters(
            lastRetainedCoordinateRef.current,
            { latitude: latestDisplayPoint.latitude, longitude: latestDisplayPoint.longitude }
          );

          if (movementDistance > 0 && movementDistance < 50) {
            if (countsWorkoutDistance) {
              const nextDistance = distanceRef.current + movementDistance;
              distanceRef.current = nextDistance;
              setDistance(nextDistance);
            } else if (workoutEngine?.getSnapshot().state === 'completed') {
              extraDistanceRef.current += movementDistance;
              setDistance(distanceRef.current + extraDistanceRef.current);
              console.log(
                `[Workout] Extra activity accepted: +${movementDistance.toFixed(1)}m `
                + `(total extra ${extraDistanceRef.current.toFixed(1)}m)`
              );
            }
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
    [addLog, appendRoutePoint, fitMapToRoute, moveMapToLocation, uploadBatch]
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

      let selectedWorkout: BackendWorkout | null = null;
      if (plannedWorkout.workoutTitle) {
        const plan = await workoutPlanService.getCurrent();
        selectedWorkout = plan.weeks
          .flatMap((week) => week.workouts)
          .find((workout) => workout.title === plannedWorkout.workoutTitle) ?? null;
        if (!selectedWorkout) {
          Alert.alert('Workout unavailable', 'The selected workout was not found in your current plan.');
          return;
        }
      }

      routeSegmentsRef.current = [];
      setRouteSegments([]);
      distanceRef.current = 0;
      extraDistanceRef.current = 0;
      setDistance(0);
      setElapsedSeconds(0);
      stepCountRef.current = 0;
      lastStepTimestampRef.current = null;
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
      previousWorkoutPointRef.current = null;
      workoutVoiceRef.current?.stop();
      workoutVoiceRef.current = null;
      workoutEngineRef.current = null;
      setIsPlannedWorkout(selectedWorkout !== null);
      setWorkoutSnapshot(null);

      const apiClient = new RunningApiClient();
      apiClientRef.current = apiClient;

      const startedAt = new Date().toISOString();
      startTimeRef.current = new Date(startedAt).getTime();
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
        lastRetainedCoordinateRef.current = {
          latitude: startRawPoint.latitude,
          longitude: startRawPoint.longitude,
        };
        // Seed the mounted polyline with the start fix. The first walking
        // display point can now draw a visible line immediately instead of
        // waiting for a third accepted point to extend a one-point segment.
        const initialSegment: RouteSegment = {
          id: 0,
          isLight: false,
          coordinates: [startingPoint],
        };
        routeSegmentsRef.current = [initialSegment];
        setRouteSegments([initialSegment]);
        console.log('[LocationManager] Start coordinate retained as raw point for final payload');
      }

      if (selectedWorkout) {
        const voice = new WorkoutVoiceService();
        let engine: WorkoutEngine;
        engine = new WorkoutEngine({
          onSegmentStarted: (segment) => {
            console.log(
              `[Workout] Segment started: ${segment.segmentType} `
              + `${segment.repeatNumber}/${segment.totalRepeats}`
            );
            voice.segmentStarted(segment);
            setWorkoutSnapshot(engine.getSnapshot());
          },
          onSegmentCompleted: (lap) => {
            console.log(
              `[Workout] Segment completed: ${lap.segmentType} `
              + `${lap.repeatNumber}/${lap.totalRepeats} `
              + `distance=${lap.distanceMeters.toFixed(1)}m duration=${lap.elapsedSeconds.toFixed(1)}s`
            );
            void voice.segmentCompleted(lap).then(() => {
              if (!isRunningRef.current) return;
              const state = engine.getSnapshot().state;
              if (state !== 'completed') {
                // Planned segments continue without interrupting the runner.
                console.log(`[Workout] Planned ${lap.segmentType} complete; continuing to next segment`);
                engine.continue();
                setWorkoutSnapshot(engine.getSnapshot());
                return;
              }

              console.log('[Workout] All planned segments complete; showing Continue/Stop popup');
              Alert.alert(
                'Workout complete',
                'Do you want to continue with extra activity or stop and save the workout?',
                [
                  {
                    text: 'Stop and save',
                    style: 'destructive',
                    onPress: () => {
                      console.log('[Workout] User selected Stop and save');
                      void stopRun();
                    },
                  },
                  {
                    text: 'Continue',
                    onPress: () => {
                      console.log('[Workout] User selected Continue; extra activity is gray');
                      void voice.workoutCompleted();
                    },
                  },
                ],
              );
            });
            setWorkoutSnapshot(engine.getSnapshot());
          },
          onWorkoutCompleted: () => {
            console.log('[Workout] All backend workout segments completed');
            setWorkoutSnapshot(engine.getSnapshot());
          },
        });
        workoutVoiceRef.current = voice;
        workoutEngineRef.current = engine;
        engine.loadWorkout(selectedWorkout);
        console.log(
          `[Workout] Backend workout loaded: "${selectedWorkout.title}" `
          + `${engine.getSnapshot().totalLaps} planned segments`
        );
        voice.workoutStarted(selectedWorkout);
        engine.start(startRawPoint);
        previousWorkoutPointRef.current = startRawPoint;
        setWorkoutSnapshot(engine.getSnapshot());
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

      addLog(`?? Run ${runId} started`);
      if (plannedWorkout.workoutTitle) addLog(`Planned workout: ${plannedWorkout.workoutTitle}`);
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
        lastStepTimestampRef.current = Date.now();
        stepCountRef.current = steps;
        if (steps >= 3) {
          movementConfirmedRef.current = true;
        }
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

      // Keep the single GPS watcher active. This movement is displayed in a
      // light colour but is excluded from the active lap's distance.
      workoutEngineRef.current?.pause();
      setWorkoutSnapshot(workoutEngineRef.current?.getSnapshot() ?? null);

      // Mark pause start time
      pauseStartTimeRef.current = Date.now();
      isPausedRef.current = true;
      setIsPaused(true);

      console.log('[RecordView] Run paused - GPS continues as light trace');
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

      // The watcher was never stopped; only active-distance accounting resumes.
      workoutEngineRef.current?.resume();
      setWorkoutSnapshot(workoutEngineRef.current?.getSnapshot() ?? null);

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
      console.log(
        `[RecordView] Stop & Save data: rawPoints=${processor?.getRawPoints().length ?? 0} `
        + `workoutDistance=${distanceRef.current.toFixed(2)}m `
        + `additionalDistance=${extraDistanceRef.current.toFixed(2)}m`
      );

      if (stationarySession) {
        console.log(
          `[LocationManager] Stationary session discarded: activity=${detectedActivity ?? 'unknown'}, steps=${stepCountRef.current}; no route or activity upload`
        );
        distanceRef.current = 0;
        setDistance(0);
        setOptimizedStats({ rawPointCount: 0, optimizedPointCount: 0, reductionPercent: 0 });
        addLog('No movement detected — route was not saved');

        if (apiClientRef.current && runIdRef.current) {
          console.log('[RecordView] Stopping stationary run without activity upload');
          await apiClientRef.current.stopRun({
            run_id: runIdRef.current,
            ended_at: stoppedAt.toISOString(),
            final_sequence: 0,
          });
        }
      } else if (processor) {
        console.log('[RecordView] Stop & Save: starting filter and optimization');
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
        console.log(
          `[WorkoutHistory] Optimized polyline prepared for history only: `
          + `raw=${rawPointCount}, filtered=${filteredPoints.length}, optimized=${optimizedCount}`
        );

        // Indoor drift protection can intentionally collapse a session to one
        // anchor. A saved polyline needs two points, so retain the valid raw
        // trace as a fallback only in that edge case.
        const usingOptimizedRoute = finalOptimized.length >= 2;
        const uploadRoutePoints: RunningGpsPoint[] = usingOptimizedRoute
          ? finalOptimized
          : processor.getRawPoints();
        console.log(
          `[LocationManager] Stop & Save route source: ${usingOptimizedRoute ? 'optimized' : 'raw fallback'} `
          + `(${uploadRoutePoints.length} points uploaded)`
        );
        console.log(
          `[WorkoutHistory] Uploading ${uploadRoutePoints.length} optimized history points; `
          + 'live SDK points remain separate'
        );
        if (finalOptimized.length < 2 && uploadRoutePoints.length >= 2) {
          console.warn('[LocationManager] Final filter produced fewer than two points; raw route fallback retained for history polyline');
        }

        // These coordinates are only for the final backend submission. The map
        // retains its complete live raw trace after Stop & Save.
        const finalCoordinates = uploadRoutePoints.map((point) => ({
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

        const uploadedRouteDistance = calculateRouteDistance(uploadRoutePoints);
        const trackedDistance = distanceRef.current + extraDistanceRef.current;
        const totalDistance = uploadedRouteDistance > 0 ? uploadedRouteDistance : trackedDistance;
        if (uploadedRouteDistance > 0 && trackedDistance === 0) {
          distanceRef.current = uploadedRouteDistance;
          console.log(
            `[LocationManager] Live distance was zero; recovered workout distance from uploaded route: `
            + `${uploadedRouteDistance.toFixed(2)}m`
          );
        }
        if (uploadedRouteDistance > 0) {
          setDistance(totalDistance);
        }
        console.log(
          `[LocationManager] Final distance source: uploaded route `
          + `${uploadedRouteDistance.toFixed(2)}m (tracked live total ${trackedDistance.toFixed(2)}m)`
        );
        const distanceSummary = {
          workout_distance_meters: Number(distanceRef.current.toFixed(2)),
          additional_distance_meters: Number(extraDistanceRef.current.toFixed(2)),
          total_distance_meters: Number(totalDistance.toFixed(2)),
          total_distance_kilometers: Number((totalDistance / 1000).toFixed(3)),
        };
        const routePayload = {
          workout_type: workoutType,
          start_time: startTimeRef.current ? new Date(startTimeRef.current).toISOString() : new Date().toISOString(),
          end_time: new Date().toISOString(),
          coordinates: finalCoordinates,
          distance: totalDistance,
          duration: elapsedSeconds,
          route_points: finalCoordinates.length,
        };

        console.log('[LocationManager] FINAL BACKEND PAYLOAD:');
        console.log(JSON.stringify(routePayload, null, 2));
        console.log('[LocationManager] DISTANCE SUMMARY (workout + additional):');
        console.log(JSON.stringify(distanceSummary, null, 2));
        console.log(
          `[Workout] Saving complete route: ${uploadRoutePoints.length} GPS points `
          + `(${workoutEngineRef.current?.getSnapshot().completedLaps.length ?? 0} planned laps; extra points included)`
        );
        const extraRoutePointCount = routeSegmentsRef.current
          .filter((segment) => segment.isLight)
          .reduce((count, segment) => count + segment.coordinates.length, 0);
        console.log(`[Workout] Extra gray route points included: ${extraRoutePointCount}`);
        console.log(
          `[Workout] Distance summary: planned=${distanceRef.current.toFixed(1)}m `
          + `extra=${extraDistanceRef.current.toFixed(1)}m total=${totalDistance.toFixed(1)}m`
        );

        // Keep a console payload equivalent to the iOS Activity Payload log.
        // It contains only the points that survived the save-time filtering and
        // optimization, never the unfiltered live-display samples.
        const completedLaps = workoutEngineRef.current?.getSnapshot().completedLaps ?? [];
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
        const iosStyleActivityPayload: ActivitySubmissionPayload = {
          gps_points: uploadRoutePoints.map((point) => ({
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
          laps,
        };
        const backendPayloadLog = {
          ...iosStyleActivityPayload,
          distance_summary: distanceSummary,
          route_points: uploadRoutePoints.length,
        };
        console.log('[LocationManager] BACKEND PAYLOAD JSON (optimized route + distance):');
        console.log(JSON.stringify(backendPayloadLog, null, 2));
        console.log('📤 ACTIVITY PAYLOAD (to backend):');
        console.log(JSON.stringify(iosStyleActivityPayload, null, 2));

        if (apiClientRef.current) {
          console.log(
            `[RecordView] Stop & Save: submitting ${iosStyleActivityPayload.gps_points.length} `
            + 'optimized GPS points to backend'
          );
          // Submit the actual final payload in the iOS-compatible shape.
          const activitySubmitted = await apiClientRef.current.submitActivity(iosStyleActivityPayload);
          console.log(`[RecordView] Activity upload result: ${activitySubmitted ? 'success' : 'failed'}`);

          const stopSucceeded = runIdRef.current
            ? await apiClientRef.current.stopRun({
              run_id: runIdRef.current,
              ended_at: stoppedAt.toISOString(),
              final_sequence: uploadRoutePoints.length,
            })
            : true;
          console.log(`[RecordView] Run stop result: ${stopSucceeded ? 'success' : 'failed'}`);

          if (activitySubmitted && stopSucceeded) {
            console.log('Activity submitted successfully');
            console.log('Response:', JSON.stringify({
              success: true,
              run_id: runIdRef.current ?? null,
              route_points: uploadRoutePoints.length,
              distance: totalDistance,
              workout_distance: distanceRef.current,
              additional_distance: extraDistanceRef.current,
              duration: elapsedSeconds,
            }, null, 2));
          }

          addLog(`Run ${runIdRef.current ?? 'activity'} completed`);
        }
      }

      setIsRunning(false);
      isRunningRef.current = false;
      startTimeRef.current = null;
      previousLocationRef.current = null;
      lastRetainedCoordinateRef.current = null;
      runIdRef.current = null;
      queueRef.current = null;
      pathProcessorRef.current = null;
      apiClientRef.current = null;
      const workoutFinished = workoutEngineRef.current?.getSnapshot().state === 'completed';
      if (!workoutFinished) {
        workoutVoiceRef.current?.stop();
      }
      workoutVoiceRef.current = null;
      workoutEngineRef.current = null;
      previousWorkoutPointRef.current = null;
      setWorkoutSnapshot(null);
      setIsPlannedWorkout(false);
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
      console.error('[RecordView] Stop & Save failed before finalization completed');
      setIsRunning(false);
      isRunningRef.current = false;
      Alert.alert('Error', 'Failed to stop run properly.');
    } finally {
      console.log('[RecordView] Stop & Save finalization finished');
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
      if (workoutEngineRef.current) {
        Alert.alert('Workout in progress', 'Use Pause to stop counting temporarily. The activity is saved after the final segment.');
        return true;
      }
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

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
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
          {routeSegments.map((segment) => (
            <Polyline
              key={segment.id}
              coordinates={segment.coordinates}
              strokeWidth={6}
              strokeColor={segment.isLight ? '#9CA3AF' : '#20D000'}
              lineCap="round"
              lineJoin="round"
              geodesic={true}
            />
          ))}
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
          <Text style={styles.recenterText}>??</Text>
        </Pressable>
      </View>

      <View style={styles.controlBar}>
        <View style={styles.controlBarContent}>
          <View style={styles.controlStatus}>
            <Text style={styles.controlStatusTitle}>{isPlannedWorkout ? 'Workout' : 'Run'}</Text>
            <Text style={styles.controlStatusValue}>
              {isPlannedWorkout && workoutSnapshot?.currentSegment
                ? `${workoutSnapshot.currentSegment.segmentType} ${workoutSnapshot.currentSegment.repeatNumber}/${workoutSnapshot.currentSegment.totalRepeats}`
                : isRunning ? (isPaused ? 'Paused' : 'Live') : 'Ready'}
            </Text>
            {isPlannedWorkout && workoutSnapshot?.currentLap && (
              <Text style={styles.paceStatus}>
                {workoutSnapshot.currentLap.targetDistanceMeters !== null
                  ? `${workoutSnapshot.currentLap.distanceMeters.toFixed(1)} / ${Math.round(workoutSnapshot.currentLap.targetDistanceMeters)}m`
                  : `${Math.floor(workoutSnapshot.currentLap.elapsedSeconds)} / ${workoutSnapshot.currentLap.targetDurationSeconds ?? 0}s`}
                {workoutSnapshot.currentLap.distanceMeters > 0
                  ? ` · ${(workoutSnapshot.currentLap.elapsedSeconds / (workoutSnapshot.currentLap.distanceMeters / 1000) / 60).toFixed(2)} min/km`
                  : ''}
              </Text>
            )}
            {isRunning && distance > 0 && (
              <Text style={styles.paceStatus}>
                {(distance / 1000).toFixed(2)}km · {Math.floor(pace)}:{String(Math.round((pace % 1) * 60)).padStart(2, '0')}/km
              </Text>
            )}
          </View>

          <View style={styles.actionButtonSlot}>
            {!isRunning ? (
              // Start button when not running
              <Pressable
                style={styles.startButton}
                hitSlop={16}
                android_disableSound
                onPressIn={() => {
                  console.log('[RecordView] START touch received');
                }}
                onPress={() => {
                  console.log('[RecordView] START button pressed');
                  void startRun();
                }}
                onTouchEnd={() => {
                  console.log('[RecordView] START touch ended');
                }}
              >
                <Text style={styles.startButtonText}>START RUN</Text>
              </Pressable>
            ) : isPaused ? (
              // Resume button when paused
              <Pressable
                style={styles.resumeButton}
                hitSlop={16}
                android_disableSound
                onPressIn={() => {
                  console.log('[RecordView] RESUME touch received');
                }}
                onPress={() => {
                  console.log('[RecordView] RESUME button pressed');
                  void resumeRun();
                }}
                onTouchEnd={() => {
                  console.log('[RecordView] RESUME touch ended');
                }}
              >
                <Text style={styles.resumeButtonText}>RESUME</Text>
              </Pressable>
            ) : (
              // Pause button when running
              <Pressable
                style={styles.pauseButton}
                hitSlop={16}
                android_disableSound
                onPressIn={() => {
                  console.log('[RecordView] PAUSE touch received');
                }}
                onPress={() => {
                  console.log('[RecordView] PAUSE button pressed');
                  void pauseRun();
                }}
                onTouchEnd={() => {
                  console.log('[RecordView] PAUSE touch ended');
                }}
              >
                <Text style={styles.pauseButtonText}>PAUSE</Text>
              </Pressable>
            )}
          </View>

          {isRunning && (!isPlannedWorkout || workoutSnapshot?.state === 'completed') && (
            <View style={styles.stopButtonSlot}>
              <Pressable
                style={styles.stopButton}
                hitSlop={16}
                android_disableSound
                onPressIn={() => {
                  console.log('[RecordView] STOP & SAVE touch received');
                }}
                onPress={() => {
                  console.log('[RecordView] STOP & SAVE button pressed');
                  void stopRun();
                }}
                onTouchEnd={() => {
                  console.log('[RecordView] STOP & SAVE touch ended');
                }}
              >
                <Text style={styles.stopButtonText}>STOP & SAVE</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  // The map and controls are normal vertical siblings. Do not use overlapping
  // absolute layout here: Android's native map surface can otherwise consume
  // a touch intended for the Stop button.
  mapContainer: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#fff', fontSize: 16, marginTop: 16 },
  loadingSubText: { color: '#bbb', fontSize: 12, marginTop: 6 },
  zoomControls: { position: 'absolute', right: 22, bottom: 24, flexDirection: 'column' },
  zoomButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  zoomButtonText: { color: '#fff', fontSize: 30, fontWeight: '700', lineHeight: 30 },
  gpsStatusContainer: { position: 'absolute', top: 26, right: 22, flexDirection: 'row' },
  gpsStatus: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  gpsDot: { width: 9, height: 9, borderRadius: 999, marginRight: 8 },
  gpsStatusText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  gpsAccuracyText: { marginLeft: 10, color: '#8BE9A8', fontSize: 11, fontWeight: '700' },
  recenterButton: { position: 'absolute', right: 18, bottom: 126, width: 40, height: 40, borderRadius: 20, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' },
  recenterText: { fontSize: 24 },
  controlBar: {
    position: 'relative',
    height: 96,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 10,
    backgroundColor: '#000000',
  },
  controlBarContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(20,20,20,0.96)', borderRadius: 24, paddingVertical: 12, paddingHorizontal: 20, gap: 10 },
  actionButtonSlot: { width: 120, height: 48, position: 'relative' },
  stopButtonSlot: { width: 120, height: 48, position: 'relative' },
  controlStatus: { flexDirection: 'column', flex: 1 },
  controlStatusTitle: { color: '#9BA3AF', fontSize: 11, fontWeight: '700' },
  controlStatusValue: { color: '#fff', fontSize: 17, fontWeight: '800' },
  paceStatus: { color: '#FFB800', fontSize: 11, fontWeight: '700', marginTop: 3 },
  startButton: { position: 'absolute', inset: 0, backgroundColor: '#20D000', borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  startButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  pauseButton: { position: 'absolute', inset: 0, backgroundColor: '#FFB800', borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  pauseButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  resumeButton: { position: 'absolute', inset: 0, backgroundColor: '#20D000', borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  resumeButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  stopButton: { position: 'absolute', inset: 0, backgroundColor: '#F04444', borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  stopButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
