const getPositiveFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const getActivityExtraDistanceMeters = (
  activity: { extra_distance?: unknown; extra_distance_km?: unknown } | null | undefined,
): number | null => {
  if (!activity) return null;

  const extraDistanceMeters = getPositiveFiniteNumber(activity.extra_distance);
  if (extraDistanceMeters !== null) return extraDistanceMeters;

  const extraDistanceKm = getPositiveFiniteNumber(activity.extra_distance_km);
  if (extraDistanceKm === null) return null;

  const convertedMeters = extraDistanceKm * 1000;
  return Number.isFinite(convertedMeters) ? convertedMeters : null;
};
