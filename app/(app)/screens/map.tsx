import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import * as Location from 'expo-location';
import { LocationService } from '../../../src/services/locationService';
import { ActivityDetectionService } from '../../../src/services/activityDetectionService';
import { StepDetectionService } from '../../../src/services/stepDetectionService';
import { RunningApiClient } from '../../../src/services/runningApi';
import { LocationQueue } from '../../../src/services/locationQueue';
import { PathProcessor } from '../../../src/services/pathProcessor';
import { ActivitySubmissionPayload, RawGpsPayload, RunningGpsPoint, RunningPathPoint } from '../../../src/types/running';
import { calculateDistanceMeters } from '../../../src/utils/distance';

const RUNNING_USER_ID = 'USER-1001';

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

  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      if (startTimeRef.current) {
        const seconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedSeconds(seconds);
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
      if (activityDetection) {
        console.log(
          `[LocationManager] Activity: ${activityDetection.getCurrentActivity()} (classification only; live raw point retained)`
        );
      }

      const retained = processor.ingestRaw(rawGps);

      if (retained) {
        // The map is a visual trace, not the backend route. Draw every raw
        // coordinate received during this workout so saving cannot shorten or
        // alter what the runner saw while walking.
        const liveCoordinates = processor.getRawPoints().map((point: RunningGpsPoint) => ({
          latitude: point.latitude,
          longitude: point.longitude,
        }));

        setRouteCoordinates(liveCoordinates);
        console.log(`[WorkoutMapView] Polyline updated: ${liveCoordinates.length} raw points`);
        console.log(`[LocationManager] Tiers -> raw:${processor.getRawPoints().length} display:${processor.getDisplayPoints().length}`);
        addLog(`? Live GPS retained: ${liveCoordinates.length} points`);

        if (lastRetainedCoordinateRef.current) {
          const movementDistance = calculateDistanceMeters(
            lastRetainedCoordinateRef.current,
            { latitude: retained.latitude, longitude: retained.longitude }
          );

          if (movementDistance > 0 && movementDistance < 50) {
            const nextDistance = distanceRef.current + movementDistance;
            distanceRef.current = nextDistance;
            setDistance(nextDistance);
          }
        }

        lastRetainedCoordinateRef.current = {
          latitude: retained.latitude,
          longitude: retained.longitude,
        };

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
      setOptimizedStats({ rawPointCount: 0, optimizedPointCount: 0, reductionPercent: 0 });
      setLogs([]);
      previousLocationRef.current = null;
      lastRetainedCoordinateRef.current = null;

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

      addLog(`?? Run ${runId} started`);
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
      void stepDetection.start(setStepCount).catch((error) => {
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

  const stopRun = async () => {
    if (isStoppingRef.current) {
      console.log('[RecordView] Stop request ignored: finalization already in progress');
      return;
    }

    isStoppingRef.current = true;
    try {
      const stoppedAt = new Date();
      const detectedActivity = activityDetectionRef.current?.getCurrentActivity();
      const workoutType = detectedActivity === 'walking' ? 'walk' : 'run';
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

      if (processor) {
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
        console.log(`[WorkoutMapView] Raw polyline preserved after save: ${displayedRawCoordinates.length} points`);

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

      setIsRunning(false);
      isRunningRef.current = false;
      startTimeRef.current = null;
      previousLocationRef.current = null;
      lastRetainedCoordinateRef.current = null;
      runIdRef.current = null;
      queueRef.current = null;
      pathProcessorRef.current = null;
      apiClientRef.current = null;

      Alert.alert('?? Run Completed!', 'Your route has been finalized and saved for upload.');
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
          <Text style={styles.recenterText}>??</Text>
        </Pressable>
      </View>

      <View style={styles.controlBar}>
        <View style={styles.controlBarContent}>
          <View style={styles.controlStatus}>
            <Text style={styles.controlStatusTitle}>Run</Text>
            <Text style={styles.controlStatusValue}>{isRunning ? 'Live' : 'Ready'}</Text>
            <Text style={styles.stepStatus}>Steps {isRunning ? stepCount : 0}</Text>
          </View>

          <View style={styles.actionButtonSlot}>
            <Pressable
              // Keep exactly one native child mounted. This avoids both the
              // Android MapView touch-overlap issue and Fabric addViewAt races.
              style={isRunning ? styles.stopButton : styles.startButton}
              hitSlop={16}
              android_disableSound
              onPressIn={() => {
                console.log('[RecordView] START / SAVE touch received');
              }}
              onPress={() => {
                console.log('[RecordView] START / SAVE button pressed');
                handleRunAction();
              }}
              onTouchEnd={() => {
                console.log('[RecordView] START / SAVE touch ended');
              }}
            >
              <Text style={styles.startButtonText}>{isRunning ? 'STOP & SAVE' : 'START RUN'}</Text>
            </Pressable>
          </View>
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
    height: 112,
    paddingHorizontal: 16,
    paddingBottom: 18,
    paddingTop: 14,
    backgroundColor: '#000000',
  },
  controlBarContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(20,20,20,0.96)', borderRadius: 24, paddingVertical: 12, paddingHorizontal: 20 },
  actionButtonSlot: { width: 174, height: 48, position: 'relative' },
  controlStatus: { flexDirection: 'column' },
  controlStatusTitle: { color: '#9BA3AF', fontSize: 11, fontWeight: '700' },
  controlStatusValue: { color: '#fff', fontSize: 17, fontWeight: '800' },
  stepStatus: { color: '#8BE9A8', fontSize: 11, fontWeight: '700', marginTop: 2 },
  startButton: { position: 'absolute', inset: 0, backgroundColor: '#20D000', borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  startButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  stopButton: { position: 'absolute', inset: 0, backgroundColor: '#F04444', borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  stopButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
