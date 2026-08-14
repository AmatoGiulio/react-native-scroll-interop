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

function resolvePackageJson(projectRoot, packageName) {
  try {
    return require.resolve(`${packageName}/package.json`, { paths: [projectRoot] });
  } catch (error) {
    throw new Error(
      `[expo-material-toolbar] Could not resolve ${packageName} from ${projectRoot}. ` +
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
        `[expo-material-toolbar] Missing expected React Native 0.86 source file: ${filePath}. ` +
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
    `[expo-material-toolbar] RN ${reactNativePackage.version}: AndroidX vertical ScrollView compatibility enabled.`
  );
}

function withRn086AndroidXScroll(config, props = {}) {
  const enabled = props?.android?.rn086AndroidXScroll === true;
  if (!enabled) {
    return config;
  }

  config = withSettingsGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error(
        '[expo-material-toolbar] rn086AndroidXScroll currently requires android/settings.gradle (Groovy).'
      );
    }
    config.modResults.contents = ensureReactNativeSourceBuildSettings(config.modResults.contents);
    return config;
  });

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      patchReactNative086Source(config.modRequest.projectRoot);
      return config;
    },
  ]);

  return config;
}

module.exports = withRn086AndroidXScroll;
module.exports.patchReactNative086Source = patchReactNative086Source;
