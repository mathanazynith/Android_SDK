import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { questionnaireService } from "../service/questionnaire/questionnaireService";
import { useAuth } from "../service/auth";
import {
  Question,
  Answer,
  QuestionnaireState,
} from "../service/questionnaire/questionnaireService";

interface QuestionnaireContextType {
  questions: Question[];
  currentQuestionIndex: number;
  answers: Answer[];
  isLoading: boolean;
  error: string | null;
  isComplete: boolean;
  progress: number;
  
  loadQuestions: () => Promise<void>;
  answerQuestion: (questionId: string, value: any) => void;
  goToNext: () => void;
  goToPrevious: () => void;
  submitAnswers: () => Promise<void>;
  resetQuestionnaire: () => void;
  setCurrentQuestionIndex: (index: number) => void;
  setAnswers: (answers: Answer[]) => void; // ✅ ADD THIS
}

const QuestionnaireContext = createContext<QuestionnaireContextType | undefined>(
  undefined
);

export function QuestionnaireProvider({ children }: { children: ReactNode }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const { user, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setQuestions([]);
      setAnswers([]);
      setCurrentQuestionIndex(0);
      setIsComplete(false);
      setError(null);
      return;
    }

    loadQuestions();
    loadSavedProgress();
  }, [authLoading, user?.id]);

  const loadSavedProgress = async () => {
    try {
      const saved = await questionnaireService.loadProgress();
      if (saved && saved.answers.length > 0) {
        setAnswers(saved.answers);
        setCurrentQuestionIndex(saved.currentQuestionIndex);
        setIsComplete(saved.isComplete);
      }
    } catch (error) {
      console.error("Error loading progress:", error);
    }
  };

  const loadQuestions = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await questionnaireService.getQuestions();
      setQuestions(data);
      setIsLoading(false);
    } catch (error) {
      setError("Failed to load questions");
      setIsLoading(false);
      console.error("Error loading questions:", error);
    }
  };

  const saveProgress = async () => {
    try {
      const state: QuestionnaireState = {
        currentQuestionIndex,
        answers,
        isComplete,
        startedAt: Date.now(),
      };
      await questionnaireService.saveProgress(state);
    } catch (error) {
      console.error("Error saving progress:", error);
    }
  };

  const answerQuestion = (questionId: string, value: any) => {
    const existingIndex = answers.findIndex((a) => a.questionId === questionId);
   
    let newAnswers: Answer[];
    if (existingIndex >= 0) {
      newAnswers = [...answers];
      newAnswers[existingIndex] = { questionId, value, timestamp: Date.now() };
    } else {
      newAnswers = [...answers, { questionId, value, timestamp: Date.now() }];
    }
   
    setAnswers(newAnswers);
    saveProgress();
  };

  const goToNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      saveProgress();
    }
  };

  const goToPrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      saveProgress();
    }
  };

  const submitAnswers = async () => {
    try {
      setIsLoading(true);
      await questionnaireService.submitAnswers(answers);
      setIsComplete(true);
      setIsLoading(false);
      await questionnaireService.clearProgress();
    } catch (error) {
      setError("Failed to submit answers");
      setIsLoading(false);
      console.error("Error submitting answers:", error);
      throw error;
    }
  };

  const resetQuestionnaire = () => {
    setCurrentQuestionIndex(0);
    setAnswers([]);
    setIsComplete(false);
    questionnaireService.clearProgress();
  };

  const progress =
    questions.length > 0
      ? Math.round(((currentQuestionIndex + 1) / questions.length) * 100)
      : 0;

  return (
    <QuestionnaireContext.Provider
      value={{
        questions,
        currentQuestionIndex,
        answers,
        isLoading,
        error,
        isComplete,
        progress,
        loadQuestions,
        answerQuestion,
        goToNext,
        goToPrevious,
        submitAnswers,
        resetQuestionnaire,
        setCurrentQuestionIndex,
        setAnswers, // ✅ ADD THIS
      }}
    >
      {children}
    </QuestionnaireContext.Provider>
  );
}

export const useQuestionnaire = () => {
  const context = useContext(QuestionnaireContext);
  if (!context) {
    throw new Error(
      "useQuestionnaire must be used within QuestionnaireProvider"
    );
  }
  return context;
};