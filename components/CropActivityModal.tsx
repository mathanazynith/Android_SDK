import { Feather } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import api from '../service/api';
import { BackendActivity } from '../src/services/activityApi';
import { calculateDistanceMeters } from '../src/utils/distance';
import { decodePolyline } from '../src/utils/polylineDecoder';
import { CustomSlider } from './CustomSlider';

interface GPSPoint {
  latitude: number;
  longitude: number;
}

interface CropActivityModalProps {
  isVisible: boolean;
  activity: BackendActivity;
  onClose: () => void;
  onCropComplete: () => void;
}

export default function CropActivityModal({
  isVisible,
  activity,
  onClose,
  onCropComplete,
}: CropActivityModalProps) {
  const [gpsPoints, setGpsPoints] = useState<GPSPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(0);
  const [croppingDistance, setCroppingDistance] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const mapRef = useRef<MapView>(null);

  // Fetch GPS points when modal opens
  useEffect(() => {
    if (isVisible && activity.id) {
      loadGPSPoints();
    }
  }, [isVisible, activity.id]);

  const loadGPSPoints = async () => {
    setLoading(true);
    try {
      // Decode GPS points from encoded polyline in the activity's route data
      if (!activity.encoded_polyline) {
        console.warn('No encoded polyline available');
        setGpsPoints([]);
        setLoading(false);
        return;
      }

      // Decode the polyline to get GPS coordinates
      const decodedPoints = decodePolyline(activity.encoded_polyline);
      console.log('[CropModal] Decoded points:', decodedPoints.length);

      setGpsPoints(decodedPoints);

      if (decodedPoints.length > 0) {
        setStartIndex(0);
        setEndIndex(decodedPoints.length - 1);
        calculateCropDistance(0, decodedPoints.length - 1, decodedPoints);
      }
    } catch (error) {
      console.error('Error loading GPS points:', error);
      Alert.alert('Error', 'Failed to decode route data for cropping');
    } finally {
      setLoading(false);
    }
  };

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

  const handleSaveCrop = async () => {
    if (gpsPoints.length === 0) {
      Alert.alert('Error', 'No GPS points available');
      return;
    }

    setIsSaving(true);
    try {
      // Call backend to crop the activity
      // For now, just show success since backend endpoint isn't implemented
      const response = await api.post(`/rundata/activities/${activity.id}/crop/`, {
        start_index: startIndex,
        end_index: endIndex,
      });

      if (response.data?.success) {
        Alert.alert('Success', 'Activity cropped successfully!', [
          { text: 'OK', onPress: onCropComplete },
        ]);
      }
    } catch (error) {
      console.error('Error cropping activity:', error);
      Alert.alert('Error', 'Failed to crop activity. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const getMapRegion = () => {
    if (gpsPoints.length === 0) {
      return {
        latitude: 0,
        longitude: 0,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };
    }

    const lats = gpsPoints.map((p) => p.latitude);
    const lons = gpsPoints.map((p) => p.longitude);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: Math.max(maxLat - minLat, 0.0922) * 1.2,
      longitudeDelta: Math.max(maxLon - minLon, 0.0421) * 1.2,
    };
  };

  const getPolylineCoordinates = () => {
    return gpsPoints.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    }));
  };

  const getSelectedPolylineCoordinates = () => {
    return gpsPoints.slice(startIndex, endIndex + 1).map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    }));
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Feather name="x" size={24} color="#F7F7F7" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Crop Workout</Text>
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#35C72B" />
            <Text style={styles.loadingText}>Loading GPS points...</Text>
          </View>
        ) : gpsPoints.length === 0 ? (
          <View style={styles.centerContainer}>
            <Feather name="alert-circle" size={48} color="#FFB020" />
            <Text style={styles.errorText}>No GPS points available for this activity</Text>
            <TouchableOpacity style={styles.closeModalButton} onPress={onClose}>
              <Text style={styles.closeModalButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Map */}
            <View style={styles.mapContainer}>
              <MapView
                ref={mapRef}
                provider={PROVIDER_GOOGLE}
                style={styles.map}
                initialRegion={getMapRegion()}
              >
                {/* Full route */}
                <Polyline
                  coordinates={getPolylineCoordinates()}
                  strokeWidth={3}
                  strokeColor="rgba(32, 208, 0, 0.3)"
                  lineCap="round"
                  lineJoin="round"
                />

                {/* Selected portion */}
                <Polyline
                  coordinates={getSelectedPolylineCoordinates()}
                  strokeWidth={5}
                  strokeColor="#20D000"
                  lineCap="round"
                  lineJoin="round"
                />

                {/* Start marker */}
                {gpsPoints[startIndex] && (
                  <Marker
                    coordinate={{
                      latitude: gpsPoints[startIndex].latitude,
                      longitude: gpsPoints[startIndex].longitude,
                    }}
                    title="Start Point"
                    pinColor="#20D000"
                  />
                )}

                {/* End marker */}
                {gpsPoints[endIndex] && (
                  <Marker
                    coordinate={{
                      latitude: gpsPoints[endIndex].latitude,
                      longitude: gpsPoints[endIndex].longitude,
                    }}
                    title="End Point"
                    pinColor="#FF6B6B"
                  />
                )}
              </MapView>
            </View>

            {/* Stats */}
            <View style={styles.statsContainer}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Total GPS Points</Text>
                <Text style={styles.statValue}>{gpsPoints.length}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Showing Points</Text>
                <Text style={styles.statValue}>{endIndex - startIndex + 1}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Cropped Distance</Text>
                <Text style={styles.statValue}>{(croppingDistance / 1000).toFixed(2)} km</Text>
              </View>
            </View>

            {/* Start Index Slider */}
            <View style={styles.sliderContainer}>
              <Text style={styles.sliderLabel}>Start Point</Text>
              <View style={styles.sliderContent}>
                <Text style={styles.sliderValue}>{startIndex}</Text>
                <CustomSlider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={gpsPoints.length - 1}
                  value={startIndex}
                  onValueChange={handleStartIndexChange}
                  minimumTrackTintColor="#20D000"
                  maximumTrackTintColor="#393C3E"
                  thumbTintColor="#20D000"
                  step={1}
                />
                <Text style={styles.sliderRange}>0 - {gpsPoints.length - 1}</Text>
              </View>
            </View>

            {/* End Index Slider */}
            <View style={styles.sliderContainer}>
              <Text style={styles.sliderLabel}>End Point</Text>
              <View style={styles.sliderContent}>
                <Text style={styles.sliderValue}>{endIndex}</Text>
                <CustomSlider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={gpsPoints.length - 1}
                  value={endIndex}
                  onValueChange={handleEndIndexChange}
                  minimumTrackTintColor="#FF6B6B"
                  maximumTrackTintColor="#393C3E"
                  thumbTintColor="#FF6B6B"
                  step={1}
                />
                <Text style={styles.sliderRange}>0 - {gpsPoints.length - 1}</Text>
              </View>
            </View>

            {/* Info Box */}
            <View style={styles.infoBox}>
              <Feather name="info" size={16} color="#8BE9A8" />
              <Text style={styles.infoText}>
                Select the start and end points to crop your workout. The green route shows your selection.
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                onPress={handleSaveCrop}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#0B0E0F" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Crop</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0E0F',
    paddingTop: Platform.OS === 'android' ? 0 : 0,
  },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#242627',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#F7F7F7',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    color: '#C4C8C5',
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  errorText: {
    color: '#C4C8C5',
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  closeModalButton: {
    backgroundColor: '#35C72B',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 24,
  },
  closeModalButtonText: {
    color: '#0B0E0F',
    fontSize: 16,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingTop: 8,
  },
  mapContainer: {
    width: '100%',
    height: 260,
    marginBottom: 12,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 20,
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#242627',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#393C3E',
    padding: 12,
    alignItems: 'center',
  },
  statLabel: {
    color: '#A9ADAF',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  statValue: {
    color: '#35C72B',
    fontSize: 16,
    fontWeight: '700',
  },
  sliderContainer: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  sliderLabel: {
    color: '#F7F7F7',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  sliderContent: {
    backgroundColor: '#242627',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#393C3E',
    padding: 12,
  },
  sliderValue: {
    color: '#8BE9A8',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderRange: {
    color: '#A9ADAF',
    fontSize: 11,
    marginTop: 8,
  },
  infoBox: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 20,
    backgroundColor: 'rgba(139, 233, 168, 0.1)',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    alignItems: 'flex-start',
  },
  infoText: {
    color: '#8BE9A8',
    fontSize: 12,
    flex: 1,
  },
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#393C3E',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#F7F7F7',
    fontSize: 16,
    fontWeight: '700',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#35C72B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#0B0E0F',
    fontSize: 16,
    fontWeight: '700',
  },
});
