import { Question, Answer } from '../types/question';
import { IQuestionRepository } from '../service/questionnaire/questionnaireTypes';
import { MockQuestionnaireService } from '../service/questionnaire/questionnaireService';

export class QuestionnaireRepository implements IQuestionRepository {
  private service: MockQuestionnaireService;

  constructor() {
    // Currently using Mock service
    // Later, swap to RealQuestionnaireService
    this.service = new MockQuestionnaireService();
  }

  // Method to switch to real API implementation
  setService(service: MockQuestionnaireService): void {
    this.service = service;
  }

  async getQuestions(): Promise<Question[]> {
    return (await this.service.getQuestions()) as Question[];
  }

  async submitAnswers(answers: Answer[]): Promise<void> {
    await this.service.submitAnswers(answers);
  }

  // Expose progress methods
  async saveProgress(state: any): Promise<void> {
    await this.service.saveProgress(state);
  }

  async loadProgress(): Promise<any> {
    return await this.service.loadProgress();
  }

  async clearProgress(): Promise<void> {
    await this.service.clearProgress();
  }
}