import type { Question } from "../service/questionnaire/questionnaireService";
import { timeToSeconds, validateTimeFormat } from "./validators";

const parseISODate = (value: string): Date | null => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;

  return date;
};

export const getMinimumEventDate = (
  minimumAvailableDate?: string | null,
  referenceDate = new Date()
): Date => {
  const parsedAvailableDate = minimumAvailableDate ? parseISODate(minimumAvailableDate) : null;
  const minimumDate = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  if (parsedAvailableDate) {
    const backendDate = new Date(
      parsedAvailableDate.getUTCFullYear(),
      parsedAvailableDate.getUTCMonth(),
      parsedAvailableDate.getUTCDate()
    );
    if (backendDate > minimumDate) return backendDate;
  }

  return minimumDate;
};

export const getAvailableEventDate = (prediction: unknown): string | null => {
  if (!prediction || typeof prediction !== "object") return null;

  const record = prediction as Record<string, unknown>;
  const dateKeys = [
    "available_date",
    "earliest_available_date",
    "earliest_event_date",
    "minimum_event_date",
    "min_event_date",
    "available_from_date",
    "event_date_available_from",
  ];
  const availabilityKeys = ["availability", "event_date_availability", "date_availability"];
  const sources = [
    record,
    ...availabilityKeys
      .map((key) => record[key])
      .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object"),
  ];

  for (const source of sources) {
    for (const key of dateKeys) {
      const candidate = source[key];
      if (typeof candidate === "string" && parseISODate(candidate)) return candidate;
    }
  }

  return null;
};

export const getQuestionClientValidationMessages = (
  question: Question,
  answer: { value?: any; unit?: string | null; customValues?: Record<string, any> } | undefined,
  overrideValue?: any,
  requireTime = question.isRequired,
  minimumDate?: string | null
): string[] => {
  const messages = new Set<string>();
  const selectedOption = question.options?.find(
    (option) => String(option.id) === String(answer?.value)
  );
  const usesCustomInput = selectedOption?.requires_input === true
    || /custom/i.test(String(selectedOption?.label ?? selectedOption?.text ?? ""));
  const customDistance = answer?.customValues?.distance ?? answer?.customValues?.targetDistance;
  const value = overrideValue !== undefined
    ? overrideValue
    : usesCustomInput
      ? customDistance
      : question.type === "time"
        ? answer?.value ?? answer?.customValues?.time ?? answer?.customValues?.targetTime
        : selectedOption?.numeric_value ?? answer?.value;

  if (question.type === "plan_selection" || question.type === "recent_long_run") {
    const customTime = String(answer?.customValues?.time ?? answer?.customValues?.targetTime ?? "").trim();
    if (customTime) {
      const timeValidation = validateTimeFormat(customTime);
      if (!timeValidation.valid) {
        messages.add(timeValidation.error ?? "Enter a valid time in HH:MM:SS format.");
      }
    } else if (
      requireTime
      && Boolean(selectedOption)
    ) {
      messages.add("Please select a time.");
    }
  }

  if (value === undefined || value === null || String(value).trim() === "") {
    if (question.type === "time" && requireTime) {
      messages.add("Please select a time.");
    }
    return [...messages];
  }

  const valueText = String(value).trim();
  const dateValue = question.type === "date" ? parseISODate(valueText) : null;
  if (question.type === "date" && !dateValue) {
    messages.add("Select a valid date.");
  }
  const availableDate = minimumDate ? parseISODate(minimumDate) : null;
  if (dateValue && availableDate && dateValue < availableDate) {
    messages.add(`Select a date on or after ${minimumDate}.`);
  }

  if (question.type === "time") {
    const timeValidation = validateTimeFormat(valueText);
    if (!timeValidation.valid) {
      messages.add(timeValidation.error ?? "Enter a valid time in HH:MM:SS format.");
    }
  }

  const validation = question.validation;
  if (validation?.pattern) {
    try {
      if (!new RegExp(validation.pattern).test(valueText)) {
        messages.add("Value does not match the required format.");
      }
    } catch (error) {
      console.error(`[Questionnaire] Invalid validation pattern for ${question.slug ?? question.id}:`, error);
    }
  }

  if (validation?.min !== undefined || validation?.max !== undefined) {
    const minValue = typeof validation.min === "number" ? validation.min : undefined;
    const maxValue = typeof validation.max === "number" ? validation.max : undefined;
    const minDate = question.type === "date" && typeof validation.min === "string"
      ? parseISODate(validation.min)
      : null;
    const maxDate = question.type === "date" && typeof validation.max === "string"
      ? parseISODate(validation.max)
      : null;

    if (dateValue && minDate && dateValue < minDate) {
      messages.add(`Date must be on or after ${validation.min}.`);
    }
    if (dateValue && maxDate && dateValue > maxDate) {
      messages.add(`Date must be on or before ${validation.max}.`);
    }

    const numericValue = question.type === "date"
      ? null
      : question.type === "time"
        ? timeToSeconds(valueText)
        : Number(valueText);
    if (numericValue === null || !Number.isFinite(numericValue)) {
      if (question.type !== "time" && question.type !== "date") messages.add("Enter a valid number.");
    } else {
      if (minValue !== undefined && numericValue < minValue) {
        messages.add(`Value must be at least ${minValue}.`);
      }
      if (maxValue !== undefined && numericValue > maxValue) {
        messages.add(`Value must be no more than ${maxValue}.`);
      }
    }
  }

  if (usesCustomInput && customDistance !== undefined && Number(customDistance) <= 0) {
    messages.add("Distance must be greater than 0.");
  }

  const allowedUnits = String(question.allowed_input_units ?? "")
    .split(",")
    .map((unit) => {
      const normalized = unit.trim().toLowerCase();
      if (/^(km|kilometers?|kilometres?)$/.test(normalized)) return "km";
      if (/^miles?$/.test(normalized)) return "mi";
      return normalized;
    })
    .filter(Boolean);
  const rawAnswerUnit = String(answer?.unit ?? answer?.customValues?.unit ?? "").trim().toLowerCase();
  const answerUnit = /^(km|kilometers?|kilometres?)$/.test(rawAnswerUnit)
    ? "km"
    : /^miles?$/.test(rawAnswerUnit)
      ? "mi"
      : rawAnswerUnit;
  if (allowedUnits.length && answerUnit && !allowedUnits.includes(answerUnit)) {
    messages.add(`Supported units: ${allowedUnits.join(", ")}.`);
  }

  return [...messages];
};
