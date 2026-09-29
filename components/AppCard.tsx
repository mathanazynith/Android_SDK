// FrontEnd/components/AppCard.tsx
import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { BorderRadius, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useResponsive } from '../utils/responsive';

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
  const { colors } = useTheme();
  const { spacing } = useResponsive();
  const getCardStyle = () => {
    switch (variant) {
      case 'elevated':
        return {
          backgroundColor: colors.surfaceRaised,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 6,
        };
      case 'outlined':
        return { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border };
      default:
        return { backgroundColor: colors.surface };
    }
  };

  return <View style={[styles.card, getCardStyle(), { padding: spacing(padding) }, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.lg, overflow: 'hidden' },
});