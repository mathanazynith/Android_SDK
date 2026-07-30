import React from 'react';
import { StyleSheet, Text } from 'react-native';

interface ValidationMessageProps {
  message?: string;
  type?: 'error' | 'hint' | 'success';
}

export const ValidationMessage: React.FC<ValidationMessageProps> = ({ message, type = 'hint' }) => {
  if (!message) {
    return null;
  }

  return <Text style={[styles.text, type === 'error' ? styles.error : type === 'success' ? styles.success : styles.hint]}>{message}</Text>;
};

const styles = StyleSheet.create({
  text: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
  },
  hint: { color: '#8E8E93' },
  error: { color: '#FF5A5F' },
  success: { color: '#34C759' },
});
