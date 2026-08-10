import React from 'react';
import { StyleSheet, View } from 'react-native';

interface FormCardProps {
  children: React.ReactNode;
  style?: object;
}

export const FormCard: React.FC<FormCardProps> = ({ children, style }) => {
  return <View style={[styles.card, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#202124',
    borderRadius: 18,
    borderWidth: 0,
    padding: 18,
  },
});
