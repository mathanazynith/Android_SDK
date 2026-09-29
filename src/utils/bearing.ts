export const normalizeDegrees = (degrees: number): number => {
  let normalized = degrees % 360;
  if (normalized < 0) {
    normalized += 360;
  }

  return normalized;
};

export const calculateBearing = (
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): number => {
  const startLat = (from.latitude * Math.PI) / 180;
  const startLon = (from.longitude * Math.PI) / 180;
  const endLat = (to.latitude * Math.PI) / 180;
  const endLon = (to.longitude * Math.PI) / 180;

  const y = Math.sin(endLon - startLon) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLon - startLon);

  const angle = (Math.atan2(y, x) * 180) / Math.PI;

  return normalizeDegrees(angle);
};

export const calculateHeadingChange = (bearingA: number, bearingB: number): number => {
  const diff = Math.abs(bearingB - bearingA);
  const normalized = Math.min(diff, 360 - diff);

  return normalized;
};
