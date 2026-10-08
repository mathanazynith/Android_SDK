import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

const extra = Constants.expoConfig?.extra ?? {};

// Use ONLY Android Client ID for native Android apps
const ANDROID_CLIENT_ID = extra.googleAndroidClientId;


const GOOGLE_DISCOVERY = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
};

const SCOPES = ["openid", "profile", "email"];

// IMPORTANT: keep this exact custom scheme in sync with the AndroidManifest
// and the Google Cloud Console native OAuth client configuration.
// For a native Android app, use the app scheme + path exactly registered in Google Cloud.
const REDIRECT_URI = AuthSession.makeRedirectUri({
  native: "com.zyapp:/oauthredirect",
});


const parseGoogleUser = (idToken: string) => {
  const [, payloadPart] = idToken.split(".");
  if (!payloadPart) {
    throw new Error("Invalid Google ID token format");
  }

  const payload = JSON.parse(atob(payloadPart));
  return {
    email: payload.email,
    name: payload.name,
    given_name: payload.given_name,
    family_name: payload.family_name,
    picture: payload.picture,
  };
};

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


      // Use native redirect (no proxy needed for Android native apps)
      const result = await this.authRequest.promptAsync(GOOGLE_DISCOVERY);


      // First, check if we have any tokens/code before checking dismissal
      // (Android native builds might return "dismiss" even on successful auth)

      // Check if we have an authorization code to exchange
      if (result.params?.code) {

        try {
          const codeVerifier = this.authRequest?.codeVerifier ?? "";
          const tokenResponse = await AuthSession.exchangeCodeAsync(
            {
              clientId: this.authRequest.clientId,
              code: result.params.code,
              redirectUri: this.authRequest.redirectUri,
              extraParams: codeVerifier ? { code_verifier: codeVerifier } : undefined,
            },
            GOOGLE_DISCOVERY
          );


          const idToken = tokenResponse.idToken;
          if (!idToken) {
            throw new Error("No ID token received from Google");
          }

          const payload = parseGoogleUser(idToken);

          return {
            idToken,
            accessToken: tokenResponse.accessToken ?? "",
            user: payload,
          };
        } catch (codeExchangeError: any) {
          console.warn(
            "⚠️ Code exchange failed, attempting direct token extraction...",
            codeExchangeError?.message
          );
          // Continue to check for direct tokens below
        }
      }

      // If code exchange didn't work or no code, try to extract tokens from result
      if (result.params?.id_token || result.params?.access_token) {

        const idToken = result.params.id_token;
        const accessToken = result.params.access_token ?? "";

        if (!idToken) {
          throw new Error("No ID token in Google response");
        }

        const payload = parseGoogleUser(idToken);

        return {
          idToken,
          accessToken,
          user: payload,
        };
      }

      // If we reach here, check if it was actually dismissed or if it's an auth failure
      if (result.type === "dismiss" || result.type === "cancel" || result.type === "closed") {
        throw new Error("Google Sign-In was cancelled. Please try again and complete the authentication process.");
      }

      // Generic auth failure
      console.error("❌ Google auth result had no tokens:", {
        type: result.type,
        params: result.params,
      });
      throw new Error("Failed to authenticate with Google. Please try again.");
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