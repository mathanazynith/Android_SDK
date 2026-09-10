export type DistanceUnitType = "km" | "m" | "mi";

export const normalizeUnit = (unitStr?: string | null): DistanceUnitType => {
  if (!unitStr) return "km";
  const lower = unitStr.toLowerCase().trim();
  if (lower === "km" || lower.includes("kilo") || lower.includes("(km)")) return "km";
  if (lower === "mi" || lower.includes("mile") || lower.includes("(mi)")) return "mi";
  if (lower === "m" || lower === "meter" || lower === "meters" || lower.includes("(m)")) return "m";
  return "km";
};

export const getUnitFullLabel = (unit: DistanceUnitType): string => {
  if (unit === "m") return "Meters (m)";
  if (unit === "mi") return "Miles (mi)";
  return "Kilometers (km)";
};

export const getUnitLabel = (unit: DistanceUnitType): string => {
  if (unit === "m") return "m";
  if (unit === "mi") return "mi";
  return "km";
};

export const getPaceUnitLabel = (unit: DistanceUnitType): string => {
  if (unit === "mi") return "min/mi";
  return "min/km";
};

export const parsePaceToSeconds = (paceStr?: string | null): number | null => {
  if (!paceStr) return null;
  const match = paceStr.match(/(\d+)\s*:\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const min = parseInt(match[1], 10) || 0;
  const sec = parseFloat(match[2]) || 0;
  const total = min * 60 + sec;
  return total > 0 ? total : null;
};

export const formatSecondsToPace = (
  totalSeconds: number,
  unit: DistanceUnitType = "km",
  includeUnitSuffix = true
): string => {
  if (!totalSeconds || totalSeconds <= 0 || !Number.isFinite(totalSeconds)) return "";
  const rounded = Math.round(totalSeconds);
  const min = Math.floor(rounded / 60);
  const sec = rounded % 60;
  const paceBase = `${min}:${String(sec).padStart(2, "0")}`;
  if (!includeUnitSuffix) return paceBase;
  const suffix = unit === "mi" ? "/ mi" : "/ km";
  return `${paceBase} ${suffix}`;
};

export const calculateTwoFields = ({
  durationSec,
  distanceVal,
  paceStr,
  unit,
}: {
  durationSec: number | null;
  distanceVal: number | null;
  paceStr: string | null;
  unit: DistanceUnitType;
}): {
  calculatedDuration: number | null;
  calculatedDistance: string;
  calculatedPace: string;
} => {
  const paceSec = parsePaceToSeconds(paceStr);
  const hasDuration = durationSec != null && durationSec > 0;
  const hasDistance = distanceVal != null && distanceVal > 0;
  const hasPace = paceSec != null && paceSec > 0;

  const filledCount = [hasDuration, hasDistance, hasPace].filter(Boolean).length;
  if (filledCount < 2) {
    return {
      calculatedDuration: null,
      calculatedDistance: "",
      calculatedPace: "",
    };
  }

  // 1. Calculate Duration if distance + pace are provided
  if (!hasDuration && hasDistance && hasPace && distanceVal && paceSec) {
    let dur = 0;
    if (unit === "m") {
      // Pace is per km, so (distance in meters / 1000) * paceSec
      dur = (distanceVal / 1000) * paceSec;
    } else {
      dur = distanceVal * paceSec;
    }
    return {
      calculatedDuration: Math.round(dur),
      calculatedDistance: "",
      calculatedPace: "",
    };
  }

  // 2. Calculate Distance if duration + pace are provided
  if (!hasDistance && hasDuration && hasPace && durationSec && paceSec) {
    if (unit === "m") {
      const dist = (durationSec / paceSec) * 1000;
      return {
        calculatedDuration: null,
        calculatedDistance: String(Math.round(dist)),
        calculatedPace: "",
      };
    } else {
      const dist = durationSec / paceSec;
      return {
        calculatedDuration: null,
        calculatedDistance: dist.toFixed(2),
        calculatedPace: "",
      };
    }
  }

  // 3. Calculate Pace if duration + distance are provided
  if (!hasPace && hasDuration && hasDistance && durationSec && distanceVal) {
    let pacePerUnit = 0;
    if (unit === "m") {
      // Pace in sec/km = durationSec / (distanceVal / 1000)
      pacePerUnit = durationSec / (distanceVal / 1000);
    } else {
      pacePerUnit = durationSec / distanceVal;
    }
    return {
      calculatedDuration: null,
      calculatedDistance: "",
      calculatedPace: formatSecondsToPace(pacePerUnit, unit),
    };
  }

  return {
    calculatedDuration: null,
    calculatedDistance: "",
    calculatedPace: "",
  };
};
