import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface ProgressBarProps {
  progress: number;
  totalQuestions: number;
  currentQuestion: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  totalQuestions,
  currentQuestion,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` }]} />
      </View>
      <Text style={styles.progressText}>
        {currentQuestion + 1} of {totalQuestions} completed
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#fff",
  },
  progressBar: {
    height: 4,
    backgroundColor: "#e0e0e0",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#007AFF",
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: "#666",
    marginTop: 8,
    textAlign: "center",
  },
});

export default ProgressBar;