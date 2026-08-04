import { validateAnswer } from "../validation/AssessmentValidator";

const assert = {
  equal(actual: unknown, expected: unknown, message?: string) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${String(actual)} to equal ${String(expected)}`);
    }
  },
  match(actual: string, expected: RegExp, message?: string) {
    if (!expected.test(actual)) {
      throw new Error(message || `Expected ${actual} to match ${expected}`);
    }
  },
};

const makeQuestion = (overrides: Partial<any> = {}) => ({
  id: "q1",
  backendId: 1,
  question: "Test",
  type: "multiple",
  isRequired: false,
  options: [],
  ...overrides,
});

const makeOption = (id: number, text: string, displayOrder?: number) => ({
  id: String(id),
  label: text,
  value: String(id),
  text,
  display_order: displayOrder,
});

const run = () => {
  const sourceQuestion = makeQuestion({
    id: "q10",
    backendId: 10,
    question: "Source",
    type: "single",
    options: [makeOption(101, "Two")],
  });

  const targetQuestion = makeQuestion({
    id: "q11",
    backendId: 11,
    question: "Target",
    type: "multiple",
    selection_count_source_id: 10,
    options: [
      makeOption(201, "A"),
      makeOption(202, "B"),
      makeOption(203, "C"),
    ],
  });

  const result = validateAnswer({
    question: targetQuestion,
    answer: [201, 202],
    allAnswers: {
      "10": {
        value: "2",
        customValues: {},
      },
    },
    questions: [sourceQuestion, targetQuestion],
  });

  assert.equal(result.valid, false);
  assert.match(result.message ?? "", /exactly 2 options/);

  const consecutiveQuestion = makeQuestion({
    id: "q12",
    backendId: 12,
    question: "Consecutive",
    type: "multiple",
    validate_consecutive_selections: true,
    options: [
      makeOption(301, "One", 1),
      makeOption(302, "Two", 2),
      makeOption(303, "Three", 3),
      makeOption(304, "Four", 4),
    ],
  });

  const consecutiveResult = validateAnswer({
    question: consecutiveQuestion,
    answer: [301, 302, 303, 304],
    allAnswers: {},
    questions: [consecutiveQuestion],
  });

  assert.equal(consecutiveResult.valid, true);

  const subsetQuestion = makeQuestion({
    id: "q13",
    backendId: 13,
    question: "Subset",
    type: "multiple",
    selection_subset_source_id: 10,
    options: [makeOption(401, "A"), makeOption(402, "B")],
  });

  const subsetResult = validateAnswer({
    question: subsetQuestion,
    answer: [401],
    allAnswers: {
      "10": {
        value: "101",
        customValues: {},
      },
    },
    questions: [sourceQuestion, subsetQuestion],
  });

  assert.equal(subsetResult.valid, false);
  assert.match(subsetResult.message ?? "", /not an allowed selection/);

  const missingSourceResult = validateAnswer({
    question: targetQuestion,
    answer: [201],
    allAnswers: {},
    questions: [targetQuestion],
  });

  assert.equal(missingSourceResult.valid, false);
  assert.match(missingSourceResult.message ?? "", /must be answered before/);
};

run();
console.log("AssessmentValidator tests passed");
