import { describe, expect, it } from 'vitest';
import {
  calculateRolloverTime,
  DEFAULT_TIME_VALUE,
  formatTimeValue,
  parseTimeValue,
  TimeParts,
} from './timePickerUtils';

describe('timePickerUtils', () => {
  it('parses and formats time strings correctly', () => {
    expect(parseTimeValue('01:30:45', 99)).toEqual({ hours: 1, minutes: 30, seconds: 45 });
    expect(parseTimeValue(undefined, 99)).toEqual({ hours: 1, minutes: 0, seconds: 0 });
    expect(parseTimeValue(undefined, 99, true)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
    expect(formatTimeValue({ hours: 1, minutes: 30, seconds: 45 })).toBe('01:30:45');
    expect(formatTimeValue({ hours: 0, minutes: 5, seconds: 9 })).toBe('00:05:09');
  });

  it('keeps minutes unchanged when scrolling seconds within the same cycle (no rollover)', () => {
    const initialTime: TimeParts = { hours: 0, minutes: 5, seconds: 58 };
    const prevIndex = 7 * 60 + 58;
    const newIndex = 7 * 60 + 59;

    const result = calculateRolloverTime(initialTime, 'seconds', newIndex, prevIndex, 99);
    expect(result.cycleDelta).toBe(0);
    expect(result.nextTime).toEqual({ hours: 0, minutes: 5, seconds: 59 });
  });

  it('increments minutes (+1) when scrolling seconds hits 59 then starts with 00', () => {
    const initialTime: TimeParts = { hours: 0, minutes: 5, seconds: 59 };
    const prevIndex = 7 * 60 + 59;
    const newIndex = 8 * 60 + 0; // hits 59 then starts again with 00

    const result = calculateRolloverTime(initialTime, 'seconds', newIndex, prevIndex, 99);
    expect(result.cycleDelta).toBe(1);
    expect(result.nextTime).toEqual({ hours: 0, minutes: 6, seconds: 0 });
    expect(formatTimeValue(result.nextTime)).toBe('00:06:00');
  });

  it('increments hours (+1) and sets minutes to 00 when seconds rollover carries through 59 minutes', () => {
    const initialTime: TimeParts = { hours: 0, minutes: 59, seconds: 59 };
    const prevIndex = 7 * 60 + 59;
    const newIndex = 8 * 60 + 0;

    const result = calculateRolloverTime(initialTime, 'seconds', newIndex, prevIndex, 99);
    expect(result.cycleDelta).toBe(1);
    expect(result.nextTime).toEqual({ hours: 1, minutes: 0, seconds: 0 });
    expect(formatTimeValue(result.nextTime)).toBe('01:00:00');
  });

  it('increments hours (+1) when scrolling minutes hits 59 then starts with 00', () => {
    const initialTime: TimeParts = { hours: 1, minutes: 59, seconds: 30 };
    const prevIndex = 7 * 60 + 59;
    const newIndex = 8 * 60 + 0; // hits 59 then starts again with 00

    const result = calculateRolloverTime(initialTime, 'minutes', newIndex, prevIndex, 99);
    expect(result.cycleDelta).toBe(1);
    expect(result.nextTime).toEqual({ hours: 2, minutes: 0, seconds: 30 });
    expect(formatTimeValue(result.nextTime)).toBe('02:00:30');
  });

  it('decrements minutes (-1) when scrolling seconds backward from 00 to 59', () => {
    const initialTime: TimeParts = { hours: 0, minutes: 6, seconds: 0 };
    const prevIndex = 8 * 60 + 0;
    const newIndex = 7 * 60 + 59;

    const result = calculateRolloverTime(initialTime, 'seconds', newIndex, prevIndex, 99);
    expect(result.cycleDelta).toBe(-1);
    expect(result.nextTime).toEqual({ hours: 0, minutes: 5, seconds: 59 });
    expect(formatTimeValue(result.nextTime)).toBe('00:05:59');
  });

  it('borrows from hours when scrolling minutes backward from 00 to 59', () => {
    const initialTime: TimeParts = { hours: 2, minutes: 0, seconds: 30 };
    const prevIndex = 8 * 60 + 0;
    const newIndex = 7 * 60 + 59;

    const result = calculateRolloverTime(initialTime, 'minutes', newIndex, prevIndex, 99);
    expect(result.cycleDelta).toBe(-1);
    expect(result.nextTime).toEqual({ hours: 1, minutes: 59, seconds: 30 });
    expect(formatTimeValue(result.nextTime)).toBe('01:59:30');
  });

  it('allows scrolling hours independently without affecting minutes or seconds', () => {
    const initialTime: TimeParts = { hours: 1, minutes: 25, seconds: 40 };

    const result = calculateRolloverTime(initialTime, 'hours', 5, 1, 99);
    expect(result.cycleDelta).toBe(0);
    expect(result.nextTime).toEqual({ hours: 5, minutes: 25, seconds: 40 });
    expect(formatTimeValue(result.nextTime)).toBe('05:25:40');
  });

  it('clamps hours to maxHours when scrolling hours', () => {
    const initialTime: TimeParts = { hours: 50, minutes: 0, seconds: 0 };
    const result = calculateRolloverTime(initialTime, 'hours', 120, 50, 99);
    expect(result.nextTime.hours).toBe(99);
  });

  it('clamps to 00:00:00 and prevents negative time when scrolling backward below zero', () => {
    const initialTime: TimeParts = { hours: 0, minutes: 0, seconds: 0 };
    const prevIndex = 7 * 60 + 0;
    const newIndex = 6 * 60 + 59;

    const result = calculateRolloverTime(initialTime, 'seconds', newIndex, prevIndex, 99);
    expect(result.nextTime.hours).toBe(0);
    expect(result.nextTime.minutes).toBe(0);
    expect(result.nextTime.seconds).toBe(59);
  });
});
