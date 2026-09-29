import { QuestionLike, ValidationResult, ValidationError } from "./AssessmentValidator";

const normalizeAnswerValue = (value: any): Array<string | number> => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (value === undefined || value === null || value === "") {
    return [];
  }

  return [String(value)];
};

const normalizeOptionText = (value?: string | number) => {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase();
};

export const validateSelectionSubset = (
  question: QuestionLike,
  submittedOptionIds: Array<string | number>,
  allAnswers: Record<string, any>,
  questions: QuestionLike[] = []
): ValidationResult => {
  const sourceQuestion = question.selection_subset_source || questions.find((q) => String(q.backendId ?? q.id) === String(question.selection_subset_source_id));

  if (!sourceQuestion) {
    throw new ValidationError("The required source question must be answered before this question can be validated.");
  }

  const sourceKey = String(sourceQuestion.backendId ?? sourceQuestion.id);
  const sourceAnswer = allAnswers[sourceKey];
  const sourceSelectedValues = normalizeAnswerValue(sourceAnswer?.value);
  const allowedValues = new Set(sourceSelectedValues.map((value) => normalizeOptionText(String(value))).filter(Boolean));

  if (!allowedValues.size) {
    throw new ValidationError("The required source question must be answered before this question can be validated.");
  }

  const submittedOptions = (question.options || []).filter((option) => {
    return submittedOptionIds.map(String).includes(String(option.id));
  });

  if (submittedOptions.length !== new Set(submittedOptionIds.map(String)).size) {
    return { valid: false, message: "One or more selected options are invalid." };
  }

  for (const option of submittedOptions) {
    const normalizedText = normalizeOptionText(option.text || option.label || option.value);
    if (!allowedValues.has(normalizedText)) {
      return {
        valid: false,
        message: `'${option.text || option.label || option.value}' is not an allowed selection for this question.`,
      };
    }
  }

  return { valid: true };
};
