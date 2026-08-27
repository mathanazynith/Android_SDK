import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, TouchableOpacity, TextInputProps, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, Spacing, Typography } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

interface AppInputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onRightIconPress?: () => void;
  containerStyle?: ViewStyle;
  inputStyle?: ViewStyle;
  authStyle?: boolean;
}

export const AppInput: React.FC<AppInputProps> = ({
  label, error, icon, rightIcon, onRightIconPress, containerStyle, inputStyle,
  authStyle = false, secureTextEntry, ...props
}) => {
  const { colors } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [isSecure, setIsSecure] = useState(secureTextEntry || false);
  const toggleSecure = () => setIsSecure(!isSecure);
  const borderColor = error ? Colors.error : isFocused ? Colors.primary : colors.border;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[
        styles.inputWrapper,
        { borderColor, backgroundColor: colors.surface },
        authStyle && styles.authInputWrapper,
        authStyle && { borderColor: error ? Colors.error : isFocused ? Colors.primary : colors.border },
        inputStyle,
      ]}>
        {icon && <View style={styles.iconContainer}>{icon}</View>}
        <TextInput
          style={[styles.input, { color: colors.inputText }, icon ? styles.inputWithIcon : undefined, secureTextEntry ? styles.inputWithRightIcon : undefined]}
          placeholderTextColor={colors.textSecondary}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          secureTextEntry={isSecure}
          {...props}
        />
        {secureTextEntry && (
          <TouchableOpacity onPress={toggleSecure} style={styles.rightIcon} accessibilityLabel={isSecure ? 'Show password' : 'Hide password'}>
            <Ionicons name={isSecure ? 'eye-outline' : 'eye-off-outline'} size={20} color={Colors.textSecondary} />
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
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderRadius: BorderRadius.md, borderWidth: 1.5, paddingHorizontal: Spacing.md, minHeight: 50 },
  authInputWrapper: { borderWidth: 1, borderRadius: 14, minHeight: 54, paddingHorizontal: 16 },
  input: { flex: 1, ...Typography.body, paddingVertical: Spacing.sm },
  inputWithIcon: { paddingLeft: Spacing.sm },
  inputWithRightIcon: { paddingRight: Spacing.sm },
  iconContainer: { marginRight: Spacing.sm },
  rightIcon: { marginLeft: Spacing.sm, padding: Spacing.xs },
  errorText: { ...Typography.caption, color: Colors.error },
});
