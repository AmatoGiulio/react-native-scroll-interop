'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SOURCE_BUILD_MARKER = 'REACT_NATIVE_SCROLL_INTEROP_SOURCE_BUILD';
const MANAGER_MARKER = 'REACT_NATIVE_SCROLL_INTEROP_NESTED_MANAGER';
const RN086_FLING_MARKER = 'REACT_NATIVE_SCROLL_INTEROP_RN086_ANDROIDX_FLING';
const RN087_FLING_MARKER = 'REACT_NATIVE_SCROLL_INTEROP_RN087_ANDROIDX_FLING';
const PREBUILT_HERMES_COMPILE_ONLY_MARKER =
  'REACT_NATIVE_SCROLL_INTEROP_PREBUILT_HERMES_COMPILE_ONLY';
const RN_SOURCE_BUILD_PLACEHOLDER_ASSIGNMENTS = [
  'project(":packages").projectDir = file("/tmp")',
  'project(":packages:react-native").projectDir = file("/tmp")',
];
const REACT_ANDROID_HERMES_PROJECT_DEPENDENCY =
  'compileOnly(project(":packages:react-native:ReactAndroid:hermes-engine"))';

function count(contents, token) {
  return contents.split(token).length - 1;
}

function parseProperties(contents) {
  const properties = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const separator = line.search(/[=:]/);
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) properties[key] = value;
  }
  return properties;
}

function assertSupportedReactNativeVersion(version) {
  if (/^0\.86\.\d+(?:[-+].*)?$/.test(version)) return '0.86';
  if (/^0\.87\.\d+(?:[-+].*)?$/.test(version)) return '0.87';

  throw new Error(
    `[react-native-scroll-interop] reactNativeScrollCompat supports react-native 0.86.x and 0.87.x; found ${version}. ` +
      'Refusing to patch an unvalidated React Native source.'
  );
}

function ensureReactNativeSourceBuildPlaceholder(reactNativeRoot, platform = process.platform) {
  if (platform !== 'win32') return false;
  if (typeof reactNativeRoot !== 'string' || reactNativeRoot.length === 0) {
    throw new TypeError('[react-native-scroll-interop] Expected a React Native package root.');
  }

  const settingsPath = path.join(reactNativeRoot, 'settings.gradle.kts');
  if (!fs.existsSync(settingsPath)) {
    throw new Error(
      `[react-native-scroll-interop] Missing React Native source-build settings: ${settingsPath}. ` +
        'Refusing to enable reactNativeScrollCompat on Windows.'
    );
  }

  const settings = fs.readFileSync(settingsPath, 'utf8');
  const assignmentsPresent = RN_SOURCE_BUILD_PLACEHOLDER_ASSIGNMENTS.filter((assignment) =>
    settings.includes(assignment)
  );

  if (assignmentsPresent.length === 0) return false;
  if (assignmentsPresent.length !== RN_SOURCE_BUILD_PLACEHOLDER_ASSIGNMENTS.length) {
    throw new Error(
      '[react-native-scroll-interop] React Native source-build settings contain a partial Gradle 9 placeholder shape. ' +
        'Refusing to guess the missing project-directory mapping.'
    );
  }

  // RN 0.86/0.87 maps the intermediate composite-build projects to file("/tmp").
  // Gradle resolves that to <react-native package>/tmp on Windows, while the npm package does not
  // ship the directory. Gradle 9 rejects the included build before ReactAndroid is configured unless
  // the placeholder exists. Creating the empty directory preserves RN's own settings and ownership.
  const placeholderPath = path.join(reactNativeRoot, 'tmp');
  fs.mkdirSync(placeholderPath, { recursive: true });
  if (!fs.statSync(placeholderPath).isDirectory()) {
    throw new Error(
      `[react-native-scroll-interop] React Native source-build placeholder is not a directory: ${placeholderPath}`
    );
  }
  return true;
}

function resolveReactNativePrebuiltHermesCoordinate(reactNativeRoot, projectRoot) {
  if (typeof reactNativeRoot !== 'string' || reactNativeRoot.length === 0) {
    throw new TypeError('[react-native-scroll-interop] Expected a React Native package root.');
  }
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    throw new TypeError('[react-native-scroll-interop] Expected a consumer project root.');
  }

  const reactAndroidPropertiesPath = path.join(reactNativeRoot, 'ReactAndroid', 'gradle.properties');
  const hermesPropertiesPath = path.join(
    reactNativeRoot,
    'sdks',
    'hermes-engine',
    'version.properties'
  );
  for (const filePath of [reactAndroidPropertiesPath, hermesPropertiesPath]) {
    if (!fs.existsSync(filePath)) {
      throw new Error(
        `[react-native-scroll-interop] Missing React Native Hermes metadata: ${filePath}. ` +
          'Refusing to guess a prebuilt Hermes coordinate.'
      );
    }
  }

  const reactAndroidProperties = parseProperties(fs.readFileSync(reactAndroidPropertiesPath, 'utf8'));
  const hermesProperties = parseProperties(fs.readFileSync(hermesPropertiesPath, 'utf8'));
  const consumerPropertiesPath = path.join(projectRoot, 'android', 'gradle.properties');
  const consumerProperties = fs.existsSync(consumerPropertiesPath)
    ? parseProperties(fs.readFileSync(consumerPropertiesPath, 'utf8'))
    : {};

  const hasLegacyHermesV1 = Object.prototype.hasOwnProperty.call(
    consumerProperties,
    'hermesV1Enabled'
  );
  const hasScopedHermesV1 = Object.prototype.hasOwnProperty.call(
    consumerProperties,
    'react.hermesV1Enabled'
  );
  const hermesV1Enabled =
    hasLegacyHermesV1 || hasScopedHermesV1
      ? (hasLegacyHermesV1 && consumerProperties.hermesV1Enabled.toLowerCase() === 'true') ||
        (hasScopedHermesV1 &&
          consumerProperties['react.hermesV1Enabled'].toLowerCase() === 'true')
      : true;

  const publishingGroup =
    reactAndroidProperties['react.internal.hermesPublishingGroup'] || 'com.facebook.hermes';
  const versionKey = hermesV1Enabled ? 'HERMES_V1_VERSION_NAME' : 'HERMES_VERSION_NAME';
  const version = hermesProperties[versionKey];

  if (!/^[A-Za-z0-9_.-]+$/.test(publishingGroup) || !version || !/^[A-Za-z0-9_.+-]+$/.test(version)) {
    throw new Error(
      `[react-native-scroll-interop] Invalid React Native Hermes metadata for ${versionKey}. ` +
        'Refusing to guess a prebuilt Hermes coordinate.'
    );
  }

  return `${publishingGroup}:hermes-android:${version}`;
}

function patchReactAndroidHermesCompileOnly(contents, hermesCoordinate) {
  if (typeof contents !== 'string') {
    throw new TypeError('[react-native-scroll-interop] Expected ReactAndroid build.gradle.kts contents.');
  }
  if (
    typeof hermesCoordinate !== 'string' ||
    !/^[A-Za-z0-9_.-]+:hermes-android:[A-Za-z0-9_.+-]+$/.test(hermesCoordinate)
  ) {
    throw new TypeError('[react-native-scroll-interop] Expected a validated Hermes Android coordinate.');
  }

  const replacement =
    `compileOnly("${hermesCoordinate}") // ${PREBUILT_HERMES_COMPILE_ONLY_MARKER}`;
  const markerCount = count(contents, PREBUILT_HERMES_COMPILE_ONLY_MARKER);
  const projectDependencyCount = count(contents, REACT_ANDROID_HERMES_PROJECT_DEPENDENCY);
  const patchedPattern = new RegExp(
    `compileOnly\\("[A-Za-z0-9_.-]+:hermes-android:[A-Za-z0-9_.+-]+"\\) // ${PREBUILT_HERMES_COMPILE_ONLY_MARKER}`,
    'g'
  );
  const patchedMatches = [...contents.matchAll(patchedPattern)];

  if (markerCount > 0) {
    if (markerCount !== 1 || patchedMatches.length !== 1 || projectDependencyCount !== 0) {
      throw new Error(
        '[react-native-scroll-interop] ReactAndroid contains a partial or duplicate prebuilt-Hermes compileOnly patch.'
      );
    }
    return contents.replace(patchedPattern, replacement);
  }

  if (projectDependencyCount !== 1) {
    throw new Error(
      `[react-native-scroll-interop] Expected exactly one ReactAndroid Hermes project compileOnly dependency; found ${projectDependencyCount}. ` +
        'Refusing to patch an unvalidated React Native source.'
    );
  }

  return contents.replace(REACT_ANDROID_HERMES_PROJECT_DEPENDENCY, replacement);
}

function ensureReactNativeSourceBuildSettings(contents) {
  if (typeof contents !== 'string') {
    throw new TypeError('[react-native-scroll-interop] Expected android/settings.gradle contents.');
  }

  const includeBuild = 'includeBuild(expoAutolinking.reactNative)';
  const reactAndroid = 'substitute(module("com.facebook.react:react-android"))';
  const legacyReactNative = 'substitute(module("com.facebook.react:react-native"))';
  const hermesAndroid = 'substitute(module("com.facebook.react:hermes-android"))';
  const hermesEngine = 'substitute(module("com.facebook.react:hermes-engine"))';
  const includeBuildCount = count(contents, includeBuild);
  const hasReactAndroid = contents.includes(reactAndroid);
  const hasLegacyReactNative = contents.includes(legacyReactNative);
  const hasHermesSourceSubstitution =
    contents.includes(hermesAndroid) || contents.includes(hermesEngine);

  if (
    includeBuildCount === 1 &&
    hasReactAndroid &&
    hasLegacyReactNative &&
    !hasHermesSourceSubstitution
  ) {
    if (count(contents, SOURCE_BUILD_MARKER) > 1) {
      throw new Error(
        '[react-native-scroll-interop] Found duplicate source-build markers in settings.gradle.'
      );
    }
    return contents;
  }

  if (
    includeBuildCount !== 0 ||
    hasReactAndroid ||
    hasLegacyReactNative ||
    hasHermesSourceSubstitution ||
    contents.includes(SOURCE_BUILD_MARKER)
  ) {
    const hermesDetail = hasHermesSourceSubstitution
      ? ' Hermes must remain on the prebuilt Android artifact; source substitution is not part of this compatibility gate.'
      : '';
    throw new Error(
      '[react-native-scroll-interop] Found a partial or duplicate React Native source-build configuration in settings.gradle. ' +
        `Refusing to add another includeBuild block.${hermesDetail}`
    );
  }

  if (!contents.includes('expoAutolinking')) {
    throw new Error(
      '[react-native-scroll-interop] Cannot enable reactNativeScrollCompat: generated settings.gradle does not expose expoAutolinking.'
    );
  }

  return (
    contents.replace(/\s*$/, '\n') +
    [
      '',
      `// ${SOURCE_BUILD_MARKER}`,
      'includeBuild(expoAutolinking.reactNative) {',
      '  dependencySubstitution {',
      '    substitute(module("com.facebook.react:react-android")).using(project(":packages:react-native:ReactAndroid"))',
      '    substitute(module("com.facebook.react:react-native")).using(project(":packages:react-native:ReactAndroid"))',
      '  }',
      '}',
      '',
    ].join('\n')
  );
}

function managerSelection() {
  return `/* ${MANAGER_MARKER}: select the AndroidX vertical ScrollView source. */\n                ReactNestedScrollViewManager()`;
}

function patchMainReactPackage(contents) {
  if (
    !contents.includes('override fun createViewManagers') ||
    !contents.includes('ReactScrollViewManager.REACT_CLASS to')
  ) {
    throw new Error(
      '[react-native-scroll-interop] MainReactPackage.kt is missing the expected ScrollView manager entry points. ' +
        'Refusing to patch an unvalidated React Native source.'
    );
  }

  const patchedPattern = new RegExp(
    `/\\* ${MANAGER_MARKER}: select the AndroidX vertical ScrollView source\\. \\*/\\s+ReactNestedScrollViewManager\\(\\)`,
    'g'
  );
  const gatePattern =
    /if \(ReactNativeFeatureFlags\.useNestedScrollViewAndroid\(\)\)\s+ReactNestedScrollViewManager\(\)\s+else ReactScrollViewManager\(\)/g;

  const markerCount = count(contents, MANAGER_MARKER);
  const patchedCount = [...contents.matchAll(patchedPattern)].length;
  if (markerCount > 2 || patchedCount !== markerCount) {
    throw new Error(
      '[react-native-scroll-interop] Found a nested ScrollView manager marker with an unexpected shape.'
    );
  }

  const expectedGates = 2 - markerCount;
  const gates = [...contents.matchAll(gatePattern)].length;
  if (gates !== expectedGates) {
    throw new Error(
      `[react-native-scroll-interop] Expected ${expectedGates} remaining ScrollView manager feature gate(s); found ${gates}. ` +
        'Refusing to patch an unvalidated React Native source.'
    );
  }

  const patched = expectedGates === 0 ? contents : contents.replace(gatePattern, managerSelection());
  if (count(patched, MANAGER_MARKER) !== 2 || [...patched.matchAll(patchedPattern)].length !== 2) {
    throw new Error(
      '[react-native-scroll-interop] Failed to normalize both vertical ScrollView manager entry points.'
    );
  }

  return patched;
}

function locateFling(contents, startToken, endToken, line) {
  const start = contents.indexOf(startToken);
  const end = contents.indexOf(endToken, start);
  if (start < 0 || end < 0) {
    throw new Error(
      `[react-native-scroll-interop] Could not locate ReactNestedScrollView.fling() in react-native ${line}.x.`
    );
  }
  return { start, end, original: contents.slice(start, end) };
}

function patchReactNestedScrollView086(contents) {
  const { start, end, original } = locateFling(
    contents,
    '  @Override\n  public void fling(int velocityY) {',
    '\n  private int correctFlingVelocityY',
    '0.86'
  );

  const commonShape =
    original.includes('if (mPagingEnabled)') &&
    original.includes('flingAndSnap(correctedVelocityY);') &&
    original.includes('super.fling(correctedVelocityY);') &&
    original.includes('handlePostTouchScrolling(0, correctedVelocityY);');

  if (original.includes(RN086_FLING_MARKER)) {
    if (
      count(contents, RN086_FLING_MARKER) !== 1 ||
      !commonShape ||
      original.includes('mScroller.fling(')
    ) {
      throw new Error('[react-native-scroll-interop] Invalid RN 0.86 fling patch state.');
    }
    return contents;
  }

  if (!commonShape || !original.includes('mScroller.fling(')) {
    throw new Error(
      '[react-native-scroll-interop] ReactNestedScrollView.fling() has an unexpected RN 0.86 shape.'
    );
  }

  const replacement = `  @Override\n  public void fling(int velocityY) {\n    final int correctedVelocityY = correctFlingVelocityY(velocityY);\n\n    if (mPagingEnabled) {\n      flingAndSnap(correctedVelocityY);\n    } else {\n      // ${RN086_FLING_MARKER}: AndroidX owns the TYPE_NON_TOUCH nested-scroll lifecycle.\n      super.fling(correctedVelocityY);\n    }\n    handlePostTouchScrolling(0, correctedVelocityY);\n  }\n`;

  return contents.slice(0, start) + replacement + contents.slice(end);
}

function patchReactNestedScrollView087(contents) {
  const { start, end, original } = locateFling(
    contents,
    '  override fun fling(velocityY: Int) {',
    '\n  private fun correctFlingVelocityY',
    '0.87'
  );

  const commonShape =
    original.includes('if (pagingEnabled)') &&
    original.includes('flingAndSnap(correctedVelocityY)') &&
    original.includes('super.fling(correctedVelocityY)') &&
    original.includes('handlePostTouchScrolling(0, correctedVelocityY)');

  if (original.includes(RN087_FLING_MARKER)) {
    if (
      count(contents, RN087_FLING_MARKER) !== 1 ||
      !commonShape ||
      original.includes('scroller.fling(')
    ) {
      throw new Error('[react-native-scroll-interop] Invalid RN 0.87 fling patch state.');
    }
    return contents;
  }

  if (
    !commonShape ||
    !original.includes('scroller.fling(') ||
    !original.includes('postInvalidateOnAnimation()')
  ) {
    throw new Error(
      '[react-native-scroll-interop] ReactNestedScrollView.fling() has an unexpected RN 0.87 shape.'
    );
  }

  const replacement = `  override fun fling(velocityY: Int) {\n    val correctedVelocityY = correctFlingVelocityY(velocityY)\n\n    if (pagingEnabled) {\n      flingAndSnap(correctedVelocityY)\n    } else {\n      // ${RN087_FLING_MARKER}: AndroidX owns the TYPE_NON_TOUCH nested-scroll lifecycle.\n      super.fling(correctedVelocityY)\n    }\n    handlePostTouchScrolling(0, correctedVelocityY)\n  }\n`;

  return contents.slice(0, start) + replacement + contents.slice(end);
}

module.exports = {
  MANAGER_MARKER,
  PREBUILT_HERMES_COMPILE_ONLY_MARKER,
  RN086_FLING_MARKER,
  RN087_FLING_MARKER,
  SOURCE_BUILD_MARKER,
  assertSupportedReactNativeVersion,
  ensureReactNativeSourceBuildPlaceholder,
  ensureReactNativeSourceBuildSettings,
  patchMainReactPackage,
  patchReactAndroidHermesCompileOnly,
  patchReactNestedScrollView086,
  patchReactNestedScrollView087,
  resolveReactNativePrebuiltHermesCoordinate,
};
