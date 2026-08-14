'use strict';

const SOURCE_BUILD_MARKER = 'EXPO_MATERIAL_TOOLBAR_RN086_ANDROIDX_SOURCE_BUILD';
const FLING_MARKER = 'EXPO_MATERIAL_TOOLBAR_RN086_ANDROIDX_FLING';
const MANAGER_MARKER = 'EXPO_MATERIAL_TOOLBAR_RN086_ANDROIDX_MANAGER';

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
  if (
    !original.includes('if (mPagingEnabled)') ||
    !original.includes('mScroller.fling(') ||
    !original.includes('super.fling(correctedVelocityY);') ||
    !original.includes('handlePostTouchScrolling(0, correctedVelocityY);')
  ) {
    throw new Error(
      '[expo-material-toolbar] ReactNestedScrollView.fling() has an unexpected shape. ' +
        'Refusing to patch an unvalidated React Native source.'
    );
  }

  const replacement = `  @Override\n  public void fling(int velocityY) {\n    final int correctedVelocityY = correctFlingVelocityY(velocityY);\n\n    if (mPagingEnabled) {\n      flingAndSnap(correctedVelocityY);\n    } else {\n      // ${FLING_MARKER}: enter AndroidX TYPE_NON_TOUCH while RN remains the fling owner.\n      super.fling(correctedVelocityY);\n    }\n    handlePostTouchScrolling(0, correctedVelocityY);\n  }\n`;

  return contents.slice(0, start) + replacement + contents.slice(end);
}

function patchMainReactPackage(contents) {
  if (contents.includes(MANAGER_MARKER)) {
    return contents;
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

  return contents.replace(
    gatePattern,
    `/* ${MANAGER_MARKER}: select the existing RN 0.86 AndroidX vertical ScrollView source. */\n                ReactNestedScrollViewManager()`
  );
}

module.exports = {
  FLING_MARKER,
  MANAGER_MARKER,
  SOURCE_BUILD_MARKER,
  assertSupportedReactNativeVersion,
  ensureReactNativeSourceBuildSettings,
  patchMainReactPackage,
  patchReactNestedScrollView,
};
