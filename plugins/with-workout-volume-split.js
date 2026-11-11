const fs = require('fs/promises');
const path = require('path');
const {
  createRunOncePlugin,
  withDangerousMod,
  withMainActivity,
  withMainApplication,
} = require('expo/config-plugins');

const MODULE_FILES = [
  'WorkoutVolumeSplitModule.kt',
  'WorkoutVolumeSplitPackage.kt',
];

const withVolumeSplitMainActivity = (config) => withMainActivity(config, (modConfig) => {
  let source = modConfig.modResults.contents;
  if (!source.includes('WorkoutVolumeSplitModule.dispatchVolumeButtonPress()')) {
    if (!source.includes('import android.view.KeyEvent')) {
      source = source.replace('import android.os.Bundle', 'import android.os.Bundle\nimport android.view.KeyEvent');
    }
    source = source.replace(
      'class MainActivity : ReactActivity() {',
      `class MainActivity : ReactActivity() {
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val isVolumeButton = event.keyCode == KeyEvent.KEYCODE_VOLUME_UP
      || event.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN
    if (WorkoutVolumeSplitModule.isEnabled && isVolumeButton) {
      if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
        WorkoutVolumeSplitModule.dispatchVolumeButtonPress()
      }
      return true
    }
    return super.dispatchKeyEvent(event)
  }
`,
    );
  }
  modConfig.modResults.contents = source;
  return modConfig;
});

const withVolumeSplitMainApplication = (config) => withMainApplication(config, (modConfig) => {
  let source = modConfig.modResults.contents;
  if (!source.includes('import com.zyapp.WorkoutVolumeSplitPackage')) {
    source = source.replace(
      /^(package [^\n]+\n)/,
      '$1\nimport com.zyapp.WorkoutVolumeSplitPackage\n',
    );
  }
  if (!source.includes('add(WorkoutVolumeSplitPackage())')) {
    source = source.replace(
      /(PackageList\(this\)\.packages\.apply\s*\{)/,
      '$1\n          add(WorkoutVolumeSplitPackage())',
    );
  }
  modConfig.modResults.contents = source;
  return modConfig;
});

const withVolumeSplitSources = (config) => withDangerousMod(config, ['android', async (modConfig) => {
  const projectRoot = modConfig.modRequest.projectRoot;
  const platformProjectRoot = modConfig.modRequest.platformProjectRoot || path.join(projectRoot, 'android');
  const sourceDirectory = path.join(projectRoot, 'plugins', 'android');
  const packageDirectory = path.join(platformProjectRoot, 'app', 'src', 'main', 'java', 'com', 'zyapp');
  await fs.mkdir(packageDirectory, { recursive: true });
  await Promise.all(MODULE_FILES.map((fileName) => (
    fs.copyFile(path.join(sourceDirectory, fileName), path.join(packageDirectory, fileName))
  )));
  return modConfig;
}]);

const withWorkoutVolumeSplit = (config) => {
  config = withVolumeSplitMainActivity(config);
  config = withVolumeSplitMainApplication(config);
  return withVolumeSplitSources(config);
};

module.exports = createRunOncePlugin(withWorkoutVolumeSplit, 'with-workout-volume-split', '1.0.0');
