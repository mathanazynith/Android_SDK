import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { authAPI } from "../../service/api";
import { useAuth } from "../../service/auth";
import { AppInput } from "../../components/common/AppInput";
import { PrimaryButton } from "../../components/common/PrimaryButton";
import { Colors, Spacing, Typography, BorderRadius } from "../../constants/theme";

export default function SignupScreen() {
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

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Create account</Text>
      <Text style={styles.subtitle}>Join thousands of runners today</Text>

      {hasGoogleData && (
        <View style={styles.googleInfoContainer}>
          <Text style={styles.googleInfoText}>🔵 Signing up with Google</Text>
          <Text style={styles.googleInfoSubtext}>
            Your email has been pre-filled from Google.
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Personal Information</Text>

      <View style={styles.row}>
        <AppInput
          placeholder="First Name *"
          value={firstName}
          onChangeText={setFirstName}
          containerStyle={styles.halfInput}
        />
        <AppInput
          placeholder="Last Name *"
          value={lastName}
          onChangeText={setLastName}
          containerStyle={styles.halfInput}
        />
      </View>

      <AppInput
        placeholder="Username *"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        containerStyle={styles.inputContainer}
      />

      <AppInput
        placeholder="Email *"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={[
          styles.inputContainer,
          hasGoogleData && styles.disabledInputContainer,
        ]}
        editable={!hasGoogleData}
      />

      <AppInput
        placeholder="Phone Number *"
        value={phoneNumber}
        onChangeText={(text) => {
          const value = text.replace(/[^0-9]/g, "");
          if (value.length <= 10) {
            setPhoneNumber(value);
          }
        }}
        keyboardType="number-pad"
        maxLength={10}
        containerStyle={styles.inputContainer}
      />

      <Text style={styles.sectionTitle}>Password</Text>

      <AppInput
        placeholder="Password *"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        containerStyle={styles.inputContainer}
      />

      <AppInput
        placeholder="Confirm Password *"
        value={password2}
        onChangeText={setPassword2}
        secureTextEntry
        containerStyle={styles.inputContainer}
      />

      <PrimaryButton
        title="Create Account"
        onPress={handleSignup}
        loading={loading}
        style={styles.signupButton}
      />

      <TouchableOpacity onPress={() => router.back()} disabled={loading}>
        <Text style={styles.link}>Already have an account? Login</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.lg,
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
    ...Typography.h4,
    color: Colors.text,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  halfInput: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: Spacing.sm,
  },
  disabledInputContainer: {
    opacity: 0.6,
  },
  signupButton: {
    marginTop: Spacing.md,
  },
  link: {
    ...Typography.bodySmall,
    color: Colors.primary,
    textAlign: "center",
    marginTop: Spacing.lg,
    marginBottom: 30,
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
});