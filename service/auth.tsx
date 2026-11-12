import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { authAPI } from "./api";
import { subscribeToFcmTokenRefresh } from "./fcmService";
import "./googleAuth"; // Ensure GoogleAuthService is initialized
import { googleAuthService } from "./googleAuth";
import {
  clearBackgroundLocationSession,
  stopBackgroundLocationTracking,
} from "../src/services/backgroundLocationTask";
import { clearActiveRunJournal } from "../src/services/activeRunJournal";
import { clearLiveTrackingNotificationForAuthExit } from "../src/services/liveTrackingNotification";
import {
  deactivateNotificationDevice,
  registerNotificationDevice,
} from "./notificationService";
import { storage } from "./storage";

interface User {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
  password_setup_required?: boolean;
  hasPassword?: boolean;
  auth_provider?: string;
  has_password?: boolean;
  authProvider?: string;
  provider?: string;
  profile?: {
    date_of_birth?: string;
    gender?: string;
    blood_group?: string;
    height_cm?: number | null;
    weight_kg?: number | null;
    phone_number?: string;
    distance_unit?: string;
    profile_picture?: string; // ✅ unified field
    profile_picture_url?: string;
  };
}

interface SignupData {
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  password: string;
  password2: string;
  phone_number?: string;
}

interface ProfileData {
  first_name?: string;
  last_name?: string;
  username?: string;
  date_of_birth?: string | null;
  gender?: string | null;
  blood_group?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  phone_number?: string | null;
  distance_unit?: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  signup: (data: SignupData) => Promise<any>;
  verifyOtp: (email: string, otpcode: string) => Promise<void>;
  resendOtp: (email: string, purpose: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: ProfileData) => Promise<void>;
  uploadProfilePicture: (file: { uri: string; name: string; type: string }) => Promise<void>;
  updatePassword: (payload: {
    currentPassword?: string;
    newPassword: string;
    confirmPassword: string;
  }) => Promise<void>;
  refreshProfile: () => Promise<void>;
  googleLogin: () => Promise<{ requiresSignup: boolean; cancelled?: boolean }>;
  googleSignupData: {
    email: string;
    first_name: string;
    last_name: string;
  } | null;
  setGoogleSignupData: (data: {
    email: string;
    first_name: string;
    last_name: string;
  } | null) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const normalizeUser = (value: unknown): User | null => {
  if (!value || typeof value !== "object") return null;

  const raw = value as Partial<User> & Record<string, unknown>;
  const rawId: unknown = raw.id;
  const id = typeof rawId === "number"
    ? rawId
    : typeof rawId === "string" && /^\d+$/.test(rawId.trim())
      ? Number(rawId)
      : Number.NaN;
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const provider = String(raw.authProvider ?? raw.auth_provider ?? raw.provider ?? '').toLowerCase();
  const explicitHasPassword = raw.hasPassword ?? raw.has_password;
  const hasPassword = typeof raw.password_setup_required === 'boolean'
    ? !raw.password_setup_required
    : typeof explicitHasPassword === 'boolean'
      ? explicitHasPassword
      : undefined;

  return { ...raw, id, hasPassword, authProvider: provider || undefined } as User;
};

const clearLiveRunState = async (reason: string) => {
  // Invalidate updates immediately, stop the producer, then finish dismissal
  // before clearing durable state.
  const notificationDismissal = clearLiveTrackingNotificationForAuthExit();
  await stopBackgroundLocationTracking().catch((error) => {
    console.warn(`[Auth] Could not stop background tracking during ${reason}`, error);
  });
  await notificationDismissal.catch((error) => {
    console.warn(`[Auth] Could not dismiss the live notification during ${reason}`, error);
  });
  await Promise.all([
    clearBackgroundLocationSession(),
    clearActiveRunJournal(),
  ]).catch((error) => {
    console.warn(`[Auth] Could not clear the active run during ${reason}`, error);
  });
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isLoggingOut = useRef(false);
  const previousUserIdRef = useRef<string | null>(null);

  const storeUser = async (userObj: User | null) => {
    try {
      if (userObj) {
        await storage.setItem(storage.KEYS.USER, JSON.stringify(userObj));
      } else {
        await storage.removeItem(storage.KEYS.USER);
      }
    } catch (e) {
      console.warn('[Auth] Failed to persist user to storage', e);
    }
  };
  const [googleSignupData, setGoogleSignupData] = useState<{
    email: string;
    first_name: string;
    last_name: string;
  } | null>(null);

  const initializeAuth = async () => {
    try {
      const [token, cachedUserJson] = await Promise.all([
        storage.getItem(storage.KEYS.ACCESS_TOKEN),
        storage.getItem(storage.KEYS.USER),
      ]);

      let restoredUser: User | null = null;
      if (cachedUserJson) {
        try {
          restoredUser = normalizeUser(JSON.parse(cachedUserJson));
        } catch (parseError) {
          console.warn('[Auth] Failed to parse cached user', parseError);
        }
      }

      if (token) {
        isLoggingOut.current = false;
        if (restoredUser) setUser(restoredUser);

        try {
          const response = await authAPI.getProfile();
          isLoggingOut.current = false;
          const freshUser = normalizeUser(response.data?.data || response.data);
          if (freshUser) {
            setUser(freshUser);
            await storeUser(freshUser);
          } else if (!restoredUser) {
            throw new Error('The profile response did not contain a valid user ID.');
          }
        } catch (error: any) {
          const status = error?.response?.status;
          const isNetworkError =
            !error?.response ||
            error?.code === 'ECONNABORTED' ||
            error?.message?.toLowerCase().includes('network') ||
            error?.message?.toLowerCase().includes('timeout') ||
            error?.message?.toLowerCase().includes('connection') ||
            error?.message?.toLowerCase().includes('failed');

          if (isNetworkError) {
            if (restoredUser) {
              console.log('[Auth] Offline mode detected during initialization; maintaining cached session.');
              isLoggingOut.current = false;
              setUser(restoredUser);
            } else {
              // Keep credentials for a retry, but never invent a user identity.
              setUser(null);
            }
          } else if (status === 401 || status === 403) {
            await storage.removeItem(storage.KEYS.ACCESS_TOKEN);
            await storage.removeItem(storage.KEYS.REFRESH_TOKEN);
            await clearLiveRunState('token invalidation');
            await storeUser(null);
            setUser(null);
          } else if (!restoredUser) {
            await storage.removeItem(storage.KEYS.ACCESS_TOKEN);
            await storage.removeItem(storage.KEYS.REFRESH_TOKEN);
            await clearLiveRunState('unverified startup session');
            await storeUser(null);
            setUser(null);
          }
        }
      } else {
        await clearLiveRunState('signed-out startup');
        await storeUser(null);
        setUser(null);
      }
    } catch (error) {
      console.warn('[Auth] Unexpected error during initializeAuth:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(initializeAuth);
  }, []);

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    const currentUserId = user?.id == null ? null : String(user.id);

    const shouldClearLiveRun = previousUserId !== null
      && (currentUserId === null || previousUserId !== currentUserId);

    if (shouldClearLiveRun) {
      void clearLiveRunState('account switch or logout');
    }

    previousUserIdRef.current = currentUserId;
  }, [user?.id]);

  useEffect(() => {
    const userId = user?.id;
    if (isLoading || userId == null) return;

    let isActive = true;
    const registerToken = async (token: string) => {
      if (!isActive || isLoggingOut.current || !token) return;
      try {
        await registerNotificationDevice(userId, token);
      } catch (error) {
        console.warn('[Notifications] Device registration failed', error);
      }
    };
    const unsubscribe = subscribeToFcmTokenRefresh((token: string) => {
      void registerToken(token);
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [isLoading, user?.id]);

  const validateToken = (value: unknown, name: string): string => {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`Invalid ${name} received from authentication response.`);
    }
    return value;
  };

  const storeTokens = async (access: string, refresh: string) => {
    await storage.setItem(storage.KEYS.ACCESS_TOKEN, access);
    await storage.setItem(storage.KEYS.REFRESH_TOKEN, refresh);
  };

  const restoreStorageValue = async (key: string, value: string | null) => {
    if (value === null) await storage.removeItem(key);
    else await storage.setItem(key, value);
  };

  const establishTokenSession = async (
    accessToken: string,
    refreshToken: string,
    responseUser: unknown,
    operation: 'login' | 'OTP verification' | 'Google sign-in',
  ): Promise<User> => {
    const previousAccess = await storage.getItem(storage.KEYS.ACCESS_TOKEN);
    const previousRefresh = await storage.getItem(storage.KEYS.REFRESH_TOKEN);
    let userToSet = normalizeUser(responseUser);

    try {
      await storeTokens(accessToken, refreshToken);
      if (!userToSet) {
        const profileResponse = await authAPI.getProfile();
        userToSet = normalizeUser(profileResponse.data?.data || profileResponse.data);
      }
      if (!userToSet) {
        throw new Error(`The ${operation} response did not contain a valid user ID.`);
      }
      return userToSet;
    } catch (error) {
      await Promise.all([
        restoreStorageValue(storage.KEYS.ACCESS_TOKEN, previousAccess),
        restoreStorageValue(storage.KEYS.REFRESH_TOKEN, previousRefresh),
      ]).catch((restoreError) => {
        console.warn(`[Auth] Could not restore token storage after ${operation} failed`, restoreError);
      });
      throw error;
    }
  };

  const resolveAuthPayload = (response: any) => {
    const payload = response.data?.data || response.data || {};
    const tokens = payload.tokens || response.data?.tokens || response.tokens;
    const user = payload.user || response.data?.user || response.user;

    return {
      accessToken: validateToken(tokens?.access, "access token"),
      refreshToken: validateToken(tokens?.refresh, "refresh token"),
      user,
    };
  };

  const login = async (identifier: string, password: string) => {
    const response = await authAPI.login({ identifier, password });
    const { accessToken, refreshToken, user: loggedInUser } = resolveAuthPayload(response);
    const userToSet = await establishTokenSession(accessToken, refreshToken, loggedInUser, 'login');
    isLoggingOut.current = false;
    setUser(userToSet);
    await storeUser(userToSet);
  };

  const signup = async (data: SignupData) => {
    const response = await authAPI.signup(data);
    return response.data;
  };

  const verifyOtp = async (email: string, otpcode: string) => {
    const response = await authAPI.verifyOtp({ email, otp_code: otpcode });
    const { accessToken, refreshToken, user: verifiedUser } = resolveAuthPayload(response);
    const userToSet = await establishTokenSession(accessToken, refreshToken, verifiedUser, 'OTP verification');
    isLoggingOut.current = false;
    setUser(userToSet);
    await storeUser(userToSet);
  };

  const resendOtp = async (email: string, purpose: string) => {
    await authAPI.resendOtp({ email, purpose });
  };

  const refreshProfile = async () => {
    const response = await authAPI.getProfile();
    const userToSet = normalizeUser(response.data.data);
    setUser(userToSet);
    await storeUser(userToSet);
  };

  const updateProfile = async (data: ProfileData) => {
    const response = await authAPI.updateProfile(data);
    const userToSet = normalizeUser(response.data.data);
    setUser(userToSet);
    await storeUser(userToSet);
  };

  const uploadProfilePicture = async (file: { uri: string; name: string; type: string }) => {
    const formData = new FormData();
    formData.append("profile_picture", {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);

    const response = await authAPI.uploadProfilePicture(formData);
    const updatedUser = response.data?.data || response.data;
    await storage.setItem(storage.KEYS.USER, JSON.stringify(updatedUser));
    setUser(normalizeUser(updatedUser));
  };

  const updatePassword = async (payload: {
    currentPassword?: string;
    newPassword: string;
    confirmPassword: string;
  }) => {
    await authAPI.updatePassword(payload);
    setUser((currentUser) => currentUser ? { ...currentUser, hasPassword: true } : currentUser);
  };

  const logout = async () => {
    isLoggingOut.current = true;
    if (user) {
      try {
        await deactivateNotificationDevice(user.id);
      } catch (error) {
        console.warn('[Notifications] Device deactivation failed during logout', error);
      }
    }

    try {
      await clearLiveRunState('logout');

      const refreshToken = await storage.getItem(storage.KEYS.REFRESH_TOKEN);
      await authAPI.logout({ refresh: refreshToken || "" });
    } catch (error) {
    } finally {
      await storage.removeItem(storage.KEYS.ACCESS_TOKEN);
      await storage.removeItem(storage.KEYS.REFRESH_TOKEN);
      await storeUser(null);
      setUser(null);
      setGoogleSignupData(null);
    }
  };

  const googleLogin = async (): Promise<{ requiresSignup: boolean; cancelled?: boolean }> => {
    try {
      setIsLoading(true);

      if (!googleAuthService.isConfigured()) {
        throw new Error(
          "Google Sign-In is not configured. Please check your Google Client ID."
        );
      }

      const result = await googleAuthService.signInWithGoogle();
      if (!result) {
        setIsLoading(false);
        return { requiresSignup: false, cancelled: true };
      }

      const response = await authAPI.googleLogin({
        id_token: result.idToken,
      });

      const apiResponse = response?.data ?? {};
      const payload = apiResponse.data ?? apiResponse;
      const requiresSignup = Boolean(
        payload?.requires_signup === true ||
          payload?.requiresSignup === true ||
          payload?.user_exists === false ||
          payload?.userExists === false ||
          apiResponse?.requires_signup === true ||
          apiResponse?.requiresSignup === true ||
          apiResponse?.user_exists === false ||
          apiResponse?.userExists === false
      );


      if (requiresSignup) {
        setGoogleSignupData({
          email: result.user.email,
          first_name: result.user.given_name || "",
          last_name: result.user.family_name || "",
        });
        setIsLoading(false);
        return { requiresSignup: true };
      }

      const tokens = payload?.tokens ?? apiResponse?.tokens ?? payload?.token ?? apiResponse?.token;
      const userData = payload?.user ?? apiResponse?.user ?? payload?.data?.user ?? apiResponse?.data?.user;

      if (tokens?.access && tokens?.refresh) {
        let normalizedUser = userData || {};

        if (!normalizedUser.profile?.profile_picture && result.user.picture) {
          normalizedUser = {
            ...normalizedUser,
            profile: {
              ...(normalizedUser.profile || {}),
              profile_picture: result.user.picture,
            },
          };
        }

        const userCandidate = {
          ...normalizedUser,
          authProvider: normalizedUser.authProvider
            ?? normalizedUser.auth_provider
            ?? normalizedUser.provider
            ?? 'google',
        };
        const googleUser = await establishTokenSession(
          validateToken(tokens.access, 'Google access token'),
          validateToken(tokens.refresh, 'Google refresh token'),
          userCandidate,
          'Google sign-in',
        );
        isLoggingOut.current = false;
        setUser(googleUser);
        await storeUser(googleUser);
        setIsLoading(false);
        return { requiresSignup: false };
      }

      throw new Error("Google sign-in did not return a supported access/refresh token pair.");
    } catch (error: any) {
      console.error("Google Login Error:", error);
      setIsLoading(false);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        signup,
        verifyOtp,
        resendOtp,
        logout,
        updateProfile,
        uploadProfilePicture,
        refreshProfile,
        updatePassword,
        googleLogin,
        googleSignupData,
        setGoogleSignupData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
};
