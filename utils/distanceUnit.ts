export type DistanceUnitCode = "km" | "mi";
export type DistanceUnitPreference = "standard" | "imperial";

const normalizeDistanceUnitValue = (value?: string | null) => {
  if (!value) return "";
  return String(value).trim().toLowerCase();
};

const isImperialValue = (normalized: string) =>
  ["imperial", "mi", "mile", "miles", "lbs", "lb", "inch", "inches", "in"].includes(normalized);

const isStandardValue = (normalized: string) =>
  ["standard", "metric", "km", "kilometer", "kilometers", "kg", "cm"].includes(normalized);

export const getDistanceUnitCode = (value?: string | null): DistanceUnitCode => {
  const normalized = normalizeDistanceUnitValue(value);

  if (isImperialValue(normalized)) {
    return "mi";
  }

  if (isStandardValue(normalized)) {
    return "km";
  }

  return "km";
};

export const getDistanceUnitPreference = (value?: string | null): DistanceUnitPreference => {
  return getDistanceUnitCode(value) === "mi" ? "imperial" : "standard";
};

export const getDistanceUnitLabel = (value?: string | null): DistanceUnitCode => {
  return getDistanceUnitCode(value);
};

export const getDistanceUnitDisplayLabel = (value?: string | null): string => {
  return getDistanceUnitCode(value) === "mi" ? "mi" : "km";
};

export const getDistanceUnitPaceLabel = (value?: string | null): string => {
  return getDistanceUnitCode(value) === "mi" ? "min/mile" : "min/km";
};

export const getDistanceUnitDisplayText = (value?: string | null): string => {
  return getDistanceUnitCode(value) === "mi" ? "mile" : "km";
};

export const getHeightUnitLabel = (value?: string | null): string => {
  return getDistanceUnitCode(value) === "mi" ? "in" : "cm";
};

export const getWeightUnitLabel = (value?: string | null): string => {
  return getDistanceUnitCode(value) === "mi" ? "lb" : "kg";
};

export const getUnitSystemLabel = (value?: string | null): string => {
  const preference = getDistanceUnitPreference(value);
  return preference === "imperial"
    ? "Imperial (mile / in / lb)"
    : "Standard (Km / cm / kg)";
};

export const convertDistanceToKilometers = (distance: number, value?: string | null): number => {
  if (getDistanceUnitCode(value) === "mi") {
    return distance * 1.60934;
  }

  return distance;
};

export const convertKilometersToDisplay = (distance: number, value?: string | null): number => {
  if (getDistanceUnitCode(value) === "mi") {
    return distance / 1.60934;
  }

  return distance;
};
