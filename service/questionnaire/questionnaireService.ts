import { assessmentAPI } from "../api";

// ========== Types (match backend serializers) ==========
export interface QuestionOption {
  id: string;
  label: string;
  value: string;
  text?: string;
  numeric_value?: string;
  numeric_unit?: string;
  requires_input?: boolean;
  input_type?: string;
  display_order?: number;
}

export interface SubQuestion {
  id: string;
  question: string;
  type: string;
  options?: QuestionOption[];
  placeholder?: string;
  condition?: {
    dependsOn?: string;
    value?: string;
  };
}

export interface Question {
  id: string;
  backendId?: number;
  question: string;          // question text
  type: string;              // e.g., "single", "multiple", "text", "time", "computed"
  options?: QuestionOption[];
  isRequired: boolean;
  placeholder?: string;
  title?: string;
  label?: string;
  description?: string;
  subTitle?: string;
  helperText?: string;
  fieldLabels?: Record<string, string>;
  subQuestions?: SubQuestion[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
  // Additional fields from backend (page_no, question_order, slug, etc.)
  page_no?: number;
  question_order?: number;
  slug?: string;
  isGoalQuestion?: boolean;
  allowed_input_units?: string;  // comma-separated
  selection_count_source_id?: number | null;
  selection_subset_source_id?: number | null;
  validate_consecutive_selections?: boolean;
}

export interface Navigation {
  page_no: number;
  page_title?: string;
  question_ids: Array<number | string>;
  // option_ids_by_question: { [questionId: string]: number[] }; // may not be needed
}

export interface AnswerPayload {
  question_id: number | string;
  value: any;
  unit?: string | null;
  custom_values?: Record<string, any> | null;
}

export interface AssessmentState {
  assessmentId: number;
  currentNavigation: Navigation | null;
  complete: boolean;
  computedResponses: any;
}

// ========== Service ==========
class AssessmentService {
  private questionsCache: Question[] | null = null;

  private normalizeQuestionType(rawType: any): string {
    const type = String(rawType ?? "text").trim().toLowerCase();
    if (["single", "single_choice", "single choice", "radio", "choice"].includes(type)) {
      return "single";
    }
    if (["multiple", "multiple_choice", "multiple choice", "checkbox", "checkboxes", "multi_select"].includes(type)) {
      return "multiple";
    }
    if (["yesno", "yes_no", "yes no", "boolean", "toggle"].includes(type)) {
      return "yesno";
    }
    if (["dropdown", "select", "select_one", "picklist", "select list"].includes(type)) {
      return "dropdown";
    }
    if (["rating", "rating_scale", "stars"].includes(type)) {
      return "rating";
    }
    if (["date", "date_picker", "date picker", "date-input", "date input"].includes(type)) {
      return "date";
    }
    if (["time", "time_picker", "time picker", "time-input", "time input"].includes(type)) {
      return "time";
    }
    if (["long_text", "longtext", "textarea", "text_area", "comment", "paragraph"].includes(type)) {
      return "text";
    }
    if (["calculated_pace", "pace", "computed", "calculatedpace"].includes(type)) {
      return "computed";
    }
    if (["plan_selection", "plan selection", "plan_select", "plan select", "plan"].includes(type)) {
      return "plan_selection";
    }
    if (["recent_long_run", "recent long run", "long run", "recent_run"].includes(type)) {
      return "recent_long_run";
    }
    if (["event_registration", "event registration", "event-register", "event register"].includes(type)) {
      return "event_registration";
    }
    if (["number", "numeric", "integer", "decimal", "float"].includes(type)) {
      return "number";
    }
    return type || "text";
  }

  // Fetch all questions and cache them
  // async fetchQuestions(): Promise<Question[]> {
  //   if (this.questionsCache) {
  //     return this.questionsCache;
  //   }

  //   const response = await assessmentAPI.getQuestions();
  //   const rawQuestions = response.data.questions ?? [];
  //   const mappedQuestions: Question[] = rawQuestions.map((item: any) => ({
  //     id: `q${item.id}`,
  //     backendId: item.id,
  //     question: item.text ?? item.question ?? "",
  //     type: this.normalizeQuestionType(item.question_type ?? item.type ?? "text"),
  //     options: (item.options ?? []).map((option: any) => ({
  //       id: String(option.id),
  //       label: option.text ?? option.label ?? String(option.id),
  //       text: option.text ?? option.label ?? String(option.id),
  //       value: String(option.id),
  //       numeric_value: option.numeric_value ?? option.value ?? undefined,
  //       numeric_unit: option.numeric_unit ?? option.unit ?? "km",
  //       requires_input: option.requires_input ?? false,
  //       input_type: option.input_type ?? "",
  //     })),
  //     isRequired: Boolean(item.is_required ?? item.required ?? false),
  //     placeholder: item.placeholder ?? undefined,
  //     validation: {
  //       min: item.validation?.min,
  //       max: item.validation?.max,
  //       pattern: item.validation?.pattern,
  //     },
  //     page_no: item.page_no,
  //     question_order: item.question_order,
  //     slug: item.slug,
  //     isGoalQuestion: Boolean(item.is_goal_question),
  //     allowed_input_units: Array.isArray(item.input_units)
  //       ? item.input_units.join(",")
  //       : item.allowed_input_units,
  //   }));

  //   this.questionsCache = mappedQuestions;
  //   return this.questionsCache;
  // }


  async fetchQuestions(): Promise<Question[]> {
  if (this.questionsCache) {
    return this.questionsCache;
  }

  const response = await assessmentAPI.getQuestions();
  const rawQuestions = response.data.questions ?? [];

  const mappedQuestions: Question[] = rawQuestions.map((item: any) => ({
    id: `q${item.id}`,
    backendId: item.id,
    question: item.text ?? item.question ?? "",
    type: this.normalizeQuestionType(item.question_type ?? item.type ?? "text"),
    options: (item.options ?? []).map((option: any) => ({
      id: String(option.id),
      label: option.text ?? option.label ?? String(option.id),
      text: option.text ?? option.label ?? String(option.id),
      value: String(option.id),
      numeric_value: option.numeric_value ?? option.value ?? undefined,
      numeric_unit: option.numeric_unit ?? option.unit ?? "km",
      requires_input: option.requires_input ?? false,
      input_type: option.input_type ?? "",
      display_order: option.display_order,
    })),
    isRequired: Boolean(item.is_required ?? item.required ?? false),
    placeholder: item.placeholder ?? undefined,
    title: item.title ?? item.heading ?? undefined,
    label: item.label ?? item.field_label ?? undefined,
    description: item.description ?? item.subtitle ?? undefined,
    helperText: item.helper_text ?? item.help_text ?? item.hint ?? undefined,
    fieldLabels: item.field_labels ?? item.labels ?? item.metadata?.field_labels ?? undefined,
    validation: {
      min: item.validation?.min,
      max: item.validation?.max,
      pattern: item.validation?.pattern,
    },
    page_no: item.page_no,
    question_order: item.question_order,
    slug: item.slug,
    isGoalQuestion: Boolean(item.is_goal_question),
    allowed_input_units: Array.isArray(item.input_units)
      ? item.input_units.join(",")
      : item.allowed_input_units,
    selection_count_source_id: item.selection_count_source_id ?? null,
    selection_subset_source_id: item.selection_subset_source_id ?? null,
    validate_consecutive_selections: Boolean(item.validate_consecutive_selections),
  }));

  // ================= DEBUG LOGS =================

  console.log("========== ALL QUESTIONS ==========");
  console.log(JSON.stringify(mappedQuestions, null, 2));

  console.log("========== EVENT_DISTANCE QUESTION ==========");
  const eventDistanceQuestion = mappedQuestions.find(
    q => q.slug === "EVENT_DISTANCE"
  );
  console.log(JSON.stringify(eventDistanceQuestion, null, 2));

  console.log("========== QUESTION 7 ==========");
  const question7 = mappedQuestions.find(
    q => q.backendId === 7
  );
  console.log(JSON.stringify(question7, null, 2));

  // =================================================

  this.questionsCache = mappedQuestions;
  return this.questionsCache;
}

  // Start a new assessment
  async startAssessment(): Promise<{
    assessmentId: number;
    navigation: Navigation;
    computedResponses: any;
    complete: boolean;
  }> {
    const response = await assessmentAPI.start();
    const data = response.data;
    return {
      assessmentId: data.assessment_id,
      navigation: data.navigation,
      computedResponses: data.computed_responses || {},
      complete: data.complete || false,
    };
  }

  // Submit answers for the current page
  // 
  
  async submitAnswers(
  assessmentId: number,
  answers: AnswerPayload[]
): Promise<{
  saved: boolean;
  complete: boolean;
  navigation: Navigation | null;
  computedResponses: any;
}> {

  // DEBUG: Convert Question 7 value to number
  const convertedAnswers = answers.map((answer) => {
  const question = this.questionsCache?.find(
    q => q.backendId === answer.question_id
  );

  let value = answer.value;

  if (
    question &&
    ["single", "dropdown"].includes(question.type) &&
    typeof value === "string" &&
    !isNaN(Number(value))
  ) {
    value = Number(value);
  }

  return {
    ...answer,
    value,
  };
});

  console.log("========== CONVERTED ANSWERS ==========");
  console.log(JSON.stringify(convertedAnswers, null, 2));

  const response = await assessmentAPI.submitAnswers(
    assessmentId,
    convertedAnswers
  );

  const data = response.data;

  return {
    saved: data.saved,
    complete: data.complete,
    navigation: data.navigation || null,
    computedResponses: data.computed_responses || {},
  };
}

  // Rewinds the server-side assessment flow so the returned page can be
  // edited and submitted again through the normal answers endpoint.
  async goBack(assessmentId: number): Promise<{
    complete: boolean;
    navigation: Navigation | null;
    computedResponses: any;
  }> {
    const response = await assessmentAPI.goBack(assessmentId);
    const data = response.data;
    return {
      complete: Boolean(data.complete),
      navigation: data.navigation || null,
      computedResponses: data.computed_responses || {},
    };
  }

  // Get final results (optional, if needed)
  async getResults(assessmentId: number): Promise<any> {
    const response = await assessmentAPI.getResults(assessmentId);
    return response.data;
  }

  // Helper to get question by id from cache
  getQuestionById(id: number): Question | undefined {
    return this.questionsCache?.find(q => q.id === String(id));
  }

  // Clear cache (e.g., on logout)
  clearCache() {
    this.questionsCache = null;
  }
}

export const assessmentService = new AssessmentService();

export class MockQuestionnaireService {
  async getQuestions(): Promise<Question[]> {
    return [];
  }

  async submitAnswers(answers: any[]): Promise<void> {
    return Promise.resolve();
  }

  async saveProgress(state: any): Promise<void> {
    return Promise.resolve();
  }

  async loadProgress(): Promise<any> {
    return Promise.resolve(null);
  }

  async clearProgress(): Promise<void> {
    return Promise.resolve();
  }
}

export const getAnswerValue = (
  answers: Array<{ questionId: string; value: any }>,
  questionId: string
) => answers.find((answer) => answer.questionId === questionId)?.value;
