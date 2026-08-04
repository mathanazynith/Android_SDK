export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export interface QuestionOptionLike {
  id?: string | number;
  text?: string;
  label?: string;
  value?: string | number;
  display_order?: number;
}

export interface QuestionLike {
  id: string | number;
  backendId?: number;
  question?: string;
  type?: string;
  options?: QuestionOptionLike[];
  selection_count_source_id?: number | null;
  selection_subset_source_id?: number | null;
  validate_consecutive_selections?: boolean;
  selection_count_source?: QuestionLike | null;
  selection_subset_source?: QuestionLike | null;
}

export interface AnswerDataLike {
  value?: any;
  unit?: string | null;
  customValues?: Record<string, any>;
}

export interface ValidationContext {
  question: QuestionLike;
  answer: any;
  allAnswers: Record<string, AnswerDataLike>;
  questions?: QuestionLike[];
}

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

const getQuestionKey = (question: QuestionLike) =>
  String(question.backendId ?? question.id);

const getQuestionById = (questions: QuestionLike[] = [], questionId?: number | null) => {
  if (questionId === undefined || questionId === null) return undefined;
  return questions.find((q) => String(q.backendId ?? q.id) === String(questionId));
};

const getAnswerForQuestion = (allAnswers: Record<string, AnswerDataLike>, question: QuestionLike) => {
  const key = getQuestionKey(question);
  return allAnswers[key];
};

const resolveSelectionCount = (context: ValidationContext): number => {
  const sourceQuestion = context.question.selection_count_source ||
    getQuestionById(context.questions || [], context.question.selection_count_source_id);

  if (!sourceQuestion) {
    throw new ValidationError("The required source question must be answered before this question can be validated.");
  }

  const sourceAnswer = getAnswerForQuestion(context.allAnswers, sourceQuestion);
  const resolvedValue = sourceAnswer?.value;

  if (resolvedValue === undefined || resolvedValue === null || resolvedValue === "") {
    throw new ValidationError("The required source question must be answered before this question can be validated.");
  }

  const numericValue = Number(resolvedValue);
  if (!Number.isFinite(numericValue) || numericValue <= 0 || !Number.isInteger(numericValue)) {
    throw new ValidationError("The selection-count source question must resolve to a positive whole number.");
  }

  return numericValue;
};

const validateExactSelectionCount = (submittedOptionIds: Array<string | number>, requiredCount: number): ValidationResult => {
  if (submittedOptionIds.length !== new Set(submittedOptionIds.map(String)).size) {
    return { valid: false, message: "Duplicate option selections are not allowed." };
  }

  if (submittedOptionIds.length !== requiredCount) {
    return { valid: false, message: `You must select exactly ${requiredCount} options.` };
  }

  return { valid: true };
};

const validateConsecutiveSelections = (question: QuestionLike, submittedOptionIds: Array<string | number>): ValidationResult => {
  const selectionCount = submittedOptionIds.length;
  if (selectionCount <= 1) {
    return { valid: true };
  }

  const options = (question.options || []).slice().sort((a, b) => {
    const aOrder = a.display_order ?? 0;
    const bOrder = b.display_order ?? 0;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a.id).localeCompare(String(b.id));
  });

  if (!options.length) {
    return { valid: true };
  }

  const displayOrders = options.map((option) => option.display_order);
  if (displayOrders.length !== new Set(displayOrders).size) {
    return { valid: false, message: "Consecutive-selection validation requires each option to have a unique display order." };
  }

  const orderedOptionIds = options.map((option) => String(option.id));
  const positionByOptionId = new Map(orderedOptionIds.map((optionId, position) => [optionId, position]));

  const selectedPositions = new Set<number>();
  for (const optionId of submittedOptionIds.map(String)) {
    if (!positionByOptionId.has(optionId)) {
      return { valid: false, message: "One or more selected options do not belong to this question." };
    }
    selectedPositions.add(positionByOptionId.get(optionId)!);
  }

  const totalOptions = orderedOptionIds.length;
  let maxConsecutiveFound = 0;

  if (selectedPositions.size === totalOptions) {
    maxConsecutiveFound = totalOptions;
  } else {
    for (const start of selectedPositions) {
      const predecessor = (start - 1 + totalOptions) % totalOptions;
      if (selectedPositions.has(predecessor)) continue;

      let runLength = 0;
      let position = start;
      while (selectedPositions.has(position)) {
        runLength += 1;
        position = (position + 1) % totalOptions;
      }

      maxConsecutiveFound = Math.max(maxConsecutiveFound, runLength);
    }
  }

  const maxAllowedConsecutive = Math.min(selectionCount - 1, 3);
  if (maxConsecutiveFound > maxAllowedConsecutive) {
    return {
      valid: false,
      message: `The selected options contain too many consecutive selections. A maximum of ${maxAllowedConsecutive} consecutive selections is allowed.`,
    };
  }

  return { valid: true };
};

const validateSelectionSubset = (context: ValidationContext, submittedOptionIds: Array<string | number>): ValidationResult => {
  const sourceQuestion = context.question.selection_subset_source ||
    getQuestionById(context.questions || [], context.question.selection_subset_source_id);

  if (!sourceQuestion) {
    throw new ValidationError("The required source question must be answered before this question can be validated.");
  }

  const sourceAnswer = getAnswerForQuestion(context.allAnswers, sourceQuestion);
  const sourceSelectedValues = normalizeAnswerValue(sourceAnswer?.value);

  const allowedValues = new Set(
    sourceSelectedValues
      .map((value) => String(value).trim().toLowerCase())
      .filter(Boolean)
  );

  if (!allowedValues.size) {
    throw new ValidationError("The required source question must be answered before this question can be validated.");
  }

  const submittedOptions = (context.question.options || []).filter((option) => {
    const optionId = String(option.id);
    return submittedOptionIds.map(String).includes(optionId);
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

export const validateAnswer = (context: ValidationContext): ValidationResult => {
  const submittedOptionIds = normalizeAnswerValue(context.answer);
  if (!submittedOptionIds.length) {
    return { valid: true };
  }

  if (context.question.selection_count_source_id || context.question.selection_count_source) {
    try {
      const requiredCount = resolveSelectionCount(context);
      const exactCountResult = validateExactSelectionCount(submittedOptionIds, requiredCount);
      if (!exactCountResult.valid) {
        return exactCountResult;
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        return { valid: false, message: error.message };
      }
      throw error;
    }
  }

  if (context.question.validate_consecutive_selections) {
    const consecutiveResult = validateConsecutiveSelections(context.question, submittedOptionIds);
    if (!consecutiveResult.valid) {
      return consecutiveResult;
    }
  }

  if (context.question.selection_subset_source_id || context.question.selection_subset_source) {
    try {
      const subsetResult = validateSelectionSubset(context, submittedOptionIds);
      if (!subsetResult.valid) {
        return subsetResult;
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        return { valid: false, message: error.message };
      }
      throw error;
    }
  }

  return { valid: true };
};
