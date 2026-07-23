import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
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
  const [errors, setErrors] = useState({
    email: "",
  });

  // Validation functions
  const validateEmail = (value: string): string => {
    if (!value.trim()) {
      return "Email is required";
    }
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(value.trim())) {
      return "Please enter a valid email address";
    }
    return "";
  };

  const validateField = (field: string, value: string) => {
    let error = "";
    switch (field) {
      case "email":
        error = validateEmail(value);
        break;
    }
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  const handleChange = (field: string, value: string) => {
    switch (field) {
      case "email":
        setEmail(value);
        break;
    }
    validateField(field, value);
  };

  const handleSubmit = async () => {
    // Validate all fields before submission
    const emailError = validateEmail(email);

    // Update all errors
    setErrors({
      email: emailError,
    });

    // Check if any error exists
    if (emailError) {
      Alert.alert(
        "Validation Error",
        "Please fix all errors before submitting"
      );
      return;
    }

    try {
      setLoading(true);
      await authAPI.passwordResetRequest({ email: email.trim() });
      Alert.alert(
        "Success", 
        "Password reset OTP has been sent to your email."
      );
      router.push({
        pathname: "/(auth)/reset-password",
        params: { email: email.trim() },
      });
    } catch (error: any) {
      console.log("Password Reset Error:", error?.response?.data);
      
      // Handle different error scenarios with user-friendly messages
      let errorMessage = "Failed to send OTP. Please try again.";
      
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        if (status === 404) {
          errorMessage = "Account not found with this email. Please check and try again.";
        } else if (status === 400) {
          if (data?.message?.toLowerCase().includes("invalid")) {
            errorMessage = "Invalid email address. Please check and try again.";
          } else {
            errorMessage = data?.message || "Invalid request. Please check your email.";
          }
        } else if (status === 429) {
          errorMessage = "Too many requests. Please wait a moment before trying again.";
        } else if (status === 500) {
          errorMessage = "Server error. Please try again later.";
        } else if (data?.message) {
          errorMessage = data.message;
        } else if (typeof data === "string") {
          errorMessage = data;
        }
      } else if (error.message?.includes("network")) {
        errorMessage = "Network error. Please check your internet connection.";
      }
      
      Alert.alert("Error", errorMessage);
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
          onChangeText={(text) => handleChange("email", text)}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          containerStyle={styles.inputContainer}
        />
        {!!errors.email && (
          <Text style={styles.errorText}>{errors.email}</Text>
        )}

        <PrimaryButton
          title="Send OTP"
          onPress={handleSubmit}
          loading={loading}
          style={styles.button}
          disabled={loading}
        />

        <TouchableOpacity 
          onPress={() => router.replace("/(auth)/login")}
          disabled={loading}
        >
          <Text style={styles.backText}>Back to Login</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: Spacing.xl,
  },
  title: { 
    ...Typography.h1, 
    color: Colors.text, 
    textAlign: "center", 
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  inputContainer: { 
    marginBottom: Spacing.sm,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.error,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  button: { 
    marginTop: Spacing.sm,
  },
  backText: {
    ...Typography.bodySmall,
    color: Colors.primary,
    textAlign: "center",
    marginTop: Spacing.lg,
    fontWeight: "600",
  },
});