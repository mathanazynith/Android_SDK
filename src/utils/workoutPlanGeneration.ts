export type WorkoutPlanGenerationState = 'loading' | 'available' | 'no_match' | 'error';

export type WorkoutPlanGenerationAction =
  | 'confirm'
  | 'retry'
  | 'change_answers'
  | 'start_over';

export const isNoTrainingPlanResponse = (value: unknown): boolean => {
  const candidates = [value];
  if (value && typeof value === 'object') {
    const response = value as Record<string, unknown>;
    candidates.push(response.data);
    for (const candidate of [value, response.data]) {
      if (!candidate || typeof candidate !== 'object') continue;
      const fields = candidate as Record<string, unknown>;
      candidates.push(fields.detail, fields.message, fields.error);
    }
  }

  return candidates.some((candidate) => (
    typeof candidate === 'string'
      && /\b(?:no\s+(?:(?:active|training|matching|generated|workout)\s+)*plans?|(?:(?:active|training|matching|generated|workout)\s+)?plans?\s+(?:not\s+found|unavailable))\b/i.test(candidate)
  ));
};

export const isDefinitiveNoWorkoutPlanResponse = (
  status: number | undefined,
  responseData: unknown,
): boolean => status === 404 || isNoTrainingPlanResponse(responseData);

export const isRetryableWorkoutPlanError = (error: {
  response?: { status?: number } | null;
  code?: string;
}): boolean => {
  const status = error.response?.status;
  return (
    !error.response
    || error.code === 'ECONNABORTED'
    || status === 408
    || status === 429
    || (status !== undefined && status >= 500)
  );
};

export const getWorkoutPlanGenerationState = ({
  isLoaded,
  isLoading,
  hasPlan,
  error,
}: {
  isLoaded: boolean;
  isLoading: boolean;
  hasPlan: boolean;
  error: string | null;
}): WorkoutPlanGenerationState => {
  if (isLoading || !isLoaded) return 'loading';
  if (hasPlan) return 'available';
  return error ? 'error' : 'no_match';
};

export const getWorkoutPlanGenerationActions = (
  state: WorkoutPlanGenerationState,
  canRetry = true,
  canStartOverOnNavigationFailure = false,
): WorkoutPlanGenerationAction[] => {
  if (state === 'available') {
    return [
      'confirm',
      'change_answers',
      ...(canStartOverOnNavigationFailure ? ['start_over' as const] : []),
    ];
  }
  if (state === 'no_match') return ['change_answers', 'start_over'];
  if (state === 'error') {
    return [
      ...(canRetry ? ['retry' as const] : []),
      'change_answers',
      'start_over',
    ];
  }
  return [];
};

export const changePlanAnswers = async (
  goToPrevious: () => Promise<boolean>,
  navigateToQuestionnaire: () => void,
): Promise<boolean> => {
  if (!await goToPrevious()) return false;
  navigateToQuestionnaire();
  return true;
};

export const startNewPlanAssessment = async (
  reset: () => Promise<void>,
  navigateToQuestionnaire: () => void,
): Promise<void> => {
  await reset();
  navigateToQuestionnaire();
};

export const retryPlanLookup = async (
  fetchWorkoutPlan: (force: boolean) => Promise<unknown>,
): Promise<void> => {
  await fetchWorkoutPlan(true);
};
