import axios from "axios";
import { storage } from "./storage";

const envApiUrl = (process.env.EXPO_PUBLIC_API_URL || "http://18.61.143.223").trim();
const normalizedApiBase = envApiUrl.endsWith("/api/v1")
  ? envApiUrl.replace(/\/+$/, "")
  : `${envApiUrl.replace(/\/+$/, "")}/api/v1`;

export const API_BASE_URL = normalizedApiBase;
export const API_ROOT_URL = API_BASE_URL.replace(/\/api\/v1$/, "");

export const resolveApiUrl = (value?: string | null) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${API_ROOT_URL}${value}`;
  return `${API_BASE_URL}/${value}`;
};

console.log("API_BASE_URL", API_BASE_URL);

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

const normalizeErrorResponse = (value: any): string | null => {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const messages = value
      .map(normalizeErrorResponse)
      .filter((item): item is string => Boolean(item));
    if (messages.length === 0) {
      return null;
    }
    return messages.join(" ");
  }

  if (typeof value === "object") {
    const preferredKeys = ["detail", "message", "non_field_errors", "errors"];
    for (const key of preferredKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const normalized = normalizeErrorResponse(value[key]);
        if (normalized) {
          return normalized;
        }
      }
    }

    const keys = Object.keys(value);
    for (const key of keys) {
      const normalized = normalizeErrorResponse(value[key]);
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
};

export const getBackendErrorMessage = (error: any, fallbackMessage = "An unexpected error occurred."): string => {
  const responseData = error?.response?.data;
  const parsedMessage = normalizeErrorResponse(responseData);
  if (parsedMessage) {
    return parsedMessage;
  }

  if (typeof error?.message === "string" && error.message.trim().length > 0) {
    return error.message;
  }

  return fallbackMessage;
};

export const assessmentAPI = {
  getQuestions: () => api.get("/assessments/questions/"),
  start: () => api.post("/assessments/start/"),
  // submitAnswers: (assessmentId: number, answers: any[]) =>
  //   api.post(`/assessments/${assessmentId}/answers/`, { answers }),

  submitAnswers: async (assessmentId: number, answers: any[]) => {
      const payload = { answers };

      console.log("========== SUBMIT ANSWERS ==========");
      console.log("Assessment ID:", assessmentId);
      console.log("Request URL:", `/assessments/${assessmentId}/answers/`);
      console.log("Payload:");
      console.log(JSON.stringify(payload, null, 2));

      try {
        const response = await api.post(
          `/assessments/${assessmentId}/answers/`,
          payload
        );

        console.log("========== RESPONSE ==========");
        console.log(JSON.stringify(response.data, null, 2));

        return response;
      } catch (error: any) {
        console.log("========== API ERROR ==========");
        console.log("Status:", error?.response?.status);
        console.log(
          "Response:",
          JSON.stringify(error?.response?.data, null, 2)
        );
        throw error;
      }
    },
  goBack: (assessmentId: number) =>
    api.post(`/assessments/${assessmentId}/answers/back/`),
  getResults: (assessmentId: number) =>
    api.get(`/assessments/${assessmentId}/results/`),
};

// The server generates and persists the user's Couch-to-5K calendar after a
// completed assessment.  This is deliberately separate from the assessment
// result, which only contains recommendation metadata.
export const workoutPlanAPI = {
  getCurrent: () => api.get("/workout-plans/current/"),
};

export default api;

