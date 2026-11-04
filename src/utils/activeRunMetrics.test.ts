import { describe, expect, it } from 'vitest';
import { calculateActiveRunElapsedSeconds } from './activeRunMetrics';

describe('calculateActiveRunElapsedSeconds', () => {
  it('calculates elapsed time from the run start instead of stale persisted elapsed time', () => {
    expect(calculateActiveRunElapsedSeconds({
      startedAt: '2026-11-04T10:00:00.000Z',
      elapsedSeconds: 30,
    }, Date.parse('2026-11-04T10:05:00.000Z'))).toBe(300);
  });

  it('subtracts completed pauses from elapsed time', () => {
    expect(calculateActiveRunElapsedSeconds({
      startedAt: '2026-11-04T10:00:00.000Z',
      pauseEvents: [{
        paused_at: '2026-11-04T10:01:00.000Z',
        resumed_at: '2026-11-04T10:02:30.000Z',
      }],
    }, Date.parse('2026-11-04T10:05:00.000Z'))).toBe(210);
  });

  it('stops elapsed time while paused', () => {
    expect(calculateActiveRunElapsedSeconds({
      startedAt: '2026-11-04T10:00:00.000Z',
      paused: true,
      pauseEvents: [{
        paused_at: '2026-11-04T10:03:00.000Z',
        resumed_at: null,
      }],
    }, Date.parse('2026-11-04T10:10:00.000Z'))).toBe(180);
  });

  it('uses the saved elapsed value when the start time is unavailable', () => {
    expect(calculateActiveRunElapsedSeconds({
      elapsedSeconds: 40,
      updatedAt: 1_000,
    }, 6_000)).toBe(45);
  });
});
