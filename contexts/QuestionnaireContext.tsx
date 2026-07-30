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

interface QuestionnaireContextType {
  questions: Question[];
  currentNavigation: Navigation | null;
  currentPageQuestions: Question[];
  currentPageAnswers: Record<string, AnswerData>;
  allAnswers: Record<string, AnswerData>;
  isLoading: boolean;
  error: string | null;
  isComplete: boolean;
  computedResponses: any;
  assessmentId: number | null;
  canGoBack: boolean;
  loadQuestions: () => Promise<void>;
  startAssessment: () => Promise<void>;
  setAnswer: (questionId: string, value: any, unit?: string | null, customValues?: Record<string, any> | null) => void;
  goToNext: () => Promise<void>;
  goToPrevious: () => void;
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
  const [isComplete, setIsComplete] = useState(false);
  const [computedResponses, setComputedResponses] = useState<any>({});

  // SINGLE SOURCE OF TRUTH: All answers for all pages
  const [allAnswers, setAllAnswers] = useState<Record<string, AnswerData>>({});

  // Navigation history for back button
  const navigationHistory = useRef<Navigation[]>([]);

  // Derive current page questions
  const getCurrentPageQuestions = useCallback((): Question[] => {
    if (!currentNavigation || !questions.length) return [];

    const ids = currentNavigation.question_ids;
    const pageQuestions = ids
      .map((numId) => {
        let q = questions.find((q) => q.backendId === numId);
        if (!q) {
          q = questions.find((q) => getNumericId(q.id) === numId);
        }
        return q;
      })
      .filter((q): q is Question => Boolean(q));

    if (pageQuestions.length > 0) {
      return pageQuestions;
    }

    console.warn("[Questionnaire] Using fallback by page_no for page", currentNavigation.page_no);
    return questions.filter((q) => q.page_no === currentNavigation.page_no);
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
    loadQuestions().then(() => startAssessment());
  }, [authLoading, user]);

  const resetState = () => {
    setQuestions([]);
    setAssessmentId(null);
    setCurrentNavigation(null);
    setIsComplete(false);
    setComputedResponses({});
    setAllAnswers({});
    navigationHistory.current = [];
    assessmentService.clearCache();
  };

  const loadQuestions = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const qs = await assessmentService.fetchQuestions();
      setQuestions(qs);
    } catch (err: any) {
      setError(err.message || "Failed to load questions");
    } finally {
      setIsLoading(false);
    }
  };

  const startAssessment = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await assessmentService.startAssessment();
      setAssessmentId(result.assessmentId);
      setCurrentNavigation(result.navigation);
      setComputedResponses(result.computedResponses);
      setIsComplete(result.complete);
      setAllAnswers({});
      navigationHistory.current = [];
    } catch (err: any) {
      setError(err.message || "Failed to start assessment");
    } finally {
      setIsLoading(false);
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

      setAllAnswers((prev) => {
        const existing = prev[key] || { value: undefined, unit: null, customValues: {} };

        let mergedCustomValues: Record<string, any> = existing.customValues || {};
        if (customValues === null) {
          mergedCustomValues = {};
        } else if (customValues !== undefined) {
          mergedCustomValues = {
            ...mergedCustomValues,
            ...customValues,
          };
        }

        mergedCustomValues = normalizeCustomValues(mergedCustomValues);

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

  // Build payload from allAnswers filtered by current page questions
  const buildAnswersPayload = useCallback((): AnswerPayload[] => {
    const payload: AnswerPayload[] = [];
    for (const question of currentPageQuestions) {
      const key = String(question.backendId ?? getNumericId(question.id));
      const answer = allAnswers[key];
      if (answer && answer.value !== undefined && answer.value !== null && answer.value !== "") {
        let value = answer.value;
        // Sanitize time values only when building payload
        if (typeof value === "string" && question.type === "time") {
          value = value.replace(/[: ]+$/, "").trim();
        }

        const customValues = normalizeCustomValues(answer.customValues);
        const numericId = question.backendId ?? getNumericId(question.id);
        payload.push({
          question_id: numericId,
          value,
          unit: answer.unit || null,
          custom_values: Object.keys(customValues).length > 0 ? customValues : null,
        });
      }
    }
    if (__DEV__) {
      console.log("[Questionnaire] buildAnswersPayload", payload);
    }
    return payload;
  }, [currentPageQuestions, allAnswers]);

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

      const payload = buildAnswersPayload();
      if (payload.length === 0) {
        setError("No answers to submit");
        return;
      }

      const previousNavigation = currentNavigation;

      // Submit answers - NO CLEARING
      const result = await assessmentService.submitAnswers(assessmentId, payload);

      // Save current navigation to history only on successful submit
      if (previousNavigation) {
        navigationHistory.current.push(previousNavigation);
      }

      // Update navigation
      setCurrentNavigation(result.navigation);
      setComputedResponses(result.computedResponses);
      setIsComplete(result.complete);

      // Answers remain in allAnswers - no clearing!

    } catch (err: any) {
      setError(err.message || "Failed to submit answers");
    } finally {
      setIsLoading(false);
    }
  };

  // Go to previous - no cache restore needed
  const goToPrevious = async () => {
    if (!assessmentId) return;
    if (!currentNavigation) return;

    try {
      setIsLoading(true);
      setError(null);

      const result = await assessmentService.goBack(assessmentId);
      setCurrentNavigation(result.navigation);
      setComputedResponses(result.computedResponses);
      setIsComplete(result.complete);

      const currentPageQuestionIds = currentNavigation.question_ids.map((id) => String(id));
      setAllAnswers((prev) => {
        const next: Record<string, AnswerData> = {};
        Object.entries(prev).forEach(([key, value]) => {
          if (!currentPageQuestionIds.includes(key)) {
            next[key] = value;
          }
        });
        return next;
      });
    } catch (err: any) {
      setError(err.message || "Failed to go back");
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
        isComplete,
        computedResponses,
        assessmentId,
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