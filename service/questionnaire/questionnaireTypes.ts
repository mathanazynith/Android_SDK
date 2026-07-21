import { Question, Answer, QuestionnaireState } from '../../types/question';

export interface IQuestionnaireService {
  getQuestions(): Promise<Question[]>;
  submitAnswers(answers: Answer[]): Promise<void>;
  saveProgress(state: QuestionnaireState): Promise<void>;
  loadProgress(): Promise<QuestionnaireState | null>;
  clearProgress(): Promise<void>;
}

export interface IQuestionRepository {
  getQuestions(): Promise<Question[]>;
  submitAnswers(answers: Answer[]): Promise<void>;
}