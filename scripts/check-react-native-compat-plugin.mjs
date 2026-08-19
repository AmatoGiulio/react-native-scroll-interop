#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  MANAGER_MARKER,
  RN086_FLING_MARKER,
  RN087_FLING_MARKER,
  SOURCE_BUILD_MARKER,
  assertSupportedReactNativeVersion,
  ensureReactNativeSourceBuildSettings,
  patchMainReactPackage,
  patchReactNestedScrollView086,
  patchReactNestedScrollView087,
} = require('../plugin/reactNativeScrollCompatPatch.js');

const count = (contents, token) => contents.split(token).length - 1;

assert.equal(assertSupportedReactNativeVersion('0.86.0'), '0.86');
assert.equal(assertSupportedReactNativeVersion('0.86.2+expo'), '0.86');
assert.equal(assertSupportedReactNativeVersion('0.87.0'), '0.87');
assert.equal(assertSupportedReactNativeVersion('0.87.3-rc.1'), '0.87');
assert.throws(() => assertSupportedReactNativeVersion('0.85.9'), /0\.86\.x and 0\.87\.x/);
assert.throws(() => assertSupportedReactNativeVersion('0.88.0'), /0\.86\.x and 0\.87\.x/);

const settingsFixture = `pluginManagement {\n  def expoAutolinking = new Object()\n}\nexpoAutolinking.useExpoModules()\n`;
const patchedSettings = ensureReactNativeSourceBuildSettings(settingsFixture);
assert.match(patchedSettings, new RegExp(SOURCE_BUILD_MARKER));
assert.match(patchedSettings, /includeBuild\(expoAutolinking\.reactNative\)/);
assert.match(patchedSettings, /com\.facebook\.react:react-android/);
assert.match(patchedSettings, /com\.facebook\.react:hermes-android/);
assert.equal(ensureReactNativeSourceBuildSettings(patchedSettings), patchedSettings);

const externalSourceBuildFixture = `${settingsFixture}\nincludeBuild(expoAutolinking.reactNative) {\n  dependencySubstitution {\n    substitute(module("com.facebook.react:react-android")).using(project(":packages:react-native:ReactAndroid"))\n    substitute(module("com.facebook.react:hermes-android")).using(project(":packages:react-native:ReactAndroid:hermes-engine"))\n  }\n}\n`;
assert.equal(
  ensureReactNativeSourceBuildSettings(externalSourceBuildFixture),
  externalSourceBuildFixture,
  'must compose with an existing complete React Native source-build configuration'
);
assert.throws(
  () => ensureReactNativeSourceBuildSettings(`${settingsFixture}\nincludeBuild(expoAutolinking.reactNative) {}\n`),
  /partial, duplicate or unexpected/
);
assert.throws(
  () => ensureReactNativeSourceBuildSettings('pluginManagement {}\n'),
  /does not expose expoAutolinking/
);

const listManagerGate = `if (ReactNativeFeatureFlags.useNestedScrollViewAndroid()) ReactNestedScrollViewManager()\n          else ReactScrollViewManager()`;
const mapManagerGate = `if (ReactNativeFeatureFlags.useNestedScrollViewAndroid())\n                    ReactNestedScrollViewManager()\n                else ReactScrollViewManager()`;
const managerFixture = `override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =\n      listOf(\n          ReactProgressBarViewManager(),\n          ${listManagerGate},\n          ReactSwitchManager(),\n      )\n\n  public val viewManagersMap: Map<String, ModuleSpec> =\n      mapOf(\n          ReactScrollViewManager.REACT_CLASS to\n              ModuleSpec.viewManagerSpec {\n                ${mapManagerGate}\n              },\n      )\n`;
const patchedManager = patchMainReactPackage(managerFixture);
assert.equal(count(patchedManager, MANAGER_MARKER), 2);
assert.doesNotMatch(patchedManager, /useNestedScrollViewAndroid/);
assert.equal(patchMainReactPackage(patchedManager), patchedManager);
assert.throws(
  () => patchMainReactPackage(managerFixture.replace(mapManagerGate, 'ReactScrollViewManager()')),
  /Expected 2 remaining ScrollView manager feature gate\(s\).*found 1/
);

const rn086Fixture = `class ReactNestedScrollView {\n  @Override\n  public void fling(int velocityY) {\n    final int correctedVelocityY = correctFlingVelocityY(velocityY);\n\n    if (mPagingEnabled) {\n      flingAndSnap(correctedVelocityY);\n    } else if (mScroller != null) {\n      mScroller.fling(getScrollX(), getScrollY(), 0, correctedVelocityY, 0, 0, 0, Integer.MAX_VALUE);\n      ViewCompat.postInvalidateOnAnimation(this);\n    } else {\n      super.fling(correctedVelocityY);\n    }\n    handlePostTouchScrolling(0, correctedVelocityY);\n  }\n\n  private int correctFlingVelocityY(int velocityY) { return velocityY; }\n}\n`;
const patched086 = patchReactNestedScrollView086(rn086Fixture);
assert.match(patched086, new RegExp(RN086_FLING_MARKER));
assert.doesNotMatch(patched086, /mScroller\.fling\(/);
assert.match(patched086, /super\.fling\(correctedVelocityY\);/);
assert.equal(patchReactNestedScrollView086(patched086), patched086);
assert.throws(
  () => patchReactNestedScrollView086('class ReactNestedScrollView {}\n'),
  /Could not locate ReactNestedScrollView\.fling/
);

const legacy086 = patched086.replace(
  RN086_FLING_MARKER,
  'EXPO_MATERIAL_TOOLBAR_RN086_ANDROIDX_FLING'
);
assert.match(patchReactNestedScrollView086(legacy086), new RegExp(RN086_FLING_MARKER));

const rn087Fixture = `internal open class ReactNestedScrollView {\n  override fun fling(velocityY: Int) {\n    val correctedVelocityY = correctFlingVelocityY(velocityY)\n\n    if (pagingEnabled) {\n      flingAndSnap(correctedVelocityY)\n    } else if (scroller != null) {\n      scroller.fling(\n          scrollX, scrollY, 0, correctedVelocityY, 0, 0, 0, Int.MAX_VALUE, 0, height / 2)\n      ViewCompat.postInvalidateOnAnimation(this)\n    } else {\n      super.fling(correctedVelocityY)\n    }\n    handlePostTouchScrolling(0, correctedVelocityY)\n  }\n\n  private fun correctFlingVelocityY(velocityY: Int): Int = velocityY\n}\n`;
const patched087 = patchReactNestedScrollView087(rn087Fixture);
assert.match(patched087, new RegExp(RN087_FLING_MARKER));
assert.doesNotMatch(patched087, /scroller\.fling\(/);
assert.match(patched087, /super\.fling\(correctedVelocityY\)/);
assert.equal(patchReactNestedScrollView087(patched087), patched087);
assert.throws(
  () => patchReactNestedScrollView087('internal class ReactNestedScrollView {}\n'),
  /Could not locate ReactNestedScrollView\.fling/
);

const legacy087 = patched087
  .replace(RN087_FLING_MARKER, 'RN087_NESTED_FLING_SOURCE_PATCH')
  .replace(
    'super.fling(correctedVelocityY)',
    'android.util.Log.i("Rn087NestedScroll", "SOURCE_FLING_PATCH")\n      super.fling(correctedVelocityY)'
  );
const normalized087 = patchReactNestedScrollView087(legacy087);
assert.match(normalized087, new RegExp(RN087_FLING_MARKER));
assert.doesNotMatch(normalized087, /SOURCE_FLING_PATCH/);

console.log('React Native 0.86/0.87 AndroidX compatibility plugin invariant: PASS');
console.log('  source-build configuration is idempotent and fail-closed');
console.log('  nested ScrollView manager selection is deterministic');
console.log('  RN 0.86 Java fling delegates ordinary motion to AndroidX');
console.log('  RN 0.87 Kotlin fling delegates ordinary motion to AndroidX');
console.log('  paging/snap remains on the existing React Native branch');
