import React from 'react';
import { StyleSheet, Text } from 'react-native';

interface QuestionInputLabelProps {
  label: string;
  hint?: string;
}

export const QuestionInputLabel: React.FC<QuestionInputLabelProps> = ({ label, hint }) => {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
    </>
  );
};

const styles = StyleSheet.create({
  label: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  hint: {
    color: '#8E8E93',
    fontSize: 12,
    marginBottom: 10,
  },
});
