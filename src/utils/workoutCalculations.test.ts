import { describe, expect, it } from 'vitest';
import { formatPaceForUnit, getPaceDistanceUnit } from './workoutCalculations';

describe('pace unit conversion', () => {
  it('detects pace source units without treating "min" as miles', () => {
    expect(getPaceDistanceUnit('min/km')).toBe('km');
    expect(getPaceDistanceUnit('min/mi')).toBe('mi');
    expect(getPaceDistanceUnit('min/mile')).toBe('mi');
  });

  it('converts single and ranged paces to the selected unit', () => {
    expect(formatPaceForUnit('5:00', 'min/km', 'mi')).toBe('8:03 min/mi');
    expect(formatPaceForUnit('5:00 - 6:00', 'min/km', 'mi')).toBe('8:03 - 9:39 min/mi');
    expect(formatPaceForUnit('5:00', 'min/mi', 'km')).toBe('3:06 min/km');
  });
});
