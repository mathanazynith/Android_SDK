import { describe, expect, it, vi } from 'vitest';
import {
  changePlanAnswers,
  getWorkoutPlanGenerationActions,
  getWorkoutPlanGenerationState,
  retryPlanLookup,
  startNewPlanAssessment,
} from './workoutPlanGeneration';

describe('workout plan generation flow', () => {
  it('offers answer editing and start-over, but not retry, when no plan matches', () => {
    const state = getWorkoutPlanGenerationState({
      isLoaded: true,
      isLoading: false,
      hasPlan: false,
      error: null,
    });

    expect(state).toBe('no_match');
    expect(getWorkoutPlanGenerationActions(state)).toEqual([
      'change_answers',
      'start_over',
    ]);
  });

  it('returns to the questionnaire after a successful rewind without changing answers', async () => {
    const answers = { goal: { value: '5k' }, days: { value: 3 } };
    const goToPrevious = vi.fn(async () => true);
    const navigate = vi.fn();

    await expect(changePlanAnswers(goToPrevious, navigate)).resolves.toBe(true);

    expect(goToPrevious).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledOnce();
    expect(answers).toEqual({ goal: { value: '5k' }, days: { value: 3 } });
  });

  it('does not navigate when the questionnaire cannot rewind', async () => {
    const navigate = vi.fn();

    await expect(changePlanAnswers(async () => false, navigate)).resolves.toBe(false);

    expect(navigate).not.toHaveBeenCalled();
  });

  it('resets before navigating to the first assessment step', async () => {
    const events: string[] = [];
    let answers: Record<string, { value: string }> = {
      goal: { value: 'half marathon' },
    };
    let currentPage = 6;

    await startNewPlanAssessment(
      async () => {
        events.push('reset');
        answers = {};
        currentPage = 1;
      },
      () => { events.push('navigate'); },
    );

    expect(events).toEqual(['reset', 'navigate']);
    expect(answers).toEqual({});
    expect(currentPage).toBe(1);
  });

  it('offers retry for transient failures without changing assessment answers', async () => {
    const answers = { goal: { value: '10k' } };
    const fetchWorkoutPlan = vi.fn(async () => null);
    const state = getWorkoutPlanGenerationState({
      isLoaded: true,
      isLoading: false,
      hasPlan: false,
      error: 'Network error',
    });

    await retryPlanLookup(fetchWorkoutPlan);

    expect(state).toBe('error');
    expect(getWorkoutPlanGenerationActions(state, true)).toEqual([
      'retry',
      'change_answers',
      'start_over',
    ]);
    expect(fetchWorkoutPlan).toHaveBeenCalledWith(true);
    expect(answers).toEqual({ goal: { value: '10k' } });
  });

  it('keeps the existing confirm action when a plan is available', () => {
    const state = getWorkoutPlanGenerationState({
      isLoaded: true,
      isLoading: false,
      hasPlan: true,
      error: null,
    });

    expect(state).toBe('available');
    expect(getWorkoutPlanGenerationActions(state)).toEqual([
      'confirm',
      'change_answers',
    ]);
  });

  it('offers start-over recovery if returning to answers fails', () => {
    expect(getWorkoutPlanGenerationActions('available', false, true)).toEqual([
      'confirm',
      'change_answers',
      'start_over',
    ]);
  });
});
