import { describe, expect, it } from "vitest";
import type { Question } from "../service/questionnaire/questionnaireService";
import {
  getAvailableEventDate,
  getMinimumEventDate,
  getQuestionClientValidationMessages,
} from "./questionnaireValidation";

const makeQuestion = (overrides: Partial<Question> = {}): Question => ({
  id: "q1",
  question: "Test question",
  type: "number",
  isRequired: false,
  ...overrides,
});

describe("getQuestionClientValidationMessages", () => {
  it("applies backend numeric min and max rules immediately", () => {
    const question = makeQuestion({ validation: { min: 2, max: 5 } });
    const patternedQuestion = makeQuestion({
      type: "text",
      validation: { pattern: "^[A-Z]{2}$" },
    });

    expect(getQuestionClientValidationMessages(question, { value: "1" }))
      .toContain("Value must be at least 2.");
    expect(getQuestionClientValidationMessages(question, { value: "6" }))
      .toContain("Value must be no more than 5.");
    expect(getQuestionClientValidationMessages(patternedQuestion, { value: "abc" }))
      .toContain("Value does not match the required format.");
  });

  it("validates time format and backend time bounds in seconds", () => {
    const question = makeQuestion({
      type: "time",
      isRequired: true,
      validation: { min: 3600 },
    });

    expect(getQuestionClientValidationMessages(question, undefined))
      .toContain("Please select a time.");
    expect(getQuestionClientValidationMessages(question, { value: "00:70:00" }))
      .toContain("Minutes must be 00-59");
    expect(getQuestionClientValidationMessages(question, { value: "00:30:00" }))
      .toContain("Value must be at least 3600.");
  });

  it("validates custom distance, custom time, and allowed units", () => {
    const question = makeQuestion({
      type: "plan_selection",
      allowed_input_units: "km",
      options: [{
        id: "custom",
        label: "Custom distance",
        value: "custom",
        requires_input: true,
      }],
    });

    const messages = getQuestionClientValidationMessages(question, {
      value: "custom",
      unit: "miles",
      customValues: { distance: "-1", time: "00:70:00" },
    });

    expect(messages).toContain("Distance must be greater than 0.");
    expect(messages).toContain("Minutes must be 00-59");
    expect(messages).toContain("Supported units: km.");
  });

  it("reports missing time after a required custom workout selection", () => {
    const question = makeQuestion({
      type: "plan_selection",
      isRequired: true,
      options: [{
        id: "custom",
        label: "Custom distance",
        value: "custom",
        requires_input: true,
      }],
    });

    expect(getQuestionClientValidationMessages(question, { value: "custom" }))
      .toContain("Please select a time.");
  });

  it("does not show value errors while a field is empty", () => {
    const question = makeQuestion({ validation: { min: 1 } });

    expect(getQuestionClientValidationMessages(question, { value: "" })).toEqual([]);
  });

  it("validates date format and backend-provided date bounds immediately", () => {
    const question = makeQuestion({
      type: "date",
      validation: { min: "2026-10-01", max: "2026-12-31", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    });

    expect(getQuestionClientValidationMessages(question, { value: "2026-09-30" }))
      .toContain("Date must be on or after 2026-10-01.");
    expect(getQuestionClientValidationMessages(question, { value: "2027-01-01" }))
      .toContain("Date must be on or before 2026-12-31.");
    expect(getQuestionClientValidationMessages(question, { value: "2026-02-30" }))
      .toContain("Select a valid date.");
    expect(getQuestionClientValidationMessages(question, { value: "2026-10-15" }))
      .toEqual([]);
  });

  it("extracts a valid earliest event date from backend availability data", () => {
    expect(getAvailableEventDate({ available_date: "2026-11-15" })).toBe("2026-11-15");
    expect(getAvailableEventDate({
      event_date_availability: { earliest_available_date: "2026-12-01" },
    })).toBe("2026-12-01");
    expect(getAvailableEventDate({ available_date: "2026-02-30" })).toBeNull();
  });

  it("rejects event dates before the backend available date", () => {
    const eventDateQuestion = makeQuestion({ type: "date" });

    expect(getQuestionClientValidationMessages(
      eventDateQuestion,
      { value: "2026-11-14" },
      undefined,
      false,
      "2026-11-15"
    )).toContain("Select a date on or after 2026-11-15.");
  });

  it("uses the backend availability date without inventing a fixed lead time", () => {
    const referenceDate = new Date(2026, 9, 30);
    const withoutBackendDate = getMinimumEventDate(null, referenceDate);
    expect(`${withoutBackendDate.getFullYear()}-${String(withoutBackendDate.getMonth() + 1).padStart(2, "0")}-${String(withoutBackendDate.getDate()).padStart(2, "0")}`)
      .toBe("2026-10-30");

    const backendDate = getMinimumEventDate("2026-12-15", referenceDate);
    expect(`${backendDate.getFullYear()}-${String(backendDate.getMonth() + 1).padStart(2, "0")}-${String(backendDate.getDate()).padStart(2, "0")}`)
      .toBe("2026-12-15");

    const pastBackendDate = getMinimumEventDate("2026-10-01", referenceDate);
    expect(`${pastBackendDate.getFullYear()}-${String(pastBackendDate.getMonth() + 1).padStart(2, "0")}-${String(pastBackendDate.getDate()).padStart(2, "0")}`)
      .toBe("2026-10-30");
  });
});
