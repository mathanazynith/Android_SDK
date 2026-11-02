import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getBackendErrorMessage } from "../service/api";
import { useAuth } from "../service/auth";
import type {
  AnswerPayload,
  Navigation,
  Question,
} from "../service/questionnaire/questionnaireService";
import { assessmentService } from "../service/questionnaire/questionnaireService";
import { storage } from "../service/storage";
import { validateAnswer } from "../service/validation/AssessmentValidator";
import { CurrentWorkoutPlan, isNoTrainingPlanResponse, workoutPlanService } from "../service/workoutPlan";
import { PlanBenchmarkStore } from "../src/services/planBenchmarkStore";

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

const getBackendValidationMessage = (payload: BackendValidationPayload | null | undefined) =>
  payload?.validation_errors
    ?.map((item) => String(item?.message ?? item?.error ?? item?.detail ?? "").trim())
    .find(Boolean) ?? null;

interface QuestionnaireContextType {
  questions: Question[];
  currentNavigation: Navigation | null;
  currentPageQuestions: Question[];
  currentPageAnswers: Record<string, AnswerData>;
  allAnswers: Record<string, AnswerData>;
  isLoading: boolean;
  error: string | null;
  validationErrors: Record<string, string[]>;
  clearValidationErrors: (questionId?: string) => void;
  isComplete: boolean;
  computedResponses: any;
  assessmentId: number | null;
  assessmentResult: any | null;
  isAssessmentResultLoading: boolean;
  fetchAssessmentResult: () => Promise<any | null>;
  workoutPlan: CurrentWorkoutPlan | null;
  completedPlanCheckAssessmentId: number | null;
  isWorkoutPlanLoaded: boolean;
  workoutPlanError: string | null;
  isWorkoutPlanLoading: boolean;
  fetchWorkoutPlan: (force?: boolean) => Promise<CurrentWorkoutPlan | null>;
  endWorkoutPlan: (reason: string) => Promise<void>;
  canGoBack: boolean;
  loadQuestions: () => Promise<void>;
  startAssessment: () => Promise<void>;
  setAnswer: (questionId: string, value: any, unit?: string | null, customValues?: Record<string, any> | null) => void;
  goToNext: () => Promise<void>;
  goToPrevious: () => Promise<void>;
  reset: () => Promise<void>;
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
  const workoutPlanRef = useRef(workoutPlan);
  const [completedPlanCheckAssessmentId, setCompletedPlanCheckAssessmentId] = useState<number | null>(null);
  const [isWorkoutPlanLoaded, setIsWorkoutPlanLoaded] = useState(false);
  const [workoutPlanError, setWorkoutPlanError] = useState<string | null>(null);
  const [isWorkoutPlanLoading, setIsWorkoutPlanLoading] = useState(false);
  const workoutPlanRequest = useRef<Promise<CurrentWorkoutPlan | null> | null>(null);

  useEffect(() => {
    workoutPlanRef.current = workoutPlan;
  }, [workoutPlan]);

  const clearValidationErrors = useCallback((questionId?: string) => {
    if (questionId === undefined) {
      setValidationErrors({});
    } else {
      const numericId = String(getNumericId(questionId));
      const question = questions.find((item) =>
        String(item.backendId ?? getNumericId(item.id)) === numericId
      );
      const aliases = new Set(
        [
          numericId,
          `q${numericId}`,
          `question_${numericId}`,
          question?.id,
          question?.backendId === undefined ? undefined : String(question.backendId),
          question?.slug,
          question?.question,
        ]
          .filter((key): key is string => Boolean(key))
          .map((key) => key.trim().toLowerCase())
      );
      setValidationErrors((previous) =>
        Object.fromEntries(
          Object.entries(previous).filter(([key]) => !aliases.has(key.trim().toLowerCase()))
        )
      );
    }
    setError(null);
  }, [questions]);

  // Navigation history for back and forward navigation
  const navigationHistory = useRef<PageState[]>([]);
  const forwardNavigationHistory = useRef<PageState[]>([]);
  const isStartingAssessment = useRef(false);
  const isResettingAssessment = useRef(false);

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

  const [canGoBack, setCanGoBack] = useState(false);
  const currentQuestionIndex = 0; // For backward compatibility

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
    setCompletedPlanCheckAssessmentId(null);
    setIsWorkoutPlanLoaded(false);
    setWorkoutPlanError(null);
    setIsWorkoutPlanLoading(false);
    navigationHistory.current = [];
    forwardNavigationHistory.current = [];
    setCanGoBack(false);
    assessmentService.clearCache();
    PlanBenchmarkStore.clearAll().catch(() => {});
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
    if (workoutPlanRef.current && !force) return workoutPlanRef.current;
    if (workoutPlanRequest.current && !force) return workoutPlanRequest.current;

    const request = (async () => {
      setIsWorkoutPlanLoading(true);
      setWorkoutPlanError(null);
      try {
        const plan = await workoutPlanService.getCurrent();
        workoutPlanRef.current = plan;
        setWorkoutPlan(plan);
        return plan;
      } catch (err: any) {
        if (err?.response?.status === 404 || isNoTrainingPlanResponse(err?.response?.data)) {
          workoutPlanRef.current = null;
          setWorkoutPlan(null);
          setWorkoutPlanError(null);
          PlanBenchmarkStore.clearAll().catch(() => {});
          return null;
        }
        if (!workoutPlanRef.current) setWorkoutPlan(null);
        setWorkoutPlanError(getBackendErrorMessage(err, "Failed to load your training plan."));
        return null;
      } finally {
        setIsWorkoutPlanLoaded(true);
        setIsWorkoutPlanLoading(false);
        workoutPlanRequest.current = null;
      }
    })();

    workoutPlanRequest.current = request;
    return request;
  }, []);

  const endWorkoutPlan = useCallback(async (reason: string) => {
    const clearEndedPlanState = async () => {
      workoutPlanRef.current = null;
      setWorkoutPlan(null);
      setAssessmentResult(null);
      setAssessmentResultLoaded(false);
      setAssessmentId(null);
      setCurrentNavigation(null);
      setIsComplete(false);
      setComputedResponses({});
      setAllAnswers({});
      setCompletedPlanCheckAssessmentId(null);
      setIsWorkoutPlanLoaded(true);
      setWorkoutPlanError(null);
      navigationHistory.current = [];
      forwardNavigationHistory.current = [];
      setCanGoBack(false);
      await storage.removeItem(storage.KEYS.TRAINING_PLAN);
      await PlanBenchmarkStore.clearAll().catch(() => {});
    };

    setIsWorkoutPlanLoading(true);
    setWorkoutPlanError(null);
    try {
      let currentPlan: CurrentWorkoutPlan | null;
      try {
        currentPlan = await workoutPlanService.getCurrent();
      } catch (err: any) {
        if (err?.response?.status === 404 || isNoTrainingPlanResponse(err?.response?.data)) {
          currentPlan = null;
        } else {
          throw err;
        }
      }

      if (!currentPlan) {
        await clearEndedPlanState();
        return;
      }

      const planId = workoutPlan?.id;
      if (!planId) {
        workoutPlanRef.current = currentPlan;
        setWorkoutPlan(currentPlan);
        const message = "Your active training plan has been refreshed. Review it before trying to end it.";
        setWorkoutPlanError(message);
        throw new Error(message);
      }

      if (currentPlan.id !== planId) {
        workoutPlanRef.current = currentPlan;
        setWorkoutPlan(currentPlan);
        const message = "Your active training plan has changed. It has been refreshed; review it before trying to end it.";
        setWorkoutPlanError(message);
        throw new Error(message);
      }

      try {
        await workoutPlanService.endPlan(currentPlan.id, reason);
      } catch (endError: any) {
        let latestPlan: CurrentWorkoutPlan | null;
        try {
          latestPlan = await workoutPlanService.getCurrent();
        } catch (refreshError: any) {
          if (refreshError?.response?.status === 404 || isNoTrainingPlanResponse(refreshError?.response?.data)) {
            latestPlan = null;
          } else {
            console.error("[Questionnaire] Unable to verify active plan after end request failed:", refreshError);
            throw endError;
          }
        }

        if (!latestPlan) {
          await clearEndedPlanState();
          return;
        }

        if (latestPlan.id !== currentPlan.id) {
          workoutPlanRef.current = latestPlan;
          setWorkoutPlan(latestPlan);
          const message = "Your active training plan has changed. It has been refreshed; review it before trying to end it.";
          setWorkoutPlanError(message);
          throw new Error(message);
        }

        throw endError;
      }

      await clearEndedPlanState();
    } catch (err: any) {
      const message = err?.response?.status === 404
        ? "The active training plan could not be found. Refresh your plan and try again."
        : getBackendErrorMessage(err, "Unable to end your training plan.");
      console.error("[Questionnaire] Failed to end workout plan:", {
        status: err?.response?.status,
        message: err?.message,
        response: err?.response?.data,
      });
      setWorkoutPlanError(message);
      throw new Error(message);
    } finally {
      setIsWorkoutPlanLoading(false);
    }
  }, [workoutPlan]);

  useEffect(() => {
    let active = true;
    if (assessmentId && isComplete && !assessmentResultLoaded && !isAssessmentResultLoading) {
      const runFetch = async () => {
        setIsAssessmentResultLoading(true);
        try {
          const result = await assessmentService.getResults(assessmentId);
          if (active) setAssessmentResult(result);
        } catch (err: any) {
          console.error("[Questionnaire] fetchAssessmentResult failed:", err);
        } finally {
          if (active) {
            setIsAssessmentResultLoading(false);
            setAssessmentResultLoaded(true);
          }
        }
      };
      void runFetch();
    }
    return () => {
      active = false;
    };
  }, [assessmentId, isComplete, assessmentResultLoaded, isAssessmentResultLoading]);

  useEffect(() => {
    if (assessmentId && isComplete) {
      // A completed assessment creates a new plan on the backend. Refresh the
      // shared cache immediately so every plan-dependent screen sees it.
      fetchWorkoutPlan(true).then(
        () => setCompletedPlanCheckAssessmentId(assessmentId),
        () => setCompletedPlanCheckAssessmentId(assessmentId),
      );
    }
  }, [assessmentId, isComplete, fetchWorkoutPlan]);

  // Automatically fetch active workout plan on user login
  useEffect(() => {
    if (!authLoading && user) {
      fetchWorkoutPlan().catch(() => {});
    }
  }, [authLoading, user, fetchWorkoutPlan]);

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
      setAssessmentResult(null);
      setAssessmentResultLoaded(false);
      setWorkoutPlan(null);
      setCompletedPlanCheckAssessmentId(null);
      setIsWorkoutPlanLoaded(false);
      setWorkoutPlanError(null);
      setAllAnswers({});
      navigationHistory.current = [];
      forwardNavigationHistory.current = [];
      setCanGoBack(false);
    } catch (err: any) {
      setError(getBackendErrorMessage(err, "Failed to start assessment"));
    } finally {
      setIsLoading(false);
      isStartingAssessment.current = false;
    }
  };

  // Load questions and start an assessment once the user session is available.
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (
      assessmentId
      || currentNavigation
      || isStartingAssessment.current
      || isResettingAssessment.current
    ) {
      return;
    }

    const initializeAssessment = async () => {
      if (isStartingAssessment.current) return;
      try {
        if (!questions.length) {
          await loadQuestions();
        }
        if (isResettingAssessment.current) return;
        if (!assessmentId && !currentNavigation) {
          await startAssessment();
        }
      } catch {
        // startAssessment already sets error state
      }
    };

    void initializeAssessment();
  }, [authLoading, user, assessmentId, currentNavigation, questions.length]);

  const userLogoutRef = useRef(user);
  useEffect(() => {
    if (userLogoutRef.current && !user) {
      resetState();
    }
    userLogoutRef.current = user;
  }, [user]);

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

  const validateCurrentAnswer = useCallback(
    (questionId: string, value: any, allowIncompleteSelectionCount = false) => {
      const question = questions.find((item) => String(item.backendId ?? getNumericId(item.id)) === String(getNumericId(questionId)));
      if (!question) return { valid: true };

      const key = String(getNumericId(questionId));
      const existingAnswer = allAnswers[key];

      const validationResult = validateAnswer({
        question,
        answer: value,
        allAnswers,
        questions,
        allowIncompleteSelectionCount,
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

      const validationResult = validateCurrentAnswer(key, value, true);
      if (!validationResult.valid) {
        return;
      }

      clearValidationErrors(questionId);

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


        return {
          ...prev,
          [key]: newAnswer,
        };
      });
    },
    [clearValidationErrors, mergeCustomValues, validateCurrentAnswer]
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

    return payload;
  }, [currentPageQuestions, allAnswers]);

  // ------------------------------------------------------------------
  // End of buildAnswersPayload fix
  // ------------------------------------------------------------------

  // Go to next page - NO CACHING, NO CLEARING
  const goToNext = async () => {
    if (!assessmentId || !currentNavigation) return;

    try {
      setIsLoading(true);
      setError(null);
      setValidationErrors({});

      const previousNavigation = currentNavigation;

      const payload = buildAnswersPayload();

      const finalPageNumber = Math.max(0, ...questions.map((question) => question.page_no ?? 0));
      const isFinalPageSubmission = finalPageNumber === 0 || previousNavigation.page_no >= finalPageNumber;

      const result = await assessmentService.submitAnswers(assessmentId, payload);

      // Some backend deployments return validation failures with HTTP 200.
      // Treat the body as authoritative and keep the current page in that case.
      if (result.validationErrors.length > 0) {
        const validationPayload = { validation_errors: result.validationErrors };
        const fieldErrors = extractQuestionValidationErrors(validationPayload);
        setValidationErrors(fieldErrors);
        setError(
          Object.keys(fieldErrors).length > 0 ? null : getBackendValidationMessage(validationPayload)
        );
        return;
      }

      if (isFinalPageSubmission) setCompletedPlanCheckAssessmentId(null);

      // Save current navigation to history only on successful submit
      if (previousNavigation) {
        navigationHistory.current.push({
          navigation: previousNavigation,
          computedResponses,
          complete: isComplete,
        });
        setCanGoBack(true);
      }
      const cachedForwardPage = forwardNavigationHistory.current.at(-1);
      let nextNavigation = result.navigation;
      let assessmentComplete = isFinalPageSubmission && (result.complete || !result.navigation);
      if (cachedForwardPage && cachedForwardPage.navigation.page_no > previousNavigation.page_no) {
        if (!result.navigation || result.navigation.page_no <= previousNavigation.page_no) {
          nextNavigation = cachedForwardPage.navigation;
          forwardNavigationHistory.current.pop();
        } else if (result.navigation.page_no === cachedForwardPage.navigation.page_no) {
          forwardNavigationHistory.current.pop();
        } else if (result.navigation.page_no > cachedForwardPage.navigation.page_no) {
          forwardNavigationHistory.current = [];
        }
        assessmentComplete = false;
      }
      // Keep the final submitted page visible when completion has no next page.
      setCurrentNavigation(nextNavigation ?? (assessmentComplete ? previousNavigation : null));
      setComputedResponses(result.computedResponses);
      setIsComplete(assessmentComplete);

      // Answers remain in allAnswers - no clearing!

    } catch (err: any) {
      const backendPayload = err?.response?.data as BackendValidationPayload | undefined;
      const fieldErrors = extractQuestionValidationErrors(backendPayload);
      setValidationErrors(fieldErrors);
      const hasBackendValidationErrors = Boolean(backendPayload?.validation_errors?.length);
      setError(hasBackendValidationErrors
        ? Object.keys(fieldErrors).length > 0
          ? null
          : getBackendValidationMessage(backendPayload)
        : getBackendErrorMessage(err, "Failed to submit answers"));
    } finally {
      setIsLoading(false);
    }
  };

  // Rewind through the shared backend flow. The server deletes the most
  // recently submitted page, making that page valid for a replacement submit.
  const goToPrevious = async () => {
    if (!assessmentId || !currentNavigation || navigationHistory.current.length === 0) return;

    setCompletedPlanCheckAssessmentId(null);
    try {
      setIsLoading(true);
      setError(null);
      const result = await assessmentService.goBack(assessmentId);
      const previousPage = navigationHistory.current.at(-1);
      const nextNavigation = result.navigation ?? previousPage?.navigation ?? null;
      forwardNavigationHistory.current.push({
        navigation: currentNavigation,
        computedResponses,
        complete: isComplete,
      });
      navigationHistory.current.pop();
      setCanGoBack(navigationHistory.current.length > 0);
      setCurrentNavigation(nextNavigation);
      setComputedResponses(result.navigation ? result.computedResponses : previousPage?.computedResponses ?? result.computedResponses);
      setIsComplete(nextNavigation ? false : result.complete);
    } catch (err: any) {
      setError(getBackendErrorMessage(err, "Unable to return to the previous questionnaire page."));
    } finally {
      setIsLoading(false);
    }
  };

  const reset = async () => {
    if (isResettingAssessment.current) return;
    isResettingAssessment.current = true;
    try {
      resetState();
      await Promise.all([
        storage.removeItem(storage.KEYS.QUESTIONNAIRE_PROGRESS),
        storage.removeItem(storage.KEYS.QUESTIONNAIRE_ANSWERS),
      ]);
      if (user) {
        await loadQuestions();
        await startAssessment();
      }
    } finally {
      isResettingAssessment.current = false;
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
        completedPlanCheckAssessmentId,
        isWorkoutPlanLoaded,
        workoutPlanError,
        isWorkoutPlanLoading,
        fetchWorkoutPlan,
        endWorkoutPlan,
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
