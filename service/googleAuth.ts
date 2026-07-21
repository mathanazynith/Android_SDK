// Suppress TS error when ambient types for expo-auth-session are missing
// and load dynamically so runtime works even if types aren't installed.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const AuthSession: any = require("expo-auth-session");
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_DISCOVERY = {
  authorizationEndpoint:
    "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint:
    "https://oauth2.googleapis.com/token",
  revocationEndpoint:
    "https://oauth2.googleapis.com/revoke",
};

const extra = Constants.expoConfig?.extra ?? {};

const WEB_CLIENT_ID = extra.googleWebClientId;
const ANDROID_CLIENT_ID = extra.googleAndroidClientId;

const isExpoGo = Constants.appOwnership === "expo";

function getClientId() {
  return isExpoGo
    ? WEB_CLIENT_ID
    : ANDROID_CLIENT_ID;
}

const REDIRECT_URI = AuthSession.makeRedirectUri({
  scheme: "zyapp",
  path: "auth/google",
});

console.log("Google Client:", getClientId());
console.log("Redirect URI:", REDIRECT_URI);
console.log("Expo Go:", isExpoGo);

const SCOPES = [
  "openid",
  "profile",
  "email",
];

class GoogleAuthService {
  private authRequest: any = null;

  isConfigured() {
    const clientId = getClientId();
    return Boolean(clientId && clientId.trim());
  }

  async initializeGoogleSignIn() {
    const clientId = getClientId();

    if (!this.isConfigured()) {
      throw new Error("Google Client ID missing.");
    }

    this.authRequest = new AuthSession.AuthRequest({
      clientId,
      redirectUri: REDIRECT_URI,
      scopes: SCOPES,
      responseType: AuthSession.ResponseType.IdToken,
      usePKCE: false,
      extraParams: {
        prompt: "select_account",
      },
    });

    return this.authRequest;
  }

  async signInWithGoogle() {
    await WebBrowser.warmUpAsync();

    try {
      const request =
        await this.initializeGoogleSignIn();

      const result =
        await request.promptAsync(GOOGLE_DISCOVERY);

      console.log(result);

      if (result.type !== "success") {
        throw new Error("Google Login cancelled.");
      }

      const idToken = result.params.id_token;

      if (!idToken) {
        throw new Error("id_token missing.");
      }

      const payload = JSON.parse(
        atob(idToken.split(".")[1])
      );

      return {
        idToken,
        accessToken: result.params.access_token ?? "",
        user: {
          email: payload.email,
          name: payload.name,
          given_name: payload.given_name,
          family_name: payload.family_name,
          picture: payload.picture,
        },
      };
    } finally {
      await WebBrowser.coolDownAsync();
    }
  }
}

export const googleAuthService =
  new GoogleAuthService();