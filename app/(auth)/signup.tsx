import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from '@expo/vector-icons';
import { authAPI } from "../../service/api";
import { useAuth } from "../../service/auth";
import { AppInput } from "../../components/common/AppInput";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { Colors, Spacing, Typography, BorderRadius } from "../../constants/theme";
import { BRAND_GREEN, useTheme } from "../../contexts/ThemeContext";

export default function SignupScreen() {
  const { colors } = useTheme();
  const { googleSignupData, setGoogleSignupData } = useAuth();

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

  const handleSignup = async () => {
    // First Name
    if (!firstName.trim()) {
      Alert.alert("Validation Error", "First Name is required.");
      return;
    }

    // Last Name
    if (!lastName.trim()) {
      Alert.alert("Validation Error", "Last Name is required.");
      return;
    }

    // Username
    if (!username.trim()) {
      Alert.alert("Validation Error", "Username is required.");
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

    // Phone Number
    if (!phoneNumber.trim()) {
      Alert.alert("Validation Error", "Phone Number is required.");
      return;
    }

    const phoneRegex = /^[6-9]\d{9}$/;

    if (!phoneRegex.test(phoneNumber.trim())) {
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

      console.log("========== SIGNUP REQUEST ==========");
      console.log(signupData);

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
      console.log("========== SIGNUP ERROR ==========");
      console.log(error);

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
      case "last_name": if (!value.trim()) error = "Last name is required"; break;
      case "phone_number":
        if (!/^[0-9]{10}$/.test(value)) error = "Enter a valid 10-digit phone number";
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

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <StatusBar barStyle={colors.background === '#F8FAFC' ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.authCard}>
          <View style={[styles.segmentedControl, { backgroundColor: colors.surfaceRaised }]}>
            <TouchableOpacity style={styles.segment} onPress={() => router.back()} disabled={loading}>
              <Text style={styles.segmentText}>Sign in</Text>
            </TouchableOpacity>
            <View style={[styles.segment, { backgroundColor: BRAND_GREEN }]}><Text style={styles.activeSegmentText}>Sign up</Text></View>
          </View>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} disabled={loading} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.emailDivider}><View style={styles.dividerLine} /><Text style={styles.emailDividerText}>Or With E-Mail</Text><View style={styles.dividerLine} /></View>

        {hasGoogleData && (
          <View style={styles.googleInfoContainer}>
            <Text style={styles.googleInfoText}>🔵 Signing up with Google</Text>
            <Text style={styles.googleInfoSubtext}>
              Your email has been pre-filled from Google.
            </Text>
          </View>
        )}

        <View style={styles.row}>
          <View style={styles.halfInput}>
            <AppInput
              placeholder="First Name *"
              label="First Name *"
              value={firstName}
              onChangeText={(text) => handleChange("first_name", text)}
              containerStyle={styles.inputContainer}
              authStyle
            />
            {!!errors.first_name && (
              <Text style={styles.errorText}>{errors.first_name}</Text>
            )}
          </View>

          <View style={styles.halfInput}>
            <AppInput
              placeholder="Last Name"
              label="Last Name"
              value={lastName}
              onChangeText={(text) => handleChange("last_name", text)}
              containerStyle={styles.inputContainer}
              authStyle
            />
            {!!errors.last_name && (
              <Text style={styles.errorText}>{errors.last_name}</Text>
            )}
          </View>
        </View>

        <AppInput
          placeholder="Username *"
          label="Username *"
          value={username}
          onChangeText={(text) => handleChange("username", text)}
          autoCapitalize="none"
          autoCorrect={false}
          containerStyle={styles.inputContainer}
          authStyle
        />
        {!!errors.username && (
          <Text style={styles.errorText}>{errors.username}</Text>
        )}

        <AppInput
          placeholder="Email *"
          label="Email *"
          value={email}
          onChangeText={(text) => handleChange("email", text)}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          containerStyle={styles.inputContainer}
          authStyle
          icon={<Ionicons name="mail-outline" size={20} color={Colors.textSecondary} />}
          editable={!hasGoogleData}
        />
        {!!errors.email && (
          <Text style={styles.errorText}>{errors.email}</Text>
        )}

        <AppInput
          placeholder="Phone Number"
          label="Phone"
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
          authStyle
        />
        {!!errors.phone_number && (
          <Text style={styles.errorText}>{errors.phone_number}</Text>
        )}

        <AppInput
          placeholder="Password *"
          label="Password *"
          value={password}
          onChangeText={(text) => handleChange("password", text)}
          secureTextEntry
          containerStyle={styles.inputContainer}
          authStyle
        />
        {!!errors.password && (
          <Text style={styles.errorText}>{errors.password}</Text>
        )}

        <AppInput
          placeholder="Confirm Password *"
          label="Confirm Password *"
          value={password2}
          onChangeText={(text) => handleChange("password2", text)}
          secureTextEntry
          containerStyle={styles.inputContainer}
          authStyle
        />
        {!!errors.password2 && (
          <Text style={styles.errorText}>{errors.password2}</Text>
        )}

        <View style={styles.termsRow}>
          <View style={styles.checkbox} />
          <Text style={styles.termsText}>I agree to the Terms and Privacy Policy</Text>
        </View>

        <PrimaryButton
          title="Create Account"
          onPress={handleSignup}
          loading={loading}
          style={styles.signupButton}
          authStyle
        />

        <TouchableOpacity onPress={() => router.back()} disabled={loading}>
          <Text style={styles.link}>Already a member? <Text style={styles.linkAccent}>Sign in</Text></Text>
        </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 30,
  },
  title: {
    ...Typography.h1,
    color: Colors.text,
    textAlign: "center",
    marginTop: Spacing.lg,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.lg,
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
    gap: 16,
  },
  halfInput: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: 10,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.error,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  disabledInputContainer: {
    opacity: 0.6,
  },
  signupButton: {
    marginTop: 16,
  },
  link: {
    fontSize: 13,
    color: Colors.primary,
    textAlign: "center",
    marginTop: 20,
    marginBottom: 10,
  },
  googleInfoContainer: {
    backgroundColor: Colors.surfaceLight,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: "#4285F4",
  },
  googleInfoText: {
    ...Typography.bodySmall,
    fontWeight: "600",
    color: Colors.text,
  },
  googleInfoSubtext: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  authCard: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  segmentedControl: { flexDirection: 'row', backgroundColor: '#202124', padding: 3, borderRadius: 10, marginBottom: 14 },
  segment: { flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  activeSegment: { backgroundColor: '#63C438' },
  segmentText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  activeSegmentText: { color: '#101510', fontSize: 12, fontWeight: '700' },
  backButton: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 30, backgroundColor: '#202124', borderWidth: 1, borderColor: '#333538', marginBottom: 12 },
  emailDivider: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#202124' },
  emailDividerText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600', letterSpacing: .2 },
  termsRow: { minHeight: 62, borderRadius: 14, backgroundColor: '#202124', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, marginTop: 8 },
  checkbox: { width: 21, height: 21, borderRadius: 3, borderWidth: 2, borderColor: Colors.textSecondary, marginRight: 15 },
  termsText: { color: Colors.textSecondary, fontSize: 14, flexShrink: 1 },
  linkAccent: { color: Colors.primary, fontWeight: '700' },
});
