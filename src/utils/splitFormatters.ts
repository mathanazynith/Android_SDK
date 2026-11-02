import { SPLIT_DISTANCE_METERS } from '../types/activity';

export const formatSplitDistance = (meters: number): string => {
  if (!Number.isFinite(meters) || meters < 0) return '--';
  if (meters === SPLIT_DISTANCE_METERS) return `${SPLIT_DISTANCE_METERS}m`;
  return `${meters.toFixed(2)}m`;
};

export const formatSplitTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '--';
  const totalSeconds = Math.round(seconds);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

export const formatPace = (secondsPerKm: number): string => {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '--/km';
  const totalSeconds = Math.round(secondsPerKm);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}/km`;
};