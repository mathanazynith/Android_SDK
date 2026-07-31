const normalizeDistanceUnitValue = (value) => {
  if (!value) return "";
  return String(value).trim().toLowerCase();
};

const isImperialValue = (normalized) =>
  ["imperial", "mi", "mile", "miles", "lbs", "lb", "inch", "inches", "in"].includes(normalized);

const isStandardValue = (normalized) =>
  ["standard", "metric", "km", "kilometer", "kilometers", "kg", "cm"].includes(normalized);

const getDistanceUnitCode = (value) => {
  const normalized = normalizeDistanceUnitValue(value);

  if (isImperialValue(normalized)) {
    return "mi";
  }

  if (isStandardValue(normalized)) {
    return "km";
  }

  return "km";
};

const getDistanceUnitPreference = (value) => {
  return getDistanceUnitCode(value) === "mi" ? "imperial" : "standard";
};

const getDistanceUnitLabel = (value) => {
  return getDistanceUnitCode(value);
};

module.exports = {
  getDistanceUnitCode,
  getDistanceUnitPreference,
  getDistanceUnitLabel,
};
