import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import type {
  BackendGpsPoint,
  BackendPauseEvent,  
  BackendPolylineRoute,
} from '../src/services/activityApi';
import { createCatmullRomPolyline } from '../src/utils/catmullRom'; 
import { buildActivityRouteGroups } from '../src/utils/activityRouteGroups';
import { decodePolyline } from '../src/utils/polylineDecoder';

interface RouteCoordinate {
  latitude: number;
  longitude: number;
}

const toRouteCoordinate = (value: {
  latitude?: unknown;
  longitude?: unknown;
} | null | undefined): RouteCoordinate | null => {
  if (!value) return null;
  const latitude = typeof value.latitude === 'string' && value.latitude.trim()
    ? Number(value.latitude)
    : value.latitude;
  const longitude = typeof value.longitude === 'string' && value.longitude.trim()
    ? Number(value.longitude)
    : value.longitude;
  if (
    typeof latitude !== 'number'
    || typeof longitude !== 'number'
    || !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || latitude < -90
    || latitude > 90
    || longitude < -180
    || longitude > 180
  ) return null;
  return { latitude, longitude };
};

interface ActivityRouteMapProps {
  encodedPolyline?: string | null;
  plannedEncodedPolyline?: string | null;
  extraEncodedPolyline?: string | null;
  savedGpsPoints?: BackendGpsPoint[];
  runningRoutes?: BackendPolylineRoute[];
  pauseRoutes?: BackendPolylineRoute[];
  pauseEvents?: BackendPauseEvent[];
  pausePoints?: BackendGpsPoint[];
  variant?: 'detail' | 'preview';
  cropStartIndex?: number;
  cropEndIndex?: number;
}

function ActivityRouteMap({
  encodedPolyline,
  plannedEncodedPolyline,
  extraEncodedPolyline,
  savedGpsPoints,
  runningRoutes,
  pauseRoutes,
  pauseEvents,
  pausePoints,
  variant = 'detail',
  cropStartIndex,
  cropEndIndex,
}: ActivityRouteMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const routePoints = useMemo(() => {
    if (!encodedPolyline?.trim()) return [];

    try {
      return decodePolyline(encodedPolyline);
    } catch {
      return [];
    }
  }, [encodedPolyline]);
  const plannedRoutePoints = useMemo(() => {
    if (!plannedEncodedPolyline?.trim()) return [];
    try {
      return decodePolyline(plannedEncodedPolyline);
    } catch {
      return [];
    }
  }, [plannedEncodedPolyline]);
  const extraRoutePoints = useMemo(() => {
    if (!extraEncodedPolyline?.trim()) return [];
    try {
      return decodePolyline(extraEncodedPolyline);
    } catch {
      return [];
    }
  }, [extraEncodedPolyline]);
  const decodeRouteGroups = (routes?: BackendPolylineRoute[]) => (routes ?? []).flatMap((route) => {
    if (!route.encoded_polyline?.trim()) return [];
    try {
      const points = decodePolyline(route.encoded_polyline);
      return points.length >= 2 ? [points] : [];
    } catch {
      return [];
    }
  });
  const backendRunningRouteGroups = useMemo(
    () => decodeRouteGroups(runningRoutes),
    [runningRoutes],
  );
  const backendPauseRouteGroups = useMemo(
    () => decodeRouteGroups(pauseRoutes),
    [pauseRoutes],
  );
  const savedRouteGroups = useMemo(
    () => buildActivityRouteGroups(savedGpsPoints),
    [savedGpsPoints],
  );
  const useSavedRouteGroups = savedRouteGroups.some((group) => group.coordinates.length >= 2)
    && !(cropStartIndex !== undefined && cropEndIndex !== undefined);

  const visibleRoutePoints = useMemo(() => {
    if (routePoints.length === 0 || cropStartIndex === undefined || cropEndIndex === undefined) {
      return routePoints;
    }

    const start = Math.max(0, Math.min(Math.floor(cropStartIndex), routePoints.length - 1));
    const end = Math.max(start, Math.min(Math.floor(cropEndIndex), routePoints.length - 1));
    return routePoints.slice(start, end + 1);
  }, [cropEndIndex, cropStartIndex, routePoints]);
  const smoothedVisibleRoutePoints = useMemo(
    () => createCatmullRomPolyline(visibleRoutePoints),
    [visibleRoutePoints],
  );
  const smoothedPlannedRoutePoints = useMemo(
    () => createCatmullRomPolyline(plannedRoutePoints),
    [plannedRoutePoints],
  );
  const smoothedExtraRoutePoints = useMemo(
    () => createCatmullRomPolyline(extraRoutePoints),
    [extraRoutePoints],
  );
  const smoothedSavedRouteGroups = useMemo(
    () => savedRouteGroups
      .filter((group) => group.coordinates.length >= 2)
      .map((group) => ({
        type: group.type,
        coordinates: createCatmullRomPolyline(group.coordinates),
      })),
    [savedRouteGroups],
  );
  const smoothedRunningRouteGroups = useMemo(() => {
    if (cropStartIndex !== undefined && cropEndIndex !== undefined) {
      return smoothedVisibleRoutePoints.length >= 2 ? [smoothedVisibleRoutePoints] : [];
    }
    if (useSavedRouteGroups) {
      return smoothedSavedRouteGroups
        .filter((group) => group.type === 'running')
        .map((group) => group.coordinates);
    }
    if (backendRunningRouteGroups.length > 0) {
      return backendRunningRouteGroups.map((points) => createCatmullRomPolyline(points));
    }
    if (plannedRoutePoints.length >= 2 || extraRoutePoints.length >= 2) return [];
    return smoothedVisibleRoutePoints.length >= 2 ? [smoothedVisibleRoutePoints] : [];
  }, [
    backendRunningRouteGroups,
    cropEndIndex,
    cropStartIndex,
    extraRoutePoints.length,
    plannedRoutePoints.length,
    smoothedSavedRouteGroups,
    smoothedVisibleRoutePoints,
    useSavedRouteGroups,
  ]);
  const savedPauseMarkers = useMemo(() => {
    const eventMarkers = (pauseEvents ?? []).flatMap((event, index) => {
      const sequence = event.sequence ?? index + 1;
      const pauseLocation = toRouteCoordinate(event.pause_location);
      const resumeLocation = toRouteCoordinate(event.resume_location);
      return [
        ...(pauseLocation ? [{
          key: `pause-${sequence}`,
          title: 'Paused',
          coordinate: pauseLocation,
        }] : []),
        ...(resumeLocation ? [{
          key: `resume-${sequence}`,
          title: 'Resumed',
          coordinate: resumeLocation,
        }] : []),
      ];
    });
    if (eventMarkers.length > 0) return eventMarkers;

    const pointsByPause = new Map<number, RouteCoordinate[]>();
    (pausePoints ?? []).forEach((point) => {
      const coordinate = toRouteCoordinate(point);
      if (!coordinate) return;
      const sequence = point.pause_sequence ?? 1;
      const points = pointsByPause.get(sequence) ?? [];
      points.push(coordinate);
      pointsByPause.set(sequence, points);
    });
    if (pointsByPause.size > 0) {
      return [...pointsByPause.entries()].flatMap(([sequence, points]) => {
        const first = points[0];
        const last = points.at(-1);
        if (!first) return [];
        return [
          { key: `pause-${sequence}`, title: 'Paused', coordinate: first },
          ...(last && last !== first
            ? [{ key: `resume-${sequence}`, title: 'Resumed', coordinate: last }]
            : []),
        ];
      });
    }

    return backendPauseRouteGroups.flatMap((points, index) => {
      const first = points[0];
      const last = points.at(-1);
      if (!first) return [];
      const sequence = pauseRoutes?.[index]?.sequence ?? index + 1;
      return [
        { key: `pause-${sequence}`, title: 'Paused', coordinate: first },
        ...(last && last !== first
          ? [{ key: `resume-${sequence}`, title: 'Resumed', coordinate: last }]
          : []),
      ];
    });
  }, [backendPauseRouteGroups, pauseEvents, pausePoints, pauseRoutes]);
  const smoothedPauseRouteGroups = useMemo(
    () => useSavedRouteGroups
      ? smoothedSavedRouteGroups
        .filter((group) => group.type === 'pause')
        .map((group) => group.coordinates)
      : backendPauseRouteGroups.map((points) => createCatmullRomPolyline(points)),
    [backendPauseRouteGroups, smoothedSavedRouteGroups, useSavedRouteGroups],
  );
  const smoothedExtraRouteGroups = useMemo(
    () => useSavedRouteGroups
      ? smoothedSavedRouteGroups
        .filter((group) => group.type === 'extra')
        .map((group) => group.coordinates)
      : smoothedExtraRoutePoints.length >= 2 ? [smoothedExtraRoutePoints] : [],
    [smoothedExtraRoutePoints, smoothedSavedRouteGroups, useSavedRouteGroups],
  );
  const allRouteCoordinates = useMemo(() => [
    ...(useSavedRouteGroups
      ? smoothedSavedRouteGroups.flatMap((group) => group.coordinates)
      : [
        ...smoothedRunningRouteGroups.flat(),
        ...smoothedPauseRouteGroups.flat(),
      ]),
    ...smoothedPlannedRoutePoints,
    ...(useSavedRouteGroups ? [] : smoothedExtraRouteGroups.flat()),
  ], [
    smoothedExtraRouteGroups,
    smoothedPauseRouteGroups,
    smoothedPlannedRoutePoints,
    smoothedRunningRouteGroups,
    smoothedSavedRouteGroups,
    useSavedRouteGroups,
  ]);

  const fitRoute = useCallback(() => {
    if (!mapRef.current || allRouteCoordinates.length < 2) return;

    mapRef.current.fitToCoordinates(allRouteCoordinates, {
      edgePadding: variant === 'preview'
        ? { top: 16, right: 16, bottom: 16, left: 16 }
        : { top: 36, right: 36, bottom: 36, left: 36 },
      animated: false,
    });
  }, [allRouteCoordinates, variant]);

  // A history card first receives its list data and then its detailed route.
  // Re-fit after that asynchronous prop update; onMapReady alone can run
  // before the encoded route has been supplied.
  useEffect(() => {
    if (!mapReady || allRouteCoordinates.length < 2) return;
    const frame = requestAnimationFrame(fitRoute);
    return () => cancelAnimationFrame(frame);
  }, [allRouteCoordinates.length, fitRoute, mapReady]);

  if (allRouteCoordinates.length === 0) {
    return (
      <View style={styles.emptyRoute}>
        <Text style={styles.emptyRouteText}>No saved route is available for this workout.</Text>
      </View>
    );
  }

  const runningCoordinates = smoothedRunningRouteGroups.flat();
  const pauseCoordinates = smoothedPauseRouteGroups.flat();
  const routePointCoordinates = useSavedRouteGroups
    ? smoothedSavedRouteGroups.flatMap((group) => group.coordinates)
    : [];
  const extraCoordinates = smoothedExtraRouteGroups.flat();
  const firstPoint = routePointCoordinates[0]
    ?? runningCoordinates[0]
    ?? pauseCoordinates[0]
    ?? smoothedPlannedRoutePoints[0]
    ?? extraCoordinates[0];
  const lastPoint = routePointCoordinates.at(-1)
    ?? runningCoordinates.at(-1)
    ?? pauseCoordinates.at(-1)
    ?? smoothedPlannedRoutePoints.at(-1)
    ?? extraCoordinates.at(-1);

  return (
    <View style={[styles.mapContainer, variant === 'preview' && styles.previewMapContainer]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude: firstPoint.latitude,
          longitude: firstPoint.longitude,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        }}
        onMapReady={() => setMapReady(true)}
      >
        {(useSavedRouteGroups
          ? smoothedSavedRouteGroups.filter((group) => group.type === 'running')
          : smoothedRunningRouteGroups.map((coordinates) => ({ type: 'running' as const, coordinates }))
        ).map(({ coordinates }, index) => (
          <Polyline
            key={`running-route-${index}`}
            coordinates={coordinates}
            strokeColor="#35C72B"
            strokeWidth={variant === 'preview' ? 2 : 3}
          />
        ))}
        {(useSavedRouteGroups
          ? smoothedSavedRouteGroups.filter((group) => group.type === 'pause')
          : smoothedPauseRouteGroups.map((coordinates) => ({ type: 'pause' as const, coordinates }))
        ).map(({ coordinates }, index) => (
          <Polyline
            key={`pause-route-${pauseRoutes?.[index]?.sequence ?? index + 1}`}
            coordinates={coordinates}
            strokeColor="#EF4444"
            strokeWidth={variant === 'preview' ? 2 : 3}
          />
        ))}
        {smoothedPlannedRoutePoints.length > 1 && (
          <Polyline coordinates={smoothedPlannedRoutePoints} strokeColor="#35C72B" strokeWidth={variant === 'preview' ? 2 : 3} />
        )}
        {smoothedExtraRouteGroups.map((coordinates, index) => (
          <Polyline
            key={`extra-route-${index}`}
            coordinates={coordinates}
            strokeColor="#9CA3AF"
            strokeWidth={variant === 'preview' ? 2 : 3}
          />
        ))}
        {savedPauseMarkers.map((marker) => (
          <Marker
            key={marker.key}
            coordinate={marker.coordinate}
            title={marker.title}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={[styles.pauseMarker, variant === 'preview' && styles.previewPauseMarker]} />
          </Marker>
        ))}
        {firstPoint && <Marker coordinate={firstPoint} pinColor="#35C72B" title="Start" />}
        {lastPoint && <Marker coordinate={lastPoint} pinColor="#FF5B5B" title="Finish" />}
      </MapView>
    </View>
  );
}

export default memo(ActivityRouteMap);

const styles = StyleSheet.create({
  mapContainer: { height: 255, overflow: 'hidden', borderRadius: 22, borderWidth: 1, borderColor: '#35C72B' },
  previewMapContainer: { height: 110, borderRadius: 20, overflow: 'hidden' },
  map: { flex: 1 },
  emptyRoute: { minHeight: 120, borderRadius: 22, borderWidth: 1, borderColor: '#393C3E', backgroundColor: '#242627', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  emptyRouteText: { color: '#A9ADAF', fontSize: 15, textAlign: 'center' },
  pauseMarker: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#D1D5DB' },
  previewPauseMarker: { width: 10, height: 10, borderWidth: 1 },
});
