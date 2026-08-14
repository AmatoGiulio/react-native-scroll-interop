'use strict';

const SOURCE_BUILD_MARKER = 'EXPO_MATERIAL_TOOLBAR_RN086_ANDROIDX_SOURCE_BUILD';
const FLING_MARKER = 'EXPO_MATERIAL_TOOLBAR_RN086_ANDROIDX_FLING';
const MANAGER_MARKER = 'EXPO_MATERIAL_TOOLBAR_RN086_ANDROIDX_MANAGER';
const EXPERIMENT_FLING_MARKER = 'RN086_ANDROIDX_FLING_SOURCE_PATCH';
const EXPERIMENT_MANAGER_MARKER = 'RN086_ANDROIDX_MANAGER_PATCH';

function countOccurrences(contents, token) {
  return contents.split(token).length - 1;
}

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

  const hasIncludeBuild = contents.includes('includeBuild(expoAutolinking.reactNative)');
  const hasReactAndroidSubstitution = contents.includes(
    'substitute(module("com.facebook.react:react-android"))'
  );
  const hasHermesAndroidSubstitution = contents.includes(
    'substitute(module("com.facebook.react:hermes-android"))'
  );
  const sourceBuildMarkerCount = countOccurrences(contents, SOURCE_BUILD_MARKER);
  const alreadyConfigured =
    hasIncludeBuild && hasReactAndroidSubstitution && hasHermesAndroidSubstitution;

  if (alreadyConfigured) {
    if (sourceBuildMarkerCount > 1) {
      throw new Error(
        '[expo-material-toolbar] Found duplicate RN 0.86 source-build markers in settings.gradle. ' +
          'Refusing to normalize an ambiguous configuration.'
      );
    }
    return contents;
  }

  const hasPartialSourceBuildConfiguration =
    sourceBuildMarkerCount > 0 ||
    hasIncludeBuild ||
    hasReactAndroidSubstitution ||
    hasHermesAndroidSubstitution;
  if (hasPartialSourceBuildConfiguration) {
    throw new Error(
      '[expo-material-toolbar] Found a partial or unexpected React Native source-build configuration ' +
        'in settings.gradle. Refusing to add a second includeBuild block.'
    );
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

function locateReactNestedScrollViewFling(contents) {
  const startToken = '  @Override\n  public void fling(int velocityY) {';
  const endToken = '\n  private int correctFlingVelocityY';
  const start = contents.indexOf(startToken);
  const end = contents.indexOf(endToken, start);

  if (start < 0 || end < 0) {
    throw new Error(
      '[expo-material-toolbar] Could not locate ReactNestedScrollView.fling() in react-native 0.86.x.'
    );
  }

  return { start, end, original: contents.slice(start, end) };
}

function isProductionFlingShape(original) {
  return (
    countOccurrences(original, FLING_MARKER) === 1 &&
    original.includes('if (mPagingEnabled)') &&
    original.includes('flingAndSnap(correctedVelocityY);') &&
    original.includes('super.fling(correctedVelocityY);') &&
    original.includes('handlePostTouchScrolling(0, correctedVelocityY);') &&
    !original.includes('mScroller.fling(') &&
    !original.includes(EXPERIMENT_FLING_MARKER) &&
    !original.includes('SOURCE_FLING_PATCH velocityY=')
  );
}

function patchReactNestedScrollView(contents) {
  const { start, end, original } = locateReactNestedScrollViewFling(contents);
  const productionMarkerCount = countOccurrences(contents, FLING_MARKER);

  if (productionMarkerCount > 0) {
    if (productionMarkerCount !== 1 || !isProductionFlingShape(original)) {
      throw new Error(
        '[expo-material-toolbar] Found the RN 0.86 production fling marker with an unexpected shape. ' +
          'Refusing to trust a partial or modified patch.'
      );
    }
    return contents;
  }

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
  if (
    !contents.includes('override fun createViewManagers') ||
    !contents.includes('ReactScrollViewManager.REACT_CLASS to')
  ) {
    throw new Error(
      '[expo-material-toolbar] MainReactPackage.kt is missing the expected RN 0.86 ScrollView manager entry points. ' +
        'Refusing to patch an unvalidated React Native source.'
    );
  }

  const productionPattern = new RegExp(
    `/\\* ${MANAGER_MARKER}: select the existing RN 0\\.86 AndroidX vertical ScrollView source\\. \\*/\\s+ReactNestedScrollViewManager\\(\\)`,
    'g'
  );
  const experimentPattern =
    /\/\* RN086_ANDROIDX_MANAGER_PATCH: experiment branch always selects the existing RN 0\.86 AndroidX source\. \*\/\s+ReactNestedScrollViewManager\(\)/g;
  const gatePattern =
    /if \(ReactNativeFeatureFlags\.useNestedScrollViewAndroid\(\)\)\s+ReactNestedScrollViewManager\(\)\s+else ReactScrollViewManager\(\)/g;

  let productionMarkerCount = countOccurrences(contents, MANAGER_MARKER);
  let productionMatches = [...contents.matchAll(productionPattern)];
  if (productionMarkerCount > 2 || productionMatches.length !== productionMarkerCount) {
    throw new Error(
      '[expo-material-toolbar] Found the RN 0.86 production manager marker with an unexpected shape. ' +
        'Refusing to trust a partial or modified patch.'
    );
  }

  const experimentMarkerCount = countOccurrences(contents, EXPERIMENT_MANAGER_MARKER);
  if (experimentMarkerCount > 0) {
    const experimentMatches = [...contents.matchAll(experimentPattern)];
    if (
      experimentMarkerCount !== 1 ||
      experimentMatches.length !== 1 ||
      productionMarkerCount > 1
    ) {
      throw new Error(
        '[expo-material-toolbar] Found the RN 0.86 experiment manager marker with an unexpected shape. ' +
          'Refusing to normalize an unknown patch.'
      );
    }
    contents = contents.replace(experimentPattern, productionManagerSelection());
  }

  productionMarkerCount = countOccurrences(contents, MANAGER_MARKER);
  productionMatches = [...contents.matchAll(productionPattern)];
  if (productionMarkerCount > 2 || productionMatches.length !== productionMarkerCount) {
    throw new Error(
      '[expo-material-toolbar] Found the RN 0.86 production manager marker with an unexpected shape. ' +
        'Refusing to trust a partial or modified patch.'
    );
  }

  const gateMatches = [...contents.matchAll(gatePattern)];
  const expectedRemainingGates = 2 - productionMarkerCount;
  if (gateMatches.length !== expectedRemainingGates) {
    throw new Error(
      `[expo-material-toolbar] Expected ${expectedRemainingGates} remaining RN 0.86 ScrollView manager feature gate(s) after ${productionMarkerCount} validated production selection(s); found ${gateMatches.length}. ` +
        'Refusing to patch an unvalidated React Native source.'
    );
  }

  if (expectedRemainingGates === 0) {
    return contents;
  }

  const patched = contents.replace(gatePattern, productionManagerSelection());
  const finalMarkerCount = countOccurrences(patched, MANAGER_MARKER);
  const finalMatches = [...patched.matchAll(productionPattern)];
  if (finalMarkerCount !== 2 || finalMatches.length !== 2) {
    throw new Error(
      '[expo-material-toolbar] Failed to normalize both RN 0.86 vertical ScrollView manager entry points.'
    );
  }

  return patched;
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
