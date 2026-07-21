// app/(auth)/forgot-password.tsx
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
import { router } from "expo-router";
import { authAPI } from "../../service/api";
import { AppInput } from "../../components/common/AppInput";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { Colors, Spacing, Typography } from "../../constants/theme";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      Alert.alert("Validation Error", "Please enter your email");
      return;
    }
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert("Validation Error", "Please enter a valid email address.");
      return;
    }

    try {
      setLoading(true);
      await authAPI.passwordResetRequest({ email });
      Alert.alert("Success", "Password reset OTP has been sent to your email.");
      router.push({
        pathname: "/(auth)/reset-password",
        params: { email },
      });
    } catch (error: any) {
      console.log("Password Reset Error:", error?.response?.data);
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Failed to send OTP"
      );
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
        <Text style={styles.title}>Forgot Password</Text>
        <Text style={styles.subtitle}>
          Enter your registered email address to receive an OTP.
        </Text>

        <AppInput
          placeholder="Email Address"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          containerStyle={styles.inputContainer}
        />

        <PrimaryButton
          title="Send OTP"
          onPress={handleSubmit}
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