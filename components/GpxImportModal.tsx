import { Alert } from '@/components/ThemedAlert';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useTheme } from '../contexts/ThemeContext';
import { activityAPI, type BackendActivity } from '../src/services/activityApi';
import { parseGpxWorkout, type GpxWorkoutPreview } from '../src/services/gpxService';
import { formatDistanceFromMeters } from '../src/utils/activityUnitFormatters';
import { formatDurationMmSs } from '../src/utils/splitFormatters';

const WebViewComponent = WebView as any;

interface GpxImportModalProps {
  visible: boolean;
  onClose: () => void;
  onImported: (activity: BackendActivity) => void;
}

export function GpxImportModal({ visible, onClose, onImported }: GpxImportModalProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [preview, setPreview] = useState<GpxWorkoutPreview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const resetState = useCallback(() => {
    setPreview(null);
    setParseError(null);
    setIsReadingFile(false);
    setIsImporting(false);
  }, []);

  const handleClose = useCallback(() => {
    if (isImporting) return;
    resetState();
    onClose();
  }, [isImporting, onClose, resetState]);

  const pickerHtml = useMemo(() => {
    const bg = colors.surface;
    const text = colors.text;
    const sub = colors.textSecondary;
    const accent = colors.primary;
    const border = colors.border;

    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%; height: 100%;
      background: ${bg};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex; align-items: center; justify-content: center;
      overflow: hidden;
    }
    .drop-btn {
      width: 100%;
      height: 100%;
      border: 1.5px dashed ${border};
      border-radius: 16px;
      background: transparent;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      padding: 16px;
      text-align: center;
      position: relative;
    }
    .drop-btn:active { opacity: 0.75; }
    .icon-circle {
      width: 44px; height: 44px; border-radius: 22px;
      background: ${accent}22;
      display: flex; align-items: center; justify-content: center;
      color: ${accent};
    }
    .title { font-size: 15px; font-weight: 700; color: ${text}; }
    .hint { font-size: 12px; color: ${sub}; }
    input[type="file"] {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <label class="drop-btn">
    <div class="icon-circle">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 4H7a4 4 0 0 0-4 4v9a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4V8a4 4 0 0 0-4-4h-3"/>
        <path d="M12 2v11m-4-4 4 4 4-4"/>
      </svg>
    </div>
    <div class="title">Choose .GPX File</div>
    <div class="hint">Tap to browse Downloads, Drive, or Files</div>
    <input id="gpxInput" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml,*/*" />
  </label>
  <script>
    const input = document.getElementById('gpxInput');
    function post(type, payload) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type, payload }));
      }
    }
    input.addEventListener('change', function(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      post('FILE_READING', { name: file.name || 'workout.gpx' });
      const reader = new FileReader();
      reader.onload = function() {
        post('FILE_LOADED', {
          name: file.name || 'workout.gpx',
          content: String(reader.result || '')
        });
        input.value = '';
      };
      reader.onerror = function() {
        post('FILE_ERROR', { message: 'Could not read the selected GPX file.' });
        input.value = '';
      };
      reader.readAsText(file);
    });
  </script>
</body>
</html>`;
  }, [colors.border, colors.primary, colors.surface, colors.text, colors.textSecondary]);

  const handlePickerMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'FILE_READING') {
        setIsReadingFile(true);
        setParseError(null);
      } else if (msg.type === 'FILE_LOADED') {
        setIsReadingFile(false);
        const fileName = String(msg.payload?.name || 'workout.gpx');
        const content = String(msg.payload?.content || '');
        try {
          const parsed = parseGpxWorkout(content, fileName);
          setPreview(parsed);
          setParseError(null);
        } catch (err: any) {
          setPreview(null);
          setParseError(err?.message || 'Invalid GPX file.');
        }
      } else if (msg.type === 'FILE_ERROR') {
        setIsReadingFile(false);
        setParseError(String(msg.payload?.message || 'Failed to read file.'));
      }
    } catch {
      setIsReadingFile(false);
    }
  }, []);

  const handleConfirmImport = useCallback(async () => {
    if (!preview || isImporting) return;
    setIsImporting(true);
    try {
      const created = await activityAPI.importGpxWorkout(preview);
      resetState();
      onImported(created);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        'Could not import this GPX workout.';
      Alert.alert('GPX Import Failed', String(message));
    } finally {
      setIsImporting(false);
    }
  }, [isImporting, onImported, preview, resetState]);

  const toggleActivityType = useCallback((nextType: 'RUN' | 'WALK') => {
    setPreview((prev) => (prev ? { ...prev, activityType: nextType } : prev));
  }, []);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              marginBottom: Math.max(16, insets.bottom),
            },
          ]}
        >
          <View style={styles.header}>
            <View>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Import GPX Workout</Text>
              <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                Upload a .gpx file to view route & 3D Flyover
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close GPX import"
              disabled={isImporting}
              onPress={handleClose}
              style={[styles.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
            >
              <Feather name="x" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.pickerContainer}>
            <WebViewComponent
              source={{ html: pickerHtml }}
              style={styles.pickerWebView}
              originWhitelist={['*']}
              javaScriptEnabled
              allowFileAccess
              allowUniversalAccessFromFileURLs
              onMessage={handlePickerMessage}
              scrollEnabled={false}
            />
          </View>

          {isReadingFile && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.statusText, { color: colors.textSecondary }]}>Parsing GPX file...</Text>
            </View>
          )}

          {parseError && (
            <View style={[styles.errorBox, { borderColor: '#EF4444' }]}>
              <Feather name="alert-circle" size={16} color="#EF4444" />
              <Text style={styles.errorText}>{parseError}</Text>
            </View>
          )}

          {preview && (
            <View style={[styles.previewCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={styles.previewHeader}>
                <Feather name="file-text" size={16} color={colors.primary} />
                <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                  {preview.fileName}
                </Text>
              </View>

              <View style={styles.typeToggleRow}>
                {(['RUN', 'WALK'] as const).map((type) => {
                  const active = preview.activityType === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      onPress={() => toggleActivityType(type)}
                      style={[
                        styles.typeChip,
                        {
                          backgroundColor: active ? colors.primary : 'transparent',
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={type === 'RUN' ? 'run' : 'walk'}
                        size={15}
                        color={active ? '#FFFFFF' : colors.textSecondary}
                      />
                      <Text style={[styles.typeChipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                        {type === 'RUN' ? 'Run' : 'Walk'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.metricsRow}>
                <View style={styles.metricItem}>
                  <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>DISTANCE</Text>
                  <Text style={[styles.metricValue, { color: colors.text }]}>
                    {formatDistanceFromMeters(preview.distanceMeters, 'km')}
                  </Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>DURATION</Text>
                  <Text style={[styles.metricValue, { color: colors.text }]}>
                    {formatDurationMmSs(preview.elapsedSeconds)}
                  </Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>GPS POINTS</Text>
                  <Text style={[styles.metricValue, { color: colors.text }]}>
                    {preview.points.length.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>
          )}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Import GPX workout"
            disabled={!preview || isImporting}
            onPress={() => void handleConfirmImport()}
            style={[
              styles.importBtn,
              {
                backgroundColor: preview ? colors.primary : colors.border,
                opacity: !preview || isImporting ? 0.65 : 1,
              },
            ]}
          >
            {isImporting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Feather name="check" size={18} color="#FFFFFF" />
            )}
            <Text style={styles.importBtnText}>
              {isImporting ? 'Importing Workout...' : 'Import Workout'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerContainer: {
    height: 128,
    borderRadius: 16,
    overflow: 'hidden',
  },
  pickerWebView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    fontSize: 13,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#EF4444',
  },
  previewCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fileName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  typeToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  metricItem: {
    gap: 2,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  importBtn: {
    height: 46,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  importBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
