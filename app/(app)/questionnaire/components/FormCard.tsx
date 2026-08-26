import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../../../contexts/ThemeContext';

interface FormCardProps {
  children: React.ReactNode;
  style?: object;
}

export const FormCard: React.FC<FormCardProps> = ({ children, style }) => {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>{children}</View>;
};

export default FormCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#202124',
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
});
