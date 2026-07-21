import { useState } from 'react';
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
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../service/auth';
import { AppInput } from '../../components/common/AppInput';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import { Colors, Spacing, Typography } from '../../constants/theme';

export default function VerifyOTPScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const { verifyOtp, resendOtp } = useAuth();

  const handleVerify = async () => {
    if (!otp || otp.length < 4) {
      Alert.alert('Error', 'Please enter a valid OTP');
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(email as string, otp);
      Alert.alert(
        'Success',
        'OTP verified successfully!',
        [
          {
            text: 'Continue',
            onPress: () => {
              console.log('Navigating to questionnaire...');
              router.replace('/(app)/questionnaire');
            }
          }
        ]
      );
    } catch (error: any) {
      Alert.alert('Verification Failed', error.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      setResendLoading(true);
      await resendOtp(email as string, 'registration');
      Alert.alert('Success', 'OTP resent successfully');
    } catch (error: any) {
      Alert.alert('Failed', error.message || 'Failed to resend OTP');
    } finally {
      setResendLoading(false);
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
        <Text style={styles.title}>Verify OTP</Text>
        <Text style={styles.subtitle}>
          Enter the OTP sent to <Text style={styles.email}>{email}</Text>
        </Text>

        <AppInput
          placeholder="Enter OTP"
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
          containerStyle={styles.inputContainer}
            // inputStyle should be TextStyle; cast to any to avoid TypeScript error
            inputStyle={styles.otpInput as any}
        />

        <PrimaryButton
          title="Verify OTP"
          onPress={handleVerify}
          loading={loading}
          style={styles.button}
        />

        <TouchableOpacity
          onPress={handleResend}
          disabled={resendLoading}
        >
          <Text style={styles.link}>
            {resendLoading ? 'Sending...' : 'Resend OTP'}
          </Text>
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
  email: {
    color: Colors.primary,
    fontWeight: '600',
  },
  inputContainer: {
    marginBottom: Spacing.md,
  },
  otpInput: {
    textAlign: 'center',
    fontSize: 20,
    letterSpacing: 8,
  },
  button: {
    marginTop: Spacing.sm,
  },
  link: {
    ...Typography.bodySmall,
    color: Colors.primary,
    textAlign: "center",
    marginTop: Spacing.lg,
    fontWeight: "600",
  },
});