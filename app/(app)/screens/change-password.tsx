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

export default function ChangePasswordScreen() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, updateProfile } = useAuth();

  const validate = () => {
    if (!currentPassword.trim()) {
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
    if (newPassword === currentPassword) {
      Alert.alert('Validation Error', 'New password cannot be the same as the current password.');
      return false;
    }
    return true;
  };

  const handleUpdate = async () => {
    if (!validate()) return;

    try {
      setLoading(true);
      // Call your backend API to change password
      // Example: await authAPI.changePassword({ currentPassword, newPassword });
      // For now, we'll simulate success
      await new Promise((resolve) => setTimeout(resolve, 1500));
      Alert.alert('Success', 'Password updated successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert(
        'Update Failed',
        error?.response?.data?.message || 'Something went wrong. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Change Password</Text>
        </View>

        <Text style={styles.subtitle}>Keep your account secure by updating your password.</Text>

        <View style={styles.form}>
          <AppInput
            label="Current Password"
            placeholder="Enter your current password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            containerStyle={styles.inputContainer}
            icon={<Text style={styles.inputIcon}>🔒</Text>}  // ✅ changed from leftIcon to icon
          />

          <AppInput
            label="New Password"
            placeholder="Enter your new password"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            containerStyle={styles.inputContainer}
            icon={<Text style={styles.inputIcon}>🔒</Text>}  // ✅ changed
          />

          <AppInput
            label="Confirm Password"
            placeholder="Confirm your new password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            containerStyle={styles.inputContainer}
            icon={<Text style={styles.inputIcon}>🔒</Text>}  // ✅ changed
          />

          <PrimaryButton
            title="Update Password"
            onPress={handleUpdate}
            loading={loading}
            style={styles.updateButton}
          />
        </View>
      </ScrollView>
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
});