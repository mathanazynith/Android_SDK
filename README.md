# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

API configuration now uses the deployed backend at https://zyrun.in/ via the Expo environment variable `EXPO_PUBLIC_API_URL`.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Google Sign-In / APK stability

If Google keeps asking for account permission after every APK install, the usual cause is that the Android app identity changed between builds. Google treats a different signing certificate, package name, or OAuth client as a new app and re-prompts consent.

To avoid this:

1. Keep the same Android package name for all daily builds.
2. Sign every daily APK with the same keystore or use a stable release signing key.
3. Keep the same Firebase project and Google Cloud OAuth client for Android.
4. Register the SHA-1 fingerprint of the exact signing key in Firebase and Google Cloud.
5. Keep the same `google-services.json`, `android.package`, and `scheme` values across builds.
6. Do not force `prompt: "select_account"` in Google OAuth requests unless you intentionally want account re-selection.

This repo intentionally avoids forcing an account selection prompt during Google sign-in. The OAuth request should keep the existing Google consent instead of re-triggering it on each re-install.

### Stable Android signing setup

Use one permanent release keystore for all daily QA builds. The project now includes a stable signing configuration at `android/app/build.gradle` and a helper script at `scripts/setup-android-signing.js`.

Run this once for a permanent signing key:

```bash
node scripts/setup-android-signing.js
```

This creates:

- `android/zyrun-release.keystore`
- `android/keystore.properties`

Then keep the generated keystore and the `android/keystore.properties` file in a secure, private location. Do not generate a new keystore for each APK build. The same file must be used for every daily update.

For Firebase/Google OAuth compatibility, add the keystore SHA-1 to:

- Firebase Console → Project Settings → Android app → Add fingerprint
- Google Cloud Console → Credentials → Android OAuth client

If you are building with a different key than the one registered in Google, consent will keep appearing again.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
