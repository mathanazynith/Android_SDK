import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  TextInput as RNTextInput,
} from "react-native";
import { useQuestionnaire } from "../../../contexts/QuestionnaireContext";
import { router } from "expo-router";
import SingleChoice from "./QuestionTypes/SingleChoice";
import PlanSelection from "./QuestionTypes/PlanSelection";
import { Feather } from "@expo/vector-icons";

export default function QuestionnaireScreen() {
  const {
    questions,
    currentQuestionIndex,
    answers,
    isLoading,
    error,
    isComplete,
    answerQuestion,
    goToNext,
    goToPrevious,
    submitAnswers,
    progress,
    loadQuestions,
    setCurrentQuestionIndex,
    setAnswers,
  } = useQuestionnaire();

  const [calculatedPace, setCalculatedPace] = useState("");
  const [isBeginner, setIsBeginner] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    console.log("===== DEBUG: Current State =====");
    console.log("Current Question ID:", questions[currentQuestionIndex]?.id);
    console.log("Current Question Index:", currentQuestionIndex);
    console.log("All Questions:", questions.map(q => q.id));
    console.log("Answers:", answers.map(a => ({ id: a.questionId, value: a.value })));
    console.log("================================");

    const q1Answer = answers.find((a) => a.questionId === "q1");
    if (q1Answer?.value === "no") {
      setIsBeginner(true);
      handleAutoSubmit();
    }

    const q4Answer = answers.find((a) => a.questionId === "q4");
    if (q4Answer?.value === "no" && currentQuestion?.id === "q4" && !isNavigating) {
      console.log("q4 = 'no', automatically navigating to q9...");
      setIsNavigating(true);
      setTimeout(() => {
        const q9Index = questions.findIndex((q) => q.id === "q9");
        if (q9Index >= 0) {
          setCurrentQuestionIndex(q9Index);
          setIsNavigating(false);
        }
      }, 100);
    }

    if (isComplete && !isSubmitting) {
      setTimeout(() => {
        router.replace("/calender");
      }, 500);
    }
  }, [answers, currentQuestionIndex, isComplete]);

  // Calculate pace when q2 and q3 are answered
  useEffect(() => {
    const distanceAnswer = answers.find((a) => a.questionId === "q2");
    const timeAnswer = answers.find((a) => a.questionId === "q3");

    if (distanceAnswer?.value && timeAnswer?.value) {
      const dist = parseFloat(distanceAnswer.value);
      const timeInMinutes = parseFloat(timeAnswer.value);

      if (dist > 0 && timeInMinutes > 0) {
        const pace = timeInMinutes / dist;
        const minutes = Math.floor(pace);
        const seconds = Math.round((pace - minutes) * 60);
        const paceString = `${minutes}:${seconds.toString().padStart(2, '0')} min/km`;
        setCalculatedPace(paceString);
        console.log("Pace calculated:", paceString);
      } else {
        setCalculatedPace("");
      }
    } else {
      setCalculatedPace("");
    }
  }, [answers]);

  const currentQuestion = questions[currentQuestionIndex];

  const getVisibleQuestionIds = () => {
    const q1Answer = answers.find((a) => a.questionId === "q1")?.value;

    if (q1Answer !== "yes") {
      return ["q1"];
    }

    const q4Answer = answers.find((a) => a.questionId === "q4")?.value;
    const baseFlow = ["q1", "q2", "q3", "q4"];

    if (q4Answer === "yes") {
      return [...baseFlow, "q5", "q6", "q7", "q8"];
    }

    // If q4 is "no", show q9 (Plan Selection) then q8
    return [...baseFlow, "q9", "q8"];
  };

  const getVisibleQuestions = () => {
    const visibleQuestionIds = getVisibleQuestionIds();
    return questions.filter((q) => visibleQuestionIds.includes(q.id));
  };

  const moveToQuestionById = (questionId: string) => {
    const targetIndex = questions.findIndex((q) => q.id === questionId);
    if (targetIndex >= 0) {
      setCurrentQuestionIndex(targetIndex);
    }
  };

  const moveToNextVisibleQuestion = () => {
    const visibleQuestionIds = getVisibleQuestionIds();
    const currentVisibleIndex = visibleQuestionIds.indexOf(currentQuestion?.id || "");

    if (currentVisibleIndex >= 0 && currentVisibleIndex < visibleQuestionIds.length - 1) {
      moveToQuestionById(visibleQuestionIds[currentVisibleIndex + 1]);
      return true;
    }

    return false;
  };

  const moveToPreviousVisibleQuestion = () => {
    const visibleQuestionIds = getVisibleQuestionIds();
    const currentVisibleIndex = visibleQuestionIds.indexOf(currentQuestion?.id || "");

    if (currentVisibleIndex > 0) {
      moveToQuestionById(visibleQuestionIds[currentVisibleIndex - 1]);
      return true;
    }

    return false;
  };

  const hasMeaningfulAnswer = (value: any) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim() !== "";
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "boolean") return true;
    if (typeof value === "number") return true;
    if (typeof value === "object") {
      // For custom values object
      if (value.targetDistance || value.targetTime || value.targetPace) return true;
      return Object.keys(value).length > 0;
    }
    return true;
  };

  const getStoredAnswer = (questionId?: string) => {
    if (!questionId) return undefined;
    return answers.find((a) => a.questionId === questionId)?.value;
  };

  const hasAnsweredQuestion = (questionId?: string) => {
    return hasMeaningfulAnswer(getStoredAnswer(questionId));
  };

  // Auto-submit when "No" is selected for q1
  const handleAutoSubmit = async () => {
    try {
      Alert.alert(
        "Thank You!",
        "You've selected that you haven't run before. We'll create a beginner 5K plan for you.",
        [
          {
            text: "Continue",
            onPress: async () => {
              try {
                await submitAnswers();
              } catch (error) {
                Alert.alert("Error", "Failed to submit. Please try again.");
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error("Auto-submit error:", error);
      Alert.alert("Error", "Something went wrong. Please try again.");
    }
  };

  // Check if we're on the running stats page (Step 1)
  const isRunningStatsPage = () => {
    const currentId = currentQuestion?.id;
    return currentId === "q2" || currentId === "q3";
  };

  // Check if we're on the event registration page (Step 2 - q4 only)
  const isEventRegistrationPage = () => {
    return currentQuestion?.id === "q4";
  };

  // Check if we're on the event details page (Step 2 - q5, q6, q7)
  const isEventDetailsPage = () => {
    return currentQuestion?.id === "q5" || currentQuestion?.id === "q6" || currentQuestion?.id === "q7";
  };

  // Check if we're on the plan selection page (q9)
  const isPlanSelectionPage = () => {
    return currentQuestion?.id === "q9";
  };

  // Check if we're on the final page (q8)
  const isFinalPage = () => {
    return currentQuestion?.id === "q8";
  };

  // Handle q4 selection
  const handleQ4Select = (value: string) => {
    console.log("===== q4 SELECTED =====");
    console.log("Selected value:", value);
    
    const existingIndex = answers.findIndex((a) => a.questionId === "q4");
    let newAnswers;
    
    if (existingIndex >= 0) {
      newAnswers = [...answers];
      newAnswers[existingIndex] = { questionId: "q4", value: value, timestamp: Date.now() };
    } else {
      newAnswers = [...answers, { questionId: "q4", value: value, timestamp: Date.now() }];
    }
    
    setAnswers(newAnswers);
    
    if (value === "no") {
      ["q5", "q6", "q7"].forEach((id) => {
        const idx = newAnswers.findIndex((a: any) => a.questionId === id);
        if (idx >= 0) {
          newAnswers[idx] = { questionId: id, value: "", timestamp: Date.now() };
        } else {
          newAnswers.push({ questionId: id, value: "", timestamp: Date.now() });
        }
      });
      setAnswers(newAnswers);
      
      console.log("Navigating to q9...");
      const q9Index = questions.findIndex((q) => q.id === "q9");
      if (q9Index >= 0) {
        setTimeout(() => {
          setCurrentQuestionIndex(q9Index);
        }, 200);
      }
    } else if (value === "yes") {
      setTimeout(() => {
        console.log("Navigating to q5...");
        const q5Index = questions.findIndex((q) => q.id === "q5");
        if (q5Index >= 0) {
          setCurrentQuestionIndex(q5Index);
        }
      }, 200);
    }
  };

  // Handle Plan Selection
  const handlePlanSelect = (value: string) => {
    console.log("===== Plan Selected =====");
    console.log("Selected plan:", value);
    answerQuestion("q9", value);
    
    // Clear custom values if not custom
    if (value !== "custom") {
      answerQuestion("q9_custom", { targetDistance: "", targetTime: "", targetPace: "" });
    }
  };

  const handleCustomChange = (field: string, value: string) => {
    const current = answers.find((a) => a.questionId === "q9_custom")?.value || {};
    const updated = { ...current, [field]: value };
    answerQuestion("q9_custom", updated);
  };

  const handleNext = () => {
    console.log("===== HANDLE NEXT CALLED =====");
    console.log("Current Question ID:", currentQuestion?.id);
    console.log("Current Answers:", answers.map(a => ({ id: a.questionId, value: a.value })));

    const q1Answer = answers.find((a) => a.questionId === "q1");

    if (q1Answer?.value === "no") {
      console.log("q1 is 'no', returning");
      return;
    }

    if (isEventRegistrationPage()) {
      const q4Answer = answers.find((a) => a.questionId === "q4");

      if (!q4Answer?.value) {
        Alert.alert(
          "Incomplete",
          "Please answer if you have registered for any event.",
          [{ text: "OK" }]
        );
        return;
      }

      if (q4Answer.value === "no") {
        console.log("q4 is 'no', moving to q9");
        const q9Index = questions.findIndex((q) => q.id === "q9");
        if (q9Index >= 0) {
          setCurrentQuestionIndex(q9Index);
        }
        return;
      }

      console.log("q4 is 'yes', moving to q5");
      const q5Index = questions.findIndex((q) => q.id === "q5");
      if (q5Index >= 0) {
        setCurrentQuestionIndex(q5Index);
      }
      return;
    }

    if (isPlanSelectionPage()) {
      const q9Answer = answers.find((a) => a.questionId === "q9");
      
      if (!q9Answer?.value) {
        Alert.alert(
          "Incomplete",
          "Please select your running plan.",
          [{ text: "OK" }]
        );
        return;
      }

      // If custom is selected, validate custom fields
      if (q9Answer.value === "custom") {
        const customValues = answers.find((a) => a.questionId === "q9_custom")?.value || {};
        if (!customValues.targetDistance || !customValues.targetTime) {
          Alert.alert(
            "Incomplete",
            "Please enter both target distance and target time for your custom plan.",
            [{ text: "OK" }]
          );
          return;
        }
      }

      console.log("Plan selected, moving to q8");
      const q8Index = questions.findIndex((q) => q.id === "q8");
      if (q8Index >= 0) {
        setCurrentQuestionIndex(q8Index);
      }
      return;
    }

    if (isFinalPage()) {
      handleSubmit();
      return;
    }

    if (currentQuestion?.isRequired && !hasAnsweredQuestion(currentQuestion?.id)) {
      Alert.alert(
        "Incomplete",
        "Please answer this question before proceeding.",
        [{ text: "OK" }]
      );
      return;
    }

    if (!moveToNextVisibleQuestion()) {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    const visibleQuestions = getVisibleQuestions();
    
    console.log("========================================");
    console.log("🔍 VALIDATION START");
    console.log("Visible Questions:", visibleQuestions.map((q) => q.id));
    console.log("All Answers:", answers.map(a => ({ id: a.questionId, value: a.value })));
    console.log("========================================");
    
    const unansweredRequired = visibleQuestions.filter((q) => {
      if (!q.isRequired) return false;
      
      const answer = answers.find((a) => a.questionId === q.id);
      const answerValue = answer?.value;
      
      if (q.id === "q4") {
        const isAnswered = answerValue === "yes" || answerValue === "no";
        console.log(`✅ q4 special check: value=${answerValue}, isAnswered=${isAnswered}`);
        return !isAnswered;
      }

      if (q.id === "q9") {
        const isAnswered = answerValue !== undefined && answerValue !== null && answerValue !== "";
        console.log(`✅ q9 special check: value=${answerValue}, isAnswered=${isAnswered}`);
        return !isAnswered;
      }
      
      const hasAnswer = hasMeaningfulAnswer(answerValue);
      console.log(`Question ${q.id}:`, {
        isRequired: q.isRequired,
        hasAnswer: hasAnswer,
        answerValue: answerValue,
        isVisible: true
      });
      
      return !hasAnswer;
    });

    console.log("Unanswered Required:", unansweredRequired.map(q => q.id));
    console.log("Remaining Count:", unansweredRequired.length);
    console.log("========================================");

    if (unansweredRequired.length > 0) {
      Alert.alert(
        "Incomplete",
        `Please answer all required questions. (${unansweredRequired.length} remaining)`,
        [{ text: "OK" }]
      );
      return;
    }

    Alert.alert(
      "Submit Answers",
      "Are you sure you want to submit your answers?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit",
          onPress: async () => {
            try {
              setIsSubmitting(true);
              await submitAnswers();
              setIsSubmitting(false);
            } catch (error) {
              setIsSubmitting(false);
              Alert.alert("Error", "Failed to submit answers. Please try again.");
            }
          },
        },
      ]
    );
  };

  const getStepInfo = () => {
    const currentId = currentQuestion?.id;
    
    if (currentId === "q2" || currentId === "q3") {
      return { current: 1, total: 3, label: "Running Activity" };
    }
    if (currentId === "q4" || currentId === "q5" || currentId === "q6" || currentId === "q7") {
      return { current: 2, total: 3, label: "Event Registration" };
    }
    if (currentId === "q9") {
      return { current: 2, total: 3, label: "Plan Selection" };
    }
    if (currentId === "q8") {
      return { current: 3, total: 3, label: "Running Schedule" };
    }
    if (currentId === "q1") {
      return { current: 1, total: 1, label: "Getting Started" };
    }
    return { current: 1, total: 3, label: "Questionnaire" };
  };

  const stepInfo = getStepInfo();

  // Render running stats page (q2 and q3 together)
  const renderRunningStatsPage = () => {
    const q2Answer = answers.find((a) => a.questionId === "q2");
    const q3Answer = answers.find((a) => a.questionId === "q3");
    const isComplete = q2Answer?.value && q3Answer?.value && calculatedPace;

    return (
      <View style={styles.singleQuestionContainer}>
        <View style={styles.header}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>STEP {stepInfo.current}</Text>
          </View>
          <Text style={styles.stepTotal}>of {stepInfo.total}</Text>
        </View>

        <Text style={styles.pageTitle}>{stepInfo.label}</Text>
        <View style={styles.dividerLine} />

        <Text style={styles.pageSubtitle}>Recent Running Activity (Last 3 Months)</Text>

        <View style={styles.inputGroup}>
          <View style={styles.inputIconContainer}>
            <Feather name="map-pin" size={18} color="#34C759" />
          </View>
          <RNTextInput
            style={styles.inputWithIcon}
            value={q2Answer?.value || ""}
            onChangeText={(value: string) => answerQuestion("q2", value)}
            placeholder="Enter distance in km (e.g., 5, 10, 21)"
            placeholderTextColor="#999"
            keyboardType="numeric"
          />
        </View>

        <View style={styles.inputGroup}>
          <View style={styles.inputIconContainer}>
            <Feather name="clock" size={18} color="#34C759" />
          </View>
          <RNTextInput
            style={styles.inputWithIcon}
            value={q3Answer?.value || ""}
            onChangeText={(value: string) => answerQuestion("q3", value)}
            placeholder="Enter time in minutes (e.g., 30, 45, 60)"
            placeholderTextColor="#999"
            keyboardType="numeric"
          />
        </View>

        {calculatedPace ? (
          <View style={styles.paceCard}>
            <Feather name="activity" size={20} color="#34C759" />
            <View style={styles.paceContent}>
              <Text style={styles.paceLabel}>Your Calculated Pace</Text>
              <Text style={styles.paceValue}>{calculatedPace}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.paceCardEmpty}>
            <Feather name="loader" size={20} color="#999" />
            <Text style={styles.paceEmptyText}>
              Enter distance and time to calculate your pace
            </Text>
          </View>
        )}

        {isComplete && (
          <View style={styles.successCard}>
            <Feather name="check-circle" size={20} color="#34C759" />
            <Text style={styles.successText}>Running data complete!</Text>
          </View>
        )}
      </View>
    );
  };

  // Render event registration page (q4, q5, q6, q7 together)
  const renderEventRegistrationPage = () => {
    const q4Answer = answers.find((a) => a.questionId === "q4");
    const q5Answer = answers.find((a) => a.questionId === "q5");
    const q6Answer = answers.find((a) => a.questionId === "q6");
    const q7Answer = answers.find((a) => a.questionId === "q7");
    const isEventRegistered = q4Answer?.value === "yes";

    return (
      <View style={styles.singleQuestionContainer}>
        <View style={styles.header}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>STEP {stepInfo.current}</Text>
          </View>
          <Text style={styles.stepTotal}>of {stepInfo.total}</Text>
        </View>

        <Text style={styles.pageTitle}>{stepInfo.label}</Text>
        <View style={styles.dividerLine} />

        <Text style={styles.pageSubtitle}>Event Registration Details</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Have you registered for any event?</Text>
          <SingleChoice
            options={[
              { id: "opt1", label: "Yes", value: "yes" },
              { id: "opt2", label: "No", value: "no" }
            ]}
            selectedValue={q4Answer?.value}
            onSelect={handleQ4Select}
          />
        </View>

        {isEventRegistered && (
          <>
            <View style={styles.dividerLine} />

            <View style={styles.inputGroup}>
              <View style={styles.inputIconContainer}>
                <Feather name="calendar" size={18} color="#34C759" />
              </View>
              <RNTextInput
                style={styles.inputWithIcon}
                value={q5Answer?.value || ""}
                onChangeText={(value: string) => answerQuestion("q5", value)}
                placeholder="Enter the event name"
                placeholderTextColor="#999"
              />
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.inputIconContainer}>
                <Feather name="map-pin" size={18} color="#34C759" />
              </View>
              <RNTextInput
                style={styles.inputWithIcon}
                value={q6Answer?.value || ""}
                onChangeText={(value: string) => answerQuestion("q6", value)}
                placeholder="Enter event distance in km"
                placeholderTextColor="#999"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.inputIconContainer}>
                <Feather name="clock" size={18} color="#34C759" />
              </View>
              <RNTextInput
                style={styles.inputWithIcon}
                value={q7Answer?.value || ""}
                onChangeText={(value: string) => answerQuestion("q7", value)}
                placeholder="Enter target time in minutes"
                placeholderTextColor="#999"
                keyboardType="numeric"
              />
            </View>
          </>
        )}

        {!isEventRegistered && q4Answer?.value === "no" && (
          <View style={styles.hintCard}>
            <Feather name="info" size={18} color="#FF9500" />
            <Text style={styles.hintText}>
              You haven't registered for any event. Click Next to continue.
            </Text>
          </View>
        )}
      </View>
    );
  };

  // ✅ NEW: Render Plan Selection page (q9)
  const renderPlanSelectionPage = () => {
    const q9Answer = answers.find((a) => a.questionId === "q9")?.value;
    const customValues = answers.find((a) => a.questionId === "q9_custom")?.value || {};

    return (
      <View style={styles.singleQuestionContainer}>
        <View style={styles.header}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>STEP {stepInfo.current}</Text>
          </View>
          <Text style={styles.stepTotal}>of {stepInfo.total}</Text>
        </View>

        <Text style={styles.pageTitle}>{stepInfo.label}</Text>
        <View style={styles.dividerLine} />

        <Text style={styles.pageSubtitle}>Choose your running plan</Text>

        <PlanSelection
          options={currentQuestion?.options || []}
          selectedValue={q9Answer}
          onSelect={handlePlanSelect}
          customValues={customValues}
          onCustomChange={handleCustomChange}
        />

        {q9Answer === "custom" && customValues.targetDistance && customValues.targetTime && customValues.targetPace && (
          <View style={styles.successCard}>
            <Feather name="check-circle" size={20} color="#34C759" />
            <Text style={styles.successText}>Custom plan ready!</Text>
          </View>
        )}
      </View>
    );
  };

  // Render final page (q8)
  const renderFinalPage = () => {
    const q8Answer = answers.find((a) => a.questionId === "q8");

    return (
      <View style={styles.singleQuestionContainer}>
        <View style={styles.header}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>STEP {stepInfo.current}</Text>
          </View>
          <Text style={styles.stepTotal}>of {stepInfo.total}</Text>
        </View>

        <Text style={styles.pageTitle}>{stepInfo.label}</Text>
        <View style={styles.dividerLine} />

        <Text style={styles.pageSubtitle}>How many days per week do you plan to run?</Text>

        <View style={styles.inputGroup}>
          <SingleChoice
            options={[
              { id: "opt1", label: "1-2 days", value: "1-2" },
              { id: "opt2", label: "3-4 days", value: "3-4" },
              { id: "opt3", label: "5-6 days", value: "5-6" },
              { id: "opt4", label: "7 days", value: "7" }
            ]}
            selectedValue={q8Answer?.value}
            onSelect={(value: string) => answerQuestion("q8", value)}
          />
        </View>
      </View>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#34C759" />
        <Text style={styles.loadingText}>Loading questions...</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={loadQuestions}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Show loading indicator while submitting
  if (isSubmitting) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#34C759" />
      </View>
    );
  }

  // When isComplete is true, the useEffect will handle navigation
  if (isComplete) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.completeCard}>
          <Feather name="check-circle" size={60} color="#34C759" />
          <Text style={styles.completeText}>✓ Questionnaire Complete!</Text>
          <Text style={styles.completeSubtext}>
            Thank you for completing the questionnaire.
          </Text>
        </View>
        <TouchableOpacity
          style={styles.dashboardButton}
          onPress={() => router.replace("/calender")}
        >
          <Feather name="calendar" size={18} color="#1A1A1A" />
          <Text style={styles.dashboardButtonText}>Go to Calendar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // No questions state
  if (!questions.length || !currentQuestion) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>No questions available</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={loadQuestions}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Determine which page to render
  const renderPage = () => {
    if (isRunningStatsPage()) {
      return renderRunningStatsPage();
    } else if (isEventRegistrationPage() || isEventDetailsPage()) {
      return renderEventRegistrationPage();
    } else if (isPlanSelectionPage()) {
      return renderPlanSelectionPage();
    } else if (isFinalPage()) {
      return renderFinalPage();
    } else if (currentQuestion?.id === "q1") {
      return (
        <View style={styles.singleQuestionContainer}>
          <View style={styles.header}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>GETTING STARTED</Text>
            </View>
          </View>
          <Text style={styles.pageTitle}>Let's Get Started</Text>
          <View style={styles.dividerLine} />
          <Text style={styles.questionText}>{currentQuestion.question}</Text>

          {currentQuestion.type === "single" && (
            <SingleChoice
              options={currentQuestion.options || []}
              selectedValue={answers.find((a) => a.questionId === currentQuestion.id)?.value}
              onSelect={(value: string) => answerQuestion(currentQuestion.id, value)}
            />
          )}
        </View>
      );
    } else {
      return (
        <View style={styles.singleQuestionContainer}>
          <View style={styles.header}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>QUESTION</Text>
            </View>
          </View>
          <Text style={styles.pageTitle}>{currentQuestion.question}</Text>
          <View style={styles.dividerLine} />

          {currentQuestion.type === "single" && (
            <SingleChoice
              options={currentQuestion.options || []}
              selectedValue={answers.find((a) => a.questionId === currentQuestion.id)?.value}
              onSelect={(value: string) => answerQuestion(currentQuestion.id, value)}
            />
          )}
        </View>
      );
    }
  };

  const stepInfoForProgress = getStepInfo();

  return (
    <View style={styles.container}>
      <View style={styles.progressHeader}>
        <View style={styles.progressHeaderRow}>
          <Text style={styles.progressHeaderText}>
            Step {stepInfoForProgress.current} of {stepInfoForProgress.total}
          </Text>
          <Text style={styles.progressLabel}>{stepInfoForProgress.label}</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(stepInfoForProgress.current / stepInfoForProgress.total) * 100}%` }]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {renderPage()}
      </ScrollView>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.prevButton]}
          onPress={goToPrevious}
          disabled={currentQuestionIndex === 0}
        >
          <Feather name="arrow-left" size={18} color="#34C759" />
          <Text
            style={[
              styles.buttonText,
              styles.prevButtonText,
              currentQuestionIndex === 0 && styles.disabledText,
            ]}
          >
            Previous
          </Text>
        </TouchableOpacity>

        {isFinalPage() ? (
          <TouchableOpacity 
            style={[styles.button, styles.submitButton]} 
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <Text style={styles.buttonText}>
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </Text>
            <Feather name="check" size={18} color="#1A1A1A" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.button, styles.nextButton]} onPress={handleNext}>
            <Text style={styles.buttonText}>Next</Text>
            <Feather name="arrow-right" size={18} color="#1A1A1A" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

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
  completeCard: {
    alignItems: "center",
    marginBottom: 24,
  },
  completeText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#34C759",
    marginBottom: 8,
  },
  completeSubtext: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  dashboardButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 32,
    paddingVertical: 14,
    backgroundColor: "#34C759",
    borderRadius: 14,
  },
  dashboardButtonText: {
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
  submitButton: {
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
  singleQuestionContainer: {
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  stepBadge: {
    backgroundColor: "#34C75915",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#34C75930",
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#34C759",
    letterSpacing: 1,
  },
  stepTotal: {
    fontSize: 13,
    color: "#999",
    fontWeight: "500",
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 15,
    color: "#666",
    fontWeight: "400",
    marginBottom: 16,
  },
  dividerLine: {
    height: 2,
    width: 40,
    backgroundColor: "#34C759",
    borderRadius: 1,
    marginBottom: 16,
  },
  questionText: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 20,
    color: "#1A1A1A",
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 15,
    color: "#333",
    marginBottom: 8,
    fontWeight: "500",
  },
  inputIconContainer: {
    width: 40,
    height: 48,
    backgroundColor: "#F5F7FA",
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E8ECF1",
    borderRightWidth: 0,
  },
  inputWithIcon: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E8ECF1",
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    padding: 14,
    fontSize: 16,
    backgroundColor: "#F8F9FB",
    color: "#1A1A1A",
  },
  paceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#34C75910",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#34C75930",
    marginTop: 8,
  },
  paceCardEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F5F7FA",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8ECF1",
    marginTop: 8,
  },
  paceContent: {
    flex: 1,
  },
  paceLabel: {
    fontSize: 12,
    color: "#666",
    fontWeight: "400",
  },
  paceValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#34C759",
  },
  paceEmptyText: {
    fontSize: 14,
    color: "#999",
    flex: 1,
  },
  successCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#34C75910",
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#34C75930",
  },
  successText: {
    fontSize: 14,
    color: "#2E7D32",
    fontWeight: "500",
  },
  hintCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFF8E1",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FFD54F",
    marginTop: 8,
  },
  hintText: {
    fontSize: 14,
    color: "#856404",
    flex: 1,
  },
});