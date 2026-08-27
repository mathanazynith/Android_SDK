import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { CropRangeSlider } from '../../../../components/CropRangeSlider';
import { activityAPI, BackendActivity } from '../../../../src/services/activityApi';
import { calculateDistanceMeters } from '../../../../src/utils/distance';
import { decodePolyline } from '../../../../src/utils/polylineDecoder';

interface GPSPoint {
  latitude: number;
  longitude: number;
}

export default function CropActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activity, setActivity] = useState<BackendActivity | null>(null);
  const [gpsPoints, setGpsPoints] = useState<GPSPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(0);
  const [croppingDistance, setCroppingDistance] = useState(0);
  const mapRef = useRef<MapView>(null);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({ pathname: '/activity/[id]', params: { id: String(id) } });
  };

  async function loadActivity() {
    try {
      setLoading(true);
      const activityId = typeof id === 'string' ? parseInt(id) : id;
      const activityData = await activityAPI.get(activityId);
      console.log('[CropActivity] Backend activity:', activityData);

      setActivity(activityData);

      // The backend polyline is the route being cropped. The decoded points are
      // used only as stable start/end indices because the API has no point times.
      if (activityData.encoded_polyline) {
        const decodedPoints = decodePolyline(activityData.encoded_polyline);
        console.log('[CropActivity] Decoded backend GPS points:', decodedPoints.length);
        setGpsPoints(decodedPoints);

        if (decodedPoints.length > 0) {
          setStartIndex(0);
          setEndIndex(decodedPoints.length - 1);
          calculateCropDistance(0, decodedPoints.length - 1, decodedPoints);
        }
      }
    } catch (error) {
      console.error('Error loading activity:', error);
      Alert.alert('Error', 'Failed to load activity for cropping');
      handleBack();
    } finally {
      setLoading(false);
    }
  }

  const calculateCropDistance = (start: number, end: number, points: GPSPoint[]) => {
    if (!points || points.length === 0 || start > end) {
      setCroppingDistance(0);
      return;
    }

    let totalDistance = 0;
    for (let i = start; i < end; i++) {
      if (i < points.length - 1) {
        const distance = calculateDistanceMeters(
          {
            latitude: points[i].latitude,
            longitude: points[i].longitude,
          },
          {
            latitude: points[i + 1].latitude,
            longitude: points[i + 1].longitude,
          }
        );
        totalDistance += distance;
      }
    }

    setCroppingDistance(totalDistance);
  };

  const fitMapToRoute = (coordinates: GPSPoint[]) => {
    if (!mapRef.current || coordinates.length === 0) return;

    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
      animated: false,
    });
  };

  const handleStartIndexChange = (value: number) => {
    const newStart = Math.floor(value);
    if (newStart <= endIndex) {
      setStartIndex(newStart);
      calculateCropDistance(newStart, endIndex, gpsPoints);
    }
  };

  const handleEndIndexChange = (value: number) => {
    const newEnd = Math.floor(value);
    if (newEnd >= startIndex) {
      setEndIndex(newEnd);
      calculateCropDistance(startIndex, newEnd, gpsPoints);
    }
  };

  const handleSaveCrop = () => {
    if (gpsPoints.length === 0 || !activity) {
      Alert.alert('Error', 'No GPS points to crop');
      return;
    }

    console.log('[CropActivity] Frontend crop selection:', { startIndex, endIndex });
    Alert.alert('Crop saved', `Showing GPS points ${startIndex} through ${endIndex}.`, [
      {
        text: 'OK',
        onPress: () => router.replace({
          pathname: '/activity/[id]',
          params: {
            id: String(activity.id),
            cropStart: String(startIndex),
            cropEnd: String(endIndex),
          },
        }),
      },
    ]);
  };

  useEffect(() => {
    // The request updates its state after the screen has mounted.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadActivity();
    // The route id is the only value that can change for this screen instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#35C72B" />
          <Text style={styles.loadingText}>Loading activity...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const selectedPoints = gpsPoints.slice(startIndex, endIndex + 1);
  const hasRoute = gpsPoints.length > 1;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.cancelButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Crop</Text>
        <View style={styles.headerSpacer} />
      </View>

      {!hasRoute ? (
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>No saved GPS route is available to crop.</Text>
        </View>
      ) : (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          onMapReady={() => fitMapToRoute(gpsPoints)}
        >
        {/* Full route - faded */}
        <Polyline
          coordinates={gpsPoints}
          strokeWidth={2}
          strokeColor="rgba(32, 208, 0, 0.2)"
          lineCap="round"
          lineJoin="round"
        />

        {/* Selected route - bright */}
        <Polyline
          coordinates={selectedPoints}
          strokeWidth={5}
          strokeColor="#20D000"
          lineCap="round"
          lineJoin="round"
        />

        {/* Start marker */}
        {gpsPoints[startIndex] && (
          <Marker
            coordinate={gpsPoints[startIndex]}
            title="Start"
            pinColor="#20D000"
          />
        )}

        {/* End marker */}
        {gpsPoints[endIndex] && (
          <Marker
            coordinate={gpsPoints[endIndex]}
            title="End"
            pinColor="#FF6B6B"
          />
        )}
        </MapView>
        </View>

      <View style={styles.controlsContainer}>
        <Text style={styles.cropTitle}>Crop Workout</Text>
        <Text style={styles.pointsText}>Showing {selectedPoints.length} GPS points</Text>
        <Text style={styles.distanceText}>{(croppingDistance / 1000).toFixed(2)} km</Text>
        <View style={styles.pointLabels}>
          <Text style={styles.pointText}>Start Point: {startIndex}</Text>
          <Text style={styles.pointText}>End Point: {endIndex}</Text>
        </View>
        <CropRangeSlider
          minimumValue={0}
          maximumValue={gpsPoints.length - 1}
          startValue={startIndex}
          endValue={endIndex}
          onStartChange={handleStartIndexChange}
          onEndChange={handleEndIndexChange}
        />

        {/* Action Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSaveCrop}
          >
            <Text style={styles.saveButtonText}>Save Crop</Text>
          </TouchableOpacity>
        </View>
      </View>
      </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0E0F',
    paddingTop: 0,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#C4C8C5',
    fontSize: 16,
    marginTop: 16,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#242627',
  },
  cancelButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#393C3E',
    borderRadius: 20,
  },
  cancelText: {
    color: '#F7F7F7',
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#F7F7F7',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 60,
  },
  content: { padding: 12, paddingBottom: 20 },
  mapContainer: { height: 270, overflow: 'hidden', borderRadius: 24 },
  map: { flex: 1 },
  controlsContainer: {
    backgroundColor: '#0B0E0F',
    paddingTop: 20,
  },
  cropTitle: { color: '#F7F7F7', fontSize: 26, fontWeight: '700', textAlign: 'center' },
  pointsText: { color: '#A9ADAF', fontSize: 16, textAlign: 'center', marginTop: 5 },
  distanceText: { color: '#F7F7F7', fontSize: 22, fontWeight: '700', textAlign: 'center', marginTop: 16 },
  pointLabels: { alignItems: 'center', marginTop: 22, marginBottom: 10 },
  pointText: { color: '#F7F7F7', fontSize: 16, lineHeight: 24 },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#35C72B',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#0B0E0F',
    fontSize: 16,
    fontWeight: '700',
  },
});
