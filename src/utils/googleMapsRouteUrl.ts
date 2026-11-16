import { RunningCoordinate } from '../types/running';

/**
 * Safely parses any coordinate value (number or string representation)
 * into a valid finite number.
 */
function toValidNumber(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val;
  }
  if (typeof val === 'string' && val.trim().length > 0) {
    const parsed = Number(val);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export interface NormalizedGpsPoint {
  latitude: number;
  longitude: number;
}

export function parseCoordinate(pt: unknown): NormalizedGpsPoint | null {
  if (!pt || typeof pt !== 'object') return null;
  const anyPt = pt as Record<string, unknown>;

  const rawLat = anyPt.latitude ?? anyPt.lat;
  const rawLng = anyPt.longitude ?? anyPt.lng ?? anyPt.lon;

  const lat = toValidNumber(rawLat);
  const lng = toValidNumber(rawLng);

  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { latitude: lat, longitude: lng };
}

/**
 * Builds an official Google Maps Directions URL that displays the user's
 * complete running track drawn on the map.
 *
 * Official Google Maps Universal Cross-Platform URL format:
 * https://www.google.com/maps/dir/?api=1&origin=...&destination=...&waypoints=...&travelmode=walking
 */
export function buildGoogleMapsRouteUrl(
  coordinates?: RunningCoordinate[] | unknown[] | null,
  maxWaypoints: number = 16
): string | null {
  if (!coordinates || !Array.isArray(coordinates) || coordinates.length === 0) {
    return null;
  }

  // Parse and normalize all points to guarantee valid numeric latitude & longitude
  const validPoints: NormalizedGpsPoint[] = [];
  for (const item of coordinates) {
    const pt = parseCoordinate(item);
    if (pt) {
      validPoints.push(pt);
    }
  }

  if (validPoints.length === 0) {
    return null;
  }

  // Single GPS coordinate (e.g. stationary or start pin)
  if (validPoints.length === 1) {
    const pt = validPoints[0];
    return `https://www.google.com/maps/search/?api=1&query=${pt.latitude.toFixed(6)},${pt.longitude.toFixed(6)}`;
  }

  const startPt = validPoints[0];
  const endPt = validPoints[validPoints.length - 1];

  const origin = `${startPt.latitude.toFixed(6)},${startPt.longitude.toFixed(6)}`;
  const destination = `${endPt.latitude.toFixed(6)},${endPt.longitude.toFixed(6)}`;

  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=walking`;

  // Sample intermediate points if there are 3 or more coordinates
  if (validPoints.length > 2) {
    const intermediate = validPoints.slice(1, -1);
    const waypoints: string[] = [];

    if (intermediate.length <= maxWaypoints) {
      for (const p of intermediate) {
        waypoints.push(`${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`);
      }
    } else {
      const step = intermediate.length / maxWaypoints;
      for (let i = 0; i < maxWaypoints; i++) {
        const index = Math.min(Math.floor(i * step), intermediate.length - 1);
        const p = intermediate[index];
        waypoints.push(`${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`);
      }
    }

    if (waypoints.length > 0) {
      url += `&waypoints=${waypoints.join('%7C')}`;
    }
  }

  return url;
}

export interface WorkoutPostContentOptions {
  title: string;
  distanceKm: string;
  durationText: string;
  paceText: string;
  elevationText?: string;
  googleMapsUrl?: string | null;
}

/**
 * Formats a clean, engaging workout share post containing workout stats
 * and the clickable Google Maps route link.
 */
export function formatWorkoutSharePost({
  title,
  distanceKm,
  durationText,
  paceText,
  elevationText,
  googleMapsUrl,
}: WorkoutPostContentOptions): string {
  const parts: string[] = [
    `🏃 ${title} Completed!`,
    `📏 Distance: ${distanceKm} km`,
    `⏱️ Time: ${durationText}`,
    `⚡ Pace: ${paceText}`,
  ];

  if (elevationText && elevationText !== '0' && elevationText !== '0 m') {
    const elev = elevationText.includes('m') ? elevationText : `${elevationText} m`;
    parts.push(`⛰️ Elevation: ${elev}`);
  }

  if (googleMapsUrl) {
    parts.push('', '🗺️ View My Route on Google Maps:', googleMapsUrl);
  }

  return parts.join('\n');
}
