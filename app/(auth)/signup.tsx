import { Alert } from '@/components/ThemedAlert';
import { Ionicons } from '@expo/vector-icons';
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AuthSocialButtons from "../../components/auth/AuthSocialButtons";
import { AppInput } from "../../components/common/AppInput";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { LegalConsent } from "../../components/LegalConsent";
import { BorderRadius, Colors, Spacing, Typography } from "../../constants/theme";
import { useTheme } from "../../contexts/ThemeContext";
import { authAPI } from "../../service/api";
import { useAuth } from "../../service/auth";

export default function SignupScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { googleLogin, googleSignupData, setGoogleSignupData } = useAuth();
  const hasGoogleData = googleSignupData !== null;

  const [firstName, setFirstName] = useState(
    googleSignupData?.first_name || ""
  );
  const [lastName, setLastName] = useState(
    googleSignupData?.last_name || ""
  );
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState(
    googleSignupData?.email || ""
  );
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [errors, setErrors] = useState({
    email: "", username: "", first_name: "", last_name: "",
    phone_number: "", password: "", password2: "",
  });

  useEffect(() => {
    return () => {
      if (googleSignupData) {
        setGoogleSignupData(null);
      }
    };
  }, []);

  useEffect(() => {
    if (!googleSignupData) return;

    const syncGoogleSignupData = setTimeout(() => {
      setFirstName(googleSignupData.first_name || "");
      setLastName(googleSignupData.last_name || "");
      setEmail(googleSignupData.email || "");
    }, 0);

    return () => clearTimeout(syncGoogleSignupData);
  }, [googleSignupData]);

  const handleGoogleSignup = async () => {
    try {
      setGoogleLoading(true);
      const result = await googleLogin();

      if (result.cancelled) return;

      if (!result.requiresSignup) {
        router.replace("/(app)/dashboard");
      }
    } catch (error: any) {
      Alert.alert(
        "Google Sign-up Failed",
        error.message || "Unable to continue with Google. Please try again."
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  useEffect(() => {
    const typedUsername = username.trim();

    if (typedUsername.length < 3) {
      return;
    }

    let isCurrentRequest = true;

    const timeoutId = setTimeout(async () => {
      try {
        const response = await authAPI.usernameAvailable(typedUsername);
        if (!isCurrentRequest) return;

        const available = response.data.data.available;
        setIsAvailable(available);
        setErrorMessage(
          response.data.message ||
            (available ? "Username is available" : "Username already exists")
        );
      } catch (error) {
        if (!isCurrentRequest) return;
        console.error("Error checking username:", error);
        setIsAvailable(null);
        setErrorMessage("Unable to check username availability.");
      } finally {
        if (isCurrentRequest) setIsChecking(false);
      }
    }, 450);

    return () => {
      isCurrentRequest = false;
      clearTimeout(timeoutId);
    };
  }, [username]);

  const handleSignup = async () => {
    // First Name
    if (!firstName.trim()) {
      Alert.alert("Validation Error", "First Name is required.");
      return;
    }

    // Username
    if (!username.trim()) {
      Alert.alert("Validation Error", "Username is required.");
      return;
    }

    if (isChecking || isAvailable === false) {
      Alert.alert("Validation Error", "Please choose an available username.");
      return;
    }

    // Email
    if (!email.trim()) {
      Alert.alert("Validation Error", "Email is required.");
      return;
    }

    const emailRegex =
      /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

    if (!emailRegex.test(email.trim())) {
      Alert.alert("Validation Error", "Please enter a valid email.");
      return;
    }

    const phoneRegex = /^[6-9]\d{9}$/;

    if (phoneNumber.trim() && !phoneRegex.test(phoneNumber.trim())) {
      Alert.alert(
        "Validation Error",
        "Enter a valid 10-digit mobile number."
      );
      return;
    }

    // Password
    if (!password) {
      Alert.alert("Validation Error", "Password is required.");
      return;
    }

    if (password.length < 8) {
      Alert.alert(
        "Validation Error",
        "Password must contain at least 8 characters."
      );
      return;
    }

    // Strong Password
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

    if (!passwordRegex.test(password)) {
      Alert.alert(
        "Validation Error",
        "Password must contain:\n\n• One uppercase letter\n• One lowercase letter\n• One number\n• One special character."
      );
      return;
    }

    // Confirm Password
    if (!password2) {
      Alert.alert(
        "Validation Error",
        "Confirm Password is required."
      );
      return;
    }

    if (password !== password2) {
      Alert.alert(
        "Validation Error",
        "Passwords do not match."
      );
      return;
    }

    const signupData = {
      email: email.trim(),
      username: username.trim(),
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      password,
      password2,
      phone_number: phoneNumber.trim(),
    };

    try {
      setLoading(true);


      const response = await authAPI.signup(signupData);

      Alert.alert(
        "Success",
        response.data.message || "OTP sent successfully."
      );

      router.push({
        pathname: "/verify-otp",
        params: {
          email: signupData.email,
        },
      });

    } catch (error: any) {

      let errorMessage = "Something went wrong";

      if (error.response?.data) {
        if (typeof error.response.data === "string") {
          errorMessage = error.response.data;
        } else if (error.response.data.message) {
          errorMessage = error.response.data.message;
        } else {
          errorMessage = Object.values(error.response.data)
            .flat()
            .join("\n");
        }
      }

      Alert.alert("Signup Failed", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const validateField = (field: string, value: string) => {
    let error = "";
    switch (field) {
      case "email":
        if (!value.trim()) error = "Email is required";
        else if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) error = "Enter a valid email";
        break;
      case "username":
        if (!value.trim()) error = "Username is required";
        else if (value.length < 4) error = "Minimum 4 characters";
        break;
      case "first_name": if (!value.trim()) error = "First name is required"; break;
      case "phone_number":
        if (value && !/^[6-9]\d{9}$/.test(value)) error = "Enter a valid 10-digit phone number";
        break;
      case "password":
        if (value.length < 8) error = "Minimum 8 characters";
        else if (!/(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[#@$!%*?&])/.test(value))
          error = "Must contain uppercase, lowercase, number and special character";
        break;
      case "password2":
        if (value !== password) error = "Passwords do not match";
        break;
    }
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  const handleChange = (field: string, value: string) => {
    switch (field) {
      case "first_name":
        setFirstName(value);
        break;
      case "last_name":
        setLastName(value);
        break;
      case "username":
        setUsername(value);
        setIsChecking(value.trim().length >= 3);
        setIsAvailable(null);
        setErrorMessage("");
        break;
      case "email":
        setEmail(value);
        break;
      case "phone_number":
        setPhoneNumber(value);
        break;
      case "password":
        setPassword(value);
        break;
      case "password2":
        setPassword2(value);
        break;
    }

    validateField(field, value);

    if (field === "password") {
      validateField("password2", password2);
    }
  };

  const emailIsValid = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email.trim());
  const passwordIsValid =
    password.length >= 8 && /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/.test(password);
  const usernameIsUsable =
    isAvailable === true ||
    (isAvailable === null && !isChecking && errorMessage.startsWith("Unable to check username"));
  const requirementChecks = [
    Boolean(firstName.trim()),
    username.trim().length >= 3 && usernameIsUsable,
    emailIsValid,
    passwordIsValid,
    Boolean(password2) && password2 === password,
  ];
  const completedRequirements = requirementChecks.filter(Boolean).length;
  const isFormValid = completedRequirements === requirementChecks.length;
  const passwordStrength = password.length === 0
    ? 0
    : [
        password.length >= 8,
        /[A-Z]/.test(password) && /[a-z]/.test(password),
        /\d/.test(password),
        /[@$!%*?&]/.test(password),
      ].filter(Boolean).length;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.surfaceRaised }]}
          onPress={() => router.back()}
          disabled={loading || googleLoading}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View
          style={styles.progressRow}
          accessibilityRole="progressbar"
          accessibilityLabel="Sign up progress"
          accessibilityValue={{ min: 0, max: requirementChecks.length, now: completedRequirements }}
        >
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceRaised }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: colors.primary, width: `${(completedRequirements / requirementChecks.length) * 100}%` },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: colors.textSecondary }]}>
            {completedRequirements}/{requirementChecks.length}
          </Text>
        </View>
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.authCard}>
          <View style={styles.heading}>
            <Text style={[styles.title, { color: colors.text }]}>Create account</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Join the run club</Text>
          </View>

          <AuthSocialButtons
            onGooglePress={handleGoogleSignup}
            loading={googleLoading}
            disabled={loading}
          />

          <View style={styles.emailDivider}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.emailDividerText, { color: colors.textSecondary }]}>Or With E-Mail</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

        {hasGoogleData && (
          <View style={[styles.googleInfoContainer, { backgroundColor: colors.surfaceRaised }]}>
            <Text style={[styles.googleInfoText, { color: colors.text }]}>Signing up with Google</Text>
            <Text style={[styles.googleInfoSubtext, { color: colors.textSecondary }]}>
              Your email has been pre-filled from Google.
            </Text>
          </View>
        )}

        <View style={styles.row}>
          <View style={styles.halfInput}>
            <AppInput
              label="First Name *"
              placeholder=""
              value={firstName}
              onChangeText={(text) => handleChange("first_name", text)}
              containerStyle={styles.inputContainer}
              inputStyle={styles.compactInput}
              authStyle
            />
            {!!errors.first_name && (
              <Text style={styles.errorText}>{errors.first_name}</Text>
            )}
          </View>

          <View style={styles.halfInput}>
            <AppInput
              label="Last Name"
              placeholder=""
              value={lastName}
              onChangeText={(text) => handleChange("last_name", text)}
              containerStyle={styles.inputContainer}
              inputStyle={styles.compactInput}
              authStyle
            />
            {!!errors.last_name && (
              <Text style={styles.errorText}>{errors.last_name}</Text>
            )}
          </View>
        </View>

        <AppInput
          label="Username *"
          placeholder=""
          value={username}
          onChangeText={(text) => handleChange("username", text)}
          autoCapitalize="none"
          autoCorrect={false}
          containerStyle={styles.inputContainer}
          inputStyle={styles.compactInput}
          authStyle
        />
        {!!errors.username && (
          <Text style={styles.errorText}>{errors.username}</Text>
        )}
        {username.trim().length >= 3 && (isChecking || errorMessage) && (
          <Text
            style={[
              styles.usernameStatus,
              { color: isAvailable === true ? "#22C55E" : "#EF4444" },
            ]}
          >
            {isChecking ? "Checking availability..." : errorMessage}
          </Text>
        )}

        <AppInput
          label="Email *"
          placeholder="Enter Your Mail"
          value={email}
          onChangeText={(text) => handleChange("email", text)}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          containerStyle={styles.inputContainer}
          inputStyle={styles.compactInput}
          authStyle
          icon={<Ionicons name="mail-outline" size={20} color={colors.textSecondary} />}
          editable={!hasGoogleData}
        />
        {!!errors.email && (
          <Text style={styles.errorText}>{errors.email}</Text>
        )}

        <AppInput
          label="Phone"
          placeholder=""
          value={phoneNumber}
          onChangeText={(text) => {
            const value = text.replace(/[^0-9]/g, "");
            if (value.length <= 10) {
              handleChange("phone_number", value);
            }
          }}
          keyboardType="number-pad"
          maxLength={10}
          containerStyle={styles.inputContainer}
          inputStyle={styles.compactInput}
          authStyle
        />
        {!!errors.phone_number && (
          <Text style={styles.errorText}>{errors.phone_number}</Text>
        )}

        <AppInput
          label="Password *"
          placeholder=""
          value={password}
          onChangeText={(text) => handleChange("password", text)}
          secureTextEntry
          containerStyle={styles.inputContainer}
          inputStyle={styles.compactInput}
          authStyle
        />
        {!!errors.password && (
          <Text style={styles.errorText}>{errors.password}</Text>
        )}
        <View style={styles.passwordStrength} accessibilityLabel={`Password strength ${passwordStrength} of 4`}>
          {[0, 1, 2, 3].map((segment) => (
            <View
              key={segment}
              style={[
                styles.passwordStrengthSegment,
                { backgroundColor: segment < passwordStrength ? colors.primary : colors.surfaceRaised },
              ]}
            />
          ))}
        </View>

        <AppInput
          label="Confirm Password *"
          placeholder=""
          value={password2}
          onChangeText={(text) => handleChange("password2", text)}
          secureTextEntry
          containerStyle={styles.inputContainer}
          inputStyle={styles.compactInput}
          authStyle
        />
        {!!errors.password2 && (
          <Text style={styles.errorText}>{errors.password2}</Text>
        )}

        <LegalConsent align="left" />

        <PrimaryButton
          title="Create Account"
          onPress={handleSignup}
          loading={loading}
          disabled={!isFormValid || isChecking || isAvailable === false}
          style={styles.signupButton}
          rightIcon={<Ionicons name="arrow-forward" size={22} color="#101510" />}
          authStyle
        />

        <TouchableOpacity onPress={() => router.back()} disabled={loading}>
          <Text style={[styles.link, { color: colors.textSecondary }]}>
            Already a member? <Text style={[styles.linkAccent, { color: colors.primary }]}>Sign In</Text>
          </Text>
        </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 24,
    paddingBottom: 6,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  progressRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    overflow: "hidden",
    borderRadius: 999,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  progressText: {
    minWidth: 28,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  heading: {
    marginTop: 4,
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
    marginTop: 10,
    marginBottom: 5,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: 0,
  },
  compactInput: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.error,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  usernameStatus: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
    marginBottom: Spacing.sm,
  },
  disabledInputContainer: {
    opacity: 0.6,
  },
  signupButton: {
    marginTop: 4,
    marginBottom: 8,
  },
  link: {
    fontSize: 13,
    color: Colors.primary,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  googleInfoContainer: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: "#4285F4",
  },
  googleInfoText: {
    ...Typography.bodySmall,
    fontWeight: "600",
  },
  googleInfoSubtext: {
    ...Typography.caption,
  },
  authCard: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 10 },
  emailDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 2, gap: 10 },
  dividerLine: { flex: 1, height: 1 },
  emailDividerText: { fontSize: 13, fontWeight: '600', letterSpacing: .2 },
  passwordStrength: { flexDirection: "row", gap: 4, marginTop: -4, marginBottom: 2 },
  passwordStrengthSegment: { flex: 1, height: 4, borderRadius: 4 },
  linkAccent: { fontWeight: '700' },
});
