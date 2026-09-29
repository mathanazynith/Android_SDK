import { QuestionLike, ValidationResult } from "./AssessmentValidator";

export const validateConsecutiveSelections = (
  question: QuestionLike,
  submittedOptionIds: Array<string | number>
): ValidationResult => {
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
