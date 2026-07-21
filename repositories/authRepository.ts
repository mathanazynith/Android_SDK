import api from '../service/api';
import { API_ENDPOINTS } from '../service/api';
import { storage } from '../service/storage';
import { LoginCredentials, SignupCredentials, User, AuthTokens } from '../types/auth';

export class AuthRepository {
  async login(credentials: LoginCredentials): Promise<{ user: User; tokens: AuthTokens }> {
    const response = await api.post(API_ENDPOINTS.auth.login, credentials);
    return response.data;
  }

  async signup(credentials: SignupCredentials): Promise<{ user: User; tokens: AuthTokens }> {
    const response = await api.post(API_ENDPOINTS.auth.signup, credentials);
    return response.data;
  }

  async forgotPassword(email: string): Promise<void> {
    await api.post(API_ENDPOINTS.auth.forgotPassword, { email });
  }

  async resetPassword(data: { email: string; otp: string; newPassword: string }): Promise<void> {
    await api.post(API_ENDPOINTS.auth.resetPassword, data);
  }

  async verifyOTP(email: string, otp: string): Promise<void> {
    await api.post(API_ENDPOINTS.auth.verifyOTP, { email, otp });
  }

  async logout(): Promise<void> {
    try {
      await api.post(API_ENDPOINTS.auth.logout);
    } catch (error) {
      console.error('Logout error:', error);
    }
    await storage.removeItem(storage.KEYS.ACCESS_TOKEN);
    await storage.removeItem(storage.KEYS.REFRESH_TOKEN);
    await storage.removeItem(storage.KEYS.USER);
  }

  async getProfile(): Promise<User> {
    const response = await api.get(API_ENDPOINTS.user.profile);
    return response.data;
  }

  async updateProfile(data: Partial<User>): Promise<User> {
    const response = await api.put(API_ENDPOINTS.user.updateProfile, data);
    return response.data;
  }

  async saveTokens(tokens: AuthTokens): Promise<void> {
    await storage.setItem(storage.KEYS.ACCESS_TOKEN, tokens.access);
    await storage.setItem(storage.KEYS.REFRESH_TOKEN, tokens.refresh);
  }

  async saveUser(user: User): Promise<void> {
    await storage.setItem(storage.KEYS.USER, JSON.stringify(user));
  }

  async getStoredUser(): Promise<User | null> {
    const data = await storage.getItem(storage.KEYS.USER);
    return data ? JSON.parse(data) : null;
  }

  async getAccessToken(): Promise<string | null> {
    return await storage.getItem(storage.KEYS.ACCESS_TOKEN);
  }
}