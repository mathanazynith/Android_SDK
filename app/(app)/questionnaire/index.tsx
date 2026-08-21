import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  TextInput as RNTextInput,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DatePicker from "../../../app/(app)/questionnaire/QuestionTypes/DatePicker";
import DistanceTimePaceSelector, { getDistanceInKilometers } from "../../../app/(app)/questionnaire/QuestionTypes/DistanceTimePaceSelector";
import PlanSelection from "../../../app/(app)/questionnaire/QuestionTypes/PlanSelection";
import RecentLongRun from "../../../app/(app)/questionnaire/QuestionTypes/RecentLongRun";
import YesNo, {
  getYesNoOptionValues,
  getYesNoValue,
} from "../../../app/(app)/questionnaire/QuestionTypes/YesNo";
import EventRegistration from "../../../app/(app)/questionnaire/components/QuestionTypes/EventRegistration";
import { ScrollTimePicker } from "../../../components/ScrollTimePicker";
import { useQuestionnaire } from "../../../contexts/QuestionnaireContext";
import { useAuth } from "../../../service/auth";
import type { Question } from "../../../service/questionnaire/questionnaireService";
import { validateAnswer } from "../../../service/validation/AssessmentValidator";
import { getDistanceUnitCode } from "../../../utils/distanceUnit";
import { calculatePace, timeToSeconds } from "../../../utils/validators";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Helper to get numeric ID
const getNumericId = (id: number | string): number => {
  if (typeof id === "number") return id;
  const numeric = id.replace(/\D/g, "");
  return parseInt(numeric, 10);
};

// SingleChoice component
const SingleChoice = ({ options, selectedValue, onSelect, stacked = false }: any) => {
  return (
    <View style={stacked ? styles.dayOptionsContainer : styles.optionsContainer}>
      {options.map((opt: any) => (
        <TouchableOpacity
          key={opt.id}
          style={[
            styles.optionButton,
            stacked && styles.dayOptionButton,
            selectedValue === opt.value && styles.optionSelected,
          ]}
          onPress={() => {
            if (selectedValue !== opt.value) {
              onSelect(opt.value);
            }
          }}
        >
          <Text style={styles.optionText}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

// Generic renderer for a question
const QuestionField = ({
  question,
  value,
  unit,
  customValues,
  onAnswer,
  onCustomChange,
  computedResponses,
  goalPacePreview,
  maxDistanceKm,
  allQuestions,
  allAnswers,
}: any) => {
  const {
    id,
    type: rawType,
    question: questionText,
    options,
    placeholder,
    isRequired,
  } = question;
  const type = String(rawType ?? "").toLowerCase();
  const questionIdentifier = `${questionText ?? ""} ${question.slug ?? ""}`;
  const isPrimaryRunningGoal = question.isGoalQuestion === true || /primary\s+running\s+goal|what\s+is\s+your\s+goal/i.test(questionIdentifier);
  const isTargetFinishTime = /target\s+finish\s+time|goal[_\s-]*target[_\s-]*time|target.*time.*goal/i.test(questionIdentifier);
  const isGoalTargetPace = /goal[_\s-]*target[_\s-]*pace|goal.*target.*pace/i.test(questionIdentifier);
  const yesNoOptionValues = getYesNoOptionValues(options);
  const normalizedQuestionText = String(questionText ?? "").toLowerCase();
  const isRunningDaysQuestion =
    type === "multiple" && /which days of the week.*usually run/.test(normalizedQuestionText);
  const isLongRunDayQuestion =
    /which of your running days.*long run/.test(normalizedQuestionText);

  const getStoredAnswer = (sourceQuestion: any) => {
    if (!sourceQuestion) return undefined;
    const key = String(sourceQuestion.backendId ?? getNumericId(sourceQuestion.id));
    return allAnswers?.[key]?.value;
  };

  const runningDaysQuestion = allQuestions?.find((candidate: any) =>
    String(candidate.type ?? "").toLowerCase() === "multiple" &&
    /which days of the week.*usually run/.test(String(candidate.question ?? "").toLowerCase())
  );
  const selectedRunningDayValues = Array.isArray(getStoredAnswer(runningDaysQuestion))
    ? getStoredAnswer(runningDaysQuestion)
    : [];
  const selectedRunningDayLabels = new Set(
    (runningDaysQuestion?.options ?? [])
      .filter((option: any) => selectedRunningDayValues.map(String).includes(String(option.value)))
      .map((option: any) => String(option.label ?? option.text ?? "").trim().toLowerCase())
  );
  const visibleOptions = isLongRunDayQuestion
    ? (options ?? []).filter((option: any) =>
        selectedRunningDayLabels.has(String(option.label ?? option.text ?? "").trim().toLowerCase())
      )
    : options ?? [];

  const runningDaysCountQuestion = allQuestions?.find((candidate: any) =>
    /how many days per week.*run/.test(String(candidate.question ?? "").toLowerCase())
  );
  const selectedRunningDaysCountValue = getStoredAnswer(runningDaysCountQuestion);
  const selectedRunningDaysCountOption = runningDaysCountQuestion?.options?.find(
    (option: any) => String(option.value) === String(selectedRunningDaysCountValue)
  );
  const selectedRunningDaysLimit = Number(
    selectedRunningDaysCountOption?.numeric_value ??
      selectedRunningDaysCountOption?.label ??
      selectedRunningDaysCountValue
  );

  const resolveComputedValue = () => {
    const responseCandidates = [
      computedResponses?.[id],
      computedResponses?.[String(id).replace(/^q/i, "")],
      computedResponses?.[String(id).toLowerCase()],
      computedResponses?.[String(question.backendId ?? id)],
      computedResponses?.[String(question.backendId ?? "").replace(/^q/i, "")],
    ];

    for (const candidate of responseCandidates) {
      if (candidate !== undefined && candidate !== null && candidate !== "") {
        return candidate;
      }
    }

    return value;
  };

  const resolvedValue = resolveComputedValue();

  console.log("[QuestionField] rendering question", {
    id,
    type,
    questionText,
    value,
    unit,
    customValues,
  });

  // Page 5 uses ordinary backend question types, so route only its two
  // identified questions through the same Page 2 primitives.
  if (isPrimaryRunningGoal) {
    return (
      <View style={styles.questionContainer}>
        <Text style={styles.questionText}>
          {questionText}
          {isRequired && <Text style={styles.requiredStar}> *</Text>}
        </Text>
        <DistanceTimePaceSelector
          title=""
          subtitle=""
          options={options || []}
          selectedValue={value}
          onSelect={(val: string, nextCustomValues?: Record<string, any> | null) =>
            onAnswer(id, val, undefined, nextCustomValues)
          }
          customValues={customValues}
          onCustomChange={(field: string, nextValue: string) =>
            onCustomChange(id, field, nextValue)
          }
          distanceField="distance"
          timeField="time"
          paceField="pace"
          distanceLabel={question.fieldLabels?.distance || question.label || "Distance"}
          customDistanceLabel="Enter Distance"
          optionsHint={question.fieldLabels?.optionsHint || question.description || "Select a common distance or custom option"}
          showHeader={false}
          showTimeInput={false}
          showPace={false}
          maxDistanceKm={maxDistanceKm}
        />
      </View>
    );
  }

  if (isTargetFinishTime) {
    return (
      <View style={styles.questionContainer}>
        <Text style={styles.questionText}>
          {questionText}
          {isRequired && <Text style={styles.requiredStar}> *</Text>}
        </Text>
        <ScrollTimePicker value={value} onChange={(nextValue) => onAnswer(id, nextValue)} />
      </View>
    );
  }

  // The long-run-day answer is intentionally single-select, even if legacy
  // question metadata describes it as a multiple-choice field.
  if (isLongRunDayQuestion) {
    return (
      <View style={styles.questionContainer}>
        <Text style={styles.questionText}>
          {questionText}
          {isRequired && <Text style={styles.requiredStar}> *</Text>}
        </Text>
        <SingleChoice
          options={visibleOptions}
          selectedValue={value}
          stacked
          onSelect={(val: string) => onAnswer(id, val)}
        />
      </View>
    );
  }

  switch (type) {
    case "single":
      if (yesNoOptionValues) {
        return (
          <View style={styles.questionContainer}>
            <Text style={styles.questionText}>
              {questionText}
              {isRequired && <Text style={styles.requiredStar}> *</Text>}
            </Text>
            <YesNo
              value={getYesNoValue(value, yesNoOptionValues)}
              onChange={(isYes) =>
                onAnswer(id, String((isYes ? yesNoOptionValues.yes : yesNoOptionValues.no).value))
              }
            />
          </View>
        );
      }
      return (
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>
            {questionText}
            {isRequired && <Text style={styles.requiredStar}> *</Text>}
          </Text>
          <SingleChoice
            options={visibleOptions}
            selectedValue={value}
            stacked={isLongRunDayQuestion}
            onSelect={(val: string) => onAnswer(id, val)}
          />
        </View>
      );

    case "yesno":
      return (
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>
            {questionText}
            {isRequired && <Text style={styles.requiredStar}> *</Text>}
          </Text>
          <YesNo
            value={getYesNoValue(value)}
            onChange={(val: boolean) => onAnswer(id, val)}
          />
        </View>
      );

    case "multiple":
      return (
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>
            {questionText}
            {isRequired && <Text style={styles.requiredStar}> *</Text>}
          </Text>
          <View style={isRunningDaysQuestion ? styles.dayOptionsContainer : styles.optionsContainer}>
            {visibleOptions.map((opt: any) => {
              const selected = Array.isArray(value) && value.includes(opt.value);
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.optionButton,
                    isRunningDaysQuestion && styles.dayOptionButton,
                    selected && styles.optionSelected,
                  ]}
                  onPress={() => {
                    let newVal = Array.isArray(value) ? [...value] : [];
                    if (selected) {
                      newVal = newVal.filter(v => v !== opt.value);
                    } else if (
                      isRunningDaysQuestion &&
                      Number.isFinite(selectedRunningDaysLimit) &&
                      newVal.length >= selectedRunningDaysLimit
                    ) {
                      return;
                    } else {
                      newVal.push(opt.value);
                    }
                    onAnswer(id, newVal);
                  }}
                >
                  <Text style={styles.optionText}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      );

    case "text":
    case "number":
    case "time":
    case "computed":
    case "calculated_pace":
      return (
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>
            {questionText}
            {isRequired && <Text style={styles.requiredStar}> *</Text>}
          </Text>
          {type === "computed" || type === "calculated_pace" ? (
            <Text style={styles.computedValue}>
              {isGoalTargetPace && goalPacePreview
                ? goalPacePreview
                : computedResponses?.[question.slug ?? id] !== undefined
                ? String(computedResponses[question.slug ?? id])
                : customValues?.derivedValue !== undefined
                ? String(customValues.derivedValue)
                : typeof resolvedValue === "object"
                ? JSON.stringify(resolvedValue)
                : String(resolvedValue ?? "Computed automatically")}
            </Text>
          ) : (
            <RNTextInput
              style={styles.textInput}
              value={value || ""}
              onChangeText={(text) => onAnswer(id, text)}
              placeholder={placeholder || ""}
              keyboardType={type === "number" ? "numeric" : "default"}
            />
          )}
        </View>
      );

    case "dropdown":
      return (
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>
            {questionText}
            {isRequired && <Text style={styles.requiredStar}> *</Text>}
          </Text>
          <View style={styles.dropdownContainer}>
            {options?.map((opt: any) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.dropdownItem, value === opt.value && styles.optionSelected]}
                onPress={() => onAnswer(id, opt.value)}
              >
                <Text style={styles.optionText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );

    case "rating":
      return (
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>
            {questionText}
            {isRequired && <Text style={styles.requiredStar}> *</Text>}
          </Text>
          <View style={styles.ratingContainer}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
              <TouchableOpacity
                key={num}
                style={[styles.ratingButton, value === num && styles.optionSelected]}
                onPress={() => onAnswer(id, num)}
              >
                <Text style={styles.ratingText}>{num}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );

    case "date":
      return (
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>
            {questionText}
            {isRequired && <Text style={styles.requiredStar}> *</Text>}
          </Text>
          <DatePicker value={value} onChange={(date) => onAnswer(id, date)} />
        </View>
      );

    case "recent_long_run":
      return (
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>
            {questionText}
            {isRequired && <Text style={styles.requiredStar}> *</Text>}
          </Text>
          <RecentLongRun
            options={options || []}
            title={question.title || questionText}
            subtitle={question.description || question.helperText}
            distanceLabel={question.fieldLabels?.distance || question.label}
            timeLabel={question.fieldLabels?.time}
            timeHint={question.fieldLabels?.timeHint || question.helperText}
            optionsHint={question.fieldLabels?.optionsHint || question.description}
            selectedValue={value}
            onSelect={(val: string, customValues?: Record<string, any> | null) =>
              onAnswer(id, val, undefined, customValues)
            }
            customValues={customValues}
            onCustomChange={(field: string, val: string) =>
              onCustomChange(id, field, val)
            }
          />
        </View>
      );

    case "plan_selection":
      return (
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>
            {questionText}
            {isRequired && <Text style={styles.requiredStar}> *</Text>}
          </Text>
          <PlanSelection
            options={options || []}
            title={question.title || questionText}
            subtitle={question.description || question.helperText}
            distanceLabel={question.fieldLabels?.distance || question.label}
            timeLabel={question.fieldLabels?.time}
            timeHint={question.fieldLabels?.timeHint || question.helperText}
            optionsHint={question.fieldLabels?.optionsHint || question.description}
            selectedValue={value}
            onSelect={(val: string, customValuesPayload?: Record<string, any> | null) =>
              onAnswer(id, val, undefined, customValuesPayload)
            }
            customValues={customValues}
            onCustomChange={(field: string, val: string) =>
              onCustomChange(id, field, val)
            }
          />
        </View>
      );

    case "event_registration":
      return (
        <EventRegistration
          value={typeof value === "object" && value !== null ? value : {}}
          options={options || []}
          selectedValue={typeof value === "string" ? value : undefined}
          customValues={customValues || {}}
          onChange={(nextValue: Record<string, any>) => onAnswer(id, nextValue)}
          trainingDaysComputed={computedResponses?.[question.slug ?? id]}
        />
      );

    default:
      return (
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>Unsupported question type: {type}</Text>
        </View>
      );
  }
};

export default function QuestionnaireScreen() {
  const {
    questions,
    currentNavigation,
    currentPageQuestions,
    currentPageAnswers, // This is now derived from allAnswers
    allAnswers,
    isLoading,
    error,
    validationErrors,
    clearValidationErrors,
    isComplete,
    computedResponses,
    assessmentId,
    setAnswer,
    goToNext,
    goToPrevious,
    reset,
    canGoBack,
  } = useQuestionnaire();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrorQuestionId, setValidationErrorQuestionId] = useState<string | null>(null);
  const [daySelectionError, setDaySelectionError] = useState<string | null>(null);

  const getQuestionValidationMessages = (question: Question): string[] => {
    const keys = [
      question.slug,
      question.backendId,
      question.id,
    ]
      .map((key) => String(key ?? "").trim().toLowerCase())
      .filter(Boolean);

    return keys.flatMap((key) => validationErrors[key] ?? []);
  };

  const goalPacePreview = useMemo(() => {
    const goalQuestion = questions.find((question) =>
      question.isGoalQuestion === true || /primary\s+running\s+goal|what\s+is\s+your\s+goal/i.test(`${question.question} ${question.slug ?? ""}`)
    );
    const goalTimeQuestion = questions.find((question) =>
      /goal[_\s-]*target[_\s-]*time|target.*time.*goal/i.test(`${question.question} ${question.slug ?? ""}`)
    );
    if (!goalQuestion || !goalTimeQuestion) return "";

    const goalAnswer = allAnswers[String(goalQuestion.backendId ?? getNumericId(goalQuestion.id))];
    const timeAnswer = allAnswers[String(goalTimeQuestion.backendId ?? getNumericId(goalTimeQuestion.id))];
    const selectedOption = goalQuestion.options?.find((option) => String(option.id) === String(goalAnswer?.value));
    const seconds = timeToSeconds(String(timeAnswer?.value ?? ""));
    if (!goalAnswer || !selectedOption || !seconds) return "";

    const unit = getDistanceUnitCode(user?.profile?.distance_unit);
    const customDistance = Number(goalAnswer.customValues?.distance);
    const distanceKm = selectedOption.requires_input
      ? (Number.isFinite(customDistance) && customDistance > 0
          ? (unit === "mile" ? customDistance * 1.60934 : customDistance)
          : null)
      : getDistanceInKilometers(selectedOption);

    return distanceKm && distanceKm > 0
      ? calculatePace(seconds, distanceKm, unit)
      : "";
  }, [allAnswers, questions, user?.profile?.distance_unit]);

  React.useEffect(() => {
    if (isComplete && assessmentId) {
      // After assessment completion, show the Plan Summary screen (separate from the Training Calendar)
      router.replace('/(app)/running-plan');
    }
  }, [isComplete, assessmentId]);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#34C759" />
        <Text style={styles.loadingText}>Loading assessment...</Text>
      </View>
    );
  }

  if (!currentNavigation || !questions.length) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>No questions available</Text>
        <TouchableOpacity style={styles.retryButton} onPress={reset}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const displayQuestions = currentPageQuestions;

  const allPageNumbers = Array.from(
    new Set(questions.map((q) => q.page_no).filter((page): page is number => typeof page === "number"))
  ).sort((a, b) => a - b);
  const totalPages = allPageNumbers.length || 1;

  // Handle answer - MERGES customValues
  const handleAnswer = (
    questionId: string,
    value: any,
    unit?: string | null,
    customValues?: any
  ) => {
    const question = questions.find((item) => String(item.backendId ?? getNumericId(item.id)) === String(getNumericId(questionId)));
    if (question) {
      const validationResult = validateAnswer({
        question,
        answer: value,
        allAnswers,
        questions,
        allowIncompleteSelectionCount: true,
      });
      if (!validationResult.valid) {
        setValidationErrorQuestionId(String(getNumericId(questionId)));
        return;
      }
    }

    // The replacement answer supersedes the rejected value. Clear the old
    // server response now so it cannot keep Next disabled.
    clearValidationErrors();
    setValidationErrorQuestionId(null);
    setDaySelectionError(null);
    setAnswer(questionId, value, unit, customValues);
  };

  // Handle custom change - MERGES customValues, never overwrites
  const handleCustomChange = (questionId: string, field: string, value: string) => {
    const numericId = getNumericId(questionId);
    const key = String(numericId);
    const existing = allAnswers[key]?.customValues || {};

    const updatedCustomValues = {
      ...existing,
      [field]: value,
    };

    const isEmptyCustom =
      Object.values(updatedCustomValues).every(
        (val) => val === undefined || val === null || String(val).trim() === ""
      );

    if (isEmptyCustom) {
      clearValidationErrors();
      setValidationErrorQuestionId(null);
      setAnswer(questionId, undefined, undefined, null);
      return;
    }

    const question = questions.find((item) => String(item.backendId ?? getNumericId(item.id)) === String(getNumericId(questionId)));
    if (question) {
      const validationResult = validateAnswer({
        question,
        answer: updatedCustomValues,
        allAnswers,
        questions,
      });
      if (!validationResult.valid) {
        setValidationErrorQuestionId(String(getNumericId(questionId)));
        return;
      }
    }

    clearValidationErrors();
    setValidationErrorQuestionId(null);
    setAnswer(questionId, undefined, undefined, updatedCustomValues);
  };

  const getRecentLongRunGroup = (questions: Question[]) => {
    const singleQuestion = questions.find(
      (q) => q.type === "single" && /long run|recent run/i.test(q.question)
    );
    const timeQuestion = questions.find((q) => q.type === "time");
    const computedQuestion = questions.find(
      (q) => q.type === "computed" && /pace/i.test(q.question)
    );
    if (singleQuestion && timeQuestion && computedQuestion) {
      return { singleQuestion, timeQuestion, computedQuestion };
    }
    return null;
  };

  const getEventRegistrationGroup = (questions: Question[]) => {
    // Detect all event-related questions
    const eventNameQuestion = questions.find(
      (q) => /event.*name|name.*event/i.test(q.question)
    );
    const eventDateQuestion = questions.find(
      (q) => /event.*date|when.*event|date.*event/i.test(q.question) && q.type === "date"
    );
    const trainingStartDateQuestion = questions.find(
      (q) => /start.*training|training.*start/i.test(q.question) && q.type === "date"
    );
    const distanceQuestion = questions.find(
      (q) => /event.*distance|distance.*event/i.test(q.question)
    );
    const targetTimeQuestion = questions.find(
      (q) => /target.*time|time.*event/i.test(q.question) && q.type === "time"
    );
    const paceQuestion = questions.find(
      (q) => q.type === "computed" && /pace/i.test(q.question)
    );

    // If we have at least event name + date, treat as event registration group
    if (eventNameQuestion && eventDateQuestion) {
      return {
        eventNameQuestion,
        eventDateQuestion,
        trainingStartDateQuestion,
        distanceQuestion,
        targetTimeQuestion,
        paceQuestion,
      };
    }
    return null;
  };

  const handleRecentLongRunCustomChange = (
    singleQuestionId: string,
    timeQuestionId: string,
    field: string,
    value: string
  ) => {
    const numericId = getNumericId(singleQuestionId);
    const key = String(numericId);
    const existing = allAnswers[key]?.customValues || {};
    const updatedCustomValues = {
      ...existing,
      [field]: value,
    };

    setAnswer(singleQuestionId, undefined, undefined, updatedCustomValues);

    if (field === "time") {
      setAnswer(timeQuestionId, value, null, null);
    }
  };

  const handleNext = async () => {
    const runningDaysQuestion = currentPageQuestions.find(
      (question) => /which days of the week.*usually run/i.test(question.question)
    );
    if (runningDaysQuestion) {
      const selectedDays = getAnswerForQuestion(runningDaysQuestion).value;
      const countQuestion = questions.find(
        (question) => /how many days per week.*run/i.test(question.question)
      );
      const countAnswer = countQuestion ? getAnswerForQuestion(countQuestion).value : undefined;
      const selectedCountOption = countQuestion?.options?.find(
        (option) => String(option.value) === String(countAnswer)
      );
      const requiredCount = Number(
        selectedCountOption?.numeric_value ?? selectedCountOption?.label ?? countAnswer
      );

      if (Number.isFinite(requiredCount) && (!Array.isArray(selectedDays) || selectedDays.length !== requiredCount)) {
        setValidationErrorQuestionId(String(runningDaysQuestion.backendId ?? getNumericId(runningDaysQuestion.id)));
        setDaySelectionError(`Please select exactly ${requiredCount} running days.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await goToNext();
    } catch (err) {
      // error is already set in context
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepInfo = {
    current: currentNavigation.page_no || 1,
    total: totalPages,
    label: currentNavigation.page_title || `Page ${currentNavigation.page_no}`,
  };

  const getAnswerForQuestion = (question: Question) => {
    const key = String(question.backendId ?? getNumericId(question.id));
    return currentPageAnswers[key] || { value: undefined, unit: null, customValues: {} };
  };

  const getAnswerValueBySlug = (slug: string) => {
    const normalizedSlug = String(slug).toLowerCase();
    const question = displayQuestions.find(
      (q) => String(q.slug ?? q.id).toLowerCase() === normalizedSlug
    );
    if (!question) return undefined;
    return getAnswerForQuestion(question)?.value;
  };

  const parseSelectedDistance = (question: Question) => {
    const answerValue = getAnswerForQuestion(question).value;
    if (!answerValue) return undefined;

    const selectedOption = question.options?.find((opt) => String(opt.id) === String(answerValue));
    if (!selectedOption) return undefined;

    const numeric = Number(selectedOption.numeric_value ?? selectedOption.value);
    if (!Number.isNaN(numeric) && numeric > 0) {
      return numeric;
    }

    const label = String(selectedOption.label || selectedOption.text || "");
    const kmMatch = label.match(/(\d+(?:\.\d+)?)\s*(km|kilometers?)/i);
    if (kmMatch) {
      return Number(kmMatch[1]);
    }
    const mileMatch = label.match(/(\d+(?:\.\d+)?)\s*(mi|mile|miles)/i);
    if (mileMatch) {
      return Number(mileMatch[1]) * 1.60934;
    }
    if (/half/i.test(label)) {
      return 21.0975;
    }
    if (/full|marathon/i.test(label)) {
      return 42.195;
    }
    return undefined;
  };

  // Frontend availability rule: a runner can select shorter targets, plus the
  // next configured progression distance. The backend still validates the
  // submitted option as the source of truth.
  const maxTargetDistanceKm = (() => {
    const currentDistanceQuestion = questions.find((question) =>
      /current.*running.*distance|current.*distance|recent.*long.*run/i.test(
        `${question.question} ${question.slug ?? ""}`
      )
    );
    if (!currentDistanceQuestion) return null;

    const answer = allAnswers[String(currentDistanceQuestion.backendId ?? getNumericId(currentDistanceQuestion.id))];
    const option = currentDistanceQuestion.options?.find((item) => String(item.id) === String(answer?.value));
    let currentDistance = getDistanceInKilometers(option);
    if (!currentDistance && option?.requires_input) {
      const enteredDistance = Number(answer?.customValues?.distance ?? answer?.customValues?.targetDistance);
      if (Number.isFinite(enteredDistance) && enteredDistance > 0) {
        currentDistance = getDistanceUnitCode(answer?.customValues?.unit) === "mile"
          ? enteredDistance * 1.60934
          : enteredDistance;
      }
    }
    if (!currentDistance) return null;
    if (currentDistance <= 5) return 10;
    if (currentDistance <= 10) return 15;
    if (currentDistance <= 15) return 21.1;
    if (currentDistance <= 21.1) return 42.2;
    return 42.2;
  })();

  const getLiveDateValidationMessages = (question: Question): string[] => {
    const slug = String(question.slug ?? "").toUpperCase();
    const answer = getAnswerForQuestion(question).value;
    if (!answer || !["EVENT_DATE", "GOAL_ACHIEVEMENT_DATE", "TRAINING_START_DATE", "START_TRAINING_DATE"].includes(slug)) {
      return [];
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(`${answer}T00:00:00`);
    if (Number.isNaN(selectedDate.getTime())) return [];

    if (slug === "TRAINING_START_DATE" || slug === "START_TRAINING_DATE") {
      if (selectedDate < today) return ["The running start date cannot be in the past."];
      const latestStart = new Date(today);
      latestStart.setDate(latestStart.getDate() + (slug === "TRAINING_START_DATE" ? 9 : 10));
      if (selectedDate > latestStart) {
        return [slug === "TRAINING_START_DATE"
          ? "Please choose a running start date within the next 10 days."
          : "The start training date should be within 10 days from joining."];
      }
      return [];
    }

    const isEventDate = slug === "EVENT_DATE";
    const distanceQuestion = questions.find((item) => String(item.slug ?? "").toUpperCase() === (isEventDate ? "EVENT_DISTANCE" : "RUNNING_GOAL"));
    const startDateQuestion = questions.find((item) => String(item.slug ?? "").toUpperCase() === (isEventDate ? "TRAINING_START_DATE" : "START_TRAINING_DATE"));
    if (!distanceQuestion || !startDateQuestion) return [];

    const distanceAnswer = getAnswerForQuestion(distanceQuestion);
    const option = distanceQuestion.options?.find((item) => String(item.id) === String(distanceAnswer.value));
    let distanceKm = getDistanceInKilometers(option);
    if (!distanceKm && option?.requires_input) {
      const customDistance = Number(distanceAnswer.customValues?.distance ?? distanceAnswer.customValues?.targetDistance);
      if (Number.isFinite(customDistance) && customDistance > 0) {
        distanceKm = getDistanceUnitCode(distanceAnswer.customValues?.unit) === "mile" ? customDistance * 1.60934 : customDistance;
      }
    }
    const startValue = getAnswerForQuestion(startDateQuestion).value;
    if (!distanceKm || !startValue) return [];
    const startDate = new Date(`${startValue}T00:00:00`);
    if (Number.isNaN(startDate.getTime())) return [];

    const minimumDays = distanceKm <= 5 ? 28 : distanceKm <= 10 ? 56 : distanceKm <= 15 ? 70 : distanceKm <= 21.1 ? (isEventDate ? 98 : 84) : 126;
    const earliestDate = new Date(startDate);
    earliestDate.setDate(earliestDate.getDate() + minimumDays);
    if (selectedDate >= earliestDate) return [];

    const label = distanceKm <= 5 ? "5K" : distanceKm <= 10 ? "10K" : distanceKm <= 15 ? "15K" : distanceKm <= 21.1 ? "Half Marathon" : "Full Marathon";
    const weeks = minimumDays / 7;
    return [isEventDate
      ? `For a ${label} event, the event date must be at least ${weeks} weeks from start date.`
      : `The goal achievable date must be at least ${minimumDays} days from start date.`];
  };

  const getDerivedComputedValue = (question: Question) => {
    const normalizedSlug = String(question.slug ?? question.question ?? "").toLowerCase();

    if (normalizedSlug.includes("target_pace") || normalizedSlug.includes("target pace")) {
      const targetTime = getAnswerValueBySlug("TARGET_TIME");
      const eventDistanceQuestion = displayQuestions.find(
        (q) => String(q.slug ?? "").toLowerCase() === "eventdistance"
      );
      const distanceKm = eventDistanceQuestion ? parseSelectedDistance(eventDistanceQuestion) : undefined;

      if (typeof targetTime === "string" && distanceKm && distanceKm > 0) {
        const totalSeconds = timeToSeconds(targetTime);
        if (totalSeconds !== null) {
          return calculatePace(totalSeconds, distanceKm);
        }
      }
    }

    if (normalizedSlug.includes("remaining days") || /event_5k_3/i.test(normalizedSlug)) {
      const eventDate = getAnswerValueBySlug("Event_5K_1");
      const startDate = getAnswerValueBySlug("Event_5K_2");
      if (eventDate && startDate) {
        const start = new Date(String(startDate));
        const end = new Date(String(eventDate));
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          const diffMs = end.getTime() - start.getTime();
          const diffDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          return diffDays;
        }
      }
    }

    if (normalizedSlug.includes("average pace") || normalizedSlug.includes("exp_5") || /average pace/i.test(normalizedSlug)) {
      const recentDistanceQuestion = displayQuestions.find(
        (q) => /recent long run/i.test(q.question || "") || /recent long run/i.test(q.slug ?? ""));
      const recentTimeQuestion = displayQuestions.find(
        (q) => q.type === "time" && /long run|time you had taken|time/i.test(q.question ?? ""));
      if (recentDistanceQuestion && recentTimeQuestion) {
        const distanceKm = parseSelectedDistance(recentDistanceQuestion);
        const recentTime = getAnswerForQuestion(recentTimeQuestion).value;
        if (typeof recentTime === "string" && distanceKm && distanceKm > 0) {
          const totalSeconds = timeToSeconds(recentTime);
          if (totalSeconds !== null) {
            return calculatePace(totalSeconds, distanceKm);
          }
        }
      }
    }

    return undefined;
  };

  const recentLongRunGroup = getRecentLongRunGroup(displayQuestions);
  const recentLongRunQuestionIds = recentLongRunGroup
    ? new Set([
        recentLongRunGroup.singleQuestion.id,
        recentLongRunGroup.timeQuestion.id,
        recentLongRunGroup.computedQuestion.id,
      ])
    : new Set<string>();

  const eventRegistrationGroup = getEventRegistrationGroup(displayQuestions);
  const eventRegistrationQuestionIds = eventRegistrationGroup
    ? new Set<string>([
        eventRegistrationGroup.eventNameQuestion.id,
        eventRegistrationGroup.eventDateQuestion.id,
        ...(eventRegistrationGroup.trainingStartDateQuestion ? [eventRegistrationGroup.trainingStartDateQuestion.id] : []),
        ...(eventRegistrationGroup.distanceQuestion ? [eventRegistrationGroup.distanceQuestion.id] : []),
        ...(eventRegistrationGroup.targetTimeQuestion ? [eventRegistrationGroup.targetTimeQuestion.id] : []),
        ...(eventRegistrationGroup.paceQuestion ? [eventRegistrationGroup.paceQuestion.id] : []),
      ])
    : new Set<string>();

  const isRequiredQuestionComplete = (question: Question) => {
    if (!question.isRequired || question.type === "computed") return true;

    const answer = getAnswerForQuestion(question);
    const value = answer?.value;
    if (
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    ) {
      return false;
    }

    const selectedOption = question.options?.find(
      (option) => String(option.id) === String(value)
    );
    const requiresCustomDistance =
      selectedOption?.requires_input === true ||
      /custom/i.test(String(selectedOption?.label ?? selectedOption?.text ?? ""));

    if (requiresCustomDistance) {
      const distance = answer?.customValues?.distance ?? answer?.customValues?.targetDistance;
      const distanceValue = Number(distance);
      return Number.isFinite(distanceValue) && distanceValue > 0;
    }

    return true;
  };

  // Next is available as soon as all required answers on the current page are
  // complete. Inline validation communicates invalid values as they are edited;
  // the backend remains the final check when Next is pressed.
  const isPageReadyToSubmit = displayQuestions.every(isRequiredQuestionComplete);

  const recentLongRunSelectedValue = recentLongRunGroup
    ? currentPageAnswers[
        String(
          recentLongRunGroup.singleQuestion.backendId ??
            getNumericId(recentLongRunGroup.singleQuestion.id)
        )
      ]?.value
    : undefined;

  const recentLongRunSingleAnswer = recentLongRunGroup
    ? currentPageAnswers[
        String(
          recentLongRunGroup.singleQuestion.backendId ??
            getNumericId(recentLongRunGroup.singleQuestion.id)
        )
      ]
    : undefined;

  const recentLongRunTimeValue = recentLongRunGroup
    ? currentPageAnswers[
        String(
          recentLongRunGroup.timeQuestion.backendId ??
            getNumericId(recentLongRunGroup.timeQuestion.id)
        )
      ]?.value
    : undefined;

  const recentLongRunCustomValues = recentLongRunGroup
    ? {
        ...(recentLongRunSingleAnswer?.customValues || {}),
        time: recentLongRunTimeValue || recentLongRunSingleAnswer?.customValues?.time,
      }
    : undefined;

  return (
    <View style={styles.container}>
      <View style={styles.progressHeader}>
        <Text style={styles.assessmentTitle}>Assessment</Text>
        <View style={styles.progressHeaderRow}>
          <Text style={styles.progressHeaderText}>
            Page {stepInfo.current} of {stepInfo.total}
          </Text>
          <Text style={styles.progressLabel}>{stepInfo.label}</Text>
        </View>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.min((stepInfo.current / 10) * 100, 100)}%` },
            ]}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} nestedScrollEnabled={true}>
        <View style={styles.pageContainer}>
          {(error || validationErrorQuestionId || daySelectionError) && (
            <View style={styles.validationBanner}>
              <Text style={styles.validationBannerText}>{error || daySelectionError || "This answer does not meet the configured validation rules."}</Text>
            </View>
          )}
          {recentLongRunGroup && (
            <RecentLongRun
              options={recentLongRunGroup.singleQuestion.options || []}
              title={recentLongRunGroup.singleQuestion.title || recentLongRunGroup.singleQuestion.question}
              subtitle={recentLongRunGroup.singleQuestion.description || recentLongRunGroup.singleQuestion.helperText}
              distanceLabel={recentLongRunGroup.singleQuestion.fieldLabels?.distance || recentLongRunGroup.singleQuestion.label}
              timeLabel={recentLongRunGroup.timeQuestion.label}
              timeHint={recentLongRunGroup.timeQuestion.helperText || recentLongRunGroup.timeQuestion.placeholder}
              optionsHint={recentLongRunGroup.singleQuestion.fieldLabels?.optionsHint || recentLongRunGroup.singleQuestion.description}
              selectedValue={recentLongRunSelectedValue}
              customValues={recentLongRunCustomValues}
              onSelect={(val: string, customValues?: Record<string, any> | null) =>
                handleAnswer(
                  recentLongRunGroup.singleQuestion.id,
                  val,
                  undefined,
                  customValues
                )
              }
              onCustomChange={(field: string, val: string) =>
                handleRecentLongRunCustomChange(
                  recentLongRunGroup.singleQuestion.id,
                  recentLongRunGroup.timeQuestion.id,
                  field,
                  val
                )
              }
            />
          )}

          {eventRegistrationGroup && (
            <EventRegistration
              value={{
                eventName: currentPageAnswers[String(eventRegistrationGroup.eventNameQuestion.backendId ?? getNumericId(eventRegistrationGroup.eventNameQuestion.id))]?.value,
                eventDate: currentPageAnswers[String(eventRegistrationGroup.eventDateQuestion.backendId ?? getNumericId(eventRegistrationGroup.eventDateQuestion.id))]?.value,
                trainingStartDate: eventRegistrationGroup.trainingStartDateQuestion ? currentPageAnswers[String(eventRegistrationGroup.trainingStartDateQuestion.backendId ?? getNumericId(eventRegistrationGroup.trainingStartDateQuestion.id))]?.value : undefined,
                targetTime: eventRegistrationGroup.targetTimeQuestion ? currentPageAnswers[String(eventRegistrationGroup.targetTimeQuestion.backendId ?? getNumericId(eventRegistrationGroup.targetTimeQuestion.id))]?.value : undefined,
                targetPace: eventRegistrationGroup.paceQuestion ? computedResponses[eventRegistrationGroup.paceQuestion.slug ?? eventRegistrationGroup.paceQuestion.id] : undefined,
              }}
              options={eventRegistrationGroup.distanceQuestion?.options || []}
              selectedValue={eventRegistrationGroup.distanceQuestion ? currentPageAnswers[String(eventRegistrationGroup.distanceQuestion.backendId ?? getNumericId(eventRegistrationGroup.distanceQuestion.id))]?.value : undefined}
              customValues={eventRegistrationGroup.distanceQuestion ? currentPageAnswers[String(eventRegistrationGroup.distanceQuestion.backendId ?? getNumericId(eventRegistrationGroup.distanceQuestion.id))]?.customValues || {} : {}}
              maxDistanceKm={maxTargetDistanceKm}
              validationMessages={{
                eventName: getQuestionValidationMessages(eventRegistrationGroup.eventNameQuestion),
                eventDate: [...getQuestionValidationMessages(eventRegistrationGroup.eventDateQuestion), ...getLiveDateValidationMessages(eventRegistrationGroup.eventDateQuestion)],
                trainingStartDate: eventRegistrationGroup.trainingStartDateQuestion
                  ? [...getQuestionValidationMessages(eventRegistrationGroup.trainingStartDateQuestion), ...getLiveDateValidationMessages(eventRegistrationGroup.trainingStartDateQuestion)]
                  : [],
                distance: eventRegistrationGroup.distanceQuestion
                  ? getQuestionValidationMessages(eventRegistrationGroup.distanceQuestion)
                  : [],
                targetTime: eventRegistrationGroup.targetTimeQuestion
                  ? getQuestionValidationMessages(eventRegistrationGroup.targetTimeQuestion)
                  : [],
              }}
              labels={{
                eventName: eventRegistrationGroup.eventNameQuestion.label || eventRegistrationGroup.eventNameQuestion.question,
                eventNamePlaceholder: eventRegistrationGroup.eventNameQuestion.placeholder,
                eventDate: eventRegistrationGroup.eventDateQuestion.label || eventRegistrationGroup.eventDateQuestion.question,
                trainingStartDate: eventRegistrationGroup.trainingStartDateQuestion?.label || eventRegistrationGroup.trainingStartDateQuestion?.question,
                trainingDays: eventRegistrationGroup.eventDateQuestion.fieldLabels?.trainingDays,
                detailsTitle: eventRegistrationGroup.distanceQuestion?.title || eventRegistrationGroup.distanceQuestion?.question,
                detailsDescription: eventRegistrationGroup.distanceQuestion?.description,
                distance: eventRegistrationGroup.distanceQuestion?.fieldLabels?.distance || eventRegistrationGroup.distanceQuestion?.label,
                targetTime: eventRegistrationGroup.targetTimeQuestion?.label || eventRegistrationGroup.targetTimeQuestion?.question,
                timeHint: eventRegistrationGroup.targetTimeQuestion?.helperText || eventRegistrationGroup.targetTimeQuestion?.placeholder,
                optionsHint: eventRegistrationGroup.distanceQuestion?.fieldLabels?.optionsHint || eventRegistrationGroup.distanceQuestion?.description,
              }}
              onChange={(nextValue: Record<string, any>) => {
                // Set event name
                if (nextValue.eventName !== undefined) {
                  handleAnswer(eventRegistrationGroup.eventNameQuestion.id, nextValue.eventName);
                }
                // Set event date
                if (nextValue.eventDate !== undefined) {
                  handleAnswer(eventRegistrationGroup.eventDateQuestion.id, nextValue.eventDate);
                }
                // Set training start date
                if (nextValue.trainingStartDate !== undefined && eventRegistrationGroup.trainingStartDateQuestion) {
                  handleAnswer(eventRegistrationGroup.trainingStartDateQuestion.id, nextValue.trainingStartDate);
                }
                // Set distance option and custom values
                if (nextValue.eventDistanceValue !== undefined && eventRegistrationGroup.distanceQuestion) {
                  handleAnswer(
                    eventRegistrationGroup.distanceQuestion.id,
                    nextValue.eventDistanceValue,
                    null,
                    nextValue.eventDistanceCustomValues || null
                  );
                }
                // Set target time
                if (nextValue.targetTime !== undefined && eventRegistrationGroup.targetTimeQuestion) {
                  handleAnswer(eventRegistrationGroup.targetTimeQuestion.id, nextValue.targetTime);
                }
              }}
              trainingDaysComputed={computedResponses?.[eventRegistrationGroup.eventDateQuestion.slug ?? "training_days"] ?? computedResponses?.training_days}
            />
          )}

          {displayQuestions
            .filter((question) => !recentLongRunQuestionIds.has(question.id))
            .filter((question) => !eventRegistrationQuestionIds.has(question.id))
            .map((question) => {
              const numericKey = String(
                question.backendId ?? getNumericId(question.id)
              );
              const answerData = currentPageAnswers[numericKey] || {};
              const value = answerData.value;
              const unit = answerData.unit;
              const computedOverride =
                question.type === "computed"
                  ? getDerivedComputedValue(question)
                  : undefined;
              const customValues = {
                ...answerData.customValues,
                ...(computedOverride !== undefined ? { derivedValue: computedOverride } : {}),
              };
              const validationMessages = [
                ...getQuestionValidationMessages(question),
                ...getLiveDateValidationMessages(question),
              ];

              return (
                <View key={question.id}>
                  <QuestionField
                    question={question}
                    value={value}
                    unit={unit}
                    customValues={customValues}
                    computedResponses={computedResponses}
                    goalPacePreview={goalPacePreview}
                    maxDistanceKm={maxTargetDistanceKm}
                    allQuestions={questions}
                    allAnswers={allAnswers}
                    onAnswer={(
                      questionKey: string,
                      val: any,
                      unitVal?: string | null,
                      customValues?: any
                    ) => handleAnswer(questionKey, val, unitVal, customValues)}
                    onCustomChange={(questionKey: string, field: string, val: string) =>
                      handleCustomChange(questionKey, field, val)
                    }
                    isInvalid={validationErrorQuestionId === String(question.backendId ?? getNumericId(question.id))}
                  />
                  {validationMessages.map((message) => (
                    <Text key={message} style={styles.questionValidationText}>
                      {message}
                    </Text>
                  ))}
                </View>
              );
            })}
        </View>
      </ScrollView>

      <View style={[styles.buttonContainer, { paddingBottom: 12 + insets.bottom }]}>
        <TouchableOpacity
          style={[styles.button, styles.prevButton]}
          onPress={goToPrevious}
          disabled={!canGoBack || isLoading}
        >
          <Feather name="arrow-left" size={18} color="#34C759" />
          <Text
            style={[
              styles.buttonText,
              styles.prevButtonText,
              (!canGoBack || isLoading) && styles.disabledText,
            ]}
          >
            Previous
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            styles.nextButton,
            (!isPageReadyToSubmit || isSubmitting || isLoading) && styles.nextButtonDisabled,
          ]}
          onPress={handleNext}
          disabled={!isPageReadyToSubmit || isSubmitting || isLoading}
        >
          <Text style={styles.buttonText}>
            {isSubmitting ? "Submitting..." : "Next"}
          </Text>
          <Feather name="arrow-right" size={18} color="#1A1A1A" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Styles (unchanged - keep your existing styles)
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0D0E",
  },
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#0B0D0E",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },
  errorText: {
    fontSize: 16,
    color: "#ff4444",
    textAlign: "center",
    marginBottom: 16,
  },
  validationBanner: {
    backgroundColor: "#FFF5F5",
    borderColor: "#FF4D4F",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  validationBannerText: {
    color: "#D93025",
    fontSize: 14,
    fontWeight: "600",
  },
  questionValidationText: {
    color: "#FF6B6B",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginTop: -16,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#34C759",
    borderRadius: 12,
  },
  retryText: {
    color: "#1A1A1A",
    fontSize: 16,
    fontWeight: "600",
  },
  progressHeader: {
    paddingHorizontal: 30,
    paddingTop: 22,
    paddingBottom: 18,
    backgroundColor: "#0B0D0E",
  },
  progressHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  progressHeaderText: {
    fontSize: 14,
    color: "#B5B6B9",
    fontWeight: "500",
  },
  progressLabel: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "400",
  },
  progressBar: {
    height: 6,
    backgroundColor: "#34373B",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#34C759",
    borderRadius: 2,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 30,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: "#0B0D0E",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 12,
    flex: 1,
  },
  prevButton: {
    backgroundColor: "#303236",
  },
  nextButton: {
    backgroundColor: "#34C759",
  },
  nextButtonDisabled: {
    backgroundColor: "#4A4D50",
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#FFFFFF",
  },
  prevButtonText: {
    color: "#FFFFFF",
  },
  disabledText: {
    color: "#999",
  },
  pageContainer: {
    paddingHorizontal: 30,
    paddingTop: 2,
  },
  questionContainer: {
    marginBottom: 18,
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#202124",
  },
  questionText: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 27,
    marginBottom: 16,
    color: "#F4F4F5",
  },
  requiredStar: {
    color: "#ff4444",
  },
  optionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  dayOptionsContainer: {
    gap: 10,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3D4044",
    backgroundColor: "#303236",
    marginBottom: 8,
  },
  dayOptionButton: {
    width: "100%",
    marginBottom: 0,
  },
  optionSelected: {
    borderColor: "#34C759",
    backgroundColor: "#253525",
  },
  optionText: {
    fontSize: 16,
    color: "#F4F4F5",
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#45474B",
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    backgroundColor: "#303236",
    color: "#F4F4F5",
  },
  dropdownContainer: {
    borderWidth: 1,
    borderColor: "#45474B",
    borderRadius: 14,
    overflow: "hidden",
  },
  dropdownItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#3D4044",
    backgroundColor: "#303236",
  },
  ratingContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ratingButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#45474B",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#303236",
  },
  ratingText: {
    fontSize: 16,
    fontWeight: "600",
  },
  computedValue: {
    fontSize: 36,
    fontWeight: "700",
    color: "#34C759",
    textAlign: "center",
    paddingVertical: 20,
    borderRadius: 16,
    backgroundColor: "#202124",
  },
  computedValueContainer: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E8ECF1",
    backgroundColor: "#F8F9FB",
  },
  computedValueLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  computedValueText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  customFields: {
    marginTop: 12,
    gap: 8,
  },
  assessmentTitle: { color: "#F4F4F5", fontSize: 24, fontWeight: "700", textAlign: "center", marginBottom: 28 },
});
