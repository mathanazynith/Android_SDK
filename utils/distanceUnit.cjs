const normalizeDistanceUnitValue = (value) => {
  if (!value) return "";
  return String(value).trim().toLowerCase();
};

const getDistanceUnitCode = (value) => {
  const normalized = normalizeDistanceUnitValue(value);

  if (normalized === "imperial" || normalized === "mi" || normalized === "mile" || normalized === "miles") {
    return "mi";
  }

  if (normalized === "metric" || normalized === "km" || normalized === "kilometer" || normalized === "kilometers") {
    return "km";
  }

  return "km";
};

const getDistanceUnitPreference = (value) => {
  return getDistanceUnitCode(value) === "mi" ? "imperial" : "metric";
};

const getDistanceUnitLabel = (value) => {
  return getDistanceUnitCode(value);
};

module.exports = {
  getDistanceUnitCode,
  getDistanceUnitPreference,
  getDistanceUnitLabel,
};
