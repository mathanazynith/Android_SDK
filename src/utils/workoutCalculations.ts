export type DistanceUnitType = "km" | "m" | "mi";

export const MAX_DISTANCE_KM = 100;
export const MAX_DISTANCE_MI = 100;
export const MAX_DISTANCE_M = 100_000;

export const getMaxDistanceForUnit = (unitStr?: string | null): number => {
  const u = normalizeUnit(unitStr);
  if (u === "m") return MAX_DISTANCE_M;
  if (u === "mi") return MAX_DISTANCE_MI;
  return MAX_DISTANCE_KM;
};

export const sanitizeDistanceInput = (
  text: string,
  unitStr?: string | null
): string => {
  if (!text) return "";
  const clean = text.replace(",", ".");
  if (clean === "." || clean === "0." || clean === "0") return text;
  const num = parseFloat(clean);
  if (isNaN(num)) return text;
  const max = getMaxDistanceForUnit(unitStr);
  if (num > max) {
    return String(max);
  }
  return text;
};

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
  const matches = [...paceStr.matchAll(/(\d+)\s*:\s*(\d+(?:\.\d+)?)/g)];
  if (!matches || matches.length === 0) return null;
  if (matches.length >= 2) {
    const sec1 = (parseInt(matches[0][1], 10) || 0) * 60 + (parseFloat(matches[0][2]) || 0);
    const sec2 = (parseInt(matches[1][1], 10) || 0) * 60 + (parseFloat(matches[1][2]) || 0);
    const avg = Math.round((sec1 + sec2) / 2);
    return avg > 0 ? avg : null;
  }
  const min = parseInt(matches[0][1], 10) || 0;
  const sec = parseFloat(matches[0][2]) || 0;
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
  const suffix = unit === "mi" ? "min/mi" : "min/km";
  return `${paceBase} ${suffix}`;
};

export const convertDistance = (
  distance: number,
  fromUnit: DistanceUnitType,
  toUnit: DistanceUnitType
): number => {
  if (!distance || distance <= 0 || !Number.isFinite(distance)) return 0;
  const f = normalizeUnit(fromUnit);
  const t = normalizeUnit(toUnit);
  if (f === t) return distance;

  let meters = distance;
  if (f === "km") meters = distance * 1000;
  else if (f === "mi") meters = distance * 1609.344;

  if (t === "km") return meters / 1000;
  if (t === "mi") return meters / 1609.344;
  return meters;
};

export const convertPace = (
  paceStrOrSec: string | number | null | undefined,
  fromUnit: DistanceUnitType,
  toUnit: DistanceUnitType,
  includeUnitSuffix = true
): string => {
  if (!paceStrOrSec) return "--:--";

  const normFrom = normalizeUnit(fromUnit);
  const normTo = normalizeUnit(toUnit);
  const baseFrom: DistanceUnitType = normFrom === "m" ? "km" : normFrom;
  const baseTo: DistanceUnitType = normTo === "m" ? "km" : normTo;

  if (typeof paceStrOrSec === "number") {
    if (paceStrOrSec <= 0 || !Number.isFinite(paceStrOrSec)) return "--:--";
    let targetSec = paceStrOrSec;
    if (baseFrom === "mi" && baseTo === "km") {
      targetSec = Math.round(paceStrOrSec / 1.609344);
    } else if (baseFrom === "km" && baseTo === "mi") {
      targetSec = Math.round(paceStrOrSec * 1.609344);
    }
    return formatSecondsToPace(targetSec, baseTo, includeUnitSuffix);
  }

  const paceStr = String(paceStrOrSec).trim();
  if (!paceStr || paceStr === "--:--") return "--:--";

  const matches = [...paceStr.matchAll(/(\d+)\s*:\s*(\d+(?:\.\d+)?)/g)];
  if (!matches || matches.length === 0) return paceStr;

  if (matches.length >= 2) {
    const s1 = (parseInt(matches[0][1], 10) || 0) * 60 + (parseFloat(matches[0][2]) || 0);
    const s2 = (parseInt(matches[1][1], 10) || 0) * 60 + (parseFloat(matches[1][2]) || 0);

    let t1 = s1;
    let t2 = s2;
    if (baseFrom === "mi" && baseTo === "km") {
      t1 = Math.round(s1 / 1.609344);
      t2 = Math.round(s2 / 1.609344);
    } else if (baseFrom === "km" && baseTo === "mi") {
      t1 = Math.round(s1 * 1.609344);
      t2 = Math.round(s2 * 1.609344);
    }

    const min1 = Math.floor(t1 / 60);
    const sec1 = t1 % 60;
    const min2 = Math.floor(t2 / 60);
    const sec2 = t2 % 60;

    const formattedRange = `${min1}:${String(sec1).padStart(2, "0")} - ${min2}:${String(sec2).padStart(2, "0")}`;
    if (!includeUnitSuffix) return formattedRange;
    return `${formattedRange} ${getPaceUnitLabel(baseTo)}`;
  }

  const min = parseInt(matches[0][1], 10) || 0;
  const sec = parseFloat(matches[0][2]) || 0;
  const total = min * 60 + sec;

  let convertedSec = total;
  if (baseFrom === "mi" && baseTo === "km") {
    convertedSec = Math.round(total / 1.609344);
  } else if (baseFrom === "km" && baseTo === "mi") {
    convertedSec = Math.round(total * 1.609344);
  }

  return formatSecondsToPace(convertedSec, baseTo, includeUnitSuffix);
};

export const convertPaceToSeconds = (
  paceSec: number,
  fromUnit: DistanceUnitType,
  toUnit: DistanceUnitType
): number => {
  if (!paceSec || paceSec <= 0 || !Number.isFinite(paceSec)) return 0;
  const baseFrom = normalizeUnit(fromUnit) === "m" ? "km" : normalizeUnit(fromUnit);
  const baseTo = normalizeUnit(toUnit) === "m" ? "km" : normalizeUnit(toUnit);
  if (baseFrom === baseTo) return paceSec;
  if (baseFrom === "mi" && baseTo === "km") {
    return Math.round(paceSec / 1.609344);
  }
  if (baseFrom === "km" && baseTo === "mi") {
    return Math.round(paceSec * 1.609344);
  }
  return paceSec;
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
      const capped = Math.min(dist, MAX_DISTANCE_M);
      return {
        calculatedDuration: null,
        calculatedDistance: String(Math.round(capped)),
        calculatedPace: "",
      };
    } else {
      const dist = durationSec / paceSec;
      const max = unit === "mi" ? MAX_DISTANCE_MI : MAX_DISTANCE_KM;
      const capped = Math.min(dist, max);
      return {
        calculatedDuration: null,
        calculatedDistance: capped.toFixed(2),
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
