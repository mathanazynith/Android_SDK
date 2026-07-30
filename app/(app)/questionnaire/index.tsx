import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput as RNTextInput,
} from "react-native";
import { useQuestionnaire } from "../../../contexts/QuestionnaireContext";
import type { Question } from "../../../service/questionnaire/questionnaireService";
import YesNo from "../../../app/(app)/questionnaire/QuestionTypes/YesNo";
import RecentLongRun from "../../../app/(app)/questionnaire/QuestionTypes/RecentLongRun";
import PlanSelection from "../../../app/(app)/questionnaire/QuestionTypes/PlanSelection";
import DatePicker from "../../../app/(app)/questionnaire/QuestionTypes/DatePicker";
import { formatTimeFromComponents, timeToSeconds, calculatePace } from "../../../utils/validators";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";

// Helper to get numeric ID
const getNumericId = (id: number | string): number => {
  if (typeof id === "number") return id;
  const numeric = id.replace(/\D/g, "");
  return parseInt(numeric, 10);
};

// SingleChoice component
const SingleChoice = ({ options, selectedValue, onSelect }: any) => {
  return (
    <View style={styles.optionsContainer}>
      {options.map((opt: any) => (
        <TouchableOpacity
          key={opt.id}
          style={[
            styles.optionButton,
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

  switch (type) {
    case "single":
      return (
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>
            {questionText}
            {isRequired && <Text style={styles.requiredStar}> *</Text>}
          </Text>
          <SingleChoice
            options={options || []}
            selectedValue={value}
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
          <YesNo value={Boolean(value)} onChange={(val: boolean) => onAnswer(id, val)} />
        </View>
      );

    case "multiple":
      return (
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>
            {questionText}
            {isRequired && <Text style={styles.requiredStar}> *</Text>}
          </Text>
          <View style={styles.optionsContainer}>
            {options?.map((opt: any) => {
              const selected = Array.isArray(value) && value.includes(opt.value);
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.optionButton, selected && styles.optionSelected]}
                  onPress={() => {
                    let newVal = Array.isArray(value) ? [...value] : [];
                    if (selected) {
                      newVal = newVal.filter(v => v !== opt.value);
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
              {computedResponses?.[question.slug ?? id] !== undefined
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
    isComplete,
    computedResponses,
    assessmentId,
    setAnswer,
    goToNext,
    goToPrevious,
    reset,
    canGoBack,
  } = useQuestionnaire();

  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (isComplete && assessmentId) {
      router.replace("./calendar");
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

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={reset}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
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

    const existingValue = allAnswers[key]?.value;
    const existingUnit = allAnswers[key]?.unit;

    if (existingValue === undefined && existingUnit === null && isEmptyCustom) {
      if (allAnswers[key]) {
        setAnswer(questionId, undefined, null, null);
      }
      return;
    }

    setAnswer(questionId, existingValue, existingUnit, updatedCustomValues);
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
    const existingValue = allAnswers[key]?.value;
    const existingUnit = allAnswers[key]?.unit;

    setAnswer(singleQuestionId, existingValue, existingUnit, updatedCustomValues);

    if (field === "time") {
      setAnswer(timeQuestionId, value, null, null);
    }
  };

  const handleNext = async () => {
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

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.pageContainer}>
          {recentLongRunGroup && (
            <RecentLongRun
              options={recentLongRunGroup.singleQuestion.options || []}
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

          {displayQuestions
            .filter((question) => !recentLongRunQuestionIds.has(question.id))
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

              return (
                <QuestionField
                  key={question.id}
                  question={question}
                  value={value}
                  unit={unit}
                  customValues={customValues}
                  computedResponses={computedResponses}
                  onAnswer={(
                    questionKey: string,
                    val: any,
                    unitVal?: string | null,
                    customValues?: any
                  ) => handleAnswer(questionKey, val, unitVal, customValues)}
                  onCustomChange={(questionKey: string, field: string, val: string) =>
                    handleCustomChange(questionKey, field, val)
                  }
                />
              );
            })}

          {Object.keys(computedResponses).length > 0 && (
            <View style={styles.computedContainer}>
              <Text style={styles.computedTitle}>Computed Values:</Text>
              {Object.entries(computedResponses).map(([key, value]) => (
                <Text key={key} style={styles.computedItem}>
                  {key}: {JSON.stringify(value)}
                </Text>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.prevButton]}
          onPress={goToPrevious}
          disabled={!canGoBack}
        >
          <Feather name="arrow-left" size={18} color="#34C759" />
          <Text
            style={[
              styles.buttonText,
              styles.prevButtonText,
              !canGoBack && styles.disabledText,
            ]}
          >
            Previous
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.nextButton]}
          onPress={handleNext}
          disabled={isSubmitting || isLoading}
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
    backgroundColor: "#F5F7FA",
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
    backgroundColor: "#F5F7FA",
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#1A1A1A",
    borderBottomWidth: 1,
    borderBottomColor: "#2D2D2D",
  },
  progressHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressHeaderText: {
    fontSize: 14,
    color: "#34C759",
    fontWeight: "600",
  },
  progressLabel: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "400",
  },
  progressBar: {
    height: 4,
    backgroundColor: "#2D2D2D",
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
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E8ECF1",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    minWidth: 110,
  },
  prevButton: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "#34C759",
  },
  nextButton: {
    backgroundColor: "#34C759",
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  prevButtonText: {
    color: "#34C759",
  },
  disabledText: {
    color: "#999",
  },
  pageContainer: {
    padding: 24,
    backgroundColor: "#FFFFFF",
    margin: 16,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  questionContainer: {
    marginBottom: 24,
  },
  questionText: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
    color: "#1A1A1A",
  },
  requiredStar: {
    color: "#ff4444",
  },
  optionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#f9f9f9",
    marginBottom: 8,
  },
  optionSelected: {
    borderColor: "#34C759",
    backgroundColor: "#34C75920",
  },
  optionText: {
    fontSize: 16,
    color: "#1A1A1A",
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#E8ECF1",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    backgroundColor: "#F8F9FB",
    color: "#1A1A1A",
  },
  dropdownContainer: {
    borderWidth: 1,
    borderColor: "#E8ECF1",
    borderRadius: 12,
    overflow: "hidden",
  },
  dropdownItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    backgroundColor: "#FFF",
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
    borderColor: "#ddd",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9f9f9",
  },
  ratingText: {
    fontSize: 16,
    fontWeight: "600",
  },
  computedContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#f0f8ff",
    borderRadius: 8,
  },
  computedTitle: {
    fontWeight: "600",
    marginBottom: 4,
  },
  computedItem: {
    fontSize: 14,
    color: "#333",
  },
  computedValue: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 8,
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
});