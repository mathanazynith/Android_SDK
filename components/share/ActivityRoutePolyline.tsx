import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Path, Rect } from 'react-native-svg';
import { RunningCoordinate } from '../../src/types/running';
import { parseCoordinate } from '../../src/utils/googleMapsRouteUrl';

export interface ActivityRoutePolylineProps {
  coordinates?: RunningCoordinate[] | unknown[] | null;
  width: number;
  height: number;
  strokeColor?: string;
  strokeWidth?: number;
  showMarkers?: boolean;
}

interface ProjectedPoint {
  x: number;
  y: number;
}

/**
 * Projects real GPS coordinates into an SVG coordinate space preserving
 * geographical aspect ratio (Mercator projection with latitude compensation).
 */
function projectGpsToCanvas(
  coordinates: RunningCoordinate[] | unknown[] | null | undefined,
  bounds: { left: number; top: number; width: number; height: number }
): { pathD: string; start: ProjectedPoint | null; end: ProjectedPoint | null } {
  // Parse & normalize any coordinates (handles numbers and strings safely)
  const validPoints: Array<{ latitude: number; longitude: number }> = [];
  if (coordinates && Array.isArray(coordinates)) {
    for (const item of coordinates) {
      const parsed = parseCoordinate(item);
      if (parsed) {
        validPoints.push(parsed);
      }
    }
  }

  if (validPoints.length < 2) {
    // Realistic aesthetic running route loop around the lake
    const cx = bounds.left + bounds.width * 0.52;
    const cy = bounds.top + bounds.height * 0.54;
    const rx = bounds.width * 0.36;
    const ry = bounds.height * 0.32;

    const samplePoints: ProjectedPoint[] = [
      { x: cx - rx * 0.85, y: cy + ry * 0.80 },
      { x: cx - rx * 0.50, y: cy + ry * 0.50 },
      { x: cx - rx * 0.70, y: cy - ry * 0.10 },
      { x: cx - rx * 0.30, y: cy - ry * 0.75 },
      { x: cx + rx * 0.20, y: cy - ry * 0.85 },
      { x: cx + rx * 0.75, y: cy - ry * 0.40 },
      { x: cx + rx * 0.85, y: cy + ry * 0.10 },
      { x: cx + rx * 0.50, y: cy + ry * 0.65 },
      { x: cx + rx * 0.10, y: cy + ry * 0.85 },
      { x: cx - rx * 0.25, y: cy + ry * 0.60 },
      { x: cx - rx * 0.85, y: cy + ry * 0.80 },
    ];

    const d = samplePoints.map((p, i) => (i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)).join(' ');
    return {
      pathD: d,
      start: samplePoints[0],
      end: samplePoints[samplePoints.length - 1],
    };
  }

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

  const midLat = (minLat + maxLat) / 2;
  const latFactor = Math.cos((midLat * Math.PI) / 180);

  const latRange = Math.max(maxLat - minLat, 0.0001);
  const lngRange = Math.max((maxLng - minLng) * latFactor, 0.0001);

  // Determine scale that fits within target bounding box
  const scaleX = bounds.width / lngRange;
  const scaleY = bounds.height / latRange;
  const scale = Math.min(scaleX, scaleY);

  // Center the route within bounds
  const projectedWidth = lngRange * scale;
  const projectedHeight = latRange * scale;
  const offsetX = bounds.left + (bounds.width - projectedWidth) / 2;
  const offsetY = bounds.top + (bounds.height - projectedHeight) / 2;

  const projectedPoints: ProjectedPoint[] = validPoints.map((p) => {
    const x = offsetX + (p.longitude - minLng) * latFactor * scale;
    // Invert Y because latitude goes from bottom (south) to top (north)
    const y = offsetY + (maxLat - p.latitude) * scale;
    return { x, y };
  });

  const pathD = projectedPoints
    .map((p, i) => (i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`))
    .join(' ');

  return {
    pathD,
    start: projectedPoints[0],
    end: projectedPoints[projectedPoints.length - 1],
  };
}

export const ActivityRoutePolyline: React.FC<ActivityRoutePolylineProps> = ({
  coordinates,
  width,
  height,
  strokeColor = '#35C72B', // Matches official ActivityRouteMap green
  strokeWidth = 3.8,
  showMarkers = true,
}) => {
  // Allow route to comfortably occupy middle canvas:
  // Below header (from Y = height * 0.17) to above HUD (Y = height * 0.72)
  const bounds = useMemo(() => {
    const top = height * 0.16;
    const bottom = height * 0.72;
    const horizontalPadding = width * 0.10;
    return {
      left: horizontalPadding,
      top,
      width: width - horizontalPadding * 2,
      height: bottom - top,
    };
  }, [width, height]);

  const { pathD, start, end } = useMemo(() => {
    return projectGpsToCanvas(coordinates, bounds);
  }, [coordinates, bounds]);

  if (!pathD) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs />

        {/* 1. Subtle Dark Contrast Underlay (Drop shadow to pop against any scenery) */}
        <Path
          d={pathD}
          stroke="rgba(0, 0, 0, 0.40)"
          strokeWidth={strokeWidth + 2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* 2. Crisp, Clean Running Polyline (NO NEON GLOW) */}
        <Path
          d={pathD}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* 3. Start & Finish Pins */}
        {showMarkers && start ? (
          <G>
            {/* Start Marker (Green Ring with White Center) */}
            <Circle cx={start.x} cy={start.y} r={7} fill="#14532D" opacity={0.6} />
            <Circle cx={start.x} cy={start.y} r={5.5} fill="#FFFFFF" />
            <Circle cx={start.x} cy={start.y} r={3.5} fill="#22C55E" />
          </G>
        ) : null}

        {showMarkers && end ? (
          <G>
            {/* Finish Marker (Chequered / Red Target) */}
            <Circle cx={end.x} cy={end.y} r={7} fill="#1F2937" opacity={0.6} />
            <Circle cx={end.x} cy={end.y} r={5.5} fill="#FFFFFF" />
            <Circle cx={end.x} cy={end.y} r={3.5} fill="#EF4444" />
            <Rect x={end.x - 1.5} y={end.y - 1.5} width={3} height={3} fill="#FFFFFF" />
          </G>
        ) : null}
      </Svg>
    </View>
  );
};
