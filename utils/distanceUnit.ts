// utils/distanceUnit.ts

export type DistanceUnitCode = "km" | "mile";
export type DistanceUnitPreference = "standard" | "imperial";

const normalizeDistanceUnitValue = (value?: string | null) => {
  if (!value) return "";
  return String(value).trim().toLowerCase();
};

const isImperialValue = (normalized: string) =>
  ["imperial", "mi", "mile", "miles", "lbs", "lb", "inch", "inches", "in"].includes(normalized);

const isStandardValue = (normalized: string) =>
  ["standard", "metric", "km", "kilometer", "kilometers", "kg", "cm"].includes(normalized);

// ✅ FIX: Return "mile" instead of "mi" for backend compatibility
export const getDistanceUnitCode = (value?: string | null): DistanceUnitCode => {
  const normalized = normalizeDistanceUnitValue(value);

  if (isImperialValue(normalized)) {
    return "mile";  // ✅ Changed from "mi" to "mile"
  }

  if (isStandardValue(normalized)) {
    return "km";
  }

  return "km";
};

export const getDistanceUnitPreference = (value?: string | null): DistanceUnitPreference => {
  return getDistanceUnitCode(value) === "mile" ? "imperial" : "standard";
};

export const getDistanceUnitLabel = (value?: string | null): DistanceUnitCode => {
  return getDistanceUnitCode(value);
};

export const getDistanceUnitDisplayLabel = (value?: string | null): string => {
  return getDistanceUnitCode(value) === "mile" ? "mi" : "km";
};

export const getDistanceUnitPaceLabel = (value?: string | null): string => {
  return getDistanceUnitCode(value) === "mile" ? "min/mile" : "min/km";
};

export const getDistanceUnitDisplayText = (value?: string | null): string => {
  return getDistanceUnitCode(value) === "mile" ? "mile" : "km";
};

export const getHeightUnitLabel = (value?: string | null): string => {
  return getDistanceUnitCode(value) === "mile" ? "in" : "cm";
};

export const getWeightUnitLabel = (value?: string | null): string => {
  return getDistanceUnitCode(value) === "mile" ? "lb" : "kg";
};

export const getUnitSystemLabel = (value?: string | null): string => {
  const preference = getDistanceUnitPreference(value);
  return preference === "imperial"
    ? "Imperial (mile / in / lb)"
    : "Standard (Km / cm / kg)";
};

export const convertDistanceToKilometers = (distance: number, value?: string | null): number => {
  if (getDistanceUnitCode(value) === "mile") {
    return distance * 1.60934;
  }
  return distance;
};

export const convertKilometersToDisplay = (distance: number, value?: string | null): number => {
  if (getDistanceUnitCode(value) === "mile") {
    return distance / 1.60934;
  }
  return distance;
};