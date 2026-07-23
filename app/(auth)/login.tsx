import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../service/auth';
import { AppInput } from '../../components/common/AppInput';
import { PrimaryButton } from '../../components/common/PrimaryButton';
import GoogleLoginButton from '../../components/GoogleLoginButton';
import { Colors, Spacing, Typography } from '../../constants/theme';

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errors, setErrors] = useState({
    identifier: '',
    password: '',
  });
  const { login, googleLogin } = useAuth();

  // Validation functions
  const validateIdentifier = (value: string): string => {
    if (!value.trim()) {
      return 'Email or Username is required';
    }
    
    const trimmedValue = value.trim();
    
    // Check if it's an email
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    const isEmail = emailRegex.test(trimmedValue);
    
    // Check if it's a valid username (letters, numbers, underscore, dot, 3-20 chars)
    const usernameRegex = /^[a-zA-Z0-9._]{3,20}$/;
    const isUsername = usernameRegex.test(trimmedValue);
    
    if (!isEmail && !isUsername) {
      return 'Please enter a valid email or username';
    }
    
    return '';
  };

  const validatePassword = (value: string): string => {
    if (!value) {
      return 'Password is required';
    }
    if (value.length < 8) {
      return 'Password must be at least 8 characters';
    }
    return '';
  };

  const validateField = (field: string, value: string) => {
    let error = '';
    switch (field) {
      case 'identifier':
        error = validateIdentifier(value);
        break;
      case 'password':
        error = validatePassword(value);
        break;
    }
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  const handleChange = (field: string, value: string) => {
    switch (field) {
      case 'identifier':
        setIdentifier(value);
        break;
      case 'password':
        setPassword(value);
        break;
    }
    validateField(field, value);
  };

  const handleLogin = async () => {
    // Validate all fields before submission
    const identifierError = validateIdentifier(identifier);
    const passwordError = validatePassword(password);

    // Update all errors
    setErrors({
      identifier: identifierError,
      password: passwordError,
    });

    // Check if any error exists
    if (identifierError || passwordError) {
      Alert.alert(
        
        'Please fill all fields'
      );
      return;
    }

    setLoading(true);
    try {
      await login(identifier.trim(), password);
      router.replace('/(app)/dashboard');
    } catch (error: any) {
      // Handle different types of errors
      let errorMessage = 'Invalid credentials. Please check your email/username and password.';
      
      // Check if error has response status
      if (error.response) {
        // 404 error - user not found
        if (error.response.status === 404) {
          errorMessage = 'Account not found. Please check your email/username or sign up.';
        }
        // 400 error - bad request
        else if (error.response.status === 400) {
          errorMessage = 'Invalid credentials. Please check your email/username and password.';
        }
        // 401 error - unauthorized
        else if (error.response.status === 401) {
          errorMessage = 'Invalid credentials. Please check your email/username and password.';
        }
        // Other errors
        else {
          // Use server error message if available
          if (error.response.data?.message) {
            errorMessage = error.response.data.message;
          } else if (typeof error.response.data === 'string') {
            errorMessage = error.response.data;
          }
        }
      } else if (error.message) {
        // Network or other errors
        errorMessage = error.message;
      }
      
      Alert.alert('Login Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setGoogleLoading(true);
      const result = await googleLogin();
      if (result?.requiresSignup) {
        router.push('/(auth)/signup');
      } else {
        router.replace('/(app)/dashboard');
      }
    } catch (error: any) {
      console.error('Google Login Error:', error);
      Alert.alert(
        'Google Login Failed',
        error.message || 'Unable to sign in with Google. Please try again.'
      );
    } finally {
      setGoogleLoading(false);
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
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to continue your journey</Text>

        <AppInput
          placeholder="Email or Username"
          value={identifier}
          onChangeText={(text) => handleChange('identifier', text)}
          autoCapitalize="none"
          autoCorrect={false}
          containerStyle={styles.inputContainer}
        />
        {!!errors.identifier && (
          <Text style={styles.errorText}>{errors.identifier}</Text>
        )}

        <AppInput
          placeholder="Password"
          value={password}
          onChangeText={(text) => handleChange('password', text)}
          secureTextEntry
          containerStyle={styles.inputContainer}
        />
        {!!errors.password && (
          <Text style={styles.errorText}>{errors.password}</Text>
        )}

        <TouchableOpacity
          style={styles.forgotPassword}
          onPress={() => router.push('/(auth)/forgot-password')}
        >
          <Text style={styles.forgotPasswordText}>Forgot password?</Text>
        </TouchableOpacity>

        <PrimaryButton
          title="Login"
          onPress={handleLogin}
          loading={loading}
          style={styles.loginButton}
        />

        <View style={styles.dividerContainer}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.divider} />
        </View>

        <GoogleLoginButton
          onPress={handleGoogleLogin}
          loading={googleLoading}
          disabled={loading || googleLoading}
        />

        <View style={styles.signupContainer}>
          <Text style={styles.signupText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
            <Text style={styles.signupLink}>Sign Up</Text>
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  title: {
    ...Typography.h1,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
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
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.lg,
  },
  forgotPasswordText: {
    color: Colors.primary,
    ...Typography.bodySmall,
    fontWeight: '500',
  },
  loginButton: {
    marginTop: Spacing.sm,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.lg,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    marginHorizontal: Spacing.md,
    color: Colors.textMuted,
    ...Typography.caption,
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.lg,
  },
  signupText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  signupLink: {
    ...Typography.bodySmall,
    color: Colors.primary,
    fontWeight: '600',
  },
});