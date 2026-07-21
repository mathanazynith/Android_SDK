import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Question, SubQuestion } from "../../../../service/questionnaire/questionnaireService";
import SingleChoice from "../QuestionTypes/SingleChoice";
import TextInput from "../QuestionTypes/TextInput";
 
interface QuestionGroupProps {
  question: Question;
  currentAnswers?: any;
  onAnswer: (questionId: string, value: any) => void;
  questionNumber: number;
  totalQuestions: number;
  allAnswers?: any[];
}
 
const QuestionGroup: React.FC<QuestionGroupProps> = ({
  question,
  currentAnswers,
  onAnswer,
  questionNumber,
  totalQuestions,
  allAnswers = [],
}) => {
  const [distance, setDistance] = useState("");
  const [time, setTime] = useState("");
  const [calculatedPace, setCalculatedPace] = useState("");
 
  // Get current answers for sub-questions
  const getSubQuestionAnswer = (subId: string) => {
    const answer = allAnswers.find((a: any) => a.questionId === subId);
    return answer?.value;
  };
 
  // Check if sub-question should be visible
  const isSubQuestionVisible = (subQuestion: SubQuestion) => {
    if (subQuestion.condition) {
      const dependsOnAnswer = allAnswers.find(
        (a: any) => a.questionId === subQuestion.condition?.dependsOn
      );
      return dependsOnAnswer?.value === subQuestion.condition?.value;
    }
    return true;
  };
 
  // Calculate pace when distance and time are answered
  useEffect(() => {
    const distanceAnswer = allAnswers.find((a: any) => a.questionId === "q2");
    const timeAnswer = allAnswers.find((a: any) => a.questionId === "q3");
   
    if (distanceAnswer?.value && timeAnswer?.value) {
      const dist = parseFloat(distanceAnswer.value);
      const timeInMinutes = parseFloat(timeAnswer.value);
     
      if (dist > 0 && timeInMinutes > 0) {
        const pace = timeInMinutes / dist;
        const minutes = Math.floor(pace);
        const seconds = Math.round((pace - minutes) * 60);
        setCalculatedPace(`${minutes}:${seconds.toString().padStart(2, '0')} min/km`);
      } else {
        setCalculatedPace("");
      }
    } else {
      setCalculatedPace("");
    }
  }, [allAnswers]);
 
  const renderSubQuestion = (subQuestion: SubQuestion) => {
    if (!isSubQuestionVisible(subQuestion)) {
      return null;
    }
 
    const currentAnswer = getSubQuestionAnswer(subQuestion.id);
 
    switch (subQuestion.type) {
      case "single":
        return (
          <View style={styles.subQuestionContainer} key={subQuestion.id}>
            <Text style={styles.subQuestionText}>{subQuestion.question}</Text>
            <SingleChoice
              options={subQuestion.options || []}
              selectedValue={currentAnswer}
              onSelect={(value: string) => onAnswer(subQuestion.id, value)}
            />
          </View>
        );
      case "text":
        return (
          <View style={styles.subQuestionContainer} key={subQuestion.id}>
            <Text style={styles.subQuestionText}>{subQuestion.question}</Text>
            <TextInput
              //style={styles.input}
              value={currentAnswer || ""}
              onChange={(value: string) => onAnswer(subQuestion.id, value)}
              placeholder={subQuestion.placeholder}
            />
          </View>
        );
      default:
        return null;
    }
  };
 
  // Check if group is the running stats group
  const isRunningStatsGroup = question.id === "group1";
 
  // Check if event registration details should be visible
  const isEventRegistrationVisible = () => {
    const q4Answer = allAnswers.find((a: any) => a.questionId === "q4");
    return q4Answer?.value === "yes";
  };
 
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.questionNumber}>
          Question {questionNumber} of {totalQuestions}
        </Text>
        {question.isRequired && (
          <Text style={styles.required}>* Required</Text>
        )}
      </View>
 
      <Text style={styles.groupTitle}>{question.question}</Text>
 
      {/* Render sub-questions */}
      {question.subQuestions?.map((subQuestion) => {
        // Special handling for event registration group
        if (question.id === "group2" && subQuestion.id !== "q4") {
          if (!isEventRegistrationVisible()) {
            return null;
          }
        }
        return renderSubQuestion(subQuestion);
      })}
 
      {/* Show pace calculation for running stats group */}
      {isRunningStatsGroup && calculatedPace && (
        <View style={styles.paceContainer}>
          <Text style={styles.paceLabel}>Your Calculated Pace:</Text>
          <View style={styles.paceDisplay}>
            <Text style={styles.paceText}>{calculatedPace}</Text>
          </View>
        </View>
      )}
 
      {/* Show hint for event registration */}
      {question.id === "group2" && !isEventRegistrationVisible() && (
        <View style={styles.hintContainer}>
          <Text style={styles.hintText}>
            You haven&apos;t registered for any event. You can skip event details.
          </Text>
        </View>
      )}
    </View>
  );
};
 
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  questionNumber: {
    fontSize: 14,
    color: "#666",
  },
  required: {
    fontSize: 14,
    color: "#ff4444",
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 20,
  },
  subQuestionContainer: {
    marginBottom: 20,
  },
  subQuestionText: {
    fontSize: 16,
    color: "#1a1a1a",
    marginBottom: 8,
    fontWeight: "500",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#f8f8f8",
  },
  paceContainer: {
    marginTop: 8,
    padding: 16,
    backgroundColor: "#f0f8ff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#4A90D9",
  },
  paceLabel: {
    fontSize: 14,
    color: "#4A90D9",
    fontWeight: "500",
    marginBottom: 4,
  },
  paceDisplay: {
    padding: 8,
    backgroundColor: "#e6f3ff",
    borderRadius: 4,
  },
  paceText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2E7D32",
  },
  hintContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#fff3cd",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ffc107",
  },
  hintText: {
    fontSize: 14,
    color: "#856404",
    textAlign: "center",
  },
});
 
export default QuestionGroup;