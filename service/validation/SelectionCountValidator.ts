import { ValidationError, QuestionLike, ValidationResult } from "./AssessmentValidator";

const normalizeAnswerValue = (value: any): Array<string | number> => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (value === undefined || value === null || value === "") {
    return [];
  }

  return [String(value)];
};

export const validateSelectionCount = (
  question: QuestionLike,
  submittedOptionIds: Array<string | number>,
  allAnswers: Record<string, any>,
  questions: QuestionLike[] = []
): ValidationResult => {
  const sourceQuestion = question.selection_count_source || questions.find((q) => String(q.backendId ?? q.id) === String(question.selection_count_source_id));

  if (!sourceQuestion) {
    throw new ValidationError("The required source question must be answered before this question can be validated.");
  }

  const sourceKey = String(sourceQuestion.backendId ?? sourceQuestion.id);
  const sourceAnswer = allAnswers[sourceKey];
  const resolvedValue = sourceAnswer?.value;

  if (resolvedValue === undefined || resolvedValue === null || resolvedValue === "") {
    throw new ValidationError("The required source question must be answered before this question can be validated.");
  }

  const numericValue = Number(resolvedValue);
  if (!Number.isFinite(numericValue) || numericValue <= 0 || !Number.isInteger(numericValue)) {
    throw new ValidationError("The selection-count source question must resolve to a positive whole number.");
  }

  const submittedIds = normalizeAnswerValue(submittedOptionIds);
  if (submittedIds.length !== new Set(submittedIds.map(String)).size) {
    return { valid: false, message: "Duplicate option selections are not allowed." };
  }

  if (submittedIds.length !== numericValue) {
    return { valid: false, message: `You must select exactly ${numericValue} options.` };
  }

  return { valid: true };
};
