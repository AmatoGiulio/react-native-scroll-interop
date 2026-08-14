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
assert.throws(() => assertSupportedReactNativeVersion('0.87.0'), /requires react-native 0\.86\.x/);

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
  () => ensureReactNativeSourceBuildSettings('pluginManagement {}\n'),
  /does not expose expoAutolinking/
);

const flingFixture = `class ReactNestedScrollView {\n  @Override\n  public void fling(int velocityY) {\n    final int correctedVelocityY = correctFlingVelocityY(velocityY);\n\n    if (mPagingEnabled) {\n      flingAndSnap(correctedVelocityY);\n    } else if (mScroller != null) {\n      int scrollWindowHeight = getHeight() - getPaddingBottom() - getPaddingTop();\n      mScroller.fling(\n          getScrollX(), getScrollY(), 0, correctedVelocityY, 0, 0, 0, Integer.MAX_VALUE, 0, scrollWindowHeight / 2);\n      ViewCompat.postInvalidateOnAnimation(this);\n    } else {\n      super.fling(correctedVelocityY);\n    }\n    handlePostTouchScrolling(0, correctedVelocityY);\n  }\n\n  private int correctFlingVelocityY(int velocityY) {\n    return velocityY;\n  }\n}\n`;
const patchedFling = patchReactNestedScrollView(flingFixture);
assert.match(patchedFling, new RegExp(FLING_MARKER));
assert.doesNotMatch(patchedFling, /mScroller\.fling\(/);
assert.match(patchedFling, /super\.fling\(correctedVelocityY\);/);
assert.match(patchedFling, /if \(mPagingEnabled\)/);
assert.equal(patchReactNestedScrollView(patchedFling), patchedFling);
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
  () => patchMainReactPackage('ReactScrollViewManager.REACT_CLASS\n'),
  /Expected exactly one RN 0\.86 ScrollView manager feature gate/
);

console.log('RN 0.86 AndroidX config-plugin checks passed.');
