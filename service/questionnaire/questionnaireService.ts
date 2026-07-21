import { storage } from "../storage";

// Types
export type QuestionType =
  | 'single'
  | 'multiple'
  | 'text'
  | 'dropdown'
  | 'rating'
  | 'date'
  | 'yesno'
  | 'number'
  | 'time'
  | 'calculated_pace'
  | 'running_stats'
  | 'event_registration'
  | 'group'
  | 'plan_selection'; // ✅ NEW: For plan selection

export interface QuestionOption {
  id: string;
  label: string;
  value: string;
}

export interface SubQuestion {
  id: string;
  question: string;
  type: QuestionType;
  options?: QuestionOption[];
  isRequired?: boolean;
  placeholder?: string;
  condition?: {
    dependsOn: string;
    value: any;
  };
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
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
  subQuestions?: SubQuestion[];
  condition?: {
    dependsOn: string;
    value: any;
  };
  isReadOnly?: boolean;
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

export interface IQuestionnaireService {
  getQuestions(): Promise<Question[]>;
  submitAnswers(answers: Answer[]): Promise<void>;
  saveProgress(state: QuestionnaireState): Promise<void>;
  loadProgress(): Promise<QuestionnaireState | null>;
  clearProgress(): Promise<void>;
}

// Helper function to get answer value by question ID
export const getAnswerValue = (answers: Answer[], questionId: string): any => {
  const answer = answers.find(a => a.questionId === questionId);
  return answer ? answer.value : null;
};

// ✅ NEW: Plan options for dropdown
const PLAN_OPTIONS = [
  { id: "plan_marathon", label: "Marathon", value: "marathon" },
  { id: "plan_half_marathon", label: "Half Marathon", value: "half_marathon" },
  { id: "plan_10k", label: "10K Plan", value: "10k" },
  { id: "plan_custom", label: "Custom", value: "custom" },
];

// Complete Mock questions data
const MOCK_QUESTIONS: Question[] = [
  {
    id: "q1",
    question: "Have you run before?",
    type: "single",
    options: [
      { id: "opt1", label: "Yes", value: "yes" },
      { id: "opt2", label: "No", value: "no" }
    ],
    isRequired: true
  },
  {
    id: "q2",
    question: "What was your recent long run distance?",
    type: "text",
    isRequired: false,
    placeholder: "Enter distance in km (e.g., 5, 10, 21)",
    condition: {
      dependsOn: "q1",
      value: "yes"
    }
  },
  {
    id: "q3",
    question: "What was your recent long run time?",
    type: "text",
    isRequired: false,
    placeholder: "Enter time in minutes (e.g., 30, 45, 60)",
    condition: {
      dependsOn: "q1",
      value: "yes"
    }
  },
  {
    id: "q4",
    question: "Have you registered for any event?",
    type: "single",
    options: [
      { id: "opt1", label: "Yes", value: "yes" },
      { id: "opt2", label: "No", value: "no" }
    ],
    isRequired: true,
    condition: {
      dependsOn: "q1",
      value: "yes"
    }
  },
  {
    id: "q5",
    question: "What is the event name?",
    type: "text",
    isRequired: false,
    placeholder: "Enter the event name",
    condition: {
      dependsOn: "q4",
      value: "yes"
    }
  },
  {
    id: "q6",
    question: "What is the event distance?",
    type: "text",
    isRequired: false,
    placeholder: "Enter event distance in km",
    condition: {
      dependsOn: "q4",
      value: "yes"
    }
  },
  {
    id: "q7",
    question: "What is your target time for the event?",
    type: "text",
    isRequired: false,
    placeholder: "Enter target time in minutes",
    condition: {
      dependsOn: "q4",
      value: "yes"
    }
  },
  // ✅ NEW: Plan Selection Question (appears when q4 = "no")
  {
    id: "q9",
    question: "What is your running plan?",
    type: "plan_selection",
    options: PLAN_OPTIONS,
    isRequired: true,
    condition: {
      dependsOn: "q4",
      value: "no"
    }
  },
  {
    id: "q8",
    question: "How many days per week do you plan to run?",
    type: "single",
    options: [
      { id: "opt1", label: "1-2 days", value: "1-2" },
      { id: "opt2", label: "3-4 days", value: "3-4" },
      { id: "opt3", label: "5-6 days", value: "5-6" },
      { id: "opt4", label: "7 days", value: "7" }
    ],
    isRequired: true,
    condition: {
      dependsOn: "q1",
      value: "yes"
    }
  },
  {
    id: "q10",
    question: "What is your current fitness level?",
    type: "single",
    options: [
      { id: "opt1", label: "Beginner (No experience)", value: "beginner" },
      { id: "opt2", label: "Somewhat active", value: "active" },
      { id: "opt3", label: "Very active", value: "very_active" }
    ],
    isRequired: true,
    condition: {
      dependsOn: "q1",
      value: "no"
    }
  },
  {
    id: "q11",
    question: "What is your age group?",
    type: "single",
    options: [
      { id: "opt1", label: "18-25", value: "18-25" },
      { id: "opt2", label: "26-35", value: "26-35" },
      { id: "opt3", label: "36-45", value: "36-45" },
      { id: "opt4", label: "46-55", value: "46-55" },
      { id: "opt5", label: "56+", value: "56+" }
    ],
    isRequired: true
  },
  {
    id: "q12",
    question: "What are your fitness goals? (Select all that apply)",
    type: "multiple",
    options: [
      { id: "opt1", label: "Weight Loss", value: "weight_loss" },
      { id: "opt2", label: "Muscle Building", value: "muscle_building" },
      { id: "opt3", label: "Endurance", value: "endurance" },
      { id: "opt4", label: "Flexibility", value: "flexibility" },
      { id: "opt5", label: "General Fitness", value: "general" }
    ],
    isRequired: true
  },
  {
    id: "q13",
    question: "What is your preferred exercise location?",
    type: "dropdown",
    options: [
      { id: "opt1", label: "Home", value: "home" },
      { id: "opt2", label: "Gym", value: "gym" },
      { id: "opt3", label: "Outdoors", value: "outdoors" },
      { id: "opt4", label: "Online Classes", value: "online" }
    ],
    isRequired: false
  },
  {
    id: "q14",
    question: "On a scale of 1-10, how motivated are you?",
    type: "rating",
    isRequired: true,
    validation: {
      min: 1,
      max: 10
    }
  },
  {
    id: "q15",
    question: "When would you prefer to exercise?",
    type: "single",
    options: [
      { id: "opt1", label: "Morning", value: "morning" },
      { id: "opt2", label: "Afternoon", value: "afternoon" },
      { id: "opt3", label: "Evening", value: "evening" },
      { id: "opt4", label: "Night", value: "night" }
    ],
    isRequired: true
  },
  {
    id: "q16",
    question: "What is your target weight?",
    type: "text",
    isRequired: false,
    placeholder: "Enter target weight in kg"
  },
  {
    id: "q17",
    question: "Do you have any medical conditions?",
    type: "yesno",
    isRequired: true
  },
  {
    id: "q18",
    question: "What is your target date to achieve your goals?",
    type: "date",
    isRequired: false
  },
  {
    id: "q19",
    question: "Any additional comments or requirements?",
    type: "text",
    isRequired: false,
    placeholder: "Share any additional information..."
  }
];

/**
 * Mock Questionnaire Service
 */
class MockQuestionnaireService implements IQuestionnaireService {
  private readonly PROGRESS_KEY = storage.KEYS?.QUESTIONNAIRE_PROGRESS || 'questionnaire_progress';
  private readonly ANSWERS_KEY = storage.KEYS?.QUESTIONNAIRE_ANSWERS || 'questionnaire_answers';

  async getQuestions(): Promise<Question[]> {
    await new Promise(resolve => setTimeout(resolve, 500));
    return MOCK_QUESTIONS;
  }

  async submitAnswers(answers: Answer[]): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 800));
    await storage.setItem(this.ANSWERS_KEY, JSON.stringify(answers));
    console.log('Submitted answers:', answers);
    await this.clearProgress();
  }

  async saveProgress(state: QuestionnaireState): Promise<void> {
    await storage.setItem(this.PROGRESS_KEY, JSON.stringify(state));
  }

  async loadProgress(): Promise<QuestionnaireState | null> {
    const data = await storage.getItem(this.PROGRESS_KEY);
    if (data) {
      return JSON.parse(data) as QuestionnaireState;
    }
    return null;
  }

  async clearProgress(): Promise<void> {
    await storage.removeItem(this.PROGRESS_KEY);
    await storage.removeItem(this.ANSWERS_KEY);
  }

  // Helper method to calculate running plan data from answers
  getRunningPlanData(answers: Answer[]): any {
    const getValue = (id: string) => getAnswerValue(answers, id);
   
    const hasRunBefore = getValue('q1') === 'yes';
    const daysPerWeek = getValue('q8');
    const recentLongRunDistance = getValue('q2');
    const recentLongRunTime = getValue('q3');
    const eventName = getValue('q5');
    const eventDistance = getValue('q6');
    const targetTime = getValue('q7');
    const selectedPlan = getValue('q9'); // ✅ NEW: Get selected plan

    let daysNumber = 0;
    if (daysPerWeek) {
      switch(daysPerWeek) {
        case '1-2': daysNumber = 2; break;
        case '3-4': daysNumber = 4; break;
        case '5-6': daysNumber = 6; break;
        case '7': daysNumber = 7; break;
        default: daysNumber = 3;
      }
    }

    let avgPace = null;
    if (recentLongRunDistance && recentLongRunTime) {
      const distance = parseFloat(recentLongRunDistance);
      const time = parseFloat(recentLongRunTime);
      if (distance > 0 && time > 0) {
        avgPace = time / distance;
      }
    }

    const shouldStartWith5K = !hasRunBefore || daysNumber < 3;

    return {
      hasRunBefore,
      daysPerWeek: daysNumber,
      avgPace,
      recentLongRunDistance: recentLongRunDistance ? parseFloat(recentLongRunDistance) : null,
      recentLongRunTime: recentLongRunTime ? parseFloat(recentLongRunTime) : null,
      eventName: eventName || null,
      eventDistance: eventDistance ? parseFloat(eventDistance) : null,
      targetTime: targetTime ? parseFloat(targetTime) : null,
      selectedPlan: selectedPlan || null, // ✅ NEW
      shouldStartWith5K,
      recommendedDays: Math.max(3, Math.min(7, daysNumber)),
    };
  }
}

export const questionnaireService = new MockQuestionnaireService();