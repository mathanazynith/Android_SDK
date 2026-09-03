// app/(app)/change-password.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../../service/auth';
import { AppInput } from '../../../components/common/AppInput';
import { PrimaryButton } from '../../../components/common/PrimaryButton';
import { Colors, Spacing, Typography } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';

export default function ChangePasswordScreen() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { colors } = useTheme();
  const { user, isLoading: authLoading, updatePassword } = useAuth();
  const passwordStateLoading = authLoading || !user || typeof user.hasPassword !== 'boolean';
  const hasPassword = user?.hasPassword === true;

  const passwordIsValid = (value: string) =>
    value.length >= 8 && /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/.test(value);

  const canSubmit = passwordIsValid(newPassword)
    && newPassword === confirmPassword
    && (hasPassword ? Boolean(currentPassword.trim()) : true);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/profile');
  };

  const validate = () => {
    if (hasPassword && !currentPassword.trim()) {
      Alert.alert('Validation Error', 'Current password is required.');
      return false;
    }
    if (!newPassword.trim()) {
      Alert.alert('Validation Error', 'New password is required.');
      return false;
    }
    if (newPassword.length < 8) {
      Alert.alert('Validation Error', 'Password must be at least 8 characters.');
      return false;
    }
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      Alert.alert(
        'Validation Error',
        'Password must contain:\n• One uppercase letter\n• One lowercase letter\n• One number\n• One special character.'
      );
      return false;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Validation Error', 'Passwords do not match.');
      return false;
    }
    if (hasPassword && newPassword === currentPassword) {
      Alert.alert('Validation Error', 'New password cannot be the same as the current password.');
      return false;
    }
    return true;
  };

  const handleUpdate = async () => {
    if (!validate()) return;

    try {
      setLoading(true);
      await updatePassword({
        ...(hasPassword ? { currentPassword } : {}),
        newPassword,
        confirmPassword,
      });
      Alert.alert('Success', hasPassword
        ? 'Password updated successfully.'
        : 'Password set successfully! You can now log in using your email and password.', [
        { text: 'OK', onPress: handleBack },
      ]);
    } catch (error: any) {
      let errorMessage = 'Something went wrong. Please try again.';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (typeof error.response?.data === 'string') {
        errorMessage = error.response.data;
      } else if (error.message) {
        errorMessage = error.message;
      }
      Alert.alert('Update Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {passwordStateLoading ? (
        <View style={styles.loadingState}>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Loading password settings...</Text>
        </View>
      ) : <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>
            {hasPassword ? 'Change Password' : 'Set Password'}
          </Text>
        </View>

        <Text style={[styles.subtitle, { color: colors.textSecondary }] }>
          {hasPassword ? 'Keep your account secure by updating your password.' : 'Create a password to sign in with your email and password.'}
        </Text>

        <View style={styles.form}>
          {hasPassword && (
            <AppInput
              label="Current Password"
              placeholder="Enter your current password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              containerStyle={styles.inputContainer}
            />
          )}

          <AppInput
            label="New Password"
            placeholder="Enter your new password"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            containerStyle={styles.inputContainer}
          />

          <AppInput
            label="Confirm Password"
            placeholder="Confirm your new password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            containerStyle={styles.inputContainer}
          />

          <PrimaryButton
            title="Update Password"
            onPress={handleUpdate}
            loading={loading}
            style={styles.updateButton}
            disabled={loading || !canSubmit}
          />
        </View>
      </ScrollView>
      }
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingTop: Spacing.xl,
  },
  backButton: { padding: Spacing.xs },
  backIcon: { fontSize: 24, color: Colors.text },
  title: { ...Typography.h2, color: Colors.text, marginLeft: Spacing.md, flex: 1 },
  subtitle: { ...Typography.bodySmall, color: Colors.textSecondary, marginBottom: Spacing.xl },
  form: { marginTop: Spacing.sm },
  inputContainer: { marginBottom: Spacing.md },
  inputIcon: { fontSize: 18, color: Colors.textMuted, marginRight: Spacing.sm },
  updateButton: { marginTop: Spacing.sm },
  loadingState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});