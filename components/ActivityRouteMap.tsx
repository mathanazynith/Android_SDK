import { Feather } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { createCatmullRomPolyline } from '../src/utils/catmullRom';
import { decodePolyline } from '../src/utils/polylineDecoder';

export interface ActivityMapStats {
  distance?: number;
  duration?: number;
  pace?: number;
  elevationGain?: number;
  activityType?: string;
}

interface ActivityRouteMapProps {
  encodedPolyline?: string | null;
  plannedEncodedPolyline?: string | null;
  extraEncodedPolyline?: string | null;
  variant?: 'detail' | 'preview';
  cropStartIndex?: number;
  cropEndIndex?: number;
  enableFullScreen?: boolean;
  onPress?: () => void;
  activityStats?: ActivityMapStats;
}

const formatDistance = (meters?: number) => {
  if (meters === undefined || !Number.isFinite(meters)) return '--';
  return `${(Math.max(0, meters) / 1000).toFixed(2)} km`;
};

const formatDuration = (seconds?: number) => {
  if (seconds === undefined || !Number.isFinite(seconds)) return '--';
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
};

const formatPace = (secondsPerKm?: number) => {
  if (secondsPerKm === undefined || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '-- /km';
  const totalSeconds = Math.round(secondsPerKm);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')} /km`;
};

function ActivityRouteMap({
  encodedPolyline,
  plannedEncodedPolyline,
  extraEncodedPolyline,
  variant = 'detail',
  cropStartIndex,
  cropEndIndex,
  enableFullScreen,
  onPress,
  activityStats,
}: ActivityRouteMapProps) {
  const { colors, isDark } = useTheme();
  const mapRef = useRef<MapView | null>(null);
  const fullScreenMapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [fullScreenMapReady, setFullScreenMapReady] = useState(false);
  const [fullScreenVisible, setFullScreenVisible] = useState(false);
  const [mapType, setMapType] = useState<'standard' | 'hybrid'>('standard');

  const isFullScreenEnabled = enableFullScreen ?? (variant === 'detail');

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

  const fitRoute = useCallback(() => {
    if (!mapRef.current || smoothedVisibleRoutePoints.length < 2) return;

    mapRef.current.fitToCoordinates(smoothedVisibleRoutePoints, {
      edgePadding: variant === 'preview'
        ? { top: 16, right: 16, bottom: 16, left: 16 }
        : { top: 36, right: 36, bottom: 36, left: 36 },
      animated: false,
    });
  }, [smoothedVisibleRoutePoints, variant]);

  const fitFullScreenRoute = useCallback(() => {
    if (!fullScreenMapRef.current || smoothedVisibleRoutePoints.length < 2) return;

    fullScreenMapRef.current.fitToCoordinates(smoothedVisibleRoutePoints, {
      edgePadding: {
        top: 130,
        right: 36,
        bottom: activityStats ? 140 : 60,
        left: 36,
      },
      animated: true,
    });
  }, [smoothedVisibleRoutePoints, activityStats]);

  useEffect(() => {
    if (!mapReady || visibleRoutePoints.length < 2) return;
    const frame = requestAnimationFrame(fitRoute);
    return () => cancelAnimationFrame(frame);
  }, [fitRoute, mapReady, visibleRoutePoints.length]);

  useEffect(() => {
    if (!fullScreenVisible || !fullScreenMapReady || visibleRoutePoints.length < 2) return;
    const timer = setTimeout(() => {
      fitFullScreenRoute();
    }, 350);
    return () => clearTimeout(timer);
  }, [fitFullScreenRoute, fullScreenMapReady, fullScreenVisible, visibleRoutePoints.length]);

  const handleMapPress = () => {
    if (onPress) {
      onPress();
      return;
    }
    if (isFullScreenEnabled) {
      setFullScreenVisible(true);
    }
  };

  if (visibleRoutePoints.length === 0) {
    return (
      <View style={[styles.emptyRoute, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.emptyRouteText, { color: colors.textSecondary }]}>No saved route is available for this workout.</Text>
      </View>
    );
  }

  const firstPoint = visibleRoutePoints[0];
  const lastPoint = visibleRoutePoints[visibleRoutePoints.length - 1];

  return (
    <>
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
          scrollEnabled={!isFullScreenEnabled}
          zoomEnabled={!isFullScreenEnabled}
          pitchEnabled={!isFullScreenEnabled}
          rotateEnabled={!isFullScreenEnabled}
        >
          {visibleRoutePoints.length > 1 && plannedRoutePoints.length < 2 && extraRoutePoints.length < 2 && (
            <Polyline coordinates={smoothedVisibleRoutePoints} strokeColor="#35C72B" strokeWidth={variant === 'preview' ? 2 : 3} />
          )}
          {smoothedPlannedRoutePoints.length > 1 && (
            <Polyline coordinates={smoothedPlannedRoutePoints} strokeColor="#35C72B" strokeWidth={variant === 'preview' ? 2 : 3} />
          )}
          {smoothedExtraRoutePoints.length > 1 && (
            <Polyline coordinates={smoothedExtraRoutePoints} strokeColor="#9CA3AF" strokeWidth={variant === 'preview' ? 2 : 3} />
          )}
          <Marker coordinate={firstPoint} pinColor="#35C72B" title="Start" />
          <Marker coordinate={lastPoint} pinColor="#FF5B5B" title="Finish" />
        </MapView>

        {isFullScreenEnabled && (
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={handleMapPress}
            style={styles.expandOverlay}
            accessibilityRole="button"
            accessibilityLabel="Tap to view route map in full screen"
          >
            <View
              style={[
                styles.expandBadge,
                {
                  backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.94)',
                  borderColor: colors.border,
                },
              ]}
            >
              <Feather name="maximize-2" size={13} color={colors.text} />
              <Text style={[styles.expandBadgeText, { color: colors.text }]}>Full Screen</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {isFullScreenEnabled && (
        <Modal
          visible={fullScreenVisible}
          animationType="slide"
          onRequestClose={() => setFullScreenVisible(false)}
          statusBarTranslucent
        >
          <View style={[styles.fullScreenContainer, { backgroundColor: colors.background }]}>
            <StatusBar
              barStyle={isDark ? 'light-content' : 'dark-content'}
              backgroundColor="transparent"
              translucent
            />

            <MapView
              ref={fullScreenMapRef}
              provider={PROVIDER_GOOGLE}
              mapType={mapType}
              style={StyleSheet.absoluteFill}
              initialRegion={{
                latitude: firstPoint.latitude,
                longitude: firstPoint.longitude,
                latitudeDelta: 0.015,
                longitudeDelta: 0.015,
              }}
              onMapReady={() => setFullScreenMapReady(true)}
              showsCompass
              showsScale
              zoomEnabled
              scrollEnabled
              pitchEnabled
              rotateEnabled
            >
              {visibleRoutePoints.length > 1 && plannedRoutePoints.length < 2 && extraRoutePoints.length < 2 && (
                <Polyline coordinates={smoothedVisibleRoutePoints} strokeColor="#35C72B" strokeWidth={4} />
              )}
              {smoothedPlannedRoutePoints.length > 1 && (
                <Polyline coordinates={smoothedPlannedRoutePoints} strokeColor="#35C72B" strokeWidth={4} />
              )}
              {smoothedExtraRoutePoints.length > 1 && (
                <Polyline coordinates={smoothedExtraRoutePoints} strokeColor="#9CA3AF" strokeWidth={4} />
              )}
              <Marker coordinate={firstPoint} pinColor="#35C72B" title="Start" />
              <Marker coordinate={lastPoint} pinColor="#FF5B5B" title="Finish" />
            </MapView>

            <SafeAreaView edges={['top']} style={styles.fullScreenTopSafeArea}>
              <View style={styles.fullScreenHeader}>
                <TouchableOpacity
                  onPress={() => setFullScreenVisible(false)}
                  style={[
                    styles.controlButton,
                    {
                      backgroundColor: isDark ? 'rgba(24, 26, 28, 0.88)' : 'rgba(255, 255, 255, 0.94)',
                      borderColor: colors.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Close full screen map"
                >
                  <Feather name="arrow-left" size={22} color={colors.text} />
                </TouchableOpacity>

                <View
                  style={[
                    styles.fullScreenTitleBadge,
                    {
                      backgroundColor: isDark ? 'rgba(24, 26, 28, 0.88)' : 'rgba(255, 255, 255, 0.94)',
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.fullScreenTitleText, { color: colors.text }]}>Route View</Text>
                  {activityStats?.distance !== undefined && (
                    <Text style={[styles.fullScreenDistanceText, { color: colors.primary }]}>
                      {formatDistance(activityStats.distance)}
                    </Text>
                  )}
                </View>

                <View style={styles.topRightControls}>
                  <TouchableOpacity
                    onPress={() => setMapType((prev) => (prev === 'standard' ? 'hybrid' : 'standard'))}
                    style={[
                      styles.controlButton,
                      {
                        backgroundColor: isDark ? 'rgba(24, 26, 28, 0.88)' : 'rgba(255, 255, 255, 0.94)',
                        borderColor: colors.border,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Toggle satellite view"
                  >
                    <Feather name="layers" size={20} color={mapType === 'hybrid' ? colors.primary : colors.text} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={fitFullScreenRoute}
                    style={[
                      styles.controlButton,
                      {
                        backgroundColor: isDark ? 'rgba(24, 26, 28, 0.88)' : 'rgba(255, 255, 255, 0.94)',
                        borderColor: colors.border,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Re-center route"
                  >
                    <Feather name="crosshair" size={20} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            </SafeAreaView>

            {activityStats && (
              <SafeAreaView edges={['bottom']} style={styles.fullScreenBottomSafeArea}>
                <View
                  style={[
                    styles.floatingStatsPanel,
                    {
                      backgroundColor: isDark ? 'rgba(24, 26, 28, 0.92)' : 'rgba(255, 255, 255, 0.96)',
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.statColumn}>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Distance</Text>
                    <Text style={[styles.statValue, { color: colors.text }]}>
                      {formatDistance(activityStats.distance)}
                    </Text>
                  </View>

                  {activityStats.duration !== undefined && (
                    <View style={[styles.statColumn, styles.statDivider, { borderLeftColor: colors.border }]}>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Time</Text>
                      <Text style={[styles.statValue, { color: colors.text }]}>
                        {formatDuration(activityStats.duration)}
                      </Text>
                    </View>
                  )}

                  {activityStats.pace !== undefined && (
                    <View style={[styles.statColumn, styles.statDivider, { borderLeftColor: colors.border }]}>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Pace</Text>
                      <Text style={[styles.statValue, { color: colors.text }]}>
                        {formatPace(activityStats.pace)}
                      </Text>
                    </View>
                  )}

                  {activityStats.elevationGain !== undefined && (
                    <View style={[styles.statColumn, styles.statDivider, { borderLeftColor: colors.border }]}>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Gain</Text>
                      <Text style={[styles.statValue, { color: colors.text }]}>
                        +{Math.round(activityStats.elevationGain)}m
                      </Text>
                    </View>
                  )}
                </View>
              </SafeAreaView>
            )}
          </View>
        </Modal>
      )}
    </>
  );
}

export default memo(ActivityRouteMap);

const styles = StyleSheet.create({
  mapContainer: {
    height: 255,
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#35C72B',
    position: 'relative',
  },
  previewMapContainer: { height: 110, borderRadius: 20, overflow: 'hidden' },
  map: { flex: 1 },
  emptyRoute: {
    minHeight: 120,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyRouteText: { fontSize: 15, textAlign: 'center' },
  expandOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    padding: 12,
  },
  expandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 3,
    elevation: 4,
  },
  expandBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  fullScreenContainer: {
    flex: 1,
    position: 'relative',
  },
  fullScreenTopSafeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  fullScreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  fullScreenTitleBadge: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  fullScreenTitleText: {
    fontSize: 14,
    fontWeight: '700',
  },
  fullScreenDistanceText: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  topRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fullScreenBottomSafeArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  floatingStatsPanel: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
  },
  statColumn: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    borderLeftWidth: 1,
  },
  statLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
  },
});
