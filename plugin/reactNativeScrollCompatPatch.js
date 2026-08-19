'use strict';

const SOURCE_BUILD_MARKER = 'REACT_NATIVE_SCROLL_INTEROP_SOURCE_BUILD';
const MANAGER_MARKER = 'REACT_NATIVE_SCROLL_INTEROP_NESTED_MANAGER';
const RN086_FLING_MARKER = 'REACT_NATIVE_SCROLL_INTEROP_RN086_ANDROIDX_FLING';
const RN087_FLING_MARKER = 'REACT_NATIVE_SCROLL_INTEROP_RN087_ANDROIDX_FLING';

const LEGACY_SOURCE_BUILD_MARKER = 'EXPO_MATERIAL_TOOLBAR_RN086_ANDROIDX_SOURCE_BUILD';
const LEGACY_MANAGER_MARKER = 'EXPO_MATERIAL_TOOLBAR_RN086_ANDROIDX_MANAGER';
const LEGACY_EXPERIMENT_MANAGER_MARKER = 'RN086_ANDROIDX_MANAGER_PATCH';
const LEGACY_RN086_FLING_MARKER = 'EXPO_MATERIAL_TOOLBAR_RN086_ANDROIDX_FLING';
const LEGACY_RN086_EXPERIMENT_FLING_MARKER = 'RN086_ANDROIDX_FLING_SOURCE_PATCH';
const LEGACY_RN087_FLING_MARKER = 'RN087_NESTED_FLING_SOURCE_PATCH';

function countOccurrences(contents, token) {
  return contents.split(token).length - 1;
}

function assertSupportedReactNativeVersion(version) {
  if (/^0\.86\.\d+(?:[-+].*)?$/.test(version)) return '0.86';
  if (/^0\.87\.\d+(?:[-+].*)?$/.test(version)) return '0.87';

  throw new Error(
    `[react-native-scroll-interop] reactNativeScrollCompat supports react-native 0.86.x and 0.87.x; found ${version}. ` +
      'Refusing to patch an unvalidated React Native source.'
  );
}

function ensureReactNativeSourceBuildSettings(contents) {
  if (typeof contents !== 'string') {
    throw new TypeError('[react-native-scroll-interop] Expected android/settings.gradle contents.');
  }

  const includeBuildToken = 'includeBuild(expoAutolinking.reactNative)';
  const reactAndroidToken = 'substitute(module("com.facebook.react:react-android"))';
  const hermesAndroidToken = 'substitute(module("com.facebook.react:hermes-android"))';

  const includeBuildCount = countOccurrences(contents, includeBuildToken);
  const hasReactAndroidSubstitution = contents.includes(reactAndroidToken);
  const hasHermesAndroidSubstitution = contents.includes(hermesAndroidToken);
  const alreadyConfigured =
    includeBuildCount === 1 && hasReactAndroidSubstitution && hasHermesAndroidSubstitution;

  if (alreadyConfigured) return contents;

  if (
    includeBuildCount > 1 ||
    includeBuildCount === 1 ||
    hasReactAndroidSubstitution ||
    hasHermesAndroidSubstitution ||
    contents.includes(SOURCE_BUILD_MARKER) ||
    contents.includes(LEGACY_SOURCE_BUILD_MARKER)
  ) {
    throw new Error(
      '[react-native-scroll-interop] Found a partial, duplicate or unexpected React Native source-build configuration in settings.gradle. ' +
        'Refusing to add another includeBuild block.'
    );
  }

  if (!contents.includes('expoAutolinking')) {
    throw new Error(
      '[react-native-scroll-interop] Cannot enable reactNativeScrollCompat: generated settings.gradle does not expose expoAutolinking.'
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

function managerSelection() {
  return `/* ${MANAGER_MARKER}: select the AndroidX vertical ScrollView source. */\n                ReactNestedScrollViewManager()`;
}

function normalizeLegacyManagerMarkers(contents) {
  return contents
    .replaceAll(
      `/* ${LEGACY_MANAGER_MARKER}: select the existing RN 0.86 AndroidX vertical ScrollView source. */`,
      `/* ${MANAGER_MARKER}: select the AndroidX vertical ScrollView source. */`
    )
    .replaceAll(
      `/* ${LEGACY_EXPERIMENT_MANAGER_MARKER}: experiment branch always selects the existing RN 0.86 AndroidX source. */`,
      `/* ${MANAGER_MARKER}: select the AndroidX vertical ScrollView source. */`
    );
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

  let source = normalizeLegacyManagerMarkers(contents);
  const productionPattern = new RegExp(
    `/\\* ${MANAGER_MARKER}: select the AndroidX vertical ScrollView source\\. \\*/\\s+ReactNestedScrollViewManager\\(\\)`,
    'g'
  );
  const gatePattern =
    /if \(ReactNativeFeatureFlags\.useNestedScrollViewAndroid\(\)\)\s+ReactNestedScrollViewManager\(\)\s+else ReactScrollViewManager\(\)/g;

  const markerCount = countOccurrences(source, MANAGER_MARKER);
  const productionMatches = [...source.matchAll(productionPattern)];
  if (markerCount > 2 || productionMatches.length !== markerCount) {
    throw new Error(
      '[react-native-scroll-interop] Found a nested ScrollView manager marker with an unexpected shape. ' +
        'Refusing to trust a partial patch.'
    );
  }

  const gateMatches = [...source.matchAll(gatePattern)];
  const expectedRemainingGates = 2 - markerCount;
  if (gateMatches.length !== expectedRemainingGates) {
    throw new Error(
      `[react-native-scroll-interop] Expected ${expectedRemainingGates} remaining ScrollView manager feature gate(s) after ${markerCount} validated selection(s); found ${gateMatches.length}. ` +
        'Refusing to patch an unvalidated React Native source.'
    );
  }

  if (expectedRemainingGates > 0) {
    source = source.replace(gatePattern, managerSelection());
  }

  const finalMarkerCount = countOccurrences(source, MANAGER_MARKER);
  const finalMatches = [...source.matchAll(productionPattern)];
  if (finalMarkerCount !== 2 || finalMatches.length !== 2) {
    throw new Error(
      '[react-native-scroll-interop] Failed to normalize both vertical ScrollView manager entry points.'
    );
  }

  return source;
}

function locateRn086Fling(contents) {
  const startToken = '  @Override\n  public void fling(int velocityY) {';
  const endToken = '\n  private int correctFlingVelocityY';
  const start = contents.indexOf(startToken);
  const end = contents.indexOf(endToken, start);
  if (start < 0 || end < 0) {
    throw new Error(
      '[react-native-scroll-interop] Could not locate ReactNestedScrollView.fling() in react-native 0.86.x.'
    );
  }
  return { start, end, original: contents.slice(start, end) };
}

function rn086FlingReplacement() {
  return `  @Override\n  public void fling(int velocityY) {\n    final int correctedVelocityY = correctFlingVelocityY(velocityY);\n\n    if (mPagingEnabled) {\n      flingAndSnap(correctedVelocityY);\n    } else {\n      // ${RN086_FLING_MARKER}: enter AndroidX TYPE_NON_TOUCH while RN remains the fling owner.\n      super.fling(correctedVelocityY);\n    }\n    handlePostTouchScrolling(0, correctedVelocityY);\n  }\n`;
}

function isRn086ProductionFling(original) {
  return (
    original.includes(RN086_FLING_MARKER) &&
    original.includes('if (mPagingEnabled)') &&
    original.includes('flingAndSnap(correctedVelocityY);') &&
    original.includes('super.fling(correctedVelocityY);') &&
    original.includes('handlePostTouchScrolling(0, correctedVelocityY);') &&
    !original.includes('mScroller.fling(')
  );
}

function patchReactNestedScrollView086(contents) {
  let source = contents.replaceAll(LEGACY_RN086_FLING_MARKER, RN086_FLING_MARKER);
  const { start, end, original } = locateRn086Fling(source);

  if (original.includes(RN086_FLING_MARKER)) {
    if (countOccurrences(source, RN086_FLING_MARKER) !== 1 || !isRn086ProductionFling(original)) {
      throw new Error(
        '[react-native-scroll-interop] Found the RN 0.86 fling marker with an unexpected shape.'
      );
    }
    return source;
  }

  const commonShape =
    original.includes('if (mPagingEnabled)') &&
    original.includes('flingAndSnap(correctedVelocityY);') &&
    original.includes('super.fling(correctedVelocityY);') &&
    original.includes('handlePostTouchScrolling(0, correctedVelocityY);');
  const stockShape = commonShape && original.includes('mScroller.fling(');
  const legacyExperimentShape =
    commonShape &&
    original.includes(LEGACY_RN086_EXPERIMENT_FLING_MARKER) &&
    !original.includes('mScroller.fling(');

  if (!stockShape && !legacyExperimentShape) {
    throw new Error(
      '[react-native-scroll-interop] ReactNestedScrollView.fling() has an unexpected RN 0.86 shape. ' +
        'Refusing to patch an unvalidated source.'
    );
  }

  return source.slice(0, start) + rn086FlingReplacement() + source.slice(end);
}

function locateRn087Fling(contents) {
  const startToken = '  override fun fling(velocityY: Int) {';
  const endToken = '\n  private fun correctFlingVelocityY';
  const start = contents.indexOf(startToken);
  const end = contents.indexOf(endToken, start);
  if (start < 0 || end < 0) {
    throw new Error(
      '[react-native-scroll-interop] Could not locate ReactNestedScrollView.fling() in react-native 0.87.x.'
    );
  }
  return { start, end, original: contents.slice(start, end) };
}

function rn087FlingReplacement() {
  return `  override fun fling(velocityY: Int) {\n    val correctedVelocityY = correctFlingVelocityY(velocityY)\n\n    if (pagingEnabled) {\n      flingAndSnap(correctedVelocityY)\n    } else {\n      // ${RN087_FLING_MARKER}: enter AndroidX TYPE_NON_TOUCH while RN remains the fling owner.\n      super.fling(correctedVelocityY)\n    }\n    handlePostTouchScrolling(0, correctedVelocityY)\n  }\n`;
}

function isRn087ProductionFling(original) {
  return (
    original.includes(RN087_FLING_MARKER) &&
    original.includes('if (pagingEnabled)') &&
    original.includes('flingAndSnap(correctedVelocityY)') &&
    original.includes('super.fling(correctedVelocityY)') &&
    original.includes('handlePostTouchScrolling(0, correctedVelocityY)') &&
    !original.includes('scroller.fling(')
  );
}

function patchReactNestedScrollView087(contents) {
  const { start, end, original } = locateRn087Fling(contents);

  if (original.includes(RN087_FLING_MARKER)) {
    if (countOccurrences(contents, RN087_FLING_MARKER) !== 1 || !isRn087ProductionFling(original)) {
      throw new Error(
        '[react-native-scroll-interop] Found the RN 0.87 fling marker with an unexpected shape.'
      );
    }
    return contents;
  }

  const commonShape =
    original.includes('if (pagingEnabled)') &&
    original.includes('flingAndSnap(correctedVelocityY)') &&
    original.includes('super.fling(correctedVelocityY)') &&
    original.includes('handlePostTouchScrolling(0, correctedVelocityY)');
  const stockShape =
    commonShape &&
    original.includes('scroller.fling(') &&
    original.includes('postInvalidateOnAnimation');
  const legacyPatchedShape =
    commonShape &&
    original.includes(LEGACY_RN087_FLING_MARKER) &&
    !original.includes('scroller.fling(');

  if (!stockShape && !legacyPatchedShape) {
    throw new Error(
      '[react-native-scroll-interop] ReactNestedScrollView.fling() has an unexpected RN 0.87 shape. ' +
        'Refusing to patch an unvalidated source.'
    );
  }

  return contents.slice(0, start) + rn087FlingReplacement() + contents.slice(end);
}

module.exports = {
  MANAGER_MARKER,
  RN086_FLING_MARKER,
  RN087_FLING_MARKER,
  SOURCE_BUILD_MARKER,
  assertSupportedReactNativeVersion,
  ensureReactNativeSourceBuildSettings,
  patchMainReactPackage,
  patchReactNestedScrollView086,
  patchReactNestedScrollView087,
};
