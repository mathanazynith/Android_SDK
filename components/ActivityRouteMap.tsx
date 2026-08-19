import { useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { decodePolyline } from '../src/utils/polylineDecoder';

interface ActivityRouteMapProps {
  encodedPolyline?: string | null;
  variant?: 'detail' | 'preview';
  cropStartIndex?: number;
  cropEndIndex?: number;
}

export default function ActivityRouteMap({
  encodedPolyline,
  variant = 'detail',
  cropStartIndex,
  cropEndIndex,
}: ActivityRouteMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const routePoints = useMemo(() => {
    if (!encodedPolyline?.trim()) return [];

    try {
      return decodePolyline(encodedPolyline);
    } catch {
      return [];
    }
  }, [encodedPolyline]);

  const visibleRoutePoints = useMemo(() => {
    if (routePoints.length === 0 || cropStartIndex === undefined || cropEndIndex === undefined) {
      return routePoints;
    }

    const start = Math.max(0, Math.min(Math.floor(cropStartIndex), routePoints.length - 1));
    const end = Math.max(start, Math.min(Math.floor(cropEndIndex), routePoints.length - 1));
    return routePoints.slice(start, end + 1);
  }, [cropEndIndex, cropStartIndex, routePoints]);

  if (visibleRoutePoints.length === 0) {
    return (
      <View style={styles.emptyRoute}>
        <Text style={styles.emptyRouteText}>No saved route is available for this workout.</Text>
      </View>
    );
  }

  const firstPoint = visibleRoutePoints[0];
  const lastPoint = visibleRoutePoints[visibleRoutePoints.length - 1];

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
        onMapReady={() => {
          if (visibleRoutePoints.length > 1) {
            mapRef.current?.fitToCoordinates(visibleRoutePoints, {
              edgePadding: variant === 'preview'
                ? { top: 16, right: 16, bottom: 16, left: 16 }
                : { top: 36, right: 36, bottom: 36, left: 36 },
              animated: false,
            });
          }
        }}
      >
        {visibleRoutePoints.length > 1 && (
          <Polyline coordinates={visibleRoutePoints} strokeColor="#35C72B" strokeWidth={variant === 'preview' ? 3 : 5} />
        )}
        <Marker coordinate={firstPoint} pinColor="#35C72B" title="Start" />
        <Marker coordinate={lastPoint} pinColor="#FF5B5B" title="Finish" />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: { height: 255, overflow: 'hidden', borderRadius: 22, borderWidth: 1, borderColor: '#393C3E' },
  previewMapContainer: { height: 178, borderRadius: 18 },
  map: { flex: 1 },
  emptyRoute: { minHeight: 120, borderRadius: 22, borderWidth: 1, borderColor: '#393C3E', backgroundColor: '#242627', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  emptyRouteText: { color: '#A9ADAF', fontSize: 15, textAlign: 'center' },
});
