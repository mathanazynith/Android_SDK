export type DistanceUnitCode = "km" | "mi";
export type DistanceUnitPreference = "metric" | "imperial";

const normalizeDistanceUnitValue = (value?: string | null) => {
  if (!value) return "";
  return String(value).trim().toLowerCase();
};

export const getDistanceUnitCode = (value?: string | null): DistanceUnitCode => {
  const normalized = normalizeDistanceUnitValue(value);

  if (normalized === "imperial" || normalized === "mi" || normalized === "mile" || normalized === "miles") {
    return "mi";
  }

  if (normalized === "metric" || normalized === "km" || normalized === "kilometer" || normalized === "kilometers") {
    return "km";
  }

  return "km";
};

export const getDistanceUnitPreference = (value?: string | null): DistanceUnitPreference => {
  return getDistanceUnitCode(value) === "mi" ? "imperial" : "metric";
};

export const getDistanceUnitLabel = (value?: string | null): "km" | "mi" => {
  return getDistanceUnitCode(value);
};

export const getDistanceUnitDisplayLabel = (value?: string | null): string => {
  return getDistanceUnitCode(value) === "mi" ? "mi" : "km";
};
