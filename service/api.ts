import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import Constants from "expo-constants";

/*
ANDROID EMULATOR:
http://10.0.2.2:8000/api/v1/auth

PHYSICAL DEVICE:
http://192.168.88.22:8000/api/v1/auth
*/

const API_BASE_URL = (() => {
  if (Platform.OS === "android") {
    if (Constants.isDevice === false) {
      return "http://10.0.2.2:8000/api/v1/auth";
    }
    return "http://192.168.88.22:8000/api/v1/auth";
  }

  if (Platform.OS === "web") {
    return "http://localhost:8000/api/v1/auth";
  }

  return "http://192.168.88.22:8000/api/v1/auth";
})();

console.log("API_BASE_URL", API_BASE_URL);
console.log("Platform.OS", Platform.OS, "isDevice", Constants.isDevice);

export const API_ENDPOINTS = {
  auth: {
    login: '/login/',
    signup: '/signup/',
    forgotPassword: '/password-reset/',
    resetPassword: '/password-reset/confirm/',
    verifyOTP: '/verify-otp/',
    logout: '/logout/',
  },
  user: {
    profile: '/profile/',
    updateProfile: '/profile/',
  },
};

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

/* ==========================
   REQUEST INTERCEPTOR
========================== */

api.interceptors.request.use(
  async (config: any) => {
    try {
      const token =
        await SecureStore.getItemAsync(
          "access_token"
        );

      if (token) {
        config.headers.Authorization =
          `Bearer ${token}`;
      }

      console.log(
        "========== API REQUEST =========="
      );
      console.log(
        "URL:",
        `${config.baseURL}${config.url}`
      );
      console.log(
        "METHOD:",
        config.method?.toUpperCase()
      );
      console.log(
        "BODY:",
        config.data
      );

      return config;
    } catch (error) {
      console.log(
        "REQUEST INTERCEPTOR ERROR:",
        error
      );

      return config;
    }
  },
  (error: any) => {
    console.log(
      "REQUEST ERROR:",
      error
    );
    return Promise.reject(error);
  }
);

/* ==========================
   RESPONSE INTERCEPTOR
========================== */

api.interceptors.response.use(
  (response: any) => {
    console.log(
      "========== API RESPONSE =========="
    );
    console.log(
      "STATUS:",
      response.status
    );
    console.log(
      "DATA:",
      response.data
    );

    return response;
  },
  (error: any) => {
    console.log(
      "========== API ERROR =========="
    );

    console.log(
      "MESSAGE:",
      error?.message
    );

    console.log(
      "STATUS:",
      error?.response?.status
    );

    console.log(
      "RESPONSE DATA:",
      error?.response?.data
    );

    if (
      error.code === "ECONNABORTED"
    ) {
      console.log(
        "Request timed out"
      );
    }

    return Promise.reject(error);
  }
);

/* ==========================
   AUTH API
========================== */

export const authAPI = {
  signup: (data: {
    email: string;
    username: string;
    first_name: string;
    last_name: string;
    password: string;
    password2: string;
    phone_number?: string;
    date_of_birth?: string;
    gender?: string;
    blood_group?: string;
    unit_system?: string;
  }) =>
    api.post("/signup/", data),

  login: (data: {
    identifier: string;
    password: string;
  }) =>
    api.post("/login/", data),

  verifyOtp: (data: {
    email: string;
    otp_code: string;
  }) =>
    api.post("/verify-otp/", data),

  resendOtp: (data: {
    email: string;
    purpose: string;
  }) =>
    api.post("/resend-otp/", data),

  googleLogin: (data: {
    id_token: string;
    access_token?: string;
    email?: string;
  }) =>
    api.post("/google-login/", data),

  passwordResetRequest: (data: {
    email: string;
  }) =>
    api.post("/password-reset/", data),

  passwordResetConfirm: (data: {
    email: string;
    otp_code: string;
    password: string;
    password2: string;
  }) =>
    api.post(
      "/password-reset/confirm/",
      data
    ),

  getProfile: () =>
    api.get("/profile/"),

  updateProfile: (data: any) =>
    api.patch("/profile/", data),

  logout: (data: {
    refresh?: string;
  }) =>
    api.post("/logout/", data),

  adminLogin: (data: {
    identifier: string;
    password: string;
  }) =>
    api.post("/admin-login/", data),
};

/* ==========================
   QUESTIONNAIRE API (For future use)
========================== */
export const questionnaireAPI = {
  getQuestions: () =>
    api.get("/questionnaire/questions/"),
  submitAnswers: (data: { answers: any[] }) =>
    api.post("/questionnaire/submit/", data),
};

export default api;

