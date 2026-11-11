import { describe, expect, it } from 'vitest';
import { createCatmullRomPolyline } from './catmullRom';

describe('createCatmullRomPolyline', () => {
  it('smooths curved route geometry without changing its endpoints or source points', () => {
    const route = [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0.0001 },
      { latitude: 0.0001, longitude: 0.0002 },
      { latitude: 0.0001, longitude: 0.0003 },
    ];

    const smoothed = createCatmullRomPolyline(route);

    expect(smoothed.length).toBeGreaterThan(route.length);
    expect(smoothed[0]).toEqual(route[0]);
    expect(smoothed.at(-1)).toEqual(route.at(-1));
    expect(smoothed.some((point) => point.latitude > 0 && point.latitude < 0.0001)).toBe(true);
    expect(route).toEqual([
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0.0001 },
      { latitude: 0.0001, longitude: 0.0002 },
      { latitude: 0.0001, longitude: 0.0003 },
    ]);
  });

  it('leaves routes with a large GPS gap unsmoothed', () => {
    const route = [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0.01 },
    ];

    expect(createCatmullRomPolyline(route)).toEqual(route);
  });
});
