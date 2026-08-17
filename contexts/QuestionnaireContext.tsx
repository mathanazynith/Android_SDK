import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useAuth } from "../service/auth";
import { assessmentService } from "../service/questionnaire/questionnaireService";
import { getBackendErrorMessage } from "../service/api";
import { CurrentWorkoutPlan, workoutPlanService } from "../service/workoutPlan";
import { validateAnswer, ValidationError } from "../service/validation/AssessmentValidator";
import type {
  Question,
  Navigation,
  AnswerPayload,
} from "../service/questionnaire/questionnaireService";

interface AnswerData {
  value: any;
  unit?: string | null;
  customValues?: Record<string, any>;
}

interface AnswerRecord extends AnswerData {
  questionId: string;
}

interface PageState {
  navigation: Navigation;
  computedResponses: any;
  complete: boolean;
}

type BackendValidationPayload = {
  validation_errors?: Array<{
    target_question?: string;
    question_slug?: string;
    question?: string;
    slug?: string;
    message?: string;
    error?: string;
    detail?: string;
    metadata?: {
      target_question?: string;
      targetQuestion?: string;
      question_slug?: string;
      question?: string;
      slug?: string;
    };
  }>;
};

const extractQuestionValidationErrors = (
  payload: BackendValidationPayload | null | undefined
): Record<string, string[]> => {
  const result: Record<string, string[]> = {};

  if (!payload || !Array.isArray(payload.validation_errors)) return result;

  for (const item of payload.validation_errors) {
    const questionKey =
      item?.target_question ??
      item?.metadata?.target_question ??
      item?.metadata?.targetQuestion ??
      item?.question_slug ??
      item?.metadata?.question_slug ??
      item?.question ??
      item?.metadata?.question ??
      item?.slug ??
      item?.metadata?.slug;
    const message = item?.message ?? item?.error ?? item?.detail;
    const normalizedKey = String(questionKey ?? "").trim().toLowerCase();
    const cleanMessage = String(message ?? "").trim();

    if (!normalizedKey || !cleanMessage) continue;
    if (!result[normalizedKey]) result[normalizedKey] = [];
    if (!result[normalizedKey].includes(cleanMessage)) result[normalizedKey].push(cleanMessage);
  }

  return result;
};

interface QuestionnaireContextType {
  questions: Question[];
  currentNavigation: Navigation | null;
  currentPageQuestions: Question[];
  currentPageAnswers: Record<string, AnswerData>;
  allAnswers: Record<string, AnswerData>;
  isLoading: boolean;
  error: string | null;
  validationErrors: Record<string, string[]>;
  clearValidationErrors: () => void;
  isComplete: boolean;
  computedResponses: any;
  assessmentId: number | null;
  assessmentResult: any | null;
  isAssessmentResultLoading: boolean;
  fetchAssessmentResult: () => Promise<any | null>;
  workoutPlan: CurrentWorkoutPlan | null;
  workoutPlanError: string | null;
  isWorkoutPlanLoading: boolean;
  fetchWorkoutPlan: (force?: boolean) => Promise<CurrentWorkoutPlan | null>;
  canGoBack: boolean;
  loadQuestions: () => Promise<void>;
  startAssessment: () => Promise<void>;
  setAnswer: (questionId: string, value: any, unit?: string | null, customValues?: Record<string, any> | null) => void;
  goToNext: () => Promise<void>;
  goToPrevious: () => Promise<void>;
  reset: () => void;
  // Backward compatibility for running-plan/index.tsx
  answers: AnswerRecord[];
  currentQuestionIndex: number;
}

const QuestionnaireContext = createContext<QuestionnaireContextType | undefined>(
  undefined
);

const getNumericId = (id: number | string): number => {
  if (typeof id === "number") return id;
  const numeric = id.replace(/\D/g, "");
  return parseInt(numeric, 10);
};

export function QuestionnaireProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();

  // Core state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [assessmentId, setAssessmentId] = useState<number | null>(null);
  const [currentNavigation, setCurrentNavigation] = useState<Navigation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});
  const [isComplete, setIsComplete] = useState(false);
  const [computedResponses, setComputedResponses] = useState<any>({});

  // SINGLE SOURCE OF TRUTH: All answers for all pages
  const [allAnswers, setAllAnswers] = useState<Record<string, AnswerData>>({});
  const [assessmentResult, setAssessmentResult] = useState<any | null>(null);
  const [assessmentResultLoaded, setAssessmentResultLoaded] = useState(false);
  const [isAssessmentResultLoading, setIsAssessmentResultLoading] = useState(false);
  const [workoutPlan, setWorkoutPlan] = useState<CurrentWorkoutPlan | null>(null);
  const [workoutPlanError, setWorkoutPlanError] = useState<string | null>(null);
  const [isWorkoutPlanLoading, setIsWorkoutPlanLoading] = useState(false);

  const clearValidationErrors = useCallback(() => {
    setValidationErrors({});
    setError(null);
  }, []);

  // Navigation history for back and forward navigation
  const navigationHistory = useRef<PageState[]>([]);
  const isStartingAssessment = useRef(false);

  // Derive current page questions
  const getCurrentPageQuestions = useCallback((): Question[] => {
    if (!currentNavigation || !questions.length) return [];

    const normalizeId = (id: number | string): string => {
      if (typeof id === "number") return String(id);
      return String(id).replace(/\D/g, "");
    };

    const pageQuestionIds = currentNavigation.question_ids
      .map((id) => normalizeId(id))
      .filter((id) => id !== "");

    const questionsById = new Map<string, Question>();
    for (const question of questions) {
      const backendId = question.backendId !== undefined ? String(question.backendId) : "";
      const localId = String(getNumericId(question.id));
      if (backendId) {
        questionsById.set(backendId, question);
      }
      questionsById.set(localId, question);
    }

    const pageQuestions = pageQuestionIds
      .map((questionId) => questionsById.get(questionId))
      .filter((q): q is Question => Boolean(q));

    if (pageQuestions.length === pageQuestionIds.length) {
      return pageQuestions;
    }

    if (__DEV__) {
      console.warn(
        "[Questionnaire] Partial question match for page",
        currentNavigation.page_no,
        "expected",
        pageQuestionIds,
        "found",
        pageQuestions.map((q) => q.backendId ?? q.id)
      );
    }

    const fallbackQuestions = questions
      .filter((q) => q.page_no === currentNavigation.page_no)
      .sort((a, b) => (a.question_order ?? 0) - (b.question_order ?? 0));

    if (fallbackQuestions.length) {
      return fallbackQuestions;
    }

    return pageQuestions;
  }, [currentNavigation, questions]);

  const currentPageQuestions = getCurrentPageQuestions();

  // Derive current page answers from allAnswers
  const currentPageAnswers = useMemo(() => {
    const result: Record<string, AnswerData> = {};
    for (const question of currentPageQuestions) {
      const key = String(question.backendId ?? getNumericId(question.id));
      if (allAnswers[key]) {
        result[key] = allAnswers[key];
      }
    }
    return result;
  }, [currentPageQuestions, allAnswers]);

  // Convert allAnswers to array for backward compatibility
  const answers = useMemo(() => {
    return Object.entries(allAnswers).map(([questionId, answer]) => ({
      questionId,
      ...answer,
    }));
  }, [allAnswers]);

  const canGoBack = navigationHistory.current.length > 0;
  const currentQuestionIndex = 0; // For backward compatibility

  // Load questions on user login
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      resetState();
      return;
    }
    if (assessmentId || currentNavigation || isStartingAssessment.current) {
      return;
    }

    const initializeAssessment = async () => {
      if (isStartingAssessment.current) return;
      try {
        if (!questions.length) {
          await loadQuestions();
        }
        if (!assessmentId && !currentNavigation) {
          await startAssessment();
        }
      } catch {
        // startAssessment already sets error state
      }
    };

    initializeAssessment();
  }, [authLoading, user, assessmentId, currentNavigation, questions.length]);

  const resetState = () => {
    setQuestions([]);
    setAssessmentId(null);
    setCurrentNavigation(null);
    setIsComplete(false);
    setComputedResponses({});
    setAllAnswers({});
    setAssessmentResult(null);
    setAssessmentResultLoaded(false);
    setIsAssessmentResultLoading(false);
    setWorkoutPlan(null);
    setWorkoutPlanError(null);
    setIsWorkoutPlanLoading(false);
    navigationHistory.current = [];
    assessmentService.clearCache();
  };

  const loadQuestions = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setValidationErrors({});
      const qs = await assessmentService.fetchQuestions();
      setQuestions(qs);
    } catch (err: any) {
      setError(getBackendErrorMessage(err, "Failed to load questions"));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAssessmentResult = useCallback(async () => {
    if (!assessmentId || !isComplete || assessmentResultLoaded) {
      return assessmentResult;
    }

    setIsAssessmentResultLoading(true);
    try {
      const result = await assessmentService.getResults(assessmentId);
      setAssessmentResult(result);
      return result;
    } catch (err: any) {
      console.error("[Questionnaire] fetchAssessmentResult failed:", err);
      return null;
    } finally {
      setIsAssessmentResultLoading(false);
      setAssessmentResultLoaded(true);
    }
  }, [assessmentId, assessmentResult, assessmentResultLoaded, isComplete]);

  const fetchWorkoutPlan = useCallback(async (force = false) => {
    if (workoutPlan && !force) return workoutPlan;

    setIsWorkoutPlanLoading(true);
    setWorkoutPlanError(null);
    try {
      const plan = await workoutPlanService.getCurrent();
      setWorkoutPlan(plan);
      return plan;
    } catch (err: any) {
      setWorkoutPlan(null);
      setWorkoutPlanError(getBackendErrorMessage(err, "Failed to load your training plan."));
      return null;
    } finally {
      setIsWorkoutPlanLoading(false);
    }
  }, [workoutPlan]);

  useEffect(() => {
    if (assessmentId && isComplete && !assessmentResultLoaded && !isAssessmentResultLoading) {
      fetchAssessmentResult().catch(() => {});
    }
  }, [assessmentId, isComplete, assessmentResultLoaded, isAssessmentResultLoading, fetchAssessmentResult]);

  const startAssessment = async () => {
    if (isStartingAssessment.current) {
      return;
    }

    try {
      isStartingAssessment.current = true;
      setIsLoading(true);
      setError(null);
      setValidationErrors({});
      const result = await assessmentService.startAssessment();
      setAssessmentId(result.assessmentId);
      setCurrentNavigation(result.navigation);
      setComputedResponses(result.computedResponses);
      setIsComplete(result.complete);
      setAllAnswers({});
      navigationHistory.current = [];
    } catch (err: any) {
      setError(getBackendErrorMessage(err, "Failed to start assessment"));
    } finally {
      setIsLoading(false);
      isStartingAssessment.current = false;
    }
  };

  const normalizeCustomValues = (customValues?: Record<string, any> | null) => {
    if (customValues === null) return {};
    if (!customValues) return {};

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(customValues)) {
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      sanitized[key] = value;
    }
    return sanitized;
  };

  const mergeCustomValues = useCallback(
    (existingCustomValues: Record<string, any> | undefined, incomingCustomValues?: Record<string, any> | null) => {
      let mergedCustomValues: Record<string, any> = existingCustomValues || {};
      if (incomingCustomValues === null) {
        mergedCustomValues = {};
      } else if (incomingCustomValues !== undefined) {
        mergedCustomValues = {
          ...mergedCustomValues,
          ...incomingCustomValues,
        };
      }

      return normalizeCustomValues(mergedCustomValues);
    },
    []
  );

  // Set answer - MERGES customValues, never overwrites
  const setAnswer = useCallback(
    (
      questionId: string,
      value: any,
      unit?: string | null,
      customValues?: Record<string, any> | null
    ) => {
      const numericId = getNumericId(questionId);
      const key = String(numericId);

      const validationResult = validateCurrentAnswer(key, value);
      if (!validationResult.valid) {
        return;
      }

      // Server-side errors describe the previously submitted values. Once the
      // user edits an answer, wait for the next submission before showing them.
      setValidationErrors({});

      setAllAnswers((prev) => {
        const existing = prev[key] || { value: undefined, unit: null, customValues: {} };

        const mergedCustomValues = mergeCustomValues(existing.customValues, customValues);

        const newAnswer: AnswerData = {
          value: value !== undefined ? value : existing.value,
          unit: unit !== undefined ? unit : existing.unit,
          customValues: mergedCustomValues,
        };

        const normalizedExistingCustom = normalizeCustomValues(existing.customValues);

        const hasChanged =
          newAnswer.value !== existing.value ||
          newAnswer.unit !== existing.unit ||
          JSON.stringify(newAnswer.customValues) !== JSON.stringify(normalizedExistingCustom);

        if (!hasChanged) {
          return prev;
        }

        const hasValue = newAnswer.value !== undefined && newAnswer.value !== null && newAnswer.value !== "";
        const hasCustom = Object.keys(newAnswer.customValues || {}).length > 0;
        const hasUnit = newAnswer.unit !== undefined && newAnswer.unit !== null && newAnswer.unit !== "";

        if (!hasValue && !hasCustom && !hasUnit) {
          const next = { ...prev };
          delete next[key];
          return next;
        }

        if (__DEV__) {
          console.log("[Questionnaire] Answer stored for id", numericId, newAnswer);
        }

        return {
          ...prev,
          [key]: newAnswer,
        };
      });
    },
    []
  );

  const validateCurrentAnswer = useCallback(
    (questionId: string, value: any) => {
      const question = questions.find((item) => String(item.backendId ?? getNumericId(item.id)) === String(getNumericId(questionId)));
      if (!question) return { valid: true };

      const key = String(getNumericId(questionId));
      const existingAnswer = allAnswers[key];

      const validationResult = validateAnswer({
        question,
        answer: value,
        allAnswers,
        questions,
      });

      if (!validationResult.valid) {
        setError(validationResult.message || "Invalid answer");
        return validationResult;
      }

      if (existingAnswer?.value !== value) {
        setError(null);
      }

      return validationResult;
    },
    [allAnswers, questions]
  );

  // ------------------------------------------------------------------
  // buildAnswersPayload – FIXED for custom distance
  // ------------------------------------------------------------------
  const buildAnswersPayload = useCallback((): AnswerPayload[] => {
    const payload: AnswerPayload[] = [];
    for (const question of currentPageQuestions) {
      const key = String(question.backendId ?? getNumericId(question.id));
      const answer = allAnswers[key];
      if (!answer || answer.value === undefined || answer.value === null || answer.value === "") {
        continue;
      }

      let value = answer.value;
      // Sanitize time values only when building payload
      if (typeof value === "string" && question.type === "time") {
        value = value.replace(/[: ]+$/, "").trim();
      }

      // Initialize as null so we can decide later
      let customValues: Record<string, any> | null = normalizeCustomValues(answer.customValues);
      const numericId = question.backendId ?? getNumericId(question.id);

      const selectedOption = question.options?.find(
        (opt) => String(opt.id) === String(value)
      );

      if (selectedOption?.requires_input) {
        const distance = customValues?.distance;
        const unit = customValues?.unit || "km";

        if (distance) {
          customValues = {
            [String(selectedOption.id)]: {
              value: String(distance),
              unit,
            },
          };
        } else {
          customValues = null;
        }
      } else {
        if (customValues && Object.keys(customValues).length === 0) {
          customValues = null;
        }
      }

      payload.push({
        question_id: numericId,
        value,
        unit: answer.unit || null,
        custom_values: customValues,
      });
    }

    if (__DEV__) {
      console.log("[Questionnaire] buildAnswersPayload", JSON.stringify(payload, null, 2));
    }
    return payload;
  }, [currentPageQuestions, allAnswers]);

  // ------------------------------------------------------------------
  // End of buildAnswersPayload fix
  // ------------------------------------------------------------------

  // Go to next page - NO CACHING, NO CLEARING
  const goToNext = async () => {
    if (!assessmentId || !currentNavigation) return;

    // Validate required questions
    for (const question of currentPageQuestions) {
      if (question.isRequired) {
        const key = String(question.backendId ?? getNumericId(question.id));
        const answer = allAnswers[key];
        if (!answer || answer.value === undefined || answer.value === null || answer.value === "") {
          setError(`Please answer question: ${question.question}`);
          return;
        }
      }
    }

    try {
      setIsLoading(true);
      setError(null);
      setValidationErrors({});

      const previousNavigation = currentNavigation;

      for (const question of currentPageQuestions) {
        const key = String(question.backendId ?? getNumericId(question.id));
        const answer = allAnswers[key];
        const validationResult = validateAnswer({
          question,
          answer: answer?.value,
          allAnswers,
          questions,
        });
        if (!validationResult.valid) {
          setError(validationResult.message || "Invalid answer");
          return;
        }
      }

      const payload = buildAnswersPayload();
      if (payload.length === 0) {
        setError("No answers to submit");
        return;
      }

      const result = await assessmentService.submitAnswers(assessmentId, payload);

      // Save current navigation to history only on successful submit
      if (previousNavigation) {
        navigationHistory.current.push({
          navigation: previousNavigation,
          computedResponses,
          complete: isComplete,
        });
      }
      // Update navigation
      setCurrentNavigation(result.navigation);
      setComputedResponses(result.computedResponses);
      setIsComplete(result.complete);

      // Answers remain in allAnswers - no clearing!

    } catch (err: any) {
      const fieldErrors = extractQuestionValidationErrors(err?.response?.data);
      setValidationErrors(fieldErrors);
      setError(
        Object.keys(fieldErrors).length > 0
          ? null
          : getBackendErrorMessage(err, "Failed to submit answers")
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Rewind through the shared backend flow. The server deletes the most
  // recently submitted page, making that page valid for a replacement submit.
  const goToPrevious = async () => {
    if (!assessmentId || !currentNavigation || navigationHistory.current.length === 0) return;

    try {
      setIsLoading(true);
      setError(null);
      const result = await assessmentService.goBack(assessmentId);
      navigationHistory.current.pop();
      setCurrentNavigation(result.navigation);
      setComputedResponses(result.computedResponses);
      setIsComplete(result.complete);
    } catch (err: any) {
      setError(getBackendErrorMessage(err, "Unable to return to the previous questionnaire page."));
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    resetState();
    if (user) {
      loadQuestions().then(() => startAssessment());
    }
  };

  return (
    <QuestionnaireContext.Provider
      value={{
        questions,
        currentNavigation,
        currentPageQuestions,
        currentPageAnswers,
        allAnswers,
        isLoading,
        error,
        validationErrors,
        clearValidationErrors,
        isComplete,
        computedResponses,
        assessmentId,
        assessmentResult,
        isAssessmentResultLoading,
        fetchAssessmentResult,
        workoutPlan,
        workoutPlanError,
        isWorkoutPlanLoading,
        fetchWorkoutPlan,
        canGoBack,
        loadQuestions,
        startAssessment,
        setAnswer,
        goToNext,
        goToPrevious,
        reset,
        // Backward compatibility
        answers,
        currentQuestionIndex,
      }}
    >
      {children}
    </QuestionnaireContext.Provider>
  );
}

export const useQuestionnaire = () => {
  const context = useContext(QuestionnaireContext);
  if (!context) {
    throw new Error("useQuestionnaire must be used within QuestionnaireProvider");
  }
  return context;
};
