export type QuestionType = 
  | 'single'
  | 'multiple'
  | 'text'
  | 'dropdown'
  | 'rating'
  | 'date'
  | 'yesno';

export interface QuestionOption {
  id: string;
  label: string;
  value: string;
}

export interface Question {
  id: string;
  question: string;
  type: QuestionType;
  options?: QuestionOption[];
  isRequired: boolean;
  placeholder?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

export interface Answer {
  questionId: string;
  value: any;
  timestamp: number;
}

export interface QuestionnaireState {
  currentQuestionIndex: number;
  answers: Answer[];
  isComplete: boolean;
  startedAt: number;
  completedAt?: number;
}

export interface QuestionResponse {
  questions: Question[];
  total: number;
}