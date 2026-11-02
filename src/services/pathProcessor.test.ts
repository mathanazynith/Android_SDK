import { describe, expect, it } from 'vitest';
import { PathProcessor } from './pathProcessor';

const pointAt = (eastMeters: number, northMeters: number) => ({
  latitude: northMeters / 111_320,
  longitude: eastMeters / 111_320,
});

describe('PathProcessor live route geometry', () => {
  it('uses the 1.5m live display threshold while retaining the accepted GPS coordinates', () => {
    const processor = new PathProcessor('test-run');
    const ingest = (eastMeters: number, timestamp: number) => processor.ingestRaw({
      ...pointAt(eastMeters, 0),
      accuracy: 3,
      speed: 1,
      timestamp,
    });

    ingest(0, 1_000);
    ingest(1, 2_000);
    ingest(1.6, 3_000);

    expect(processor.getDisplayPoints()).toHaveLength(2);
    expect(processor.getDisplayPoints()[1]?.longitude).toBeCloseTo(1.6 / 111_320);
  });

  it('removes sub-meter cross-track jitter without mutating source coordinates', () => {
    const processor = new PathProcessor('test-run');
    const route = [
      pointAt(0, 0),
      pointAt(3, 0.4),
      pointAt(6, -0.3),
      pointAt(10, 0),
    ];

    const simplified = processor.simplifyLivePolyline(route);

    expect(simplified).toEqual([route[0], route.at(-1)]);
    expect(route).toHaveLength(4);
  });

  it('preserves meaningful turns while simplifying live geometry', () => {
    const processor = new PathProcessor('test-run');
    const route = [
      pointAt(0, 0),
      pointAt(5, 0),
      pointAt(5, 5),
      pointAt(10, 5),
    ];

    expect(processor.simplifyLivePolyline(route)).toEqual(route);
  });

  it('merges journaled points in timestamp order without duplicating foreground fixes', () => {
    const processor = new PathProcessor('journal-merge-run');
    const first = { ...pointAt(0, 0), accuracy: 3, timestamp: 1_000 };
    processor.ingestRaw(first);
    processor.ingestRaw({ ...pointAt(3, 0), accuracy: 4, timestamp: 3_000 });

    processor.mergeRawPoints([
      { ...pointAt(1.5, 0), accuracy: 5, timestamp: 2_000 },
      { ...first, accuracy: 2 },
    ]);

    expect(processor.getRawPoints().map((point) => point.timestamp)).toEqual([1_000, 2_000, 3_000]);
    expect(processor.getRawPoints()[0]?.accuracy).toBe(2);
  });

  it('collapses a sustained compact GPS drift loop before save optimization', () => {
    const processor = new PathProcessor('drift-run');
    const startedAt = Date.now() - 120_000;
    const pointCount = 24;

    for (let index = 0; index <= pointCount; index += 1) {
      const angle = (index / pointCount) * Math.PI * 2;
      processor.ingestRaw({
        ...pointAt(Math.cos(angle) * 20, Math.sin(angle) * 20),
        accuracy: 30,
        speed: 1,
        timestamp: startedAt + index * 10_000,
      });
    }

    const filtered = processor.filterRawPoints();

    expect(filtered).toHaveLength(1);
    expect(processor.simplifyFinal(filtered)).toHaveLength(1);
  });

  it('collapses a short loop only when its radius is below reported GPS uncertainty', () => {
    const processor = new PathProcessor('uncertain-drift-run');
    const startedAt = Date.now() - 40_000;
    const pointCount = 24;

    for (let index = 0; index <= pointCount; index += 1) {
      const angle = (index / pointCount) * Math.PI * 2;
      processor.ingestRaw({
        ...pointAt(Math.cos(angle) * 8, Math.sin(angle) * 8),
        accuracy: 12,
        speed: 1,
        timestamp: startedAt + index * (40_000 / pointCount),
      });
    }

    expect(processor.filterRawPoints()).toHaveLength(1);
  });

  it('preserves a short loop supported by precise GPS fixes', () => {
    const processor = new PathProcessor('accurate-loop-run');
    const startedAt = Date.now() - 40_000;
    const pointCount = 24;

    for (let index = 0; index <= pointCount; index += 1) {
      const angle = (index / pointCount) * Math.PI * 2;
      processor.ingestRaw({
        ...pointAt(Math.cos(angle) * 8, Math.sin(angle) * 8),
        accuracy: 3,
        speed: 1,
        timestamp: startedAt + index * (40_000 / pointCount),
      });
    }

    expect(processor.filterRawPoints().length).toBeGreaterThan(1);
  });

  it('does not classify across a pause or workout boundary', () => {
    const processor = new PathProcessor('segmented-route-run');
    const startedAt = Date.now() - 80_000;
    const pointCountPerLeg = 12;

    for (let index = 0; index <= pointCountPerLeg; index += 1) {
      const eastMeters = -8 + (16 * index) / pointCountPerLeg;
      processor.ingestRaw({
        ...pointAt(eastMeters, 0),
        accuracy: 12,
        speed: 1,
        timestamp: startedAt + index * (40_000 / pointCountPerLeg),
      });
    }
    for (let index = 0; index <= pointCountPerLeg; index += 1) {
      const eastMeters = 8 - (16 * index) / pointCountPerLeg;
      processor.ingestRaw({
        ...pointAt(eastMeters, 0),
        accuracy: 12,
        speed: 1,
        timestamp: startedAt + 40_000 + index * (40_000 / pointCountPerLeg),
      });
    }

    expect(processor.filterRawPoints([startedAt + 40_000]).length).toBeGreaterThan(1);
  });
});