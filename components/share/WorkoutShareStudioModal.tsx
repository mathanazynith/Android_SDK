import React, { useMemo, useRef, useState } from 'react';
import {
  Clipboard,
  Dimensions,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { BackendActivity } from '../../src/services/activityApi';
import { shareActivityAsGpx } from '../../src/services/gpxFileExport';
import { RunningCoordinate } from '../../src/types/running';
import { buildGoogleMapsRouteUrl, formatWorkoutSharePost, parseCoordinate } from '../../src/utils/googleMapsRouteUrl';
import { decodePolyline } from '../../src/utils/polylineDecoder';
import { formatDurationMmSs as formatDuration } from '../../src/utils/splitFormatters';
import { WorkoutShareCard } from './WorkoutShareCard';
import { WORKOUT_SHARE_THEMES, WorkoutShareTheme } from './workoutShareThemes';

export interface WorkoutShareStudioModalProps {
  visible: boolean;
  onClose: () => void;
  activity: BackendActivity | null;
  distanceUnit?: string | null;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Automatically picks a matching theme from the activity distance or workout type.
 */
function autoSelectTheme(activity: BackendActivity | null): string {
  if (!activity) return 'warmup';

  const distanceMeters = activity.distance ?? 0;
  const activityType = (activity.activity_type ?? '').toUpperCase();

  if (activityType.includes('WARM') || distanceMeters < 2000) return 'warmup';
  if (activityType.includes('TRAIL')) return 'trail_run';
  if (distanceMeters >= 40_000) return 'marathon';
  if (distanceMeters >= 20_000) return 'half_marathon';
  if (distanceMeters >= 9_500) return 'ten_k';
  if (distanceMeters >= 4_500) return 'five_k';
  if (activityType === 'WALK') return 'recovery_run';
  if (activity.elevation_gain && activity.elevation_gain > 100) return 'hill_repeats';

  return 'warmup';
}

export const WorkoutShareStudioModal: React.FC<WorkoutShareStudioModalProps> = ({
  visible,
  onClose,
  activity,
}) => {
  const { colors, isDark } = useTheme();

  const defaultThemeId = useMemo(() => autoSelectTheme(activity), [activity]);
  const cardRef = useRef<View>(null);
  const [selectedThemeId, setSelectedThemeId] = useState<string>(defaultThemeId);
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [customSubtitle, setCustomSubtitle] = useState<string | null>(null);
  const [showRouteThumbnail, setShowRouteThumbnail] = useState<boolean>(true);
  const [isExportingGpx, setIsExportingGpx] = useState(false);
  const [isSharingImage, setIsSharingImage] = useState(false);
  const [isSharingText, setIsSharingText] = useState(false);

  const countWords = (text: string) => {
    if (!text || !text.trim()) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  };

  const handleCustomTitleChange = (text: string) => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const subWords = countWords(customSubtitle ?? '');
    if (words.length + subWords <= 25) {
      setCustomTitle(text);
    } else {
      const allowed = Math.max(1, 25 - subWords);
      setCustomTitle(words.slice(0, allowed).join(' '));
    }
  };

  const handleCustomSubtitleChange = (text: string) => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const titleWords = countWords(customTitle ?? '');
    if (words.length + titleWords <= 25) {
      setCustomSubtitle(text);
    } else {
      const allowed = Math.max(0, 25 - titleWords);
      setCustomSubtitle(words.slice(0, allowed).join(' '));
    }
  };

  // When activity changes, re-sync default theme and reset custom text
  React.useEffect(() => {
    setSelectedThemeId(autoSelectTheme(activity));
    setCustomTitle(null);
    setCustomSubtitle(null);
  }, [activity]);

  // Extract coordinates from activity route or encoded polyline
  const coordinates: RunningCoordinate[] = useMemo(() => {
    if (!activity) return [];

    // 1. Check direct coordinates array in route object
    const routeCoords = activity.route?.coordinates ?? activity.route?.points ?? activity.route?.gps_points ?? [];
    if (routeCoords.length > 0) {
      const parsed = routeCoords.map((pt) => parseCoordinate(pt)).filter(Boolean) as RunningCoordinate[];
      if (parsed.length > 0) return parsed;
    }

    // 2. Check top-level gps_points if present
    const rawGpsPoints = activity.route?.gps_points ?? [];
    if (rawGpsPoints.length > 0) {
      const parsed = rawGpsPoints.map((pt) => parseCoordinate(pt)).filter(Boolean) as RunningCoordinate[];
      if (parsed.length > 0) return parsed;
    }

    // 3. Decode encoded_polyline (official backend format)
    const encoded = activity.encoded_polyline ?? activity.route?.encoded_polyline;
    if (encoded && typeof encoded === 'string' && encoded.trim().length > 0) {
      try {
        const decoded = decodePolyline(encoded);
        if (decoded.length > 0) {
          return decoded.map((pt) => parseCoordinate(pt)).filter(Boolean) as RunningCoordinate[];
        }
      } catch (err) {
        console.warn('[WorkoutShareStudioModal] Failed to decode polyline string', err);
      }
    }

    return [];
  }, [activity]);

  // Google Maps Directions link for the run track
  const googleMapsUrl = useMemo(() => {
    return buildGoogleMapsRouteUrl(coordinates);
  }, [coordinates]);

  // Distance formatting
  const distanceKm = useMemo(() => {
    if (!activity?.distance) return '5.00';
    return (activity.distance / 1000).toFixed(2);
  }, [activity?.distance]);

  // Duration formatting
  const durationText = useMemo(() => {
    if (!activity) return '25:30';
    const seconds = activity.moving_time || activity.elapsed_time || 0;
    return formatDuration(seconds);
  }, [activity]);

  // Pace formatting
  const paceText = useMemo(() => {
    if (!activity?.avg_pace) return '05:06';
    const paceSec = Math.round(activity.avg_pace);
    const mins = Math.floor(paceSec / 60);
    const secs = paceSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [activity?.avg_pace]);

  // Elevation formatting
  const elevationText = useMemo(() => {
    return activity?.elevation_gain ? String(Math.round(activity.elevation_gain)) : '34';
  }, [activity?.elevation_gain]);

  // Card size calculations to strictly preserve 571 x 1024 artwork aspect ratio
  const cardWidth = Math.min(SCREEN_WIDTH - 44, 330);
  const cardHeight = Math.round(cardWidth * (1024 / 571));

  const handleOpenGoogleMaps = async () => {
    if (!googleMapsUrl) return;
    try {
      await Linking.openURL(googleMapsUrl);
    } catch (err) {
      console.warn('[WorkoutShareStudioModal] Failed to open Google Maps URL', err);
    }
  };

  const handleShareImage = async () => {
    if (isSharingImage || !cardRef.current) return;
    setIsSharingImage(true);
    try {
      const activeThemeObj =
        WORKOUT_SHARE_THEMES[selectedThemeId] ??
        WORKOUT_SHARE_THEMES.warmup ??
        WORKOUT_SHARE_THEMES.easy_run;

      const titleToShare =
        customTitle !== null && customTitle.trim().length > 0
          ? customTitle.trim()
          : activeThemeObj.name;

      if (customTitle !== null && !customTitle.trim()) {
        setCustomTitle(activeThemeObj.name);
      }
      if (customSubtitle !== null && !customSubtitle.trim()) {
        setCustomSubtitle(activeThemeObj.subtitle);
      }

      // Format complete workout post text with metrics & Google Maps route link
      const message = formatWorkoutSharePost({
        title: titleToShare,
        distanceKm,
        durationText,
        paceText,
        elevationText,
        googleMapsUrl,
      });

      // 1. Copy formatted text post & GPS route link to clipboard so it is ready in all apps
      try {
        Clipboard.setString(message);
      } catch (clipErr) {
        console.warn('[WorkoutShareStudioModal] Clipboard error', clipErr);
      }

      // Small pause to let any state changes render into native view
      await new Promise((resolve) => setTimeout(resolve, 100));

      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 0.98,
        result: 'tmpfile',
      });

      // 2. Open native share sheet with the captured trading card image
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `${titleToShare} - ${distanceKm} km`,
          UTI: 'public.png',
        });
      } else {
        await handleShareTextPost();
      }
    } catch (err) {
      console.warn('[WorkoutShareStudioModal] Error sharing image, falling back to text', err);
      await handleShareTextPost();
    } finally {
      setIsSharingImage(false);
    }
  };

  const handleShareTextPost = async () => {
    if (isSharingText) return;
    setIsSharingText(true);
    try {
      const activeThemeObj =
        WORKOUT_SHARE_THEMES[selectedThemeId] ??
        WORKOUT_SHARE_THEMES.warmup ??
        WORKOUT_SHARE_THEMES.easy_run;

      // When sharing without any custom heading, fill it with default theme text
      const titleToShare =
        customTitle !== null && customTitle.trim().length > 0
          ? customTitle.trim()
          : activeThemeObj.name;

      if (customTitle !== null && !customTitle.trim()) {
        setCustomTitle(activeThemeObj.name);
      }
      if (customSubtitle !== null && !customSubtitle.trim()) {
        setCustomSubtitle(activeThemeObj.subtitle);
      }

      const message = formatWorkoutSharePost({
        title: titleToShare,
        distanceKm,
        durationText,
        paceText,
        elevationText,
        googleMapsUrl,
      });

      const sharePayload: { title?: string; message: string; url?: string } = {
        title: `${titleToShare} - ${distanceKm} km`,
        message,
      };

      if (Platform.OS === 'ios' && googleMapsUrl) {
        sharePayload.url = googleMapsUrl;
      }

      await Share.share(sharePayload);
    } catch (err) {
      console.warn('[WorkoutShareStudioModal] Share post error', err);
    } finally {
      setIsSharingText(false);
    }
  };

  const handleExportGpx = async () => {
    if (!activity || isExportingGpx) return;
    setIsExportingGpx(true);
    try {
      await shareActivityAsGpx(activity);
    } catch (err) {
      console.warn('[WorkoutShareStudioModal] GPX export error', err);
    } finally {
      setIsExportingGpx(false);
    }
  };

  const themeList = Object.values(WORKOUT_SHARE_THEMES);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={colors.background}
        />

        {/* Modal Top Bar */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Workout Share Card</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              Tap text on card to edit (max 25 words)
            </Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="Close share card studio"
            onPress={onClose}
            style={[styles.closeButton, { backgroundColor: colors.surface }]}
          >
            <Feather name="x" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* THE CARD PREVIEW */}
          <View style={styles.cardContainer}>
            <WorkoutShareCard
              ref={cardRef}
              themeId={selectedThemeId}
              title={customTitle !== null ? customTitle : undefined}
              subtitle={customSubtitle !== null ? customSubtitle : undefined}
              distanceKm={distanceKm}
              timeFormatted={durationText}
              paceFormatted={paceText}
              elevationMeters={elevationText}
              coordinates={coordinates}
              cardWidth={cardWidth}
              cardHeight={cardHeight}
              isEditable
              showRouteThumbnail={showRouteThumbnail}
              onTitleChange={handleCustomTitleChange}
              onSubtitleChange={handleCustomSubtitleChange}
              onPressCard={handleShareImage}
              onToggleRouteMap={() => setShowRouteThumbnail((prev) => !prev)}
            />
          </View>

          {/* THEME PICKER CAROUSEL */}
          <View style={styles.themeSection}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              CHOOSE THEME
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.themeList}
            >
              {themeList.map((themeItem: WorkoutShareTheme) => {
                const isSelected = themeItem.id === selectedThemeId;
                return (
                  <TouchableOpacity
                    key={themeItem.id}
                    onPress={() => {
                      setSelectedThemeId(themeItem.id);
                      setCustomTitle(null);
                      setCustomSubtitle(null);
                    }}
                    style={[
                      styles.themePill,
                      {
                        backgroundColor: isSelected ? themeItem.primaryColor : colors.surface,
                        borderColor: isSelected ? themeItem.glowColor : colors.border,
                      },
                    ]}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.themeDot,
                        { backgroundColor: isSelected ? '#FFFFFF' : themeItem.primaryColor },
                      ]}
                    />
                    <Text
                      style={[
                        styles.themeName,
                        {
                          color: isSelected ? '#FFFFFF' : colors.text,
                          fontWeight: isSelected ? '800' : '600',
                        },
                      ]}
                    >
                      {themeItem.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* ACTION BUTTONS */}
          <View style={styles.actionsSection}>
            {/* Primary Action: Share */}
            <TouchableOpacity
              onPress={handleShareImage}
              disabled={isSharingImage}
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
            >
              <Feather name="share-2" size={18} color={colors.primaryText} />
              <Text style={[styles.primaryButtonText, { color: colors.primaryText }]}>
                {isSharingImage ? 'Sharing...' : 'Share'}
              </Text>
            </TouchableOpacity>

            {/* Toggle Route Map on Card (Remove / Add Map) */}
            {coordinates.length > 1 ? (
              <TouchableOpacity
                onPress={() => setShowRouteThumbnail((prev) => !prev)}
                style={[
                  styles.utilityButton,
                  {
                    backgroundColor: showRouteThumbnail ? 'rgba(34, 211, 238, 0.12)' : colors.surface,
                    borderColor: showRouteThumbnail ? '#22D3EE' : colors.border,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Feather
                  name={showRouteThumbnail ? 'slash' : 'map-pin'}
                  size={16}
                  color={showRouteThumbnail ? '#22D3EE' : colors.text}
                />
                <Text
                  style={[
                    styles.utilityButtonText,
                    {
                      color: showRouteThumbnail ? '#22D3EE' : colors.text,
                      fontWeight: '700',
                    },
                  ]}
                >
                  {showRouteThumbnail ? 'Remove Map from Card' : 'Add Map to Card'}
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Quick Open in Google Maps */}
            {googleMapsUrl ? (
              <TouchableOpacity
                onPress={handleOpenGoogleMaps}
                style={[
                  styles.utilityButton,
                  { backgroundColor: colors.surface, borderColor: 'rgba(16, 185, 129, 0.5)' },
                ]}
                activeOpacity={0.8}
              >
                <Feather name="map" size={16} color="#10B981" />
                <Text style={[styles.utilityButtonText, { color: colors.text, fontWeight: '700' }]}>
                  View Track in Google Maps
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Export Raw GPX */}
            <TouchableOpacity
              onPress={handleExportGpx}
              disabled={isExportingGpx}
              style={[
                styles.utilityButton,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              activeOpacity={0.8}
            >
              <Feather name="download" size={16} color={colors.textSecondary} />
              <Text style={[styles.utilityButtonText, { color: colors.textSecondary }]}>
                {isExportingGpx ? 'Exporting GPX...' : 'Export Raw GPX'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  cardContainer: {
    marginVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeSection: {
    width: '100%',
    marginTop: 14,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 4,
  },
  themeList: {
    gap: 8,
    paddingRight: 16,
  },
  themePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 6,
  },
  themeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  themeName: {
    fontSize: 13,
  },
  actionsSection: {
    width: '100%',
    paddingHorizontal: 18,
    marginTop: 20,
    gap: 10,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
  utilityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  utilityButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
