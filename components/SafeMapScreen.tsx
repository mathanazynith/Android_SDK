// app/components/SafeMapScreen.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import MapScreen from '../app/(app)/screens/map';
import { RunningLoader } from './common/RunningLoader';
import ENV from '../env';
import ErrorBoundary from './ErrorBoundary';
import * as Location from 'expo-location';

export default function SafeMapScreen() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationStatus, setLocationStatus] = useState<string>('Checking...');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const runInit = async () => {
      try {
        // Step 1: Check API Key
        const apiKey = ENV.GOOGLE_MAPS_API_KEY;
        
        if (!apiKey || apiKey.length < 20) {
          if (!cancelled) {
            setError('Google Maps API Key is invalid or missing.');
            setLoading(false);
          }
          return;
        }

        // Step 2: Check Location Permissions
        const { status } = await Location.requestForegroundPermissionsAsync();
        
        if (status !== 'granted') {
          if (!cancelled) {
            setError('Location permission is required for the map to work.');
            setLocationStatus('Permission denied');
            setLoading(false);
          }
          return;
        }

        if (!cancelled) setLocationStatus('Permission granted');

        // Step 3: Try to get current location
        try {
          await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Highest,
          });
          if (!cancelled) setLocationStatus('Location obtained ✓');
        } catch (locError) {
          console.warn('⚠️ Could not get initial location:', locError);
          if (!cancelled) setLocationStatus('Location pending...');
          // Still proceed - map will show user location eventually
        }

        // Step 4: Everything is ready
        if (!cancelled) {
          setIsReady(true);
          setLoading(false);
        }

      } catch (err: any) {
        console.error('❌ Map initialization error:', err);
        if (!cancelled) {
          setError(err?.message || 'Failed to initialize map');
          setLoading(false);
        }
      }
    };

    void runInit();

    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setLocationStatus('Checking...');
    setRetryCount((prev) => prev + 1);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <RunningLoader size={64} label={locationStatus || 'Initializing Map...'} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorEmoji}>⚠️</Text>
        <Text style={styles.errorTitle}>Map Failed to Load</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.errorDetails}>
          {Platform.OS === 'android' 
            ? 'Check: Google Play Services, API Key, Permissions' 
            : 'Check: API Key and Permissions'}
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.text}>Map is not ready</Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <MapScreen />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0B0E0F',
    padding: 20,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 15,
  },
  statusText: {
    color: '#A0A0A0',
    fontSize: 14,
    marginTop: 8,
  },
  errorEmoji: {
    fontSize: 50,
    marginBottom: 15,
  },
  errorTitle: {
    color: '#FF6B6B',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  errorDetails: {
    color: '#A0A0A0',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 25,
  },
  retryButton: {
    backgroundColor: '#208AEF',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 20,
  },
});