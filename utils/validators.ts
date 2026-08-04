/**
 * Validation utilities for questionnaire inputs
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface TimeComponentValidation extends ValidationResult {
  numericValue: number;
}

/**
 * Validate complete time format HH:MM:SS
 */
export const validateTimeFormat = (time: string): ValidationResult => {
  if (!time || typeof time !== "string") {
    return { valid: false, error: "Time is required" };
  }

  const trimmed = time.trim();
  
  const timeRegex = /^(\d{2}):(\d{2}):(\d{2})$/;
  const match = trimmed.match(timeRegex);

  if (!match) {
    return { valid: false, error: "Invalid format. Use HH:MM:SS (e.g., 01:30:45)" };
  }

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);

  if (hours < 0 || hours > 99) {
    return { valid: false, error: "Hours must be 00-99" };
  }

  if (minutes < 0 || minutes > 59) {
    return { valid: false, error: "Minutes must be 00-59" };
  }

  if (seconds < 0 || seconds > 59) {
    return { valid: false, error: "Seconds must be 00-59" };
  }

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  if (totalSeconds === 0) {
    return { valid: false, error: "Time must be greater than 00:00:00" };
  }

  return { valid: true };
};

/**
 * Validate individual time component
 */
export const validateTimeComponent = (
  value: string,
  type: 'hours' | 'minutes' | 'seconds'
): TimeComponentValidation => {
  const trimmed = value.trim();
  
  if (trimmed === '') {
    return { valid: true, error: undefined, numericValue: 0 };
  }

  const num = parseInt(trimmed, 10);
  if (isNaN(num)) {
    return { valid: false, error: 'Must be a number', numericValue: 0 };
  }

  let max = 59;
  let min = 0;
  let label = '';
  
  if (type === 'hours') {
    max = 99;
    label = 'Hours';
  } else if (type === 'minutes') {
    max = 59;
    label = 'Minutes';
  } else {
    max = 59;
    label = 'Seconds';
  }

  if (num < min || num > max) {
    return { valid: false, error: `${label} must be ${min}-${max}`, numericValue: num };
  }

  return { valid: true, error: undefined, numericValue: num };
};

/**
 * Validate distance (positive decimal number)
 */
export const validateDistance = (distance: string): ValidationResult => {
  if (!distance || typeof distance !== "string") {
    return { valid: false, error: "Distance is required" };
  }

  const trimmed = distance.trim();
  
  if (trimmed === '') {
    return { valid: true };
  }

  const distanceNum = parseFloat(trimmed);

  if (Number.isNaN(distanceNum)) {
    return { valid: false, error: "Distance must be a valid number" };
  }

  if (distanceNum <= 0) {
    return { valid: false, error: "Distance must be greater than 0" };
  }

  if (distanceNum > 999) {
    return { valid: false, error: "Distance must be less than 999" };
  }

  return { valid: true };
};

/**
 * Convert time string HH:MM:SS to total seconds
 */
export const timeToSeconds = (time: string): number | null => {
  const validation = validateTimeFormat(time);
  if (!validation.valid) return null;

  const parts = time.split(":").map((part) => parseInt(part, 10));
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
};

/**
 * Format time from components to HH:MM:SS string
 */
export const normalizeTimePartValue = (value: string, maxLength: number = 2): string => {
  const cleaned = String(value ?? "").replace(/\D/g, "").slice(0, maxLength);
  return cleaned;
};

export const formatTimeFromComponents = (hours: string, minutes: string, seconds: string): string => {
  const h = String(hours ?? "").padStart(2, "0");
  const m = String(minutes ?? "").padStart(2, "0");
  const s = String(seconds ?? "").padStart(2, "0");
  return `${h}:${m}:${s}`;
};

/**
 * Calculate pace from time and distance using the selected unit system
 */
export const calculatePace = (
  timeSeconds: number,
  distanceKm: number,
  distanceUnit: string | null | undefined = "km"
): string => {
  if (!timeSeconds || timeSeconds <= 0 || !distanceKm || distanceKm <= 0) {
    return "";
  }

  const normalizedUnit = String(distanceUnit || "km").trim().toLowerCase();
  const paceUnit = normalizedUnit === "mi" || normalizedUnit === "mile" || normalizedUnit === "miles"
    ? "min/mile"
    : "min/km";

  // `distanceKm` is canonical. Convert only for an imperial pace display so
  // the numerical pace and its unit always describe the same distance.
  const paceDistance = paceUnit === "min/mile" ? distanceKm / 1.60934 : distanceKm;
  const paceSeconds = timeSeconds / paceDistance;
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.round(paceSeconds % 60);

  return `${minutes}:${seconds.toString().padStart(2, "0")} ${paceUnit}`;
};
