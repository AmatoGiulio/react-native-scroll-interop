'use strict';

const SOURCE_BUILD_MARKER = 'EXPO_MATERIAL_TOOLBAR_RN086_ANDROIDX_SOURCE_BUILD';
const FLING_MARKER = 'EXPO_MATERIAL_TOOLBAR_RN086_ANDROIDX_FLING';
const MANAGER_MARKER = 'EXPO_MATERIAL_TOOLBAR_RN086_ANDROIDX_MANAGER';
const EXPERIMENT_FLING_MARKER = 'RN086_ANDROIDX_FLING_SOURCE_PATCH';
const EXPERIMENT_MANAGER_MARKER = 'RN086_ANDROIDX_MANAGER_PATCH';

function assertSupportedReactNativeVersion(version) {
  if (!/^0\.86\.\d+(?:[-+].*)?$/.test(version)) {
    throw new Error(
      `[expo-material-toolbar] rn086AndroidXScroll requires react-native 0.86.x; found ${version}. ` +
        'Disable the compatibility plugin for other React Native versions.'
    );
  }
}

function ensureReactNativeSourceBuildSettings(contents) {
  if (typeof contents !== 'string') {
    throw new TypeError('[expo-material-toolbar] Expected android/settings.gradle contents.');
  }

  const alreadyConfigured =
    contents.includes('includeBuild(expoAutolinking.reactNative)') &&
    contents.includes('substitute(module("com.facebook.react:react-android"))') &&
    contents.includes('substitute(module("com.facebook.react:hermes-android"))');

  if (alreadyConfigured) {
    return contents;
  }

  if (!contents.includes('expoAutolinking')) {
    throw new Error(
      '[expo-material-toolbar] Cannot enable the RN 0.86 AndroidX compatibility path: ' +
        'the generated settings.gradle does not expose expoAutolinking.'
    );
  }

  const block = [
    '',
    `// ${SOURCE_BUILD_MARKER}`,
    'includeBuild(expoAutolinking.reactNative) {',
    '  dependencySubstitution {',
    '    substitute(module("com.facebook.react:react-android")).using(project(":packages:react-native:ReactAndroid"))',
    '    substitute(module("com.facebook.react:react-native")).using(project(":packages:react-native:ReactAndroid"))',
    '    substitute(module("com.facebook.react:hermes-android")).using(project(":packages:react-native:ReactAndroid:hermes-engine"))',
    '    substitute(module("com.facebook.react:hermes-engine")).using(project(":packages:react-native:ReactAndroid:hermes-engine"))',
    '  }',
    '}',
    '',
  ].join('\n');

  return contents.replace(/\s*$/, '\n') + block;
}

function productionFlingReplacement() {
  return `  @Override\n  public void fling(int velocityY) {\n    final int correctedVelocityY = correctFlingVelocityY(velocityY);\n\n    if (mPagingEnabled) {\n      flingAndSnap(correctedVelocityY);\n    } else {\n      // ${FLING_MARKER}: enter AndroidX TYPE_NON_TOUCH while RN remains the fling owner.\n      super.fling(correctedVelocityY);\n    }\n    handlePostTouchScrolling(0, correctedVelocityY);\n  }\n`;
}

function patchReactNestedScrollView(contents) {
  if (contents.includes(FLING_MARKER)) {
    return contents;
  }

  const startToken = '  @Override\n  public void fling(int velocityY) {';
  const endToken = '\n  private int correctFlingVelocityY';
  const start = contents.indexOf(startToken);
  const end = contents.indexOf(endToken, start);

  if (start < 0 || end < 0) {
    throw new Error(
      '[expo-material-toolbar] Could not locate ReactNestedScrollView.fling() in react-native 0.86.x.'
    );
  }

  const original = contents.slice(start, end);
  const commonShape =
    original.includes('if (mPagingEnabled)') &&
    original.includes('super.fling(correctedVelocityY);') &&
    original.includes('handlePostTouchScrolling(0, correctedVelocityY);');
  const stockShape = commonShape && original.includes('mScroller.fling(');
  const validatedExperimentShape =
    commonShape &&
    original.includes(EXPERIMENT_FLING_MARKER) &&
    original.includes('SOURCE_FLING_PATCH velocityY=') &&
    !original.includes('mScroller.fling(');

  if (!stockShape && !validatedExperimentShape) {
    throw new Error(
      '[expo-material-toolbar] ReactNestedScrollView.fling() has an unexpected shape. ' +
        'Refusing to patch an unvalidated React Native source.'
    );
  }

  return contents.slice(0, start) + productionFlingReplacement() + contents.slice(end);
}

function productionManagerSelection() {
  return `/* ${MANAGER_MARKER}: select the existing RN 0.86 AndroidX vertical ScrollView source. */\n                ReactNestedScrollViewManager()`;
}

function patchMainReactPackage(contents) {
  if (contents.includes(MANAGER_MARKER)) {
    return contents;
  }

  if (contents.includes(EXPERIMENT_MANAGER_MARKER)) {
    const experimentPattern =
      /\/\* RN086_ANDROIDX_MANAGER_PATCH: experiment branch always selects the existing RN 0\.86 AndroidX source\. \*\/\s+ReactNestedScrollViewManager\(\)/g;
    const experimentMatches = [...contents.matchAll(experimentPattern)];
    if (experimentMatches.length !== 1) {
      throw new Error(
        '[expo-material-toolbar] Found the RN 0.86 experiment manager marker with an unexpected shape. ' +
          'Refusing to normalize an unknown patch.'
      );
    }
    return contents.replace(experimentPattern, productionManagerSelection());
  }

  const gatePattern =
    /if \(ReactNativeFeatureFlags\.useNestedScrollViewAndroid\(\)\)\s+ReactNestedScrollViewManager\(\)\s+else ReactScrollViewManager\(\)/g;
  const matches = [...contents.matchAll(gatePattern)];

  if (matches.length !== 1) {
    throw new Error(
      `[expo-material-toolbar] Expected exactly one RN 0.86 ScrollView manager feature gate; found ${matches.length}. ` +
        'Refusing to patch an unvalidated React Native source.'
    );
  }

  return contents.replace(gatePattern, productionManagerSelection());
}

module.exports = {
  EXPERIMENT_FLING_MARKER,
  EXPERIMENT_MANAGER_MARKER,
  FLING_MARKER,
  MANAGER_MARKER,
  SOURCE_BUILD_MARKER,
  assertSupportedReactNativeVersion,
  ensureReactNativeSourceBuildSettings,
  patchMainReactPackage,
  patchReactNestedScrollView,
};
