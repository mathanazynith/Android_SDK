// FrontEnd/components/PrimaryButton.tsx
import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { Colors, BorderRadius, Typography, Spacing } from '../../constants/theme';

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
}) => {
  const getBackgroundColor = () => {
    if (disabled) return Colors.surfaceLighter;
    if (variant === 'primary') return Colors.primary;
    if (variant === 'secondary') return Colors.surfaceLight;
    if (variant === 'outline') return 'transparent';
    return Colors.primary;
  };

  const getTextColor = () => {
    if (disabled) return Colors.textMuted;
    if (variant === 'primary') return Colors.background;
    if (variant === 'secondary') return Colors.text;
    if (variant === 'outline') return Colors.primary;
    return Colors.background;
  };

  const getBorderColor = () => {
    if (disabled) return Colors.surfaceLighter;
    if (variant === 'outline') return Colors.primary;
    if (variant === 'secondary') return Colors.surfaceLight;
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
});