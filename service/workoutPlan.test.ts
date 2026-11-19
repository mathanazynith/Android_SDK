import { describe, expect, it } from 'vitest';
import {
  getWorkoutPlanGenerationActions,
  getWorkoutPlanGenerationState,
  isDefinitiveNoWorkoutPlanResponse,
  isNoTrainingPlanResponse,
  isRetryableWorkoutPlanError,
} from '../src/utils/workoutPlanGeneration';

describe('isDefinitiveNoWorkoutPlanResponse', () => {
  it('recognizes an HTTP 404 as no matching plan', () => {
    expect(isDefinitiveNoWorkoutPlanResponse(404, { detail: 'Not found.' })).toBe(true);
  });

  it('recognizes no-plan response messages independent of status', () => {
    expect(isDefinitiveNoWorkoutPlanResponse(
      200,
      { detail: 'No matching workout plan for these selections.' },
    )).toBe(true);
  });

  it('does not classify a generic server failure as no matching plan', () => {
    expect(isDefinitiveNoWorkoutPlanResponse(
      503,
      { detail: 'Service temporarily unavailable.' },
    )).toBe(false);
  });
});

describe('isNoTrainingPlanResponse', () => {
  it.each([
    'No active training plan is available.',
    'No matching plan for these selections.',
    'No generated workout plan found.',
    { detail: 'Training plan not found.' },
    { data: { message: 'No workout plans are available.' } },
  ])('recognizes definitive no-plan response %#', (response) => {
    expect(isNoTrainingPlanResponse(response)).toBe(true);
  });

  it.each([
    { detail: 'The server is temporarily unavailable.' },
    { message: 'Network request failed.' },
    'Internal server error',
  ])('does not classify request failures as no-plan responses %#', (response) => {
    expect(isNoTrainingPlanResponse(response)).toBe(false);
  });
});

describe('workout plan generation state', () => {
  it('does not offer retry for definitive no-match responses', () => {
    const isNoMatch = isNoTrainingPlanResponse({
      detail: 'No matching plan for these selections.',
    });
    const state = getWorkoutPlanGenerationState({
      isLoaded: true,
      isLoading: false,
      hasPlan: false,
      error: isNoMatch ? null : 'Unexpected request failure',
    });

    expect(isNoMatch).toBe(true);
    expect(getWorkoutPlanGenerationActions(state, false)).toEqual([
      'change_answers',
      'start_over',
    ]);
  });

  it('offers retry for retryable request failures', () => {
    const state = getWorkoutPlanGenerationState({
      isLoaded: true,
      isLoading: false,
      hasPlan: false,
      error: 'Server error',
    });

    expect(getWorkoutPlanGenerationActions(state, true)).toEqual([
      'retry',
      'change_answers',
      'start_over',
    ]);
  });

  it('does not offer retry for non-retryable errors', () => {
    const state = getWorkoutPlanGenerationState({
      isLoaded: true,
      isLoading: false,
      hasPlan: false,
      error: 'Invalid request',
    });

    expect(getWorkoutPlanGenerationActions(state, false)).toEqual([
      'change_answers',
      'start_over',
    ]);
  });
});

describe('isRetryableWorkoutPlanError', () => {
  it.each([
    { code: 'ERR_NETWORK' },
    { code: 'ECONNABORTED', response: { status: 408 } },
    { response: { status: 429 } },
    { response: { status: 503 } },
  ])('recognizes retryable failures %#', (error) => {
    expect(isRetryableWorkoutPlanError(error)).toBe(true);
  });

  it.each([
    { response: { status: 400 } },
    { response: { status: 401 } },
    { response: { status: 404 } },
  ])('does not classify client errors as retryable %#', (error) => {
    expect(isRetryableWorkoutPlanError(error)).toBe(false);
  });
});
