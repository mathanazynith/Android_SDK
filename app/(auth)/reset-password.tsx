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
  const [errors, setErrors] = useState({
    otpCode: "",
    password: "",
    confirmPassword: "",
  });

  // Validation functions
  const validateOtp = (value: string): string => {
    if (!value.trim()) {
      return "OTP is required";
    }
    if (value.trim().length < 4) {
      return "Please enter 6 digit OTP";
    }
    if (value.trim().length > 6) {
      return "Please enter 6 digit OTP";
    }
    if (!/^\d+$/.test(value.trim())) {
      return "OTP must contain only numbers";
    }
    return "";
  };

  const validatePassword = (value: string): string => {
    if (!value) {
      return "Password is required";
    }
    if (value.length < 8) {
      return "Password must be at least 8 characters";
    }
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
    if (!passwordRegex.test(value)) {
      return "Password must contain uppercase, lowercase, number, and special character";
    }
    return "";
  };

  const validateConfirmPassword = (value: string): string => {
    if (!value) {
      return "Please confirm your password";
    }
    if (value !== password) {
      return "Passwords do not match";
    }
    return "";
  };

  const validateField = (field: string, value: string) => {
    let error = "";
    switch (field) {
      case "otpCode":
        error = validateOtp(value);
        break;
      case "password":
        error = validatePassword(value);
        break;
      case "confirmPassword":
        error = validateConfirmPassword(value);
        break;
    }
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  const handleChange = (field: string, value: string) => {
    switch (field) {
      case "otpCode":
        // Only allow numbers for OTP
        const numericValue = value.replace(/[^0-9]/g, "");
        setOtpCode(numericValue);
        validateField(field, numericValue);
        break;
      case "password":
        setPassword(value);
        validateField(field, value);
        // Re-validate confirm password when password changes
        if (confirmPassword) {
          validateField("confirmPassword", confirmPassword);
        }
        break;
      case "confirmPassword":
        setConfirmPassword(value);
        validateField(field, value);
        break;
    }
  };

  const handleReset = async () => {
    // Validate all fields before submission
    const otpError = validateOtp(otpCode);
    const passwordError = validatePassword(password);
    const confirmError = validateConfirmPassword(confirmPassword);

    // Update all errors
    setErrors({
      otpCode: otpError,
      password: passwordError,
      confirmPassword: confirmError,
    });

    // Check if any error exists
    if (otpError || passwordError || confirmError) {
      Alert.alert(
        "Validation Error",
        "Please fix all errors before submitting"
      );
      return;
    }

    try {
      setLoading(true);
      await authAPI.passwordResetConfirm({
        email: email as string,
        otp_code: otpCode.trim(),
        password,
        password2: confirmPassword,
      });
      
      Alert.alert(
        "Success", 
        "Password reset successful. Please login with your new password.",
        [
          { 
            text: "OK", 
            onPress: () => router.replace("/(auth)/login") 
          },
        ]
      );
    } catch (error: any) {
      console.log("Reset Password Error:", error?.response?.data);
      
      // Handle different error scenarios with user-friendly messages
      let errorMessage = "Password reset failed. Please try again.";
      let errorTitle = "Error";
      
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        if (status === 400) {
          if (data?.message?.toLowerCase().includes("expired")) {
            errorTitle = "OTP Expired";
            errorMessage = "Your OTP has expired. Please request a new one from the forgot password page.";
          } else if (data?.message?.toLowerCase().includes("invalid")) {
            errorTitle = "Invalid OTP";
            errorMessage = "The OTP you entered is invalid. Please check and try again.";
          } else if (data?.message?.toLowerCase().includes("password")) {
            errorTitle = "Invalid Password";
            errorMessage = data.message || "Password does not meet the requirements.";
          } else {
            errorMessage = data?.message || "Invalid request. Please check your inputs.";
          }
        } else if (status === 401) {
          errorMessage = "Invalid OTP. Please check and try again.";
        } else if (status === 404) {
          errorMessage = "Email not found. Please request a new OTP.";
        } else if (status === 429) {
          errorTitle = "Too Many Requests";
          errorMessage = "Too many attempts. Please wait a moment before trying again.";
        } else if (status === 500) {
          errorTitle = "Server Error";
          errorMessage = "Something went wrong on our end. Please try again later.";
        } else {
          if (data?.message) {
            errorMessage = data.message;
          } else if (typeof data === "string") {
            errorMessage = data;
          }
        }
      } else if (error.message?.includes("network")) {
        errorTitle = "Network Error";
        errorMessage = "Unable to connect. Please check your internet connection and try again.";
      }
      
      Alert.alert(errorTitle, errorMessage);
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
          onChangeText={(text) => handleChange("otpCode", text)}
          keyboardType="number-pad"
          maxLength={6}
          containerStyle={styles.inputContainer}
        />
        {!!errors.otpCode && (
          <Text style={styles.errorText}>{errors.otpCode}</Text>
        )}

        <AppInput
          placeholder="New Password"
          value={password}
          onChangeText={(text) => handleChange("password", text)}
          secureTextEntry
          containerStyle={styles.inputContainer}
        />
        {!!errors.password && (
          <Text style={styles.errorText}>{errors.password}</Text>
        )}

        <AppInput
          placeholder="Confirm Password"
          value={confirmPassword}
          onChangeText={(text) => handleChange("confirmPassword", text)}
          secureTextEntry
          containerStyle={styles.inputContainer}
        />
        {!!errors.confirmPassword && (
          <Text style={styles.errorText}>{errors.confirmPassword}</Text>
        )}

        <PrimaryButton
          title="Reset Password"
          onPress={handleReset}
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