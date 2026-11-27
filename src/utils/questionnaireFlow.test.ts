import { describe, expect, it } from 'vitest';
import { isAssessmentAlreadyCompleteError } from './questionnaireFlow';

describe('isAssessmentAlreadyCompleteError', () => {
  it.each([
    new Error('This assessment is complete.'),
    { response: { data: { detail: 'Assessment has already been completed.' } } },
    { response: { data: { message: 'Cannot submit answers for a completed assessment.' } } },
  ])('recognizes a completed-assessment response %#', (error) => {
    expect(isAssessmentAlreadyCompleteError(error)).toBe(true);
  });

  it.each([
    { response: { data: { detail: 'The answer is required.' } } },
    { response: { data: { message: 'Service temporarily unavailable.' } } },
  ])('does not classify unrelated failures as completion %#', (error) => {
    expect(isAssessmentAlreadyCompleteError(error)).toBe(false);
  });
});
