import { useState, useEffect } from 'react';
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

const OTP_EXPIRY_MINUTES = 5;
const OTP_EXPIRY_SECONDS = OTP_EXPIRY_MINUTES * 60;

export default function VerifyOTPScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(OTP_EXPIRY_SECONDS);
  const [isOtpExpired, setIsOtpExpired] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const { verifyOtp, resendOtp } = useAuth();

  // Countdown timer effect
  useEffect(() => {
    // Reset timer when component mounts (when OTP is sent)
    setTimeRemaining(OTP_EXPIRY_SECONDS);
    setIsOtpExpired(false);
    setAttempts(0);

    const timer = setInterval(() => {
      setTimeRemaining((prevTime) => {
        if (prevTime <= 1) {
          clearInterval(timer);
          setIsOtpExpired(true);
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);

    // Cleanup timer on unmount
    return () => clearInterval(timer);
  }, [email]); // Reset timer if email changes

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleVerify = async () => {
    // Check if OTP is expired (frontend timer)
    if (isOtpExpired) {
      Alert.alert(
        'OTP Expired', 
        'Your OTP has expired. Please request a new one to continue.'
      );
      return;
    }

    // Validate OTP length
    if (!otp || otp.length < 4) {
      Alert.alert('Error', 'Please enter a valid 4-6 digit OTP');
      return;
    }

    // Check if too many attempts (max 5 attempts)
    if (attempts >= 5) {
      Alert.alert(
        'Too Many Attempts',
        'You have exceeded the maximum number of attempts. Please request a new OTP.'
      );
      return;
    }

    setLoading(true);
    try {
      await verifyOtp(email as string, otp);
      
      // Reset attempts on success
      setAttempts(0);
      
      Alert.alert(
        'Success',
        'OTP verified successfully!',
        [
          {
            text: 'Continue',
            onPress: () => {
              console.log('Navigating to dashboard...');
              router.replace('/(app)/dashboard');
            }
          }
        ]
      );
    } catch (error: any) {
      // Increment attempts on failure
      setAttempts((prev) => prev + 1);
      
      // Handle different error scenarios with user-friendly messages
      let errorMessage = 'Invalid OTP. Please check and try again.';
      let errorTitle = 'Verification Failed';
      
      // Check if error has response
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        // Handle specific status codes
        if (status === 400) {
          // Bad request - usually invalid OTP format or expired
          if (data?.message?.toLowerCase().includes('expired')) {
            errorTitle = 'OTP Expired';
            errorMessage = 'Your OTP has expired. Please request a new one.';
            setIsOtpExpired(true);
          } else if (data?.message?.toLowerCase().includes('invalid')) {
            errorMessage = 'Invalid OTP. Please check the code and try again.';
          } else {
            errorMessage = data?.message || 'Invalid OTP. Please try again.';
          }
        } 
        else if (status === 401) {
          errorMessage = 'Invalid OTP. Please check the code and try again.';
        }
        else if (status === 404) {
          errorMessage = 'OTP not found. Please request a new OTP.';
        }
        else if (status === 429) {
          errorTitle = 'Too Many Requests';
          errorMessage = 'Too many attempts. Please wait a moment before trying again.';
        }
        else if (status === 500) {
          errorTitle = 'Server Error';
          errorMessage = 'Something went wrong on our end. Please try again later.';
        }
        else {
          // Use server message if available
          if (data?.message) {
            errorMessage = data.message;
          } else if (typeof data === 'string') {
            errorMessage = data;
          }
        }
      } 
      else if (error.message) {
        // Network or other errors
        if (error.message.includes('network') || error.message.includes('connection')) {
          errorTitle = 'Network Error';
          errorMessage = 'Unable to connect. Please check your internet connection and try again.';
        } else {
          errorMessage = error.message;
        }
      }
      
      // Show remaining attempts message
      const remainingAttempts = 5 - (attempts + 1);
      if (remainingAttempts > 0 && !errorTitle.includes('Expired')) {
        errorMessage += `\n\n${remainingAttempts} attempt${remainingAttempts > 1 ? 's' : ''} remaining.`;
      } else if (remainingAttempts === 0) {
        errorMessage += '\n\nPlease request a new OTP.';
      }
      
      Alert.alert(errorTitle, errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      setResendLoading(true);
      await resendOtp(email as string, 'registration');
      
      // Reset timer and attempts on successful resend
      setTimeRemaining(OTP_EXPIRY_SECONDS);
      setIsOtpExpired(false);
      setOtp(''); // Clear OTP input for security
      setAttempts(0); // Reset attempts
      
      Alert.alert('Success', 'A new OTP has been sent to your email.');
    } catch (error: any) {
      // Handle resend errors
      let errorMessage = 'Failed to resend OTP. Please try again.';
      
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        if (status === 429) {
          errorMessage = 'Too many requests. Please wait a moment before requesting again.';
        } else if (status === 404) {
          errorMessage = 'Email not found. Please check your email address.';
        } else if (status === 500) {
          errorMessage = 'Server error. Please try again later.';
        } else if (data?.message) {
          errorMessage = data.message;
        } else if (typeof data === 'string') {
          errorMessage = data;
        }
      } else if (error.message?.includes('network')) {
        errorMessage = 'Network error. Please check your internet connection.';
      }
      
      Alert.alert('Failed', errorMessage);
    } finally {
      setResendLoading(false);
    }
  };

  // Determine timer color based on remaining time
  const getTimerColor = () => {
    if (isOtpExpired) return Colors.error || '#FF3B30';
    if (timeRemaining <= 60) return Colors.warning || '#FF9500';
    return Colors.primary || '#007AFF';
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

        {/* Timer Display */}
        <View style={styles.timerContainer}>
          <Text style={[styles.timerText, { color: getTimerColor() }]}>
            {isOtpExpired ? 'OTP Expired' : `Time Remaining: ${formatTime(timeRemaining)}`}
          </Text>
          {!isOtpExpired && timeRemaining <= 60 && (
            <Text style={styles.warningText}>Hurry up! OTP is about to expire</Text>
          )}
        </View>

        {/* Attempts counter */}
        {attempts > 0 && !isOtpExpired && (
          <Text style={styles.attemptsText}>
            Attempts: {attempts}/5
          </Text>
        )}

        <AppInput
          placeholder="Enter OTP"
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
          containerStyle={styles.inputContainer}
          inputStyle={styles.otpInput as any}
          editable={!isOtpExpired && attempts < 5}
        />

        <PrimaryButton
          title="Verify OTP"
          onPress={handleVerify}
          loading={loading}
          style={styles.button}
          disabled={isOtpExpired || loading || attempts >= 5}
        />

        <TouchableOpacity
          onPress={handleResend}
          disabled={resendLoading}
          style={styles.resendContainer}
        >
          <Text style={styles.link}>
            {resendLoading ? 'Sending...' : 'Resend OTP'}
          </Text>
        </TouchableOpacity>

        {/* Show expired message with resend prompt */}
        {isOtpExpired && (
          <View style={styles.expiredContainer}>
            <Text style={styles.expiredText}>
              Your OTP has expired. Please click "Resend OTP" to get a new code.
            </Text>
          </View>
        )}

        {/* Show attempts exhausted message */}
        {attempts >= 5 && !isOtpExpired && (
          <View style={styles.expiredContainer}>
            <Text style={styles.expiredText}>
              Maximum attempts exceeded. Please click "Resend OTP" to get a new code.
            </Text>
          </View>
        )}
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
    marginBottom: Spacing.md,
  },
  email: {
    color: Colors.primary,
    fontWeight: '600',
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
  },
  timerText: {
    ...Typography.h2,
    fontWeight: '700',
    fontSize: 20,
    marginBottom: Spacing.xs,
  },
  warningText: {
    ...Typography.bodySmall,
    color: Colors.warning || '#FF9500',
    textAlign: 'center',
    fontWeight: '600',
  },
  attemptsText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.md,
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
  resendContainer: {
    marginTop: Spacing.lg,
  },
  link: {
    ...Typography.bodySmall,
    color: Colors.primary,
    textAlign: "center",
    fontWeight: "600",
  },
  expiredContainer: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: '#FFE5E5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.error || '#FF3B30',
  },
  expiredText: {
    ...Typography.bodySmall,
    color: Colors.error || '#FF3B30',
    textAlign: 'center',
  },
});