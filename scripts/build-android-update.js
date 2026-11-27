const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const appConfigPath = path.join(rootDir, 'app.json');
const androidDir = path.join(rootDir, 'android');
const gradleConfigPath = path.join(androidDir, 'app', 'build.gradle');
const apkPath = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const gradleUserHome = path.join(process.env.USERPROFILE || rootDir, '.gradle');
const installIndex = process.argv.indexOf('--install');
const deviceSerial = installIndex >= 0 ? process.argv[installIndex + 1] : undefined;
const runCommand = (command, args, options) => spawnSync(command, args, {
  stdio: 'inherit',
  ...options,
});

if (installIndex >= 0 && (!deviceSerial || deviceSerial.startsWith('--'))) {
  console.error('Usage: node scripts/build-android-update.js [--install <device-serial>]');
  process.exit(1);
}

const appConfig = JSON.parse(fs.readFileSync(appConfigPath, 'utf8').replace(/^\uFEFF/, ''));
const expoConfig = appConfig.expo;
const currentCode = expoConfig?.android?.versionCode;

if (!Number.isSafeInteger(currentCode) || currentCode < 1) {
  console.error('app.json must define expo.android.versionCode as a positive integer.');
  process.exit(1);
}
if (currentCode >= Number.MAX_SAFE_INTEGER) {
  console.error('expo.android.versionCode cannot be incremented safely any further.');
  process.exit(1);
}

if (!fs.existsSync(gradleConfigPath)) {
  console.log('Generating the Android native project with Expo prebuild.');
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const prebuild = runCommand(npx, ['expo', 'prebuild', '--platform', 'android', '--no-install'], {
    cwd: rootDir,
    shell: process.platform === 'win32',
  });
  if (prebuild.error) {
    console.error(`Could not start Expo prebuild: ${prebuild.error.message}`);
    process.exit(1);
  }
  if (prebuild.status !== 0) process.exit(prebuild.status || 1);
}

expoConfig.android.versionCode = currentCode + 1;
console.log(`Building ${expoConfig.android.package} versionCode ${expoConfig.android.versionCode} (previous ${currentCode}).`);

const gradleConfig = fs.readFileSync(gradleConfigPath, 'utf8');
const versionCodePattern = /(^[ \t]*versionCode[ \t]+)[^\r\n]+/m;
const versionNamePattern = /(^[ \t]*versionName[ \t]+)[^\r\n]+/m;
if (!versionCodePattern.test(gradleConfig) || !versionNamePattern.test(gradleConfig)) {
  console.error(`Could not find versionCode/versionName in ${gradleConfigPath}.`);
  process.exit(1);
}
const updatedGradleConfig = gradleConfig
  .replace(versionCodePattern, `$1${expoConfig.android.versionCode}`)
  .replace(versionNamePattern, `$1"${expoConfig.version}"`);
fs.writeFileSync(gradleConfigPath, updatedGradleConfig);
fs.writeFileSync(appConfigPath, `${JSON.stringify(appConfig, null, 2)}\n`);

const gradleWrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const build = runCommand(gradleWrapper, [':app:assembleRelease', '--console=plain'], {
  cwd: androidDir,
  shell: process.platform === 'win32',
  env: { ...process.env, GRADLE_USER_HOME: process.env.GRADLE_USER_HOME || gradleUserHome },
});

if (build.error) {
  console.error(`Could not start Gradle: ${build.error.message}`);
  process.exit(1);
}
if (build.status !== 0) process.exit(build.status || 1);
if (!fs.existsSync(apkPath)) {
  console.error(`Gradle succeeded but the expected APK was not found: ${apkPath}`);
  process.exit(1);
}

console.log(`Update APK ready: ${apkPath}`);

if (deviceSerial) {
  const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const adbPath = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const adb = sdkRoot ? path.join(sdkRoot, 'platform-tools', adbPath) : adbPath;
  const install = runCommand(adb, ['-s', deviceSerial, 'install', '-r', apkPath], {
    shell: process.platform === 'win32' && !sdkRoot,
  });
  if (install.error) {
    console.error(`Could not start adb: ${install.error.message}`);
    process.exit(1);
  }
  if (install.status !== 0) process.exit(install.status || 1);
}
