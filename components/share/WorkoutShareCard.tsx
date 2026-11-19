import React, { useMemo } from 'react';
import {
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { RunningCoordinate } from '../../src/types/running';
import { parseCoordinate } from '../../src/utils/googleMapsRouteUrl';
import { WORKOUT_SHARE_THEMES, WorkoutShareTheme } from './workoutShareThemes';

export interface WorkoutShareCardProps {
  themeId?: string;
  theme?: WorkoutShareTheme;
  title?: string;
  subtitle?: string;
  distanceKm?: number | string;
  timeFormatted?: string;
  paceFormatted?: string;
  elevationMeters?: number | string;
  coordinates?: RunningCoordinate[] | null;
  cardWidth?: number;
  cardHeight?: number;
  isEditable?: boolean;
  showRouteThumbnail?: boolean;
  onTitleChange?: (text: string) => void;
  onSubtitleChange?: (text: string) => void;
  onPressCard?: () => void;
  onToggleRouteMap?: () => void;
}

/**
 * Resolves the artwork background image for each workout theme.
 */
function getThemeBackgroundImage(themeId: string) {
  switch (themeId) {
    case 'intervals':
      return require('../../assets/images/templates/intervals_bg.jpg');
    case 'tempo_run':
      return require('../../assets/images/templates/tempo_run_bg.jpg');
    case 'hill_repeats':
      return require('../../assets/images/templates/hill_repeats_bg.jpg');
    case 'recovery_run':
      return require('../../assets/images/templates/recovery_run_bg.jpg');
    case 'easy_run':
      return require('../../assets/images/templates/easy_run_bg.jpg');
    case 'marathon':
      return require('../../assets/images/templates/marathon_bg.jpg');
    case 'half_marathon':
      return require('../../assets/images/templates/half_marathon_bg.jpg');
    case 'five_k':
      return require('../../assets/images/templates/five_k_bg.jpg');
    case 'ten_k':
      return require('../../assets/images/templates/ten_k_bg.jpg');
    case 'trail_run':
      return require('../../assets/images/templates/trail_run_bg.jpg');
    case 'warmup':
    default:
      return require('../../assets/images/templates/warmup_bg.jpg');
  }
}

/**
 * Counts words in a string.
 */
function countWords(str: string): number {
  if (!str || !str.trim()) return 0;
  return str.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Truncates text so total words do not exceed maxWords.
 */
function enforceMaxWords(str: string, maxWords: number = 25): string {
  if (!str) return '';
  const words = str.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return str;
  return words.slice(0, maxWords).join(' ');
}

/**
 * Projects real GPS coordinates into a sleek mini-map thumbnail
 * preserving geographic proportions with Mercator latitude compensation.
 */
function projectMiniRoute(
  coordinates: RunningCoordinate[] | unknown[] | null | undefined,
  size: number = 74
): { pathD: string; start: { x: number; y: number } | null; end: { x: number; y: number } | null } | null {
  if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const validPoints: Array<{ latitude: number; longitude: number }> = [];
  for (const item of coordinates) {
    const parsed = parseCoordinate(item);
    if (parsed) validPoints.push(parsed);
  }

  if (validPoints.length < 2) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const p of validPoints) {
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
    if (p.longitude < minLng) minLng = p.longitude;
    if (p.longitude > maxLng) maxLng = p.longitude;
  }

  const pad = 12;
  const drawSize = size - pad * 2;
  const midLat = (minLat + maxLat) / 2;
  const latFactor = Math.cos((midLat * Math.PI) / 180);

  const latRange = Math.max(maxLat - minLat, 0.0001);
  const lngRange = Math.max((maxLng - minLng) * latFactor, 0.0001);

  const scale = Math.min(drawSize / lngRange, drawSize / latRange);
  const projW = lngRange * scale;
  const projH = latRange * scale;
  const offX = pad + (drawSize - projW) / 2;
  const offY = pad + (drawSize - projH) / 2;

  const points = validPoints.map((p) => {
    const x = offX + (p.longitude - minLng) * latFactor * scale;
    const y = offY + (maxLat - p.latitude) * scale;
    return { x, y };
  });

  const pathD = points
    .map((p, i) => (i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`))
    .join(' ');

  return {
    pathD,
    start: points[0],
    end: points[points.length - 1],
  };
}

export const WorkoutShareCard = React.forwardRef<View, WorkoutShareCardProps>(({
  themeId = 'warmup',
  theme: customTheme,
  title,
  subtitle,
  distanceKm = '5.00',
  timeFormatted = '25:30',
  paceFormatted = '05:06',
  elevationMeters = '34',
  coordinates,
  cardWidth = 330,
  cardHeight,
  isEditable = false,
  showRouteThumbnail = true,
  onTitleChange,
  onSubtitleChange,
  onPressCard,
  onToggleRouteMap,
}, ref) => {
  const activeTheme =
    customTheme ??
    WORKOUT_SHARE_THEMES[themeId] ??
    WORKOUT_SHARE_THEMES.warmup ??
    WORKOUT_SHARE_THEMES.easy_run;

  // Exact 571 x 1024 or 576 x 1024 aspect ratio from artwork (~9:16 story format)
  const actualHeight = cardHeight ?? Math.round(cardWidth * (1024 / 571));

  // Resolved dynamic theme colors matching each background template
  const activeHudGradient = activeTheme.hudGradient ?? ['rgba(8, 47, 73, 0.90)', 'rgba(4, 24, 38, 0.95)'];
  const activeBorderColor = activeTheme.hudBorderColor ?? activeTheme.cardBorderColor ?? '#22D3EE';
  const activeShadowColor = activeTheme.hudShadowColor ?? activeTheme.glowColor ?? '#22D3EE';
  const activeLabelColor = activeTheme.labelColor ?? '#67E8F9';
  const activeUnitColor = activeTheme.unitColor ?? '#38BDF8';
  const activeValueShadow = activeTheme.valueShadowColor ?? 'rgba(34, 211, 238, 0.75)';
  const activeDividerColor = activeTheme.dividerColor ?? 'rgba(34, 211, 238, 0.25)';
  const activeIconColor = activeTheme.iconColor ?? activeTheme.primaryColor ?? '#22D3EE';
  const activeMountGrad = activeTheme.mountainGrad ?? ['#67E8F9', '#0891B2', '#0E7490', '#0284C7'];
  const activeMiniMapBorder = activeTheme.miniMapBorder ?? activeBorderColor;
  const activeMiniMapBg = activeTheme.miniMapBg ?? 'rgba(4, 24, 38, 0.86)';
  const activeMiniMapPolyline = activeTheme.miniMapPolyline ?? activeIconColor;
  const activeMiniMapBadgeBg = activeTheme.miniMapBadgeBg ?? 'rgba(34, 211, 238, 0.25)';
  const activeMiniMapBadgeText = activeTheme.miniMapBadgeText ?? activeLabelColor;
  const activeSubtitleColor =
    activeTheme.id === 'tempo_run'
      ? '#FED7AA'
      : activeTheme.id === 'intervals'
        ? '#BAE6FD'
        : activeTheme.id === 'hill_repeats'
          ? '#FDE68A'
          : activeTheme.id === 'recovery_run'
            ? '#E9D5FF'
            : activeTheme.id === 'easy_run'
              ? '#A7F3D0'
              : activeTheme.id === 'marathon'
                ? '#D9F99D'
                : activeTheme.id === 'five_k'
                  ? '#93C5FD'
                  : activeTheme.id === 'half_marathon'
                    ? '#93C5FD'
                    : activeTheme.id === 'ten_k'
                    ? '#5EEAD4'
                    : activeTheme.id === 'trail_run'
                      ? '#86EFAC'
                      : (activeTheme.labelColor ?? '#E0F2FE');

  // Enforce maximum 25 words in the header
  // If title/subtitle is explicitly passed (even as empty string ''), honor it so user can backspace & clear it completely while editing!
  const rawTitle = title !== undefined ? title : activeTheme.name;
  const rawSubtitle = subtitle !== undefined ? subtitle : activeTheme.subtitle;

  const displayTitle = useMemo(() => enforceMaxWords(rawTitle, 25), [rawTitle]);
  const titleWordCount = useMemo(() => countWords(displayTitle), [displayTitle]);
  const remainingWordsForSubtitle = Math.max(0, 25 - titleWordCount);
  const displaySubtitle = useMemo(
    () => enforceMaxWords(rawSubtitle, remainingWordsForSubtitle),
    [rawSubtitle, remainingWordsForSubtitle]
  );

  const totalHeaderWords = titleWordCount + countWords(displaySubtitle);

  // Enlarged heading font sizing, with graceful scaling for long text
  const titleFontSize = useMemo(() => {
    if (totalHeaderWords > 16) return Math.max(14, Math.round(cardWidth * 0.045));
    if (totalHeaderWords > 8) return Math.max(16, Math.round(cardWidth * 0.055));
    return Math.max(19, Math.min(24, Math.round(cardWidth * 0.070)));
  }, [totalHeaderWords, cardWidth]);

  const subtitleFontSize = useMemo(() => {
    if (totalHeaderWords > 16) return Math.max(10, Math.round(cardWidth * 0.030));
    if (totalHeaderWords > 8) return Math.max(11, Math.round(cardWidth * 0.035));
    return Math.max(12, Math.min(15, Math.round(cardWidth * 0.042)));
  }, [totalHeaderWords, cardWidth]);

  // Mini Route Thumbnail projected into a glass HUD chip on the right side above the stats box
  const miniRoute = useMemo(() => {
    if (!showRouteThumbnail) return null;
    return projectMiniRoute(coordinates, 74);
  }, [coordinates, showRouteThumbnail]);

  const rawDistance = distanceKm ?? '5.00';
  const formattedDistance =
    typeof rawDistance === 'number' ? rawDistance.toFixed(2) : String(rawDistance);

  const rawPace = String(paceFormatted ?? '05:06');
  const formattedPace = rawPace.includes('/') ? rawPace : `${rawPace} /km`;

  const rawElevation = elevationMeters ?? '34';
  const formattedElevation =
    typeof rawElevation === 'number'
      ? `${Math.round(rawElevation)} m`
      : String(rawElevation).includes('m')
        ? String(rawElevation)
        : `${rawElevation} m`;

  const handleTitleTextChange = (text: string) => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const subWords = countWords(displaySubtitle);
    if (words.length + subWords <= 25) {
      onTitleChange?.(text);
    } else {
      const allowed = Math.max(1, 25 - subWords);
      onTitleChange?.(words.slice(0, allowed).join(' '));
    }
  };

  const handleSubtitleTextChange = (text: string) => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const titWords = countWords(displayTitle);
    if (words.length + titWords <= 25) {
      onSubtitleChange?.(text);
    } else {
      const allowed = Math.max(0, 25 - titWords);
      onSubtitleChange?.(words.slice(0, allowed).join(' '));
    }
  };

  return (
    <View
      ref={ref}
      collapsable={false}
      style={[
        styles.cardOuter,
        {
          width: cardWidth,
          height: actualHeight,
          borderColor: activeBorderColor,
          shadowColor: activeShadowColor,
        },
      ]}
    >
      {/* 1. Photorealistic Clean Background (Artwork has the glowing capsule & badge pre-painted) */}
      <ImageBackground
        source={getThemeBackgroundImage(activeTheme.id)}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      >
        {/* If onPressCard is provided, tapping card background or HUD area triggers share */}
        {onPressCard ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onPressCard}
            accessibilityRole="button"
            accessibilityLabel="Tap card to share image and stats"
          />
        ) : null}

        {/* 2. Sleek Header Text (Left-aligned, enlarged, seamless inside pre-painted capsule, NO underlines) */}
        <View
          style={[
            styles.headerTextContainer,
            {
              top: Math.round(actualHeight * 0.038),
              left: Math.round(cardWidth * 0.075),
              width: Math.round(cardWidth * 0.66),
              height: Math.round(actualHeight * 0.115),
            },
          ]}
        >
          {isEditable ? (
            <TextInput
              value={displayTitle}
              onChangeText={handleTitleTextChange}
              style={[
                styles.headerTitle,
                styles.editableInput,
                { fontSize: titleFontSize },
              ]}
              textAlign="left"
              maxLength={120}
              selectTextOnFocus
              placeholder="Add Title"
              placeholderTextColor="rgba(255, 255, 255, 0.45)"
              multiline={totalHeaderWords > 6}
            />
          ) : (
            <Text
              style={[
                styles.headerTitle,
                {
                  fontSize: titleFontSize,
                  lineHeight: Math.round(titleFontSize * 1.2),
                },
              ]}
              numberOfLines={totalHeaderWords > 10 ? 2 : 1}
              adjustsFontSizeToFit
            >
              {displayTitle.trim() ? displayTitle : activeTheme.name}
            </Text>
          )}

          {displaySubtitle || isEditable ? (
            isEditable ? (
              <TextInput
                value={displaySubtitle}
                onChangeText={handleSubtitleTextChange}
                style={[
                  styles.headerSubtitle,
                  styles.editableInputSmall,
                  { fontSize: subtitleFontSize, color: activeSubtitleColor },
                ]}
                textAlign="left"
                maxLength={120}
                selectTextOnFocus
                placeholder="Add Subtitle"
                placeholderTextColor="rgba(255, 255, 255, 0.45)"
                multiline={totalHeaderWords > 6}
              />
            ) : (
              <Text
                style={[
                  styles.headerSubtitle,
                  {
                    fontSize: subtitleFontSize,
                    lineHeight: Math.round(subtitleFontSize * 1.25),
                    color: activeSubtitleColor,
                  },
                ]}
                numberOfLines={2}
                adjustsFontSizeToFit
              >
                {displaySubtitle.trim() ? displaySubtitle : activeTheme.subtitle}
              </Text>
            )
          ) : null}
        </View>

        {/* 3. Small Workout Route Drawing (Lifted safely above stats box; controlled via buttons below image) */}
        {miniRoute && miniRoute.pathD ? (
          <View
            style={[
              styles.miniMapContainer,
              {
                borderColor: activeMiniMapBorder,
                backgroundColor: activeMiniMapBg,
                shadowColor: activeMiniMapBorder,
              },
            ]}
          >
            <Svg width={74} height={74} viewBox="0 0 74 74">
              {/* Route drop-shadow underlay */}
              <Path
                d={miniRoute.pathD}
                stroke="rgba(0, 0, 0, 0.65)"
                strokeWidth={4.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              {/* Vibrant GPS Route Line matching active theme */}
              <Path
                d={miniRoute.pathD}
                stroke={activeMiniMapPolyline}
                strokeWidth={2.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              {/* Start point (Green dot) */}
              {miniRoute.start ? (
                <Circle
                  cx={miniRoute.start.x}
                  cy={miniRoute.start.y}
                  r={3.2}
                  fill="#4ADE80"
                  stroke="#FFFFFF"
                  strokeWidth={1}
                />
              ) : null}
              {/* End point (Red dot) */}
              {miniRoute.end ? (
                <Circle
                  cx={miniRoute.end.x}
                  cy={miniRoute.end.y}
                  r={3.2}
                  fill="#EF4444"
                  stroke="#FFFFFF"
                  strokeWidth={1}
                />
              ) : null}
            </Svg>
            <View style={[styles.miniMapBadge, { backgroundColor: activeMiniMapBadgeBg }]}>
              <Text style={[styles.miniMapBadgeText, { color: activeMiniMapBadgeText }]}>ROUTE</Text>
            </View>
          </View>
        ) : null}

        {/* 4. Bottom Data HUD (Styled to match the Theme Artwork Glass Capsule) */}
        <View pointerEvents={onPressCard ? 'none' : 'auto'} style={styles.hudContainer}>
          <LinearGradient
            colors={activeHudGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[
              styles.hudCapsule,
              {
                borderColor: activeBorderColor,
                shadowColor: activeShadowColor,
              },
            ]}
          >
            {/* Top Specular Highlight Line (Glass Sheen matching header) */}
            <View style={styles.specularSheen} />

            {/* Quadrant Row 1: Distance & Time */}
            <View style={styles.hudRow}>
              {/* Slot 1: Distance */}
              <View style={styles.hudQuadrant}>
                <View style={styles.hudIconBox}>
                  <Svg width={24} height={24} viewBox="0 0 36 36">
                    <Path
                      d="M 18 33 C 13.5 26.5 7.5 19.5 7.5 13.5 A 10.5 10.5 0 1 1 28.5 13.5 C 28.5 19.5 22.5 26.5 18 33 Z"
                      fill={activeIconColor}
                    />
                    <Circle cx={18} cy={13.5} r={4} fill="#FFFFFF" />
                  </Svg>
                </View>
                <View style={styles.hudTextBox}>
                  <Text style={[styles.hudLabel, { color: activeLabelColor }]}>Distance</Text>
                  <Text style={[styles.hudValue, { textShadowColor: activeValueShadow }]}>
                    {formattedDistance} <Text style={[styles.hudUnit, { color: activeUnitColor }]}>km</Text>
                  </Text>
                </View>
              </View>

              {/* Vertical Divider */}
              <View style={[styles.verticalDivider, { backgroundColor: activeDividerColor }]} />

              {/* Slot 2: Time */}
              <View style={styles.hudQuadrant}>
                <View style={styles.hudIconBox}>
                  <Svg width={24} height={24} viewBox="0 0 36 36">
                    <Rect x={15} y={1} width={6} height={3} rx={1.5} fill={activeIconColor} />
                    <Circle cx={18} cy={19} r={14} stroke={activeIconColor} strokeWidth={3.5} fill="none" />
                    <Circle cx={18} cy={19} r={2} fill="#FFFFFF" />
                    <Path d="M 18 19 L 18 10 M 18 19 L 24 19" stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" />
                  </Svg>
                </View>
                <View style={styles.hudTextBox}>
                  <Text style={[styles.hudLabel, { color: activeLabelColor }]}>Time</Text>
                  <Text style={[styles.hudValue, { textShadowColor: activeValueShadow }]}>{timeFormatted}</Text>
                </View>
              </View>
            </View>

            {/* Horizontal Crosshair Divider */}
            <View style={[styles.horizontalDivider, { backgroundColor: activeDividerColor }]} />

            {/* Quadrant Row 2: Pace & Elevation */}
            <View style={styles.hudRow}>
              {/* Slot 3: Pace */}
              <View style={styles.hudQuadrant}>
                <View style={styles.hudIconBox}>
                  <Svg width={24} height={24} viewBox="0 0 36 36">
                    <Path d="M 6 26 A 14 14 0 1 1 30 26" stroke={activeIconColor} strokeWidth={3.5} strokeLinecap="round" fill="none" />
                    <Path d="M 18 24 L 25 14" stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" />
                    <Circle cx={18} cy={24} r={3} fill={activeIconColor} />
                    <Circle cx={18} cy={24} r={1.5} fill="#FFFFFF" />
                  </Svg>
                </View>
                <View style={styles.hudTextBox}>
                  <Text style={[styles.hudLabel, { color: activeLabelColor }]}>Pace</Text>
                  <Text style={[styles.hudValue, { textShadowColor: activeValueShadow }]}>{formattedPace}</Text>
                </View>
              </View>

              {/* Vertical Divider */}
              <View style={[styles.verticalDivider, { backgroundColor: activeDividerColor }]} />

              {/* Slot 4: Elevation */}
              <View style={styles.hudQuadrant}>
                <View style={styles.hudIconBox}>
                  <Svg width={28} height={24} viewBox="0 0 40 36">
                    <Defs>
                      <SvgLinearGradient id="mountGradTheme" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0%" stopColor={activeMountGrad[0]} />
                        <Stop offset="50%" stopColor={activeMountGrad[1]} />
                        <Stop offset="100%" stopColor={activeMountGrad[2]} />
                      </SvgLinearGradient>
                    </Defs>
                    <Path d="M 22 4 L 38 32 L 6 32 Z" fill="url(#mountGradTheme)" />
                    <Path d="M 22 4 L 27 13 L 24 15 L 20 13 L 17 14 Z" fill="#FFFFFF" />
                    <Path d="M 11 14 L 22 32 L 0 32 Z" fill={activeMountGrad[3]} opacity={0.88} />
                    <Path d="M 11 14 L 14 20 L 11 21 L 8 20 Z" fill="#FFFFFF" />
                  </Svg>
                </View>
                <View style={styles.hudTextBox}>
                  <Text style={[styles.hudLabel, { color: activeLabelColor }]}>Elevation</Text>
                  <Text style={[styles.hudValue, { textShadowColor: activeValueShadow }]}>{formattedElevation}</Text>
                </View>
              </View>
            </View>
          </LinearGradient>
        </View>
      </ImageBackground>
    </View>
  );
});

const styles = StyleSheet.create({
  cardOuter: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 2,
    backgroundColor: '#031525',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 14,
  },
  headerTextContainer: {
    position: 'absolute',
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 4,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontStyle: 'italic',
    textAlign: 'left',
    alignSelf: 'flex-start',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 5,
  },
  headerSubtitle: {
    color: '#E0F2FE',
    fontWeight: '800',
    fontStyle: 'italic',
    textAlign: 'left',
    alignSelf: 'flex-start',
    marginTop: 2,
    letterSpacing: -0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  editableInput: {
    paddingVertical: 0,
    borderBottomWidth: 0,
    minWidth: 100,
  },
  editableInputSmall: {
    paddingVertical: 0,
    borderBottomWidth: 0,
    minWidth: 100,
  },
  miniMapContainer: {
    position: 'absolute',
    right: 14,
    bottom: 142,
    width: 74,
    height: 74,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 10,
  },
  miniMapBadge: {
    position: 'absolute',
    top: 4,
    left: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  miniMapBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  hudContainer: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    zIndex: 10,
  },
  hudCapsule: {
    borderRadius: 22,
    borderWidth: 1.8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 12,
    overflow: 'hidden',
  },
  specularSheen: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  hudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  hudQuadrant: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 3,
  },
  hudIconBox: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hudTextBox: {
    flex: 1,
  },
  hudLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  hudValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 0,
    letterSpacing: -0.3,
    textShadowRadius: 6,
  },
  hudUnit: {
    fontSize: 12,
    fontWeight: '800',
  },
  verticalDivider: {
    width: 1,
    height: 32,
    marginHorizontal: 3,
  },
  horizontalDivider: {
    height: 1,
    marginVertical: 3,
  },
});

WorkoutShareCard.displayName = 'WorkoutShareCard';
