import { getDistanceUnitCode, type DistanceUnitCode } from '../../utils/distanceUnit';
import { SPLIT_DISTANCE_METERS } from '../types/activity';

const METERS_PER_MILE = 1609.344;
const KILOMETERS_PER_MILE = 1.609344;
const METERS_TO_FEET = 3.28084;
const KILOMETERS_PER_HOUR_TO_MILES_PER_HOUR = 0.621371;
const METERS_PER_SECOND_TO_KILOMETERS_PER_HOUR = 3.6;
const METERS_PER_SECOND_TO_MILES_PER_HOUR = 2.236936;

export const formatDistanceFromMeters = (
  meters: number | null | undefined,
  unit?: string | null,
): string => {
  const value = formatDistanceValueFromMeters(meters, unit);
  if (value === '--') return value;
  const distanceUnit = getDistanceUnitCode(unit);
  return `${value} ${distanceUnit === 'mile' ? 'mi' : 'km'}`;
};

export const formatDistanceValueFromMeters = (
  meters: number | null | undefined,
  unit?: string | null,
): string => {
  if (meters === null || meters === undefined || !Number.isFinite(meters) || meters < 0) return '--';
  const distanceUnit = getDistanceUnitCode(unit);
  const distance = distanceUnit === 'mile' ? meters / METERS_PER_MILE : meters / 1000;
  return distance.toFixed(2);
};

export const formatElevationFromMeters = (
  meters: number | null | undefined,
  unit?: string | null,
): string => {
  if (meters === null || meters === undefined || !Number.isFinite(Number(meters))) return '—';
  const numericMeters = Number(meters);
  return getDistanceUnitCode(unit) === 'mile'
    ? `${Math.round(numericMeters * METERS_TO_FEET)} ft`
    : `${Math.round(numericMeters)} m`;
};

export const formatPaceFromSecondsPerKm = (
  secondsPerKm: number | null | undefined,
  unit?: string | null,
): string => {
  const paceUnit: DistanceUnitCode = getDistanceUnitCode(unit);
  return `${formatPaceValueFromSecondsPerKm(secondsPerKm, unit)} min/${paceUnit === 'mile' ? 'mi' : 'km'}`;
};

export const formatPaceValueFromSecondsPerKm = (
  secondsPerKm: number | null | undefined,
  unit?: string | null,
): string => {
  if (secondsPerKm === null || secondsPerKm === undefined || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) {
    return '--:--';
  }
  const paceUnit: DistanceUnitCode = getDistanceUnitCode(unit);
  const secondsPerDisplayedUnit = paceUnit === 'mile'
    ? secondsPerKm * KILOMETERS_PER_MILE
    : secondsPerKm;
  const totalSeconds = Math.round(secondsPerDisplayedUnit);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

export const formatSplitDistance = (
  meters: number,
  unit?: string | null,
): string => {
  const value = formatSplitDistanceValue(meters, unit);
  if (value === '--') return value;
  return `${value} ${getDistanceUnitCode(unit) === 'mile' ? 'mi' : 'm'}`;
};

export const formatSplitDistanceValue = (
  meters: number,
  unit?: string | null,
): string => {
  if (!Number.isFinite(meters) || meters < 0) return '--';
  if (getDistanceUnitCode(unit) === 'mile') {
    return (meters / METERS_PER_MILE).toFixed(2);
  }
  return meters === SPLIT_DISTANCE_METERS ? String(SPLIT_DISTANCE_METERS) : meters.toFixed(2);
};

export const formatSpeedFromMetersPerSecond = (
  metersPerSecond: number,
  unit?: string | null,
): string => {
  if (!Number.isFinite(metersPerSecond) || metersPerSecond < 0) return '--';
  return getDistanceUnitCode(unit) === 'mile'
    ? `${(metersPerSecond * METERS_PER_SECOND_TO_MILES_PER_HOUR).toFixed(1)} mph`
    : `${(metersPerSecond * METERS_PER_SECOND_TO_KILOMETERS_PER_HOUR).toFixed(1)} km/h`;
};

export const formatSpeedFromKilometersPerHour = (
  kilometersPerHour: number,
  unit?: string | null,
): string => {
  if (!Number.isFinite(kilometersPerHour) || kilometersPerHour < 0) return '--';
  return getDistanceUnitCode(unit) === 'mile'
    ? `${(kilometersPerHour * KILOMETERS_PER_HOUR_TO_MILES_PER_HOUR).toFixed(1)} mph`
    : `${kilometersPerHour.toFixed(1)} km/h`;
};
