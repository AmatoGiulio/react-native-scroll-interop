'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod, withSettingsGradle } = require('expo/config-plugins');
const {
  assertSupportedReactNativeVersion,
  ensureReactNativeSourceBuildSettings,
  patchMainReactPackage,
  patchReactNestedScrollView086,
  patchReactNestedScrollView087,
} = require('./reactNativeScrollCompatPatch');
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

function readPackage(projectRoot, packageName) {
  const packageJsonPath = resolvePackageJson(projectRoot, packageName);
  return {
    packageJsonPath,
    root: path.dirname(packageJsonPath),
    json: JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')),
  };
}

function patchReactNativeScrollSource(projectRoot) {
  const reactNative = readPackage(projectRoot, 'react-native');
  const line = assertSupportedReactNativeVersion(reactNative.json.version);

  const scrollPath = path.join(
    reactNative.root,
    'ReactAndroid',
    'src',
    'main',
    'java',
    'com',
    'facebook',
    'react',
    'views',
    'scroll',
    line === '0.86' ? 'ReactNestedScrollView.java' : 'ReactNestedScrollView.kt'
  );
  const mainPackagePath = path.join(
    reactNative.root,
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
        `[react-native-scroll-interop] Missing expected React Native ${line}.x source file: ${filePath}. ` +
          'Refusing to enable reactNativeScrollCompat.'
      );
    }
  }

  const originalScroll = fs.readFileSync(scrollPath, 'utf8');
  const patchedScroll =
    line === '0.86'
      ? patchReactNestedScrollView086(originalScroll)
      : patchReactNestedScrollView087(originalScroll);
  if (patchedScroll !== originalScroll) fs.writeFileSync(scrollPath, patchedScroll);

  const originalMainPackage = fs.readFileSync(mainPackagePath, 'utf8');
  const patchedMainPackage = patchMainReactPackage(originalMainPackage);
  if (patchedMainPackage !== originalMainPackage) {
    fs.writeFileSync(mainPackagePath, patchedMainPackage);
  }

  console.log(
    `[react-native-scroll-interop] RN ${reactNative.json.version}: AndroidX nested ScrollView compatibility enabled.`
  );
}

function patchReactNativeScreensSource(projectRoot) {
  const screens = readPackage(projectRoot, 'react-native-screens');
  assertSupportedReactNativeScreensVersion(screens.json.version);

  const screenPath = path.join(
    screens.root,
    'android',
    'src',
    'main',
    'java',
    'com',
    'swmansion',
    'rnscreens',
    'Screen.kt'
  );
  const gradlePath = path.join(screens.root, 'android', 'build.gradle');

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
  if (patchedScreen !== originalScreen) fs.writeFileSync(screenPath, patchedScreen);

  const originalGradle = fs.readFileSync(gradlePath, 'utf8');
  const patchedGradle = patchReactNativeScreensGradle(originalGradle);
  if (patchedGradle !== originalGradle) fs.writeFileSync(gradlePath, patchedGradle);

  console.log(
    `[react-native-scroll-interop] react-native-screens ${screens.json.version}: Screen nested-scroll ownership enabled.`
  );
}

function withScrollInterop(config, props = {}) {
  const scrollCompatEnabled = props?.android?.reactNativeScrollCompat === true;
  const screensInteropEnabled = props?.android?.reactNativeScreensInterop === true;

  if (!scrollCompatEnabled && !screensInteropEnabled) return config;

  if (scrollCompatEnabled) {
    config = withSettingsGradle(config, (config) => {
      if (config.modResults.language !== 'groovy') {
        throw new Error(
          '[react-native-scroll-interop] reactNativeScrollCompat currently requires android/settings.gradle (Groovy).'
        );
      }

      const reactNative = readPackage(config.modRequest.projectRoot, 'react-native');
      assertSupportedReactNativeVersion(reactNative.json.version);
      config.modResults.contents = ensureReactNativeSourceBuildSettings(config.modResults.contents);
      return config;
    });
  }

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      if (scrollCompatEnabled) patchReactNativeScrollSource(config.modRequest.projectRoot);
      if (screensInteropEnabled) patchReactNativeScreensSource(config.modRequest.projectRoot);
      return config;
    },
  ]);

  return config;
}

module.exports = withScrollInterop;
module.exports.patchReactNativeScrollSource = patchReactNativeScrollSource;
module.exports.patchReactNativeScreensSource = patchReactNativeScreensSource;
