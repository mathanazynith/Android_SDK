# Updating Android test APKs

Use the update build command for each new internal APK:

```powershell
npm run android:apk:update
```

It increments `expo.android.versionCode` in `app.json`, builds a release APK, and saves it at `android/app/build/outputs/apk/release/app-release.apk`. If the generated `android` project is missing, the script creates it with Expo prebuild first. To install the APK over an existing copy and retain that app's local data:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s <device-serial> install -r android/app/build/outputs/apk/release/app-release.apk
```

Or build and install in one step from PowerShell:

```powershell
node .\scripts\build-android-update.js --install <device-serial>
```

`-r` replaces the installed package without clearing its app data. Android permits this only when the package ID and signing certificate match the installed APK. This project currently signs its debug and internal release APKs with `android/app/debug.keystore`; keep that exact file safe and stable for updates made from this workstation. It is ignored by Git and must not be committed or regenerated. To update installs on another workstation, securely provision the same keystore there.

This debug key is for internal testing. A production signing key must be stored and backed up separately, with its passwords kept outside source control. APKs signed with a different key cannot update these test installs in place; decide on the production signing identity before distributing production builds. Version names are user-facing; Android update ordering uses the increasing `versionCode`.

Verify an install with `adb -s <device-serial> shell dumpsys package com.zyapp` and check the reported version code. Keep a test account signed in before installation and reopen the app after; the installer preserves local app data, while server-side authentication/session policy still determines whether a stored session remains valid.
