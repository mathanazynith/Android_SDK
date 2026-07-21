import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthState } from '../types/auth';
import { AuthRepository } from '../repositories/authRepository';
import { router } from 'expo-router';

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, otp: string, newPassword: string) => Promise<void>;
  verifyOTP: (email: string, otp: string) => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const authRepository = new AuthRepository();

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const user = await authRepository.getStoredUser();
      const token = await authRepository.getAccessToken();
      
      if (user && token) {
        setState({
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: 'Authentication failed',
      });
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      const { user, tokens } = await authRepository.login({ email, password });
      await authRepository.saveTokens(tokens);
      await authRepository.saveUser(user);
      setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.response?.data?.detail || 'Login failed',
      }));
      throw error;
    }
  };

  const signup = async (email: string, password: string, name: string) => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      const { user, tokens } = await authRepository.signup({ email, password, name });
      await authRepository.saveTokens(tokens);
      await authRepository.saveUser(user);
      setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.response?.data?.detail || 'Signup failed',
      }));
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authRepository.logout();
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
      router.replace('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const forgotPassword = async (email: string) => {
    try {
      await authRepository.forgotPassword(email);
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to send reset link');
    }
  };

  const resetPassword = async (email: string, otp: string, newPassword: string) => {
    try {
      await authRepository.resetPassword({ email, otp, newPassword });
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Failed to reset password');
    }
  };

  const verifyOTP = async (email: string, otp: string) => {
    try {
      await authRepository.verifyOTP(email, otp);
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'OTP verification failed');
    }
  };

  const updateProfile = async (data: Partial<User>) => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      const updatedUser = await authRepository.updateProfile(data);
      await authRepository.saveUser(updatedUser);
      setState(prev => ({
        ...prev,
        user: updatedUser,
        isLoading: false,
      }));
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.response?.data?.detail || 'Profile update failed',
      }));
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        signup,
        logout,
        forgotPassword,
        resetPassword,
        verifyOTP,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};