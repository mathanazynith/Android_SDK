import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleProp, StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View, ViewStyle } from 'react-native';
import { BorderRadius, Colors, Spacing, Typography } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useResponsive } from '../../utils/responsive';

interface AppInputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onRightIconPress?: () => void;
  containerStyle?: ViewStyle;
  inputStyle?: StyleProp<ViewStyle>;
  authStyle?: boolean;
}

export const AppInput: React.FC<AppInputProps> = ({
  label, error, icon, rightIcon, onRightIconPress, containerStyle, inputStyle,
  authStyle = false, secureTextEntry, ...props
}) => {
  const { colors, isDark } = useTheme();
  const { spacing, fontSize } = useResponsive();
  const [isFocused, setIsFocused] = useState(false);
  const [isSecure, setIsSecure] = useState(secureTextEntry || false);
  const toggleSecure = () => setIsSecure(!isSecure);
  const authBorderColor = isDark ? '#303236' : colors.border;
  const borderColor = error ? Colors.error : isFocused ? colors.primary : authBorderColor;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text style={[
          styles.label,
          { color: authStyle ? colors.text : colors.textSecondary },
          authStyle && styles.authLabel,
        ]}>
          {label}
        </Text>
      )}
      <View style={[
        styles.inputWrapper,
        { borderColor, backgroundColor: authStyle && isDark ? '#202124' : colors.surface },
        authStyle && styles.authInputWrapper,
        authStyle && { borderColor: error ? Colors.error : isFocused ? Colors.primary : authBorderColor },
        inputStyle,
      ]}>
        {icon && <View style={styles.iconContainer}>{icon}</View>}
        <TextInput
          style={[styles.input, { color: colors.inputText, fontSize: fontSize(Typography.body.fontSize), paddingVertical: spacing(Spacing.sm) }, icon ? styles.inputWithIcon : undefined, secureTextEntry ? styles.inputWithRightIcon : undefined]}
          placeholderTextColor={colors.textSecondary}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          secureTextEntry={isSecure}
          {...props}
        />
        {secureTextEntry && (
          <TouchableOpacity onPress={toggleSecure} style={styles.rightIcon} accessibilityLabel={isSecure ? 'Show password' : 'Hide password'}>
            <Ionicons name={isSecure ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        {rightIcon && <TouchableOpacity onPress={onRightIconPress} style={styles.rightIcon}>{rightIcon}</TouchableOpacity>}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: Spacing.sm },
  label: { ...Typography.bodySmall, fontWeight: '500' },
  authLabel: { fontSize: 14, fontWeight: '500' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderRadius: BorderRadius.md, borderWidth: 1.5, paddingHorizontal: Spacing.md, minHeight: 50 },
  authInputWrapper: { borderWidth: 1, borderRadius: 14, minHeight: 54, paddingHorizontal: 16 },
  input: { flex: 1, ...Typography.body, paddingVertical: Spacing.sm },
  inputWithIcon: { paddingLeft: Spacing.sm },
  inputWithRightIcon: { paddingRight: Spacing.sm },
  iconContainer: { marginRight: Spacing.sm },
  rightIcon: { marginLeft: Spacing.sm, padding: Spacing.xs },
  errorText: { ...Typography.caption, color: Colors.error },
});
