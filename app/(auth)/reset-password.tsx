// app/(auth)/reset-password.tsx
import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { authAPI } from "../../service/api";
import { AppInput } from "../../components/common/AppInput";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { Colors, Spacing, Typography } from "../../constants/theme";

export default function ResetPasswordScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [otpCode, setOtpCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!otpCode.trim()) {
      Alert.alert("Validation Error", "Please enter OTP.");
      return;
    }
    if (!password.trim()) {
      Alert.alert("Validation Error", "Please enter a new password.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Validation Error", "Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Validation Error", "Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      await authAPI.passwordResetConfirm({
        email: email as string,
        otp_code: otpCode,
        password,
        password2: confirmPassword,
      });
      Alert.alert("Success", "Password reset successful.", [
        { text: "OK", onPress: () => router.replace("/(auth)/login") },
      ]);
    } catch (error: any) {
      console.log("Reset Password Error:", error?.response?.data);
      Alert.alert("Error", error?.response?.data?.message || "Password reset failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>
          Enter the OTP sent to your email and create a new password.
        </Text>

        <AppInput
          placeholder="OTP Code"
          value={otpCode}
          onChangeText={setOtpCode}
          keyboardType="number-pad"
          containerStyle={styles.inputContainer}
        />

        <AppInput
          placeholder="New Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          containerStyle={styles.inputContainer}
        />

        <AppInput
          placeholder="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          containerStyle={styles.inputContainer}
        />

        <PrimaryButton
          title="Reset Password"
          onPress={handleReset}
          loading={loading}
          style={styles.button}
        />

        <TouchableOpacity onPress={() => router.replace("/(auth)/login")}>
          <Text style={styles.backText}>Back to Login</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: Spacing.xl,
  },
  title: { ...Typography.h1, color: Colors.text, textAlign: "center", marginBottom: Spacing.xs },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  inputContainer: { marginBottom: Spacing.md },
  button: { marginTop: Spacing.sm },
  backText: {
    ...Typography.bodySmall,
    color: Colors.primary,
    textAlign: "center",
    marginTop: Spacing.lg,
    fontWeight: "600",
  },
});