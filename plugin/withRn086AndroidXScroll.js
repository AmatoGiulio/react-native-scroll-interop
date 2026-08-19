'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod, withSettingsGradle } = require('expo/config-plugins');
const {
  assertSupportedReactNativeVersion,
  ensureReactNativeSourceBuildSettings,
  patchMainReactPackage,
  patchReactNestedScrollView,
} = require('./rn086AndroidXPatch');
const {
  assertSupportedReactNativeScreensVersion,
  patchReactNativeScreensGradle,
  patchScreen,
} = require('./reactNativeScreensInteropPatch');

function resolvePackageJson(projectRoot, packageName) {
  try {
    return require.resolve(`${packageName}/package.json`, { paths: [projectRoot] });
  } catch (error) {
    throw new Error(
      `[react-native-scroll-interop] Could not resolve ${packageName} from ${projectRoot}. ` +
        'Install dependencies before running Expo Prebuild.',
      { cause: error }
    );
  }
}

function patchReactNative086Source(projectRoot) {
  const packageJsonPath = resolvePackageJson(projectRoot, 'react-native');
  const reactNativeRoot = path.dirname(packageJsonPath);
  const reactNativePackage = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  assertSupportedReactNativeVersion(reactNativePackage.version);

  const scrollPath = path.join(
    reactNativeRoot,
    'ReactAndroid',
    'src',
    'main',
    'java',
    'com',
    'facebook',
    'react',
    'views',
    'scroll',
    'ReactNestedScrollView.java'
  );
  const mainPackagePath = path.join(
    reactNativeRoot,
    'ReactAndroid',
    'src',
    'main',
    'java',
    'com',
    'facebook',
    'react',
    'shell',
    'MainReactPackage.kt'
  );

  for (const filePath of [scrollPath, mainPackagePath]) {
    if (!fs.existsSync(filePath)) {
      throw new Error(
        `[react-native-scroll-interop] Missing expected React Native 0.86 source file: ${filePath}. ` +
          'Refusing to enable rn086AndroidXScroll.'
      );
    }
  }

  const originalScroll = fs.readFileSync(scrollPath, 'utf8');
  const patchedScroll = patchReactNestedScrollView(originalScroll);
  if (patchedScroll !== originalScroll) {
    fs.writeFileSync(scrollPath, patchedScroll);
  }

  const originalMainPackage = fs.readFileSync(mainPackagePath, 'utf8');
  const patchedMainPackage = patchMainReactPackage(originalMainPackage);
  if (patchedMainPackage !== originalMainPackage) {
    fs.writeFileSync(mainPackagePath, patchedMainPackage);
  }

  console.log(
    `[react-native-scroll-interop] RN ${reactNativePackage.version}: AndroidX vertical ScrollView compatibility enabled.`
  );
}

function patchReactNativeScreensSource(projectRoot) {
  const packageJsonPath = resolvePackageJson(projectRoot, 'react-native-screens');
  const screensRoot = path.dirname(packageJsonPath);
  const screensPackage = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  assertSupportedReactNativeScreensVersion(screensPackage.version);

  // react-native-screens 4.26.x still uses the legacy native Screen owner. The newer
  // stack/screen/StackScreen.kt source belongs to a later architecture and must not be assumed here.
  const screenPath = path.join(
    screensRoot,
    'android',
    'src',
    'main',
    'java',
    'com',
    'swmansion',
    'rnscreens',
    'Screen.kt'
  );
  const gradlePath = path.join(screensRoot, 'android', 'build.gradle');

  for (const filePath of [screenPath, gradlePath]) {
    if (!fs.existsSync(filePath)) {
      throw new Error(
        `[react-native-scroll-interop] Missing expected react-native-screens 4.26.x file: ${filePath}. ` +
          'Refusing to enable reactNativeScreensInterop.'
      );
    }
  }

  const originalScreen = fs.readFileSync(screenPath, 'utf8');
  const patchedScreen = patchScreen(originalScreen);
  if (patchedScreen !== originalScreen) {
    fs.writeFileSync(screenPath, patchedScreen);
  }

  const originalGradle = fs.readFileSync(gradlePath, 'utf8');
  const patchedGradle = patchReactNativeScreensGradle(originalGradle);
  if (patchedGradle !== originalGradle) {
    fs.writeFileSync(gradlePath, patchedGradle);
  }

  console.log(
    `[react-native-scroll-interop] react-native-screens ${screensPackage.version}: Screen nested-scroll ownership enabled.`
  );
}

function withRn086AndroidXScroll(config, props = {}) {
  const rn086Enabled = props?.android?.rn086AndroidXScroll === true;
  const screensInteropEnabled = props?.android?.reactNativeScreensInterop === true;

  if (!rn086Enabled && !screensInteropEnabled) {
    return config;
  }

  if (rn086Enabled) {
    config = withSettingsGradle(config, (config) => {
      if (config.modResults.language !== 'groovy') {
        throw new Error(
          '[react-native-scroll-interop] rn086AndroidXScroll currently requires android/settings.gradle (Groovy).'
        );
      }
      config.modResults.contents = ensureReactNativeSourceBuildSettings(config.modResults.contents);
      return config;
    });
  }

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      if (rn086Enabled) {
        patchReactNative086Source(config.modRequest.projectRoot);
      }
      if (screensInteropEnabled) {
        patchReactNativeScreensSource(config.modRequest.projectRoot);
      }
      return config;
    },
  ]);

  return config;
}

module.exports = withRn086AndroidXScroll;
module.exports.patchReactNative086Source = patchReactNative086Source;
module.exports.patchReactNativeScreensSource = patchReactNativeScreensSource;
