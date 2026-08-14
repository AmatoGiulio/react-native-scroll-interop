#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  FLING_MARKER,
  MANAGER_MARKER,
  SOURCE_BUILD_MARKER,
  assertSupportedReactNativeVersion,
  ensureReactNativeSourceBuildSettings,
  patchMainReactPackage,
  patchReactNestedScrollView,
} = require('../plugin/rn086AndroidXPatch.js');

assert.doesNotThrow(() => assertSupportedReactNativeVersion('0.86.0'));
assert.doesNotThrow(() => assertSupportedReactNativeVersion('0.86.2'));
assert.doesNotThrow(() => assertSupportedReactNativeVersion('0.86.3-rc.0'));
assert.doesNotThrow(() => assertSupportedReactNativeVersion('0.86.2+expo'));
assert.throws(() => assertSupportedReactNativeVersion('0.87.0'), /requires react-native 0\.86\.x/);
assert.throws(() => assertSupportedReactNativeVersion('0.85.9'), /requires react-native 0\.86\.x/);

const settingsFixture = `pluginManagement {\n  def expoAutolinking = new Object()\n}\nexpoAutolinking.useExpoModules()\n`;
const patchedSettings = ensureReactNativeSourceBuildSettings(settingsFixture);
assert.match(patchedSettings, new RegExp(SOURCE_BUILD_MARKER));
assert.match(patchedSettings, /includeBuild\(expoAutolinking\.reactNative\)/);
assert.match(patchedSettings, /com\.facebook\.react:react-android/);
assert.equal(ensureReactNativeSourceBuildSettings(patchedSettings), patchedSettings);

const externalSourceBuildFixture = `${settingsFixture}\nincludeBuild(expoAutolinking.reactNative) {\n  dependencySubstitution {\n    substitute(module("com.facebook.react:react-android")).using(project(":packages:react-native:ReactAndroid"))\n    substitute(module("com.facebook.react:hermes-android")).using(project(":packages:react-native:ReactAndroid:hermes-engine"))\n  }\n}\n`;
assert.equal(
  ensureReactNativeSourceBuildSettings(externalSourceBuildFixture),
  externalSourceBuildFixture,
  'must compose with expo-build-properties source-build configuration'
);
assert.throws(
  () =>
    ensureReactNativeSourceBuildSettings(
      `${settingsFixture}\nincludeBuild(expoAutolinking.reactNative) {\n  dependencySubstitution {\n    substitute(module("com.facebook.react:react-android")).using(project(":packages:react-native:ReactAndroid"))\n  }\n}\n`
    ),
  /partial or unexpected React Native source-build configuration/
);
assert.throws(
  () => ensureReactNativeSourceBuildSettings(`${patchedSettings}\n// ${SOURCE_BUILD_MARKER}\n`),
  /duplicate RN 0\.86 source-build markers/
);
assert.throws(
  () => ensureReactNativeSourceBuildSettings('pluginManagement {}\n'),
  /does not expose expoAutolinking/
);

const flingFixture = `class ReactNestedScrollView {\n  @Override\n  public void fling(int velocityY) {\n    final int correctedVelocityY = correctFlingVelocityY(velocityY);\n\n    if (mPagingEnabled) {\n      flingAndSnap(correctedVelocityY);\n    } else if (mScroller != null) {\n      int scrollWindowHeight = getHeight() - getPaddingBottom() - getPaddingTop();\n      mScroller.fling(\n          getScrollX(), getScrollY(), 0, correctedVelocityY, 0, 0, 0, Integer.MAX_VALUE, 0, scrollWindowHeight / 2);\n      ViewCompat.postInvalidateOnAnimation(this);\n    } else {\n      super.fling(correctedVelocityY);\n    }\n    handlePostTouchScrolling(0, correctedVelocityY);\n  }\n\n  private int correctFlingVelocityY(int velocityY) {\n    return velocityY;\n  }\n}\n`;
const patchedFling = patchReactNestedScrollView(flingFixture);
assert.match(patchedFling, new RegExp(FLING_MARKER));
assert.doesNotMatch(patchedFling, /mScroller\.fling\(/);
assert.match(patchedFling, /super\.fling\(correctedVelocityY\);/);
assert.match(patchedFling, /if \(mPagingEnabled\)/);
assert.match(patchedFling, /flingAndSnap\(correctedVelocityY\);/);
assert.equal(patchReactNestedScrollView(patchedFling), patchedFling);
assert.throws(
  () =>
    patchReactNestedScrollView(
      patchedFling.replace(
        'super.fling(correctedVelocityY);',
        'mScroller.fling(0, 0, 0, correctedVelocityY, 0, 0, 0, 1);'
      )
    ),
  /production fling marker with an unexpected shape/
);
assert.throws(
  () => patchReactNestedScrollView(`${flingFixture}\n// ${FLING_MARKER}\n`),
  /production fling marker with an unexpected shape/
);

const experimentFlingFixture = `class ReactNestedScrollView {\n  @Override\n  public void fling(int velocityY) {\n    final int correctedVelocityY = correctFlingVelocityY(velocityY);\n\n    if (mPagingEnabled) {\n      flingAndSnap(correctedVelocityY);\n    } else {\n      // RN086_ANDROIDX_FLING_SOURCE_PATCH: keep RN physics but enter AndroidX TYPE_NON_TOUCH nested scrolling.\n      android.util.Log.i("ExpoRn086AndroidX", "SOURCE_FLING_PATCH velocityY=" + correctedVelocityY);\n      super.fling(correctedVelocityY);\n    }\n    handlePostTouchScrolling(0, correctedVelocityY);\n  }\n\n  private int correctFlingVelocityY(int velocityY) {\n    return velocityY;\n  }\n}\n`;
const normalizedExperimentFling = patchReactNestedScrollView(experimentFlingFixture);
assert.match(normalizedExperimentFling, new RegExp(FLING_MARKER));
assert.doesNotMatch(normalizedExperimentFling, /ExpoRn086AndroidX/);
assert.doesNotMatch(normalizedExperimentFling, /RN086_ANDROIDX_FLING_SOURCE_PATCH/);
assert.throws(
  () => patchReactNestedScrollView('class ReactNestedScrollView {}\n'),
  /Could not locate ReactNestedScrollView\.fling/
);

const managerFixture = `ReactScrollViewManager.REACT_CLASS to\n    ModuleSpec.viewManagerSpec {\n      if (ReactNativeFeatureFlags.useNestedScrollViewAndroid())\n          ReactNestedScrollViewManager()\n      else ReactScrollViewManager()\n    },\n`;
const patchedManager = patchMainReactPackage(managerFixture);
assert.match(patchedManager, new RegExp(MANAGER_MARKER));
assert.doesNotMatch(patchedManager, /useNestedScrollViewAndroid/);
assert.match(patchedManager, /ReactNestedScrollViewManager\(\)/);
assert.equal(patchMainReactPackage(patchedManager), patchedManager);
assert.throws(
  () =>
    patchMainReactPackage(
      patchedManager.replace('ReactNestedScrollViewManager()', 'ReactScrollViewManager()')
    ),
  /production manager marker with an unexpected shape/
);
assert.throws(
  () => patchMainReactPackage(`${patchedManager}\n/* ${MANAGER_MARKER}: duplicate */\n`),
  /production manager marker with an unexpected shape/
);

const experimentManagerFixture = `ReactScrollViewManager.REACT_CLASS to\n    ModuleSpec.viewManagerSpec {\n      /* RN086_ANDROIDX_MANAGER_PATCH: experiment branch always selects the existing RN 0.86 AndroidX source. */\n      ReactNestedScrollViewManager()\n    },\n`;
const normalizedExperimentManager = patchMainReactPackage(experimentManagerFixture);
assert.match(normalizedExperimentManager, new RegExp(MANAGER_MARKER));
assert.doesNotMatch(normalizedExperimentManager, /RN086_ANDROIDX_MANAGER_PATCH/);
assert.throws(
  () => patchMainReactPackage('ReactScrollViewManager.REACT_CLASS\n'),
  /Expected exactly one RN 0\.86 ScrollView manager feature gate/
);
assert.throws(
  () => patchMainReactPackage(`${managerFixture}\n${managerFixture}`),
  /Expected exactly one RN 0\.86 ScrollView manager feature gate; found 2/
);

console.log('RN 0.86 AndroidX config-plugin hardening checks passed.');
