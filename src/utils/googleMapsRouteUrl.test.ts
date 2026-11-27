import { describe, expect, it } from 'vitest';
import { buildGoogleMapsRouteUrl, formatWorkoutSharePost, parseCoordinate } from './googleMapsRouteUrl';

describe('googleMapsRouteUrl', () => {
  it('returns null for empty or null coordinates', () => {
    expect(buildGoogleMapsRouteUrl(null)).toBeNull();
    expect(buildGoogleMapsRouteUrl([])).toBeNull();
    expect(buildGoogleMapsRouteUrl(undefined)).toBeNull();
  });

  it('safely handles string coordinates without throwing TypeError', () => {
    // This specifically guards against the error the user experienced:
    // TypeError: undefined is not a function at startPt.latitude.toFixed
    const stringCoords = [
      { latitude: '12.971598', longitude: '77.594566' },
      { latitude: '12.980000', longitude: '77.600000' },
    ];
    const url = buildGoogleMapsRouteUrl(stringCoords);
    expect(url).not.toBeNull();
    expect(url).toContain('origin=12.971598,77.594566');
    expect(url).toContain('destination=12.980000,77.600000');
    expect(url).toContain('travelmode=walking');
  });

  it('generates search URL for a single coordinate', () => {
    const url = buildGoogleMapsRouteUrl([{ latitude: 12.9716, longitude: 77.5946 }]);
    expect(url).toContain('https://www.google.com/maps/search/?api=1&query=12.971600,77.594600');
  });

  it('generates directions URL for 2 points without waypoints', () => {
    const coords = [
      { latitude: 12.9716, longitude: 77.5946 },
      { latitude: 12.9800, longitude: 77.6000 },
    ];
    const url = buildGoogleMapsRouteUrl(coords);
    expect(url).toContain('https://www.google.com/maps/dir/?api=1');
    expect(url).toContain('origin=12.971600,77.594600');
    expect(url).toContain('destination=12.980000,77.600000');
    expect(url).toContain('travelmode=walking');
  });

  it('formats a share post with Google Maps link properly', () => {
    const post = formatWorkoutSharePost({
      title: 'Easy Run',
      distanceKm: '5.00',
      durationText: '25:30',
      paceText: '05:06 /km',
      elevationText: '34',
      googleMapsUrl: 'https://www.google.com/maps/dir/?api=1&origin=10,20&destination=11,21',
    });

    expect(post).toContain('🏃 Easy Run Completed!');
    expect(post).toContain('📏 Distance: 5.00 km');
    expect(post).toContain('⏱️ Time: 25:30');
    expect(post).toContain('⚡ Pace: 05:06 /km');
    expect(post).toContain('⛰️ Elevation: 34 m');
    expect(post).toContain('🗺️ View My Route on Google Maps:');
  });
});
