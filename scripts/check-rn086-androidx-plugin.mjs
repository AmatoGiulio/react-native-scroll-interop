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

const count = (contents, token) => contents.split(token).length - 1;

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

// RN 0.86.0 and 0.86.2 expose the vertical ScrollView manager through two creation paths:
// createViewManagers() and viewManagersMap. A clean consumer has both feature gates, while the
// original proof runner had already replaced only the viewManagersMap gate.
const listManagerGate = `if (ReactNativeFeatureFlags.useNestedScrollViewAndroid()) ReactNestedScrollViewManager()\n          else ReactScrollViewManager()`;
const mapManagerGate = `if (ReactNativeFeatureFlags.useNestedScrollViewAndroid())\n                    ReactNestedScrollViewManager()\n                else ReactScrollViewManager()`;
const productionManagerSelection = `/* ${MANAGER_MARKER}: select the existing RN 0.86 AndroidX vertical ScrollView source. */\n                ReactNestedScrollViewManager()`;
const experimentManagerSelection = `/* RN086_ANDROIDX_MANAGER_PATCH: experiment branch always selects the existing RN 0.86 AndroidX source. */\n                ReactNestedScrollViewManager()`;

const managerFixture = `override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =\n      listOf(\n          ReactProgressBarViewManager(),\n          ${listManagerGate},\n          ReactSwitchManager(),\n      )\n\n  public val viewManagersMap: Map<String, ModuleSpec> =\n      mapOf(\n          ReactScrollViewManager.REACT_CLASS to\n              ModuleSpec.viewManagerSpec {\n                ${mapManagerGate}\n              },\n      )\n`;

const patchedManager = patchMainReactPackage(managerFixture);
assert.equal(count(patchedManager, MANAGER_MARKER), 2);
assert.doesNotMatch(patchedManager, /useNestedScrollViewAndroid/);
assert.equal(count(patchedManager, 'ReactNestedScrollViewManager()'), 2);
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

const experimentManagerFixture = managerFixture.replace(mapManagerGate, experimentManagerSelection);
const normalizedExperimentManager = patchMainReactPackage(experimentManagerFixture);
assert.equal(count(normalizedExperimentManager, MANAGER_MARKER), 2);
assert.doesNotMatch(normalizedExperimentManager, /RN086_ANDROIDX_MANAGER_PATCH/);
assert.doesNotMatch(normalizedExperimentManager, /useNestedScrollViewAndroid/);

const legacyProductionPartialFixture = managerFixture.replace(
  mapManagerGate,
  productionManagerSelection
);
const normalizedLegacyProduction = patchMainReactPackage(legacyProductionPartialFixture);
assert.equal(count(normalizedLegacyProduction, MANAGER_MARKER), 2);
assert.doesNotMatch(normalizedLegacyProduction, /useNestedScrollViewAndroid/);
assert.equal(patchMainReactPackage(normalizedLegacyProduction), normalizedLegacyProduction);

assert.throws(
  () => patchMainReactPackage('ReactScrollViewManager.REACT_CLASS to\n'),
  /missing the expected RN 0\.86 ScrollView manager entry points/
);
assert.throws(
  () =>
    patchMainReactPackage(
      managerFixture.replace(mapManagerGate, 'ReactScrollViewManager()')
    ),
  /Expected 2 remaining RN 0\.86 ScrollView manager feature gate\(s\).*found 1/
);
assert.throws(
  () => patchMainReactPackage(`${managerFixture}\n${listManagerGate}\n`),
  /Expected 2 remaining RN 0\.86 ScrollView manager feature gate\(s\).*found 3/
);

console.log('RN 0.86 AndroidX config-plugin hardening checks passed.');
