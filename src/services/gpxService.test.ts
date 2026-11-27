import { describe, expect, it } from 'vitest';
import {
  parseGpxWorkout,
  serializeActivityAsGpx,
  toGpxActivityImportRequest,
} from './gpxService';
import type { BackendActivity } from './activityApi';

const gpx = (points: string, routeType = 'running') => `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><type>${routeType}</type><trkseg>${points}</trkseg></trk>
</gpx>`;

describe('parseGpxWorkout', () => {
  it('parses timed track points and prepares an activity import payload', () => {
    const preview = parseGpxWorkout(gpx(`
      <trkpt lat="12.9" lon="80.1"><ele>31.5</ele><time>2026-11-02T10:00:00Z</time></trkpt>
      <trkpt lat="12.901" lon="80.101"><time>2026-11-02T10:00:10Z</time></trkpt>
    `), 'run.gpx');
    const request = toGpxActivityImportRequest(preview);

    expect(preview.activityType).toBe('RUN');
    expect(preview.points).toHaveLength(2);
    expect(preview.points[0]?.altitude).toBe(31.5);
    expect(preview.elapsedSeconds).toBe(10);
    expect(preview.distanceMeters).toBeGreaterThan(100);
    expect(request.gps_points[0]).toMatchObject({
      latitude: 12.9,
      longitude: 80.1,
      accuracy: null,
      is_paused: false,
    });
  });

  it('accepts timed Xcode waypoint files and flags unusually long time gaps', () => {
    const preview = parseGpxWorkout(`<gpx version="1.1" creator="Xcode">
      <wpt lat="12.9" lon="80.1"><time>2026-11-02T10:00:00Z</time></wpt>
      <wpt lat="12.901" lon="80.101"><time>2026-11-02T11:00:00Z</time></wpt>
    </gpx>`, 'xcode-route.gpx');

    expect(preview.points).toHaveLength(2);
    expect(preview.longGapCount).toBe(1);
    expect(preview.elapsedSeconds).toBe(3600);
  });

  it('accepts timed GPX route points and identifies walks', () => {
    const preview = parseGpxWorkout(`<gpx version="1.1">
      <rte><type>walking</type>
        <rtept lat="12.9" lon="80.1"><time>2026-11-02T10:00:00Z</time></rtept>
        <rtept lat="12.901" lon="80.101"><time>2026-11-02T10:00:10Z</time></rtept>
      </rte>
    </gpx>`, 'walk.gpx');

    expect(preview.activityType).toBe('WALK');
    expect(preview.points).toHaveLength(2);
  });

  it('rejects invalid coordinates, missing timestamps, and non-GPX XML', () => {
    expect(() => parseGpxWorkout(gpx(`
      <trkpt lat="91" lon="80"><time>2026-11-02T10:00:00Z</time></trkpt>
      <trkpt lat="12.9" lon="80.1"><time>2026-11-02T10:00:10Z</time></trkpt>
    `), 'invalid.gpx')).toThrow(/invalid latitude or longitude/i);

    expect(() => parseGpxWorkout(gpx(`
      <trkpt lat="12.9" lon="80.1"></trkpt>
      <trkpt lat="12.901" lon="80.101"><time>2026-11-02T10:00:10Z</time></trkpt>
    `), 'untimed.gpx')).toThrow(/timestamp with a timezone/i);

    expect(() => parseGpxWorkout('<not-gpx />', 'other.xml')).toThrow(/GPX root/i);
  });
});

describe('serializeActivityAsGpx', () => {
  it('exports route points as GPX 1.1 with escaped activity names and timestamps', () => {
    const result = serializeActivityAsGpx({
      id: 'run&1',
      activity_type: 'RUN',
      start_time: '2026-11-02T10:00:00Z',
      end_time: '2026-11-02T10:00:10Z',
      gps_points: [
        { latitude: 12.9, longitude: 80.1, altitude: 31.4, timestamp: '2026-11-02T10:00:00Z' },
        { latitude: 12.901, longitude: 80.101, timestamp: '2026-11-02T10:00:10Z' },
      ],
    });

    expect(result).toContain('<gpx version="1.1"');
    expect(result).toContain('run&amp;1');
    expect(result).toContain('<ele>31.4</ele>');
    expect(result).toContain('<time>2026-11-02T10:00:10.000Z</time>');
    expect(result.match(/<trkpt /g)).toHaveLength(2);
    expect(parseGpxWorkout(result, 'round-trip.gpx').points).toHaveLength(2);
  });

  it('normalizes numeric-string coordinates and skips invalid samples', () => {
    const result = serializeActivityAsGpx({
      id: 12,
      activity_type: 'WALK',
      start_time: '2026-11-02T10:00:00Z',
      end_time: '2026-11-02T10:00:20Z',
      gps_points: [
        { latitude: '12.9000000', longitude: '80.1000000', timestamp: '2026-11-02T10:00:00Z' },
        { latitude: 'invalid', longitude: '80.1005000', timestamp: '2026-11-02T10:00:10Z' },
        { latitude: 12.901, longitude: 80.101, timestamp: '2026-11-02T10:00:20Z' },
      ] as BackendActivity['gps_points'],
    });

    expect(result).toContain('<trkpt lat="12.9000000" lon="80.1000000">');
    expect(result.match(/<trkpt /g)).toHaveLength(2);
    expect(parseGpxWorkout(result, 'walk.gpx').points).toHaveLength(2);
  });

  it('requires timestamps so exported tracks can be replayed', () => {
    expect(() => serializeActivityAsGpx({
      id: 13,
      activity_type: 'RUN',
      start_time: '2026-11-02T10:00:00Z',
      end_time: '2026-11-02T10:00:10Z',
      gps_points: [
        { latitude: 12.9, longitude: 80.1 },
        { latitude: 12.901, longitude: 80.101 },
      ],
    })).toThrow(/missing valid GPS point timestamps/i);
  });
});
