// FrontEnd/components/AppCard.tsx
import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, BorderRadius, Spacing } from '../constants/theme';

interface AppCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'elevated' | 'outlined';
  padding?: number;
}

export const AppCard: React.FC<AppCardProps> = ({
  children,
  style,
  variant = 'default',
  padding = Spacing.md,
}) => {
  const getCardStyle = () => {
    switch (variant) {
      case 'elevated':
        return {
          backgroundColor: Colors.surfaceLight,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 6,
        };
      case 'outlined':
        return { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border };
      default:
        return { backgroundColor: Colors.surface };
    }
  };

  return <View style={[styles.card, getCardStyle(), { padding }, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.lg, overflow: 'hidden' },
});