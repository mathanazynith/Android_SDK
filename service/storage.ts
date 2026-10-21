import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const secureStoreKey = (key: string) => key.replace(/[^a-zA-Z0-9._-]/g, "_");

export const storage = {
  async getItem(key: string) {
    if (Platform.OS === "web") {
      return localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(secureStoreKey(key));
  },

  async setItem(key: string, value: string) {
    if (Platform.OS === "web") {
      localStorage.setItem(key, value);
      return;
    }
    return SecureStore.setItemAsync(secureStoreKey(key), value);
  },

  async removeItem(key: string) {
    if (Platform.OS === "web") {
      localStorage.removeItem(key);
      return;
    }
    return SecureStore.deleteItemAsync(secureStoreKey(key));
  },

  // Storage Keys
  KEYS: {
    ACCESS_TOKEN: "access_token",
    REFRESH_TOKEN: "refresh_token",
    USER: "user",
    QUESTIONNAIRE_PROGRESS: "questionnaire_progress",
    QUESTIONNAIRE_ANSWERS: "questionnaire_answers",
    BACKGROUND_LOCATION_PERMISSION_REQUESTED: "background_location_permission_requested",
    TRAINING_PLAN: "training_plan", // ✅ NEW: For saving training plan
    NOTIFICATION_DEVICE_ID: "notification_device_id",
  },
};
