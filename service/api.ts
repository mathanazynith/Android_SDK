import axios from "axios";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { storage } from "./storage";

const API_BASE_URL = (() => {
  if (Platform.OS === "android") {
    if (Constants.isDevice === false) {
      return "http://10.0.2.2:8000/api/v1";
    }
    return "http://192.168.88.20:8000/api/v1";
  }

  if (Platform.OS === "web") {
    return "http://localhost:8000/api/v1";
  }

  return "http://192.168.88.20:8000/api/v1";
})();

console.log("API_BASE_URL", API_BASE_URL);
console.log("Platform.OS", Platform.OS, "isDevice", Constants.isDevice);

export const API_ENDPOINTS = {
  auth: {
    login: "/auth/login/",
    signup: "/auth/signup/",
    forgotPassword: "/auth/password-reset/",
    resetPassword: "/auth/password-reset/confirm/",
    verifyOTP: "/auth/verify-otp/",
    logout: "/auth/logout/",
  },
  user: {
    profile: "/auth/profile/",
    updateProfile: "/auth/profile/",
  },
};

const REFRESH_TOKEN_PATHS = ["/auth/token/refresh/", "/auth/refresh/"];

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

const isRefreshEndpoint = (url?: string) => {
  if (!url) return false;
  return REFRESH_TOKEN_PATHS.some((path) => url.endsWith(path) || url.includes(path));
};

const isAuthEndpoint = (url?: string) => {
  if (!url) return false;
  return [
    API_ENDPOINTS.auth.login,
    API_ENDPOINTS.auth.signup,
    API_ENDPOINTS.auth.logout,
    ...REFRESH_TOKEN_PATHS,
  ].some((path) => url.endsWith(path) || url.includes(path));
};

let isRefreshing = false;
let refreshSubscribers: Array<(token: string | null) => void> = [];

const subscribeTokenRefresh = (callback: (token: string | null) => void) => {
  refreshSubscribers.push(callback);
};

const notifyRefreshSubscribers = (token: string | null) => {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
};

const refreshAccessToken = async (): Promise<string | null> => {
  const refreshToken = await storage.getItem(storage.KEYS.REFRESH_TOKEN);
  if (!refreshToken) return null;

  for (const refreshPath of REFRESH_TOKEN_PATHS) {
    try {
      const response = await axios.post(
        `${API_BASE_URL}${refreshPath}`,
        { refresh: refreshToken },
        { headers: { "Content-Type": "application/json" } }
      );

      const data = response.data;
      const newAccessToken =
        data.access || data.token?.access || data.data?.tokens?.access;
      const newRefreshToken =
        data.refresh || data.token?.refresh || data.data?.tokens?.refresh;

      if (typeof newAccessToken === "string" && newAccessToken.trim()) {
        await storage.setItem(storage.KEYS.ACCESS_TOKEN, newAccessToken);
        if (typeof newRefreshToken === "string" && newRefreshToken.trim()) {
          await storage.setItem(storage.KEYS.REFRESH_TOKEN, newRefreshToken);
        }
        return newAccessToken;
      }
    } catch (refreshError: any) {
      if (refreshError?.response?.status === 404) {
        continue;
      }
      break;
    }
  }

  await storage.removeItem(storage.KEYS.ACCESS_TOKEN);
  await storage.removeItem(storage.KEYS.REFRESH_TOKEN);
  return null;
};

api.interceptors.request.use(
  async (config: any) => {
    try {
      const token = await storage.getItem(storage.KEYS.ACCESS_TOKEN);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      console.log("========== API REQUEST ==========");
      console.log("URL:", `${config.baseURL}${config.url}`);
      console.log("METHOD:", config.method?.toUpperCase());
      console.log("BODY:", config.data);
      return config;
    } catch (error) {
      console.log("REQUEST INTERCEPTOR ERROR:", error);
      return config;
    }
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    console.log("========== API RESPONSE ==========");
    console.log("STATUS:", response.status);
    console.log("DATA:", response.data);
    return response;
  },
  async (error) => {
    const originalRequest = error?.config;
    const status = error?.response?.status;
    const requestUrl = originalRequest?.url;

    console.log("========== API ERROR ==========");
    console.log("MESSAGE:", error?.message);
    console.log("STATUS:", status);
    console.log("RESPONSE DATA:", error?.response?.data);
    if (error.code === "ECONNABORTED") {
      console.log("Request timed out");
    }

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint(requestUrl)
    ) {
      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((token) => {
            if (token) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            } else {
              reject(error);
            }
          });
        });
      }

      isRefreshing = true;
      try {
        const newToken = await refreshAccessToken();
        isRefreshing = false;
        notifyRefreshSubscribers(newToken);

        if (newToken) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        isRefreshing = false;
        notifyRefreshSubscribers(null);
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export const authAPI = {
  signup: (data: {
    email: string;
    username: string;
    first_name: string;
    last_name: string;
    password: string;
    password2: string;
    phone_number?: string;
  }) => api.post("/auth/signup/", data),

  login: (data: { identifier: string; password: string }) =>
    api.post("/auth/login/", data),

  verifyOtp: (data: { email: string; otp_code: string }) =>
    api.post("/auth/verify-otp/", data),

  resendOtp: (data: { email: string; purpose: string }) =>
    api.post("/auth/resend-otp/", data),

  googleLogin: (data: { id_token: string }) =>
    api.post("/auth/google-login/", { id_token: data.id_token }),

  passwordResetRequest: (data: { email: string }) =>
    api.post("/auth/password-reset/", data),

  passwordResetConfirm: (data: {
    email: string;
    otp_code: string;
    password: string;
    password2: string;
  }) => api.post("/auth/password-reset/confirm/", data),

  getProfile: () => api.get("/auth/profile/"),

  updateProfile: (data: any) => api.patch("/auth/profile/", data),

  changePassword: (data: {
    current_password?: string;
    password: string;
    password2: string;
  }) => api.post("/auth/change-password/", data),

  logout: (data: { refresh?: string }) => api.post("/auth/logout/", data),

  adminLogin: (data: { identifier: string; password: string }) =>
    api.post("/auth/admin-login/", data),
};

export const assessmentAPI = {
  getQuestions: () => api.get("/assessments/questions/"),
  start: () => api.post("/assessments/start/"),
  submitAnswers: (assessmentId: number, answers: any[]) =>
    api.post(`/assessments/${assessmentId}/answers/`, { answers }),
  getResults: (assessmentId: number) =>
    api.get(`/assessments/${assessmentId}/results/`),
  back: (assessmentId: number) =>
    api.post(`/assessments/${assessmentId}/answers/back/`),
};

export default api;

