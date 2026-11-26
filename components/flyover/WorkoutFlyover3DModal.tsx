// components/flyover/WorkoutFlyover3DModal.tsx
import { Alert } from '@/components/ThemedAlert';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

const WebViewComponent = WebView as any;

import { RunningLoader } from '../common/RunningLoader';
import { useTheme } from '../../contexts/ThemeContext';
import { type BackendActivity } from '../../src/services/activityApi';
import {
  generateFlyoverHtml,
  type FlyoverGpsPoint,
} from '../../src/services/flyover3d/flyoverHtmlGenerator';
import { formatDistanceFromMeters } from '../../src/utils/activityUnitFormatters';
import { decodePolyline } from '../../src/utils/polylineDecoder';
import { formatDurationMmSs } from '../../src/utils/splitFormatters';

interface WorkoutFlyover3DModalProps {
  visible: boolean;
  onClose: () => void;
  activity?: BackendActivity | null;
  points?: FlyoverGpsPoint[];
  encodedPolyline?: string | null;
  title?: string;
  totalDistanceMeters?: number;
  totalDurationSeconds?: number;
  elevationGainMeters?: number;
  avatarUrl?: string | null;
  mapboxToken?: string | null;
  maptilerKey?: string | null;
}

export function WorkoutFlyover3DModal({
  visible,
  onClose,
  activity,
  points,
  encodedPolyline,
  title = 'Workout 3D Flyover',
  totalDistanceMeters = 0,
  totalDurationSeconds = 0,
  elevationGainMeters = 0,
  avatarUrl,
  mapboxToken,
  maptilerKey,
}: WorkoutFlyover3DModalProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<any>(null);

  const activeMapboxToken =
    mapboxToken ||
    process.env.EXPO_PUBLIC_MAPBOX_TOKEN ||
    process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
    null;
  const activeMaptilerKey =
    maptilerKey ||
    process.env.EXPO_PUBLIC_MAPTILER_KEY ||
    null;

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 4>(1);
  const [styleMode, setStyleMode] = useState<'satellite' | 'dark'>('satellite');

  // Live HUD metrics from 3D flight engine
  const [progress, setProgress] = useState(0); // 0 to 1
  const [currentDistanceMeters, setCurrentDistanceMeters] = useState(0);
  const [currentElevationMeters, setCurrentElevationMeters] = useState(0);
  const [currentElapsedSeconds, setCurrentElapsedSeconds] = useState(0);

  // Video recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatusText, setRecordingStatusText] = useState('');
  const [exportingAction, setExportingAction] = useState<'download' | 'share' | null>(null);
  const recordingChunksRef = useRef<string[]>([]);

  const resolvedPoints = useMemo<FlyoverGpsPoint[]>(() => {
    const parsePoints = (arr: unknown[]): FlyoverGpsPoint[] => {
      const result: FlyoverGpsPoint[] = [];
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue;
        const p = item as Record<string, unknown>;
        const rawLat = p.latitude ?? p.lat;
        const rawLng = p.longitude ?? p.lng ?? p.lon;
        const lat = typeof rawLat === 'number' ? rawLat : (typeof rawLat === 'string' ? parseFloat(rawLat) : NaN);
        const lng = typeof rawLng === 'number' ? rawLng : (typeof rawLng === 'string' ? parseFloat(rawLng) : NaN);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          const rawAlt = p.altitude ?? p.alt ?? p.elevation;
          const alt = typeof rawAlt === 'number' ? rawAlt : (typeof rawAlt === 'string' ? parseFloat(rawAlt) : null);
          const rawSpeed = p.speed;
          const speed = typeof rawSpeed === 'number' ? rawSpeed : null;
          result.push({
            latitude: lat,
            longitude: lng,
            altitude: alt,
            speed,
            timestamp: (p.timestamp as string | number) ?? null,
          });
        }
      }
      return result;
    };

    // 1. Try provided points or activity GPS point candidates
    const pointCandidates = [
      points,
      activity?.gps_points,
      activity?.route?.points,
      activity?.route?.gps_points,
      activity?.points,
      activity?.coordinates,
      activity?.route?.coordinates,
    ];

    for (const cand of pointCandidates) {
      if (Array.isArray(cand) && cand.length >= 2) {
        const parsed = parsePoints(cand);
        if (parsed.length >= 2) return parsed;
      }
    }

    // 2. Try encoded polylines (primary, route, planned, extra)
    const polylineCandidates = [
      encodedPolyline,
      activity?.encoded_polyline,
      activity?.route?.encoded_polyline,
      activity?.planned_encoded_polyline,
      activity?.route?.planned_encoded_polyline,
      activity?.extra_encoded_polyline,
      activity?.route?.extra_encoded_polyline,
    ];

    for (const poly of polylineCandidates) {
      if (typeof poly === 'string' && poly.trim().length > 0) {
        try {
          const decoded = decodePolyline(poly.trim());
          if (decoded && decoded.length >= 2) {
            return decoded.map((p) => ({
              latitude: p.latitude,
              longitude: p.longitude,
            }));
          }
        } catch (e) {
          console.warn('[3D Flyover] Could not decode polyline:', e);
        }
      }
    }

    // 3. Try runningRoutes if activity has multiple segmented routes
    const runningRoutes = activity?.route?.running_routes;
    if (Array.isArray(runningRoutes) && runningRoutes.length > 0) {
      const combined: FlyoverGpsPoint[] = [];
      for (const route of runningRoutes) {
        if (typeof route?.encoded_polyline === 'string' && route.encoded_polyline.trim()) {
          try {
            const decoded = decodePolyline(route.encoded_polyline.trim());
            for (const p of decoded) {
              combined.push({ latitude: p.latitude, longitude: p.longitude });
            }
          } catch {}
        }
      }
      if (combined.length >= 2) return combined;
    }

    return [];
  }, [points, encodedPolyline, activity]);

  const hasRoute = resolvedPoints.length >= 2;

  // Safety timer to guarantee loading screen dismisses even under high latency
  useEffect(() => {
    if (!visible) {
      setIsReady(false);
      setIsPlaying(false);
      setProgress(0);
      return;
    }

    if (!hasRoute) {
      setIsReady(true);
      return;
    }

    const timer = setTimeout(() => {
      setIsReady((prev) => {
        if (!prev) {
          console.log('[3D Flyover] Force-dismissing loading overlay via safety timer');
          return true;
        }
        return prev;
      });
    }, 3200);

    return () => clearTimeout(timer);
  }, [visible, hasRoute]);

  const htmlContent = useMemo(() => {
    if (!hasRoute) return '';
    return generateFlyoverHtml({
      points: resolvedPoints,
      title,
      totalDistanceMeters,
      totalDurationSeconds,
      elevationGainMeters,
      initialStyle: styleMode,
      avatarUrl,
      mapboxToken: activeMapboxToken,
      maptilerKey: activeMaptilerKey,
    });
  }, [hasRoute, resolvedPoints, title, totalDistanceMeters, totalDurationSeconds, elevationGainMeters, styleMode, avatarUrl, activeMapboxToken, activeMaptilerKey]);

  const sendCommand = useCallback((action: string, payload?: unknown) => {
    if (!webViewRef.current) return;
    const script = `
      if (window.FlyoverControls && window.FlyoverControls.${action}) {
        window.FlyoverControls.${action}(${JSON.stringify(payload ?? null)});
      }
      true;
    `;
    webViewRef.current.injectJavaScript(script);
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      sendCommand('pause');
      setIsPlaying(false);
    } else {
      sendCommand('play');
      setIsPlaying(true);
    }
  }, [isPlaying, sendCommand]);

  const handleRestart = useCallback(() => {
    sendCommand('restart');
    setIsPlaying(false);
    setProgress(0);
    setCurrentDistanceMeters(0);
    setCurrentElapsedSeconds(0);
  }, [sendCommand]);

  const handleSpeedToggle = useCallback(() => {
    const nextSpeed: 1 | 2 | 4 = playbackSpeed === 1 ? 2 : playbackSpeed === 2 ? 4 : 1;
    setPlaybackSpeed(nextSpeed);
    sendCommand('setSpeed', nextSpeed);
  }, [playbackSpeed, sendCommand]);

  const handleStyleToggle = useCallback((style: 'satellite' | 'dark') => {
    setStyleMode(style);
    sendCommand('setStyle', style);
  }, [sendCommand]);

  const handleStartExport = useCallback((targetAction: 'download' | 'share') => {
    setExportingAction(targetAction);
    setIsRecording(true);
    setRecordingStatusText('Capturing 3D frames...');
    sendCommand('startRecording');
  }, [sendCommand]);

  const handleRecordingExportReady = useCallback(async (base64Payload: string, mimeType: string) => {
    try {
      setRecordingStatusText('Processing video...');
      const cleanBase64 = base64Payload.replace(/^data:[^;]+;base64,/, '');
      const isMp4 = mimeType.includes('mp4');
      const ext = isMp4 ? 'mp4' : 'webm';
      const filename = `zyrun_3d_flyover_${Date.now()}.${ext}`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(fileUri, cleanBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (exportingAction === 'download') {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          await MediaLibrary.saveToLibraryAsync(fileUri);
          Alert.alert('Saved to Gallery', 'Your 3D Flyover video has been saved to your photo gallery!');
        } else {
          Alert.alert('Permission Denied', 'Unable to save to gallery without storage permission.');
        }
      } else if (exportingAction === 'share') {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: isMp4 ? 'video/mp4' : 'video/webm',
            dialogTitle: `Share ${title}`,
            UTI: isMp4 ? 'public.movie' : undefined,
          });
        } else {
          Alert.alert('Sharing Unavailable', 'Sharing is not available on this device.');
        }
      }
    } catch (err: any) {
      console.error('Error saving 3D flyover video:', err);
      Alert.alert('Export Error', err?.message || 'Unable to save video file.');
    } finally {
      setIsRecording(false);
      setRecordingStatusText('');
      setExportingAction(null);
    }
  }, [exportingAction, title]);

  const onWebViewMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      switch (data.type) {
        case 'READY':
          setIsReady(true);
          break;
        case 'STATE_CHANGE':
          setIsPlaying(Boolean(data.payload?.isPlaying));
          break;
        case 'PROGRESS':
          setProgress(data.payload?.progress || 0);
          setCurrentDistanceMeters(data.payload?.currentDistanceMeters || 0);
          setCurrentElevationMeters(Math.round(data.payload?.currentElevationMeters || 0));
          setCurrentElapsedSeconds(data.payload?.elapsedSeconds || 0);
          break;
        case 'PLAYBACK_COMPLETE':
          setIsPlaying(false);
          break;
        case 'RECORDING_STARTED':
          setRecordingStatusText(
            data.payload?.durationSeconds
              ? `Recording ${data.payload.durationSeconds}s 3D flyover video...`
              : 'Recording 3D flyover video...'
          );
          break;
        case 'RECORDING_CHUNK_START':
          recordingChunksRef.current = [];
          setRecordingStatusText('Preparing video file...');
          break;
        case 'RECORDING_CHUNK':
          if (typeof data.payload?.data === 'string') {
            recordingChunksRef.current.push(data.payload.data);
          }
          break;
        case 'RECORDING_CHUNK_END': {
          const assembledBase64 = recordingChunksRef.current.join('');
          recordingChunksRef.current = [];
          void handleRecordingExportReady(assembledBase64, data.payload?.mimeType || 'video/mp4');
          break;
        }
        case 'RECORDING_EXPORT_READY':
          void handleRecordingExportReady(data.payload?.base64, data.payload?.mimeType || 'video/mp4');
          break;
        case 'RECORDING_ERROR':
          recordingChunksRef.current = [];
          setIsRecording(false);
          setRecordingStatusText('');
          setExportingAction(null);
          Alert.alert('Recording Error', String(data.payload || 'Unable to record 3D flyover video.'));
          break;
        case 'NO_ROUTE':
          setIsReady(true);
          break;
        case 'ERROR':
          console.warn('[3D Flyover Error]', data.payload);
          setIsReady(true);
          break;
        default:
          break;
      }
    } catch (err) {
      console.warn('Failed to parse WebView message:', err);
    }
  }, [handleRecordingExportReady]);

  // Current pace calculation
  const currentPaceFormatted = useMemo(() => {
    if (currentDistanceMeters < 50 || currentElapsedSeconds < 5) return '--:--';
    const paceSecondsPerKm = (currentElapsedSeconds / currentDistanceMeters) * 1000;
    if (!Number.isFinite(paceSecondsPerKm) || paceSecondsPerKm > 1800) return '--:--';
    return formatDurationMmSs(Math.round(paceSecondsPerKm));
  }, [currentDistanceMeters, currentElapsedSeconds]);

  if (!visible) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {/* Top Control Header */}
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close flyover"
            onPress={onClose}
            style={styles.headerIconButton}
          >
            <Feather name="x" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.headerSubtitle}>3D Terrain Flyover</Text>
          </View>

          {/* Style Selector Pill (Satellite vs Dark) */}
          <View style={styles.stylePillContainer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Satellite view"
              onPress={() => handleStyleToggle('satellite')}
              style={[
                styles.stylePillOption,
                styleMode === 'satellite' && styles.stylePillOptionActive,
              ]}
            >
              <Feather name="globe" size={13} color={styleMode === 'satellite' ? '#000000' : '#A1A1AA'} />
              <Text
                style={[
                  styles.stylePillText,
                  styleMode === 'satellite' && styles.stylePillTextActive,
                ]}
              >
                Sat
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dark 3D view"
              onPress={() => handleStyleToggle('dark')}
              style={[
                styles.stylePillOption,
                styleMode === 'dark' && styles.stylePillOptionActive,
              ]}
            >
              <Feather name="moon" size={13} color={styleMode === 'dark' ? '#000000' : '#A1A1AA'} />
              <Text
                style={[
                  styles.stylePillText,
                  styleMode === 'dark' && styles.stylePillTextActive,
                ]}
              >
                Dark
              </Text>
            </Pressable>
          </View>
        </View>

        {/* 3D Map Viewport */}
        <View style={styles.mapViewport}>
          {!hasRoute ? (
            <View style={styles.noRouteContainer}>
              <Feather name="map-pin" size={44} color="#71717A" />
              <Text style={styles.noRouteTitle}>No GPS Route Available</Text>
              <Text style={styles.noRouteSubtitle}>
                This workout does not have enough GPS coordinates or route data to generate a 3D terrain flyover.
              </Text>
            </View>
          ) : (
            <>
              <WebViewComponent
                ref={webViewRef}
                source={{ html: htmlContent, baseUrl: 'https://localhost' }}
                style={styles.webView}
                originWhitelist={['*']}
                javaScriptEnabled
                domStorageEnabled
                androidHardwareAccelerationDisabled={false}
                androidLayerType="hardware"
                mixedContentMode="always"
                allowFileAccess
                allowFileAccessFromFileURLs
                allowUniversalAccessFromFileURLs
                mediaPlaybackRequiresUserAction={false}
                onMessage={onWebViewMessage}
                scrollEnabled={false}
                bounces={false}
              />

              {!isReady && (
                <View style={styles.loadingOverlay}>
                  <RunningLoader size={60} label="Loading 3D Terrain..." />
                </View>
              )}

              {/* Floating Glassmorphism HUD (Live Stats) */}
              {isReady && (
                <View style={styles.hudCard}>
                  <View style={styles.hudMetricItem}>
                    <Text style={styles.hudMetricLabel}>DISTANCE</Text>
                    <Text style={styles.hudMetricValue}>
                      {formatDistanceFromMeters(currentDistanceMeters, 'km')}
                    </Text>
                  </View>

                  <View style={styles.hudDivider} />

                  <View style={styles.hudMetricItem}>
                    <Text style={styles.hudMetricLabel}>TIME</Text>
                    <Text style={styles.hudMetricValue}>
                      {formatDurationMmSs(currentElapsedSeconds)}
                    </Text>
                  </View>

                  <View style={styles.hudDivider} />

                  <View style={styles.hudMetricItem}>
                    <Text style={styles.hudMetricLabel}>ELEVATION</Text>
                    <Text style={styles.hudMetricValue}>{currentElevationMeters} m</Text>
                  </View>

                  <View style={styles.hudDivider} />

                  <View style={styles.hudMetricItem}>
                    <Text style={styles.hudMetricLabel}>PACE</Text>
                    <Text style={styles.hudMetricValue}>{currentPaceFormatted}/km</Text>
                  </View>
                </View>
              )}

              {/* Recording Progress Spinner Overlay */}
              {isRecording && (
                <View style={styles.recordingOverlay}>
                  <View style={styles.recordingDialog}>
                    <ActivityIndicator size="large" color="#22C55E" />
                    <Text style={styles.recordingTitle}>{recordingStatusText || 'Recording 3D Flyover...'}</Text>
                    <Text style={styles.recordingHint}>
                      Rendering video at 30 FPS. Please do not close.
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        {/* Bottom Playback & Video Action Bar */}
        <View style={styles.bottomBar}>
          {/* Scrubber Progress Bar */}
          <View style={styles.scrubberContainer}>
            <View style={styles.scrubberTrack}>
              <View style={[styles.scrubberProgress, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
            <Text style={styles.scrubberTime}>
              {formatDurationMmSs(currentElapsedSeconds)} / {formatDurationMmSs(totalDurationSeconds)}
            </Text>
          </View>

          {/* Player Action Row */}
          <View style={styles.playerControlsRow}>
            {/* Speed Toggle */}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Speed ${playbackSpeed}x`}
              onPress={handleSpeedToggle}
              style={styles.controlPillButton}
            >
              <Text style={styles.controlPillButtonText}>{playbackSpeed}×</Text>
            </TouchableOpacity>

            {/* Restart Button */}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Restart flyover"
              onPress={handleRestart}
              style={styles.playbackCircleButton}
            >
              <Feather name="rotate-ccw" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Main Play / Pause Button */}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
              disabled={!hasRoute || !isReady}
              onPress={handleTogglePlay}
              style={[styles.playPauseMainButton, (!hasRoute || !isReady) && styles.buttonDisabled]}
            >
              <Feather name={isPlaying ? 'pause' : 'play'} size={26} color="#090B0A" />
            </TouchableOpacity>

            {/* Download Video Button */}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Download 3D Video"
              disabled={!hasRoute || isRecording || !isReady}
              onPress={() => handleStartExport('download')}
              style={[styles.actionExportButton, (!hasRoute || isRecording || !isReady) && styles.buttonDisabled]}
            >
              <Feather name="download" size={18} color="#FFFFFF" />
              <Text style={styles.actionExportText}>Download</Text>
            </TouchableOpacity>

            {/* Share Video Button */}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Share 3D Video"
              disabled={!hasRoute || isRecording || !isReady}
              onPress={() => handleStartExport('share')}
              style={[styles.actionExportButton, styles.actionShareButton, (!hasRoute || isRecording || !isReady) && styles.buttonDisabled]}
            >
              <Feather name="share-2" size={18} color="#000000" />
              <Text style={[styles.actionExportText, styles.actionShareText]}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090B0A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#090B0A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#22C55E',
    marginTop: 1,
  },
  stylePillContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    padding: 3,
  },
  stylePillOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  stylePillOptionActive: {
    backgroundColor: '#22C55E',
  },
  stylePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A1A1AA',
  },
  stylePillTextActive: {
    color: '#000000',
  },
  mapViewport: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000000',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: '#090B0A',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  hudCard: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    backgroundColor: 'rgba(9, 11, 10, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  hudMetricItem: {
    alignItems: 'center',
  },
  hudMetricLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#A1A1AA',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  hudMetricValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  hudDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  recordingOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 30,
    padding: 24,
  },
  recordingDialog: {
    backgroundColor: '#16191D',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    maxWidth: 320,
    width: '100%',
  },
  recordingTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 14,
    textAlign: 'center',
  },
  recordingHint: {
    color: '#A1A1AA',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 16,
  },
  bottomBar: {
    backgroundColor: '#090B0A',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  scrubberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  scrubberTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  scrubberProgress: {
    height: '100%',
    backgroundColor: '#22C55E',
    borderRadius: 3,
  },
  scrubberTime: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A1A1AA',
    fontVariant: ['tabular-nums'],
  },
  playerControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  controlPillButton: {
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlPillButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  playbackCircleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPauseMainButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22C55E',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  actionExportButton: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionShareButton: {
    backgroundColor: '#22C55E',
  },
  actionExportText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  actionShareText: {
    color: '#000000',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  noRouteContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#090B0A',
  },
  noRouteTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 16,
    textAlign: 'center',
  },
  noRouteSubtitle: {
    fontSize: 13,
    color: '#A1A1AA',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 18,
  },
});
