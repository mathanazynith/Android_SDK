/// <reference types="node" />
import { deepStrictEqual, strictEqual } from 'node:assert';
import { describe, it } from 'node:test';
import { tagLocationBatch } from './locationPointTagging.ts';

const point = (timestamp: string) => ({
  latitude: 37,
  longitude: -122,
  timestamp,
});

describe('tagLocationBatch', () => {
  it('classifies a batch that spans pause and resume by each point timestamp', () => {
    const result = tagLocationBatch([
      point('2026-10-21T10:00:00.000Z'),
      point('2026-10-21T10:00:10.000Z'),
      point('2026-10-21T10:00:20.000Z'),
      point('2026-10-21T10:00:31.000Z'),
    ], {
      paused: false,
      pauseEvents: [{
        paused_at: '2026-10-21T10:00:10.000Z',
        resumed_at: '2026-10-21T10:00:30.000Z',
      }],
    });

    deepStrictEqual(result.map(({ traceType }) => traceType), ['active', 'pause', 'pause', 'active']);
  });

  it('uses the current pause flag only for samples at or after an open pause start', () => {
    const result = tagLocationBatch([
      point('2026-10-21T10:00:09.000Z'),
      point('2026-10-21T10:00:10.000Z'),
      point('2026-10-21T10:00:11.000Z'),
    ], {
      paused: true,
      pauseEvents: [{ paused_at: '2026-10-21T10:00:10.000Z', resumed_at: null }],
    });

    deepStrictEqual(result.map(({ traceType }) => traceType), ['active', 'pause', 'pause']);
  });

  it('handles Date timestamps and falls back to paused when no interval exists', () => {
    const result = tagLocationBatch([
      { ...point(''), timestamp: new Date('2026-10-21T10:00:11.000Z') },
    ], { paused: true, pauseEvents: [] });

    strictEqual(result[0]?.traceType, 'pause');
  });
});
