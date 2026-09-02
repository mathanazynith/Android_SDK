import React, {
  createContext,
  useContext,
  useState,
  useEffect,
} from "react";
import { authAPI } from "./api";
import { googleAuthService } from "./googleAuth";
import { storage } from "./storage";
import "./googleAuth"; // Ensure GoogleAuthService is initialized

interface User {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
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
  changePassword: (current_password: string | undefined, password: string, password2: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  googleLogin: () => Promise<{ requiresSignup: boolean }>;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [googleSignupData, setGoogleSignupData] = useState<{
    email: string;
    first_name: string;
    last_name: string;
  } | null>(null);

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      const token = await storage.getItem(storage.KEYS.ACCESS_TOKEN);
      if (token) {
        const response = await authAPI.getProfile();
        setUser(response.data.data);
      }
    } catch (error) {
      console.log("Auth Init Error:", error);
      await storage.removeItem(storage.KEYS.ACCESS_TOKEN);
      await storage.removeItem(storage.KEYS.REFRESH_TOKEN);
    } finally {
      setIsLoading(false);
    }
  };

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
    await storeTokens(accessToken, refreshToken);
    setUser(loggedInUser);
  };

  const signup = async (data: SignupData) => {
    const response = await authAPI.signup(data);
    return response.data;
  };

  const verifyOtp = async (email: string, otpcode: string) => {
    const response = await authAPI.verifyOtp({ email, otp_code: otpcode });
    const { accessToken, refreshToken, user: verifiedUser } = resolveAuthPayload(response);
    await storeTokens(accessToken, refreshToken);
    setUser(verifiedUser);
  };

  const resendOtp = async (email: string, purpose: string) => {
    await authAPI.resendOtp({ email, purpose });
  };

  const refreshProfile = async () => {
    const response = await authAPI.getProfile();
    setUser(response.data.data);
  };

  const updateProfile = async (data: ProfileData) => {
    const response = await authAPI.updateProfile(data);
    setUser(response.data.data);
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
    setUser(updatedUser);
  };

  const changePassword = async (
    current_password: string | undefined,
    password: string,
    password2: string
  ) => {
    await authAPI.changePassword({
      current_password,
      password,
      password2,
    });
  };

  const logout = async () => {
    try {
      const refreshToken = await storage.getItem(storage.KEYS.REFRESH_TOKEN);
      await authAPI.logout({ refresh: refreshToken || "" });
    } catch (error) {
      console.log("Logout Error:", error);
    } finally {
      await storage.removeItem(storage.KEYS.ACCESS_TOKEN);
      await storage.removeItem(storage.KEYS.REFRESH_TOKEN);
      setUser(null);
      setGoogleSignupData(null);
    }
  };

  const googleLogin = async (): Promise<{ requiresSignup: boolean }> => {
    try {
      console.log("Starting Google Login flow...");
      setIsLoading(true);

      if (!googleAuthService.isConfigured()) {
        throw new Error(
          "Google Sign-In is not configured. Please check your Google Client ID."
        );
      }

      const result = await googleAuthService.signInWithGoogle();
      console.log("Google Sign-In successful:", result.user.email);

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

      console.log("Google Login Response:", payload);

      if (requiresSignup) {
        console.log("New user - needs to complete signup");
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

        await storeTokens(tokens.access, tokens.refresh);
        setUser(normalizedUser);
        setIsLoading(false);
        return { requiresSignup: false };
      }

      if (payload?.status === "success" && userData) {
        setUser(userData);
        setIsLoading(false);
        return { requiresSignup: false };
      }

      throw new Error("Invalid response from Google Login API");
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
        changePassword,
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