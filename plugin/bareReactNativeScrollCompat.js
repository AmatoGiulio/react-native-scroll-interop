'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  SOURCE_BUILD_MARKER,
  assertSupportedReactNativeVersion,
  ensureReactNativeSourceBuildPlaceholder,
  patchMainReactPackage,
  patchReactAndroidHermesCompileOnly,
  patchReactNestedScrollView086,
  patchReactNestedScrollView087,
  resolveReactNativePrebuiltHermesCoordinate,
} = require('./reactNativeScrollCompatPatch');

const BARE_REACT_NATIVE_INCLUDE = 'includeBuild("../node_modules/react-native")';
const REACT_ANDROID_SUBSTITUTION =
  'substitute(module("com.facebook.react:react-android")).using(project(":packages:react-native:ReactAndroid"))';
const LEGACY_REACT_NATIVE_SUBSTITUTION =
  'substitute(module("com.facebook.react:react-native")).using(project(":packages:react-native:ReactAndroid"))';
const HERMES_ANDROID_SUBSTITUTION = 'substitute(module("com.facebook.react:hermes-android"))';
const HERMES_ENGINE_SUBSTITUTION = 'substitute(module("com.facebook.react:hermes-engine"))';

function count(contents, token) {
  return contents.split(token).length - 1;
}

function resolvePackageJson(projectRoot, packageName) {
  try {
    return require.resolve(`${packageName}/package.json`, { paths: [projectRoot] });
  } catch (error) {
    throw new Error(
      `[react-native-scroll-interop] Could not resolve ${packageName} from ${projectRoot}. ` +
        'Install dependencies before applying bare React Native compatibility.',
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

function ensureBareReactNativeSourceBuildSettings(contents) {
  if (typeof contents !== 'string') {
    throw new TypeError('[react-native-scroll-interop] Expected bare android/settings.gradle contents.');
  }

  const includeCount = count(contents, BARE_REACT_NATIVE_INCLUDE);
  const hasReactAndroid = contents.includes(REACT_ANDROID_SUBSTITUTION);
  const hasLegacyReactNative = contents.includes(LEGACY_REACT_NATIVE_SUBSTITUTION);
  const hasHermesSourceSubstitution =
    contents.includes(HERMES_ANDROID_SUBSTITUTION) || contents.includes(HERMES_ENGINE_SUBSTITUTION);
  const markerCount = count(contents, SOURCE_BUILD_MARKER);

  if (
    includeCount === 1 &&
    hasReactAndroid &&
    hasLegacyReactNative &&
    !hasHermesSourceSubstitution &&
    markerCount === 1
  ) {
    return contents;
  }

  if (
    includeCount !== 0 ||
    hasReactAndroid ||
    hasLegacyReactNative ||
    hasHermesSourceSubstitution ||
    markerCount !== 0 ||
    contents.includes("includeBuild('../node_modules/react-native')")
  ) {
    const hermesDetail = hasHermesSourceSubstitution
      ? ' Hermes must remain on the prebuilt Android artifact.'
      : '';
    throw new Error(
      '[react-native-scroll-interop] Found a partial or conflicting bare React Native source-build configuration. ' +
        `Refusing to add another includeBuild block.${hermesDetail}`
    );
  }

  const hasReactSettingsPlugin = contents.includes('com.facebook.react.settings');
  const hasAutolinking = contents.includes('autolinkLibrariesFromCommand()');
  const hasGradlePluginBuild =
    contents.includes('includeBuild("../node_modules/@react-native/gradle-plugin")') ||
    contents.includes("includeBuild('../node_modules/@react-native/gradle-plugin')");

  if (!hasReactSettingsPlugin || !hasAutolinking || !hasGradlePluginBuild) {
    throw new Error(
      '[react-native-scroll-interop] Bare android/settings.gradle does not match the validated React Native community template shape.'
    );
  }

  return (
    contents.replace(/\s*$/, '\n') +
    [
      '',
      `// ${SOURCE_BUILD_MARKER}`,
      BARE_REACT_NATIVE_INCLUDE + ' {',
      '  dependencySubstitution {',
      `    ${REACT_ANDROID_SUBSTITUTION}`,
      `    ${LEGACY_REACT_NATIVE_SUBSTITUTION}`,
      '  }',
      '}',
      '',
    ].join('\n')
  );
}

function patchBareReactNativeProject(projectRoot = process.cwd()) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    throw new TypeError('[react-native-scroll-interop] Expected a bare React Native project root.');
  }

  const reactNative = readPackage(projectRoot, 'react-native');
  const line = assertSupportedReactNativeVersion(reactNative.json.version);
  const settingsPath = path.join(projectRoot, 'android', 'settings.gradle');
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
  const reactAndroidBuildPath = path.join(reactNative.root, 'ReactAndroid', 'build.gradle.kts');
  const requiredPaths = [settingsPath, scrollPath, mainPackagePath];
  if (process.platform === 'win32') requiredPaths.push(reactAndroidBuildPath);

  for (const filePath of requiredPaths) {
    if (!fs.existsSync(filePath)) {
      throw new Error(
        `[react-native-scroll-interop] Missing expected bare React Native ${line}.x file: ${filePath}. ` +
          'Refusing to patch an unvalidated project.'
      );
    }
  }

  const originalSettings = fs.readFileSync(settingsPath, 'utf8');
  const patchedSettings = ensureBareReactNativeSourceBuildSettings(originalSettings);
  const originalScroll = fs.readFileSync(scrollPath, 'utf8');
  const patchedScroll =
    line === '0.86'
      ? patchReactNestedScrollView086(originalScroll)
      : patchReactNestedScrollView087(originalScroll);
  const originalMainPackage = fs.readFileSync(mainPackagePath, 'utf8');
  const patchedMainPackage = patchMainReactPackage(originalMainPackage);

  let originalReactAndroidBuild = null;
  let patchedReactAndroidBuild = null;
  if (process.platform === 'win32') {
    const hermesCoordinate = resolveReactNativePrebuiltHermesCoordinate(reactNative.root, projectRoot);
    originalReactAndroidBuild = fs.readFileSync(reactAndroidBuildPath, 'utf8');
    patchedReactAndroidBuild = patchReactAndroidHermesCompileOnly(
      originalReactAndroidBuild,
      hermesCoordinate
    );
  }

  ensureReactNativeSourceBuildPlaceholder(reactNative.root);

  if (patchedSettings !== originalSettings) fs.writeFileSync(settingsPath, patchedSettings);
  if (patchedScroll !== originalScroll) fs.writeFileSync(scrollPath, patchedScroll);
  if (patchedMainPackage !== originalMainPackage) fs.writeFileSync(mainPackagePath, patchedMainPackage);
  if (
    process.platform === 'win32' &&
    patchedReactAndroidBuild !== originalReactAndroidBuild
  ) {
    fs.writeFileSync(reactAndroidBuildPath, patchedReactAndroidBuild);
  }

  console.log(
    `[react-native-scroll-interop] Bare RN ${reactNative.json.version}: AndroidX nested ScrollView compatibility enabled.`
  );
}

if (require.main === module) {
  patchBareReactNativeProject(process.cwd());
}

module.exports = {
  ensureBareReactNativeSourceBuildSettings,
  patchBareReactNativeProject,
};
