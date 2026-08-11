import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
} from "react-native";

import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  Region,
} from "react-native-maps";

import * as Location from "expo-location";

// Import your actual services
import { LocationService } from "../../../src/services/locationService";
import { PathProcessor } from "../../../src/services/pathProcessor";
import { RunningApiClient } from "../../../src/services/runningApi";
import { LocationQueue } from "../../../src/services/locationQueue";
import { RunningPathPoint, RawGpsPayload } from "../../../src/types/running";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

/* =========================================================
   CONSTANTS
========================================================= */

const RUNNING_USER_ID = "USER-1001";
const DEFAULT_LATITUDE_DELTA = 0.005;
const DEFAULT_LONGITUDE_DELTA = 0.005;
const BATCH_UPLOAD_SIZE = 25;
const RUNNING_ZOOM = 18;

/* =========================================================
   TYPES
========================================================= */

type Coordinate = {
  latitude: number;
  longitude: number;
};

/* =========================================================
   DISTANCE UTILITIES
========================================================= */

const calculateDistance = (point1: Coordinate, point2: Coordinate): number => {
  const R = 6371000;
  const lat1 = (point1.latitude * Math.PI) / 180;
  const lat2 = (point2.latitude * Math.PI) / 180;
  const deltaLat = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const deltaLon = ((point2.longitude - point1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const formatDistance = (meters: number): string => {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
};

const formatTime = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

/* =========================================================
   COMPONENT
========================================================= */

export default function MapScreen() {
  /* =======================================================
     REFS
  ======================================================= */

  const mapRef = useRef<MapView | null>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(
    null
  );
  const pathProcessorRef = useRef<PathProcessor | null>(null);
  const queueRef = useRef<LocationQueue | null>(null);
  const apiClientRef = useRef<RunningApiClient | null>(null);
  const runIdRef = useRef<string | null>(null);
  const isRunningRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);
  const previousLocationRef = useRef<RawGpsPayload | null>(null);
  const uploadInProgressRef = useRef(false);
  const distanceRef = useRef(0);
  const lastRetainedCoordinateRef = useRef<Coordinate | null>(null);
  const lastRouteFitLengthRef = useRef(0);
  const lastRouteFitAtRef = useRef(0);

  /* =======================================================
     STATE
  ======================================================= */

  const [location, setLocation] = useState<Location.LocationObject | null>(
    null
  );
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<Coordinate[]>([]);
  const [distance, setDistance] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [optimizedStats, setOptimizedStats] = useState({
    rawPointCount: 0,
    optimizedPointCount: 0,
    reductionPercent: 0,
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [isMapReady, setIsMapReady] = useState(false);

  /* =======================================================
     LOGGING
  ======================================================= */

  const addLog = useCallback((message: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((previous) => [...previous.slice(-7), `${time} - ${message}`]);
  }, []);

  /* =======================================================
     MAP CONTROLS
  ======================================================= */

  const moveMapToLocation = useCallback((latitude: number, longitude: number) => {
    if (!mapRef.current) return;

    const region: Region = {
      latitude,
      longitude,
      latitudeDelta: DEFAULT_LATITUDE_DELTA,
      longitudeDelta: DEFAULT_LONGITUDE_DELTA,
    };

    mapRef.current.animateToRegion(region, 500);
  }, []);

  const followRunner = useCallback((latitude: number, longitude: number) => {
    if (!isRunningRef.current || !mapRef.current) return;

    mapRef.current.animateCamera(
      {
        center: { latitude, longitude },
        zoom: RUNNING_ZOOM,
      },
      { duration: 500 }
    );
  }, []);

  const fitMapToRoute = useCallback((coordinates: Coordinate[]) => {
    if (!mapRef.current || coordinates.length < 2) return;

    const now = Date.now();
    const sizeDelta = coordinates.length - lastRouteFitLengthRef.current;
    const fitAllowed =
      sizeDelta >= 2 ||
      now - lastRouteFitAtRef.current > 2500;

    if (!fitAllowed) {
      return;
    }

    const route = coordinates.map((coordinate) => ({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    }));

    mapRef.current.fitToCoordinates(route, {
      edgePadding: {
        top: 80,
        right: 80,
        bottom: 110,
        left: 80,
      },
      animated: true,
    });

    lastRouteFitLengthRef.current = coordinates.length;
    lastRouteFitAtRef.current = now;
  }, []);

  const zoomIn = useCallback(() => {
    if (!mapRef.current) return;
    mapRef.current.getCamera().then((camera) => {
      mapRef.current?.animateCamera(
        {
          zoom: (camera.zoom || RUNNING_ZOOM) + 1,
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
          zoom: Math.max((camera.zoom || RUNNING_ZOOM) - 1, 10),
        },
        { duration: 300 }
      );
    });
  }, []);

  /* =======================================================
     LOCATION PERMISSIONS
  ======================================================= */

  const requestLocation = useCallback(async () => {
    try {
      setLoading(true);

      // Request foreground permissions
      const granted = await LocationService.requestForegroundPermissions();
      if (!granted) {
        setPermissionGranted(false);
        Alert.alert(
          "Location Permission Required",
          "Please allow precise location access to track your runs.",
          [
            { text: "OK", style: "default" },
            {
              text: "Settings",
              onPress: () => Location.requestForegroundPermissionsAsync(),
            },
          ]
        );
        return;
      }

      // Request background permissions for Android
      if (Platform.OS === "android") {
        const { status: backgroundStatus } =
          await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== "granted") {
          Alert.alert(
            "Background Location",
            "Background location access helps track your run even when the app is in background."
          );
        }
      }

      setPermissionGranted(true);

      // Get current location
      const currentLocation = await LocationService.getCurrentLocation();
      
      // Convert timestamp to number
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
        timestamp: timestamp,
      });

      setAccuracy(currentLocation.accuracy ?? null);

      // Move map to location
      moveMapToLocation(currentLocation.latitude, currentLocation.longitude);

      addLog("📍 Precise location access granted");
      addLog(`📍 Accuracy: ${(currentLocation.accuracy ?? 0).toFixed(1)}m`);
    } catch (error) {
      console.error("Location error:", error);
      Alert.alert(
        "Location Error",
        "Unable to get your current location. Please make sure GPS is enabled."
      );
    } finally {
      setLoading(false);
    }
  }, [moveMapToLocation, addLog]);

  /* =======================================================
     INITIAL LOCATION
  ======================================================= */

  useEffect(() => {
    requestLocation();

    return () => {
      isRunningRef.current = false;
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    };
  }, [requestLocation]);

  /* =======================================================
     RUN TIMER
  ======================================================= */

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

  /* =======================================================
     UPLOAD BATCH
  ======================================================= */

  const uploadBatch = useCallback(
    async (batch: RunningPathPoint[]) => {
      if (batch.length === 0) return;
      if (uploadInProgressRef.current) return;
      if (!runIdRef.current || !apiClientRef.current) return;

      uploadInProgressRef.current = true;

      try {
        addLog(`📤 Uploading ${batch.length} points`);
        await apiClientRef.current.uploadBatch(runIdRef.current, batch);
        addLog(`✅ ${batch.length} points uploaded`);
      } catch (error) {
        console.error("Batch upload failed:", error);
        addLog("❌ Batch upload failed");
      } finally {
        uploadInProgressRef.current = false;
      }
    },
    [addLog]
  );

  /* =======================================================
     LIVE LOCATION UPDATE
  ======================================================= */

  const handleLocationUpdate = useCallback(
    (rawGps: RawGpsPayload) => {
      if (!isRunningRef.current) return;

      // Convert timestamp to number
      const timestamp = typeof rawGps.timestamp === 'number' 
        ? rawGps.timestamp 
        : typeof rawGps.timestamp === 'string' 
          ? parseInt(rawGps.timestamp, 10) 
          : Date.now();

      // Update UI location
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
        timestamp: timestamp,
      });

      setAccuracy(rawGps.accuracy ?? null);

      // Get processor and queue
      const processor = pathProcessorRef.current;
      const queue = queueRef.current;

      if (!processor || !queue) return;

      // Process the GPS point through PathProcessor
      const retained = processor.ingest(rawGps);

      if (retained) {
        // Use the retained route coordinate, not the raw sample, to keep distance aligned with trajectory retention.
        if (lastRetainedCoordinateRef.current) {
          const movementDistance = calculateDistance(
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

        // Add to queue for uploading
        queue.enqueue(retained);

        // Update stats
        const snapshot = processor.getSnapshot();
        setOptimizedStats({
          rawPointCount: snapshot.rawPointCount,
          optimizedPointCount: snapshot.optimizedPointCount,
          reductionPercent: snapshot.reductionPercent,
        });

        // Get optimized points for the polyline
        const optimized = processor.getOptimizedPoints();
        const coordinates = optimized.map((point: RunningPathPoint) => ({
          latitude: point.latitude,
          longitude: point.longitude,
        }));

        setRouteCoordinates(coordinates);
        fitMapToRoute(coordinates);
        console.log("[Live Route]", JSON.stringify(coordinates, null, 2));
        console.log(`[Live GPS] retained ${coordinates.length} optimized route points`);
        addLog(`✅ Path retained: ${coordinates.length} points`);

        // Upload batch if needed
        if (queue.getPendingCount() >= BATCH_UPLOAD_SIZE) {
          const batch = queue.drainBatch();
          if (runIdRef.current && apiClientRef.current) {
            uploadBatch(batch);
          }
        }
      } else {
        addLog("❌ GPS point rejected");
      }

      // Follow the runner on the map
      followRunner(rawGps.latitude, rawGps.longitude);
    },
    [addLog, followRunner, uploadBatch]
  );

  /* =======================================================
     START LIVE GPS
  ======================================================= */

  const startLiveGPS = useCallback(async () => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }

    locationSubscription.current = await LocationService.watchLocation(
      handleLocationUpdate
    );

    addLog("📡 Live GPS tracking started");
  }, [addLog, handleLocationUpdate]);

  /* =======================================================
     START RUN
  ======================================================= */

  const startRun = async () => {
    try {
      if (!permissionGranted) {
        await requestLocation();
        return;
      }

      // Reset state
      setRouteCoordinates([]);
      distanceRef.current = 0;
      setDistance(0);
      setElapsedSeconds(0);
      setOptimizedStats({
        rawPointCount: 0,
        optimizedPointCount: 0,
        reductionPercent: 0,
      });
      setLogs([]);
      previousLocationRef.current = null;
      lastRetainedCoordinateRef.current = null;

      // Create API client
      const apiClient = new RunningApiClient();
      apiClientRef.current = apiClient;

      // Start run in backend
      const startedAt = new Date().toISOString();
      const startResponse = await apiClient.startRun(RUNNING_USER_ID, startedAt);

      if (!startResponse.success || !startResponse.run_id) {
        Alert.alert("Error", "Failed to start run");
        return;
      }

      const runId = startResponse.run_id;
      runIdRef.current = runId;

      // Get current location
      const currentLocation = await LocationService.getCurrentLocation();
      const startingPoint: Coordinate = {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      };

      // Initialize PathProcessor with the run ID
      const pathProcessor = new PathProcessor(runId);
      pathProcessorRef.current = pathProcessor;
      pathProcessor.reset();

      // Initialize Queue
      const queue = new LocationQueue();
      queueRef.current = queue;

      // Set initial point for polyline
      setRouteCoordinates([startingPoint]);
      console.log("[Run Start Coordinate]", JSON.stringify([startingPoint], null, 2));
      console.log("[Run Start Payload]", JSON.stringify({
        user_id: RUNNING_USER_ID,
        started_at: startedAt,
        run_id: runId,
      }));

      // Start run state
      startTimeRef.current = Date.now();
      isRunningRef.current = true;
      setIsRunning(true);

      addLog(`🏃 Run ${runId} started`);
      addLog("📡 GPS tracking enabled");

      // Move map to starting position
      moveMapToLocation(startingPoint.latitude, startingPoint.longitude);

      // Start GPS tracking
      await startLiveGPS();

      console.log("RUN STARTED:", runId);
    } catch (error) {
      console.error("Start run error:", error);
      isRunningRef.current = false;
      setIsRunning(false);
      Alert.alert(
        "Error",
        "Failed to start run. Please check your location settings."
      );
    }
  };

  /* =======================================================
     STOP RUN
  ======================================================= */

  const stopRun = async () => {
    try {
      // Stop processing new GPS
      isRunningRef.current = false;

      // Stop GPS watcher
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }

      const processor = pathProcessorRef.current;
      const queue = queueRef.current;

      if (processor && queue) {
        // Finalize the path using RDP simplification
        const finalOptimized = processor.simplifyFinal();
        queue.enqueueMany(finalOptimized);

        // Update polyline with the final simplified route instead of the unfiltered working list.
        const finalCoordinates = finalOptimized.map((point: RunningPathPoint) => ({
          latitude: point.latitude,
          longitude: point.longitude,
        }));
        setRouteCoordinates(finalCoordinates);
        fitMapToRoute(finalCoordinates);

        console.log("[Route Saved]", JSON.stringify(finalCoordinates, null, 2));
        console.log(`[Route Saved] ${finalCoordinates.length} coordinate points finalized`);

        // Final stats
        const snapshot = processor.getSnapshot();
        setOptimizedStats({
          rawPointCount: snapshot.rawPointCount,
          optimizedPointCount: snapshot.optimizedPointCount,
          reductionPercent: snapshot.reductionPercent,
        });

        addLog(`🏁 Final optimization: ${finalOptimized.length} points`);

        // Upload remaining points
        if (runIdRef.current && apiClientRef.current) {
          const finalBatch = queue.drainBatch();
          if (finalBatch.length > 0) {
            await uploadBatch(finalBatch);
          }

          // Finalize run in backend
          await apiClientRef.current.stopRun({
            run_id: runIdRef.current,
            ended_at: new Date().toISOString(),
            final_sequence: processor.getOptimizedPoints().length,
          });

          addLog(`✅ Run ${runIdRef.current} completed`);
        }
      }

      // Reset state
      setIsRunning(false);
      isRunningRef.current = false;
      startTimeRef.current = null;
      previousLocationRef.current = null;

      const finalDistance = distanceRef.current;
      const finalRouteCount = routeCoordinates.length;

      const routePayload = {
        run_id: runIdRef.current,
        start_time: startTimeRef.current,
        end_time: new Date().toISOString(),
        duration: elapsedSeconds,
        distance: finalDistance,
        route_points: finalRouteCount,
        coordinates: routeCoordinates.map((point) => [point.latitude, point.longitude]),
      };

      console.log("[Route Final Payload]", JSON.stringify(routePayload, null, 2));

      // Show completion alert without dumping distance or route summary to the frontend UI.
      Alert.alert(
        "🎉 Run Completed!",
        "Your route has been finalized and saved for upload."
      );
    } catch (error) {
      console.error("Stop run error:", error);
      setIsRunning(false);
      isRunningRef.current = false;
      Alert.alert("Error", "Failed to stop run properly.");
    }
  };

  /* =======================================================
     LOADING
  ======================================================= */

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#20D000" />
        <Text style={styles.loadingText}>Getting precise GPS location...</Text>
        <Text style={styles.loadingSubText}>Please wait while we find your location</Text>
      </View>
    );
  }

  /* =======================================================
     PERMISSION
  ======================================================= */

  if (!permissionGranted) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.permissionIconContainer}>
          <Text style={styles.permissionIcon}>📍</Text>
        </View>
        <Text style={styles.permissionTitle}>Location Permission Required</Text>
        <Text style={styles.permissionDescription}>
          This app needs precise location access to track your running routes accurately.
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestLocation}>
          <Text style={styles.permissionButtonText}>Allow Precise Location</Text>
        </TouchableOpacity>
      </View>
    );
  }

  /* =======================================================
     WAITING FOR LOCATION
  ======================================================= */

  if (!location) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#20D000" />
        <Text style={styles.loadingText}>Waiting for GPS signal...</Text>
        <Text style={styles.loadingSubText}>Make sure you're outside with clear sky view</Text>
      </View>
    );
  }

  /* =======================================================
     INITIAL MAP REGION
  ======================================================= */

  const region: Region = {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    latitudeDelta: DEFAULT_LATITUDE_DELTA,
    longitudeDelta: DEFAULT_LONGITUDE_DELTA,
  };

  /* =======================================================
     MAIN UI
  ======================================================= */

  return (
    <View style={styles.container}>
      {/* =================================================
          MAP CONTAINER - Full screen with proper layout
      ================================================== */}

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
          onMapReady={() => setIsMapReady(true)}
          minZoomLevel={10}
          maxZoomLevel={20}
        >
          {/* Current Location Marker */}
          <Marker
            coordinate={{
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            }}
            title={isRunning ? "🏃 Running" : "📍 Current Location"}
            description={
              isRunning
                ? `Speed: ${(location.coords.speed ?? 0).toFixed(1)} m/s`
                : "Tap START RUN to begin tracking"
            }
          />

          {/* Running Path Polyline - This shows the optimized route */}
          {routeCoordinates.length > 1 && (
            <Polyline
              coordinates={routeCoordinates}
              strokeWidth={6}
              strokeColor="#20D000"
              lineCap="round"
              lineJoin="round"
              geodesic={true}
            />
          )}
        </MapView>

        {/* =================================================
            ZOOM CONTROLS - Overlay on map
        ================================================== */}

        <View style={styles.zoomControls}>
          <TouchableOpacity style={styles.zoomButton} onPress={zoomIn}>
            <Text style={styles.zoomButtonText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.zoomButton} onPress={zoomOut}>
            <Text style={styles.zoomButtonText}>−</Text>
          </TouchableOpacity>
        </View>

        {/* =================================================
            GPS STATUS - Top right
        ================================================== */}

        <View style={styles.gpsStatusContainer}>
          <View style={styles.gpsStatus}>
            <View
              style={[
                styles.gpsDot,
                {
                  backgroundColor: isRunning ? "#20D000" : "#FFA500",
                },
              ]}
            />
            <Text style={styles.gpsStatusText}>
              {isRunning ? "LIVE TRACKING" : "GPS READY"}
            </Text>
            {accuracy !== null && (
              <Text style={styles.gpsAccuracyText}>
                ±{accuracy.toFixed(1)}m
              </Text>
            )}
          </View>
        </View>

        {/* =================================================
            RECENTER BUTTON
        ================================================== */}

        <TouchableOpacity
          style={styles.recenterButton}
          onPress={() => {
            if (location) {
              moveMapToLocation(location.coords.latitude, location.coords.longitude);
            }
          }}
        >
          <Text style={styles.recenterText}>📍</Text>
        </TouchableOpacity>
      </View>

      {/* =================================================
          CLEAN MAP CONTROL BAR - Bottom overlay only
      ================================================== */}

      <View style={styles.controlBar}>
        <View style={styles.controlBarContent}>
          <View style={styles.controlStatus}>
            <Text style={styles.controlStatusTitle}>Run</Text>
            <Text style={styles.controlStatusValue}>
              {isRunning ? "Live" : "Ready"}
            </Text>
          </View>

          {!isRunning ? (
            <TouchableOpacity
              style={styles.startButton}
              onPress={startRun}
              activeOpacity={0.8}
            >
              <Text style={styles.startButtonText}>▶  START RUN</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.stopButton}
              onPress={stopRun}
              activeOpacity={0.8}
            >
              <Text style={styles.stopButtonText}>■  STOP RUN</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },

  mapContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  map: {
    ...StyleSheet.absoluteFill,
  },

  centerContainer: {
    flex: 1,
    backgroundColor: "#0B0E0F",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },

  loadingText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 20,
    textAlign: "center",
  },

  loadingSubText: {
    color: "#888888",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },

  permissionIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(32, 208, 0, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },

  permissionIcon: {
    fontSize: 40,
  },

  permissionTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 10,
  },

  permissionDescription: {
    color: "#AAAAAA",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 30,
    lineHeight: 24,
  },

  permissionButton: {
    backgroundColor: "#20D000",
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 15,
  },

  permissionButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  gpsStatusContainer: {
    position: "absolute",
    top: 55,
    right: 20,
    zIndex: 10,
  },

  gpsStatus: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  gpsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },

  gpsStatusText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    marginRight: 8,
  },

  gpsAccuracyText: {
    color: "#AAAAAA",
    fontSize: 11,
    fontWeight: "500",
  },

  zoomControls: {
    position: "absolute",
    right: 20,
    bottom: 320,
    zIndex: 10,
  },

  zoomButton: {
    width: 44,
    height: 44,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },

  zoomButtonText: {
    fontSize: 28,
    color: "#222222",
    fontWeight: "300",
    lineHeight: 30,
  },

  recenterButton: {
    position: "absolute",
    right: 20,
    bottom: 270,
    width: 44,
    height: 44,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 10,
  },

  recenterText: {
    fontSize: 20,
    color: "#222222",
  },

  controlBar: {
    position: "absolute",
    left: 15,
    right: 15,
    bottom: 15,
    zIndex: 10,
  },

  controlBarContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(16, 21, 20, 0.95)",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  controlStatus: {
    flexDirection: "column",
  },

  controlStatusTitle: {
    color: "#9CA3AF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  controlStatusValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 2,
  },

  startButton: {
    backgroundColor: "#20D000",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 28,
    alignItems: "center",
    shadowColor: "#20D000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },

  startButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },

  stopButton: {
    backgroundColor: "#D00000",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 28,
    alignItems: "center",
    shadowColor: "#D00000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },

  stopButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },
});