import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Question } from "../service/questionnaire/questionnaireService";
import SingleChoice from "../app/(app)/questionnaire/QuestionTypes/SingleChoice";
import MultipleChoice from "../app/(app)/questionnaire/QuestionTypes/MultipleChoice";
import TextInput from "../app/(app)/questionnaire/QuestionTypes/TextInput";
import Dropdown from "../app/(app)/questionnaire/QuestionTypes/DropDown";
import Rating from "../app/(app)/questionnaire/QuestionTypes/Rating";
import DatePicker from "../app/(app)/questionnaire/QuestionTypes/DatePicker";
import YesNo from "../app/(app)/questionnaire/QuestionTypes/YesNo";  
 
interface QuestionCardProps {
  question: Question;
  currentAnswer?: any;
  onAnswer: (value: any) => void;
  questionNumber: number;
  totalQuestions: number;
}
 
const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  currentAnswer,
  onAnswer,
  questionNumber,
  totalQuestions,
}) => {
  const renderQuestionType = () => {
    switch (question.type) {
      case "single":
        return (
          <SingleChoice
            options={question.options || []}
            selectedValue={currentAnswer}
            onSelect={onAnswer}
          />
        );
      case "multiple":
        return (
          <MultipleChoice
            options={question.options || []}
            selectedValues={currentAnswer || []}
            onSelect={onAnswer}
          />
        );
      case "text":
        return (
          <TextInput
            value={currentAnswer || ""}
            onChange={onAnswer}
            placeholder={question.placeholder}
          />
        );
      case "dropdown":
        return (
          <Dropdown
            options={question.options || []}
            selectedValue={currentAnswer}
            onSelect={onAnswer}
          />
        );
      case "rating":
        return (
          <Rating
            value={currentAnswer || 0}
            onChange={onAnswer}
            min={question.validation?.min || 1}
            max={question.validation?.max || 5}
          />
        );
      case "date":
        return <DatePicker value={currentAnswer} onChange={onAnswer} />;
      case "yesno":
        return <YesNo value={currentAnswer} onChange={onAnswer} />;
      default:
        return null;
    }
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
 
      <Text style={styles.questionText}>{question.question}</Text>
 
      <View style={styles.answerContainer}>{renderQuestionType()}</View>
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
  questionText: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 24,
    color: "#1a1a1a",
  },
  answerContainer: {
    flex: 1,
  },
});
 
export default QuestionCard;