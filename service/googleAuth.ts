// Google Sign-In for Android using Android Client ID
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const AuthSession: any = require("expo-auth-session");
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

const extra = Constants.expoConfig?.extra ?? {};

// Use ONLY Android Client ID for native Android apps
const ANDROID_CLIENT_ID = extra.googleAndroidClientId;

console.log("🔑 Android Client ID loaded for native Android app");

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
};

const SCOPES = ["openid", "profile", "email"];

// For native Android, use the app's native scheme
// This doesn't need to be registered in Google Console for Android apps
const REDIRECT_URI = AuthSession.makeRedirectUri({
  scheme: "com.zyapp",
});

console.log("📍 Native Android Redirect URI:", REDIRECT_URI);

class GoogleAuthService {
  private authRequest: any = null;

  isConfigured() {
    return Boolean(ANDROID_CLIENT_ID && ANDROID_CLIENT_ID.trim());
  }

  async signInWithGoogle() {
    if (!this.isConfigured()) {
      throw new Error(
        "Android Client ID not configured. Check app.json extra.googleAndroidClientId"
      );
    }

    await WebBrowser.warmUpAsync();

    try {
      console.log("🚀 Starting Google Sign-In with Android Client ID...");

      // Create auth request with Authorization Code flow (proper for Android)
      this.authRequest = new AuthSession.AuthRequest({
        clientId: ANDROID_CLIENT_ID,
        redirectUri: REDIRECT_URI,
        scopes: SCOPES,
        responseType: AuthSession.ResponseType.Code,
        usePKCE: true,
        extraParams: {
          prompt: "select_account",
          access_type: "offline",
        },
      });

      console.log("📱 Prompting user for Google Sign-In...");

      // Use native redirect (no proxy needed for Android native apps)
      const result = await this.authRequest.promptAsync(GOOGLE_DISCOVERY);

      console.log("✅ Auth flow completed:", result.type);

      if (result.type !== "success") {
        throw new Error(`Google Sign-In was cancelled: ${result.type}`);
      }

      if (!result.params.code) {
        throw new Error("No authorization code received from Google");
      }

      console.log("📦 Exchanging authorization code for tokens...");

      // Exchange the authorization code for tokens
      const tokenResponse = await this.authRequest.performCodeExchangeAsync(result);

      console.log("🎫 Tokens received successfully");

      const idToken = tokenResponse.idToken;

      if (!idToken) {
        throw new Error("No ID token received from Google");
      }

      // Decode the JWT to get user info
      const payload = JSON.parse(atob(idToken.split(".")[1]));

      console.log("👤 User authenticated:", payload.email);

      return {
        idToken,
        accessToken: tokenResponse.accessToken ?? "",
        user: {
          email: payload.email,
          name: payload.name,
          given_name: payload.given_name,
          family_name: payload.family_name,
          picture: payload.picture,
        },
      };
    } catch (error: any) {
      console.error("❌ Google Sign-In Error:", {
        message: error?.message,
        code: error?.code,
      });
      throw error;
    } finally {
      await WebBrowser.coolDownAsync();
    }
  }
}

export const googleAuthService = new GoogleAuthService();