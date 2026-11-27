const collectErrorMessages = (value: unknown, depth = 0): string[] => {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object' || depth >= 5) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectErrorMessages(item, depth + 1));
  }

  const record = value as Record<string, unknown>;
  return [
    ...collectErrorMessages(record.message, depth + 1),
    ...collectErrorMessages(record.detail, depth + 1),
    ...collectErrorMessages(record.error, depth + 1),
    ...collectErrorMessages(record.response, depth + 1),
    ...collectErrorMessages(record.data, depth + 1),
  ];
};

export const isAssessmentAlreadyCompleteError = (error: unknown): boolean =>
  collectErrorMessages(error).some((message) =>
    /\bassessment\b[\s\S]{0,60}\b(?:is\s+)?(?:already\s+)?complete(?:d)?\b/i.test(message)
    || /\bcomplete(?:d)?\s+assessment\b/i.test(message),
  );
