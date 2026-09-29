export const formatSplitDistance = (meters: number): string => {
  if (!Number.isFinite(meters) || meters < 0) return '--';
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  const roundedMeters = Number(meters.toFixed(2));
  return `${roundedMeters} m`;
};

export const formatSplitTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '--';
  if (seconds < 60) return `${seconds.toFixed(1).replace(/\.0$/, '')} s`;
  const totalSeconds = Math.round(seconds);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

export const formatPace = (secondsPerKm: number): string => {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '-- /km';
  const totalSeconds = Math.round(secondsPerKm);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')} /km`;
};