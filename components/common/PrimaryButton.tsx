// FrontEnd/components/PrimaryButton.tsx
import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { BorderRadius, Typography, Spacing } from '../../constants/theme';
import { BRAND_GREEN, useTheme } from '../../contexts/ThemeContext';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'outline';
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  authStyle?: boolean;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  fullWidth = true,
  style,
  textStyle,
  leftIcon,
  rightIcon,
  authStyle = false,
}) => {
  const { colors } = useTheme();
  const getBackgroundColor = () => {
    if (disabled) return colors.surfaceRaised;
    if (variant === 'primary') return BRAND_GREEN;
    if (variant === 'secondary') return colors.surfaceRaised;
    if (variant === 'outline') return 'transparent';
    return BRAND_GREEN;
  };

  const getTextColor = () => {
    if (disabled) return colors.textSecondary;
    if (variant === 'primary') return colors.background;
    if (variant === 'secondary') return colors.text;
    if (variant === 'outline') return BRAND_GREEN;
    return colors.background;
  };

  const getBorderColor = () => {
    if (disabled) return colors.surfaceRaised;
    if (variant === 'outline') return BRAND_GREEN;
    if (variant === 'secondary') return colors.border;
    return 'transparent';
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
          width: fullWidth ? '100%' : 'auto',
        },
        authStyle && styles.authButton,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} />
      ) : (
        <>
          {leftIcon && <>{leftIcon}</>}
          <Text style={[styles.text, { color: getTextColor() }, textStyle]}>{title}</Text>
          {rightIcon && <>{rightIcon}</>}
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    gap: Spacing.sm,
    minHeight: 50,
  },
  text: { ...Typography.button, textAlign: 'center' },
  authButton: { minHeight: 52, borderRadius: 14, borderWidth: 0 },
});
