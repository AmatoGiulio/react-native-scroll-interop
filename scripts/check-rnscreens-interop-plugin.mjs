#!/usr/bin/env node

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const {
  assertSupportedReactNativeScreensVersion,
  patchReactNativeScreensGradle,
  patchScreen,
} = require('../plugin/reactNativeScreensInteropPatch');

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const pluginSource = read('plugin/reactNativeScreensInteropPatch.js');
const upstreamPlan = read('UPSTREAM_REACT_NATIVE_SCREENS.md');
const violations = [];

function expect(condition, message) {
  if (!condition) violations.push(message);
}

for (const version of ['4.26.0', '4.26.2', '4.26.99']) {
  try {
    assertSupportedReactNativeScreensVersion(version);
  } catch (error) {
    violations.push(`expected supported react-native-screens version ${version}: ${error.message}`);
  }
}

for (const version of ['4.25.0', '4.27.0', '5.0.0']) {
  let rejected = false;
  try {
    assertSupportedReactNativeScreensVersion(version);
  } catch {
    rejected = true;
  }
  expect(rejected, `unsupported react-native-screens version must fail closed: ${version}`);
}

const gradleFixture = `dependencies {\n    implementation 'com.facebook.react:react-native:+'\n    implementation 'androidx.appcompat:appcompat:1.7.1'\n}\n`;
const patchedGradle = patchReactNativeScreensGradle(gradleFixture);
expect(
  patchedGradle.includes("implementation project(':react-native-scroll-interop')"),
  'react-native-screens Gradle patch must depend on react-native-scroll-interop'
);
expect(
  patchReactNativeScreensGradle(patchedGradle) === patchedGradle,
  'react-native-screens Gradle patch must be idempotent'
);

const screenFixture = `package com.swmansion.rnscreens\n\nimport android.view.MotionEvent\nimport android.view.View\nimport android.view.ViewGroup\nimport android.view.WindowManager\nimport androidx.core.view.children\nimport com.facebook.react.uimanager.events.EventDispatcher\n\nclass Screen(\n    val reactContext: ThemedReactContext,\n) : FabricEnabledViewGroup(reactContext),\n    ScreenContentWrapper.OnLayoutCallback,\n    FragmentProviding {\n    var container: ScreenContainer? = null\n\n    private val isNativeStackScreen: Boolean\n        get() = container is ScreenStack\n\n    init {\n        layoutParams = WindowManager.LayoutParams(WindowManager.LayoutParams.TYPE_APPLICATION)\n    }\n\n    val contentWrapper: ScreenContentWrapper?\n        get() = children.find { it is ScreenContentWrapper } as? ScreenContentWrapper\n\n    override fun onLayout(\n        changed: Boolean,\n        l: Int,\n        t: Int,\n        r: Int,\n        b: Int,\n    ) {\n        if (changed && isNativeStackScreen && !usesFormSheetPresentation()) {\n            val width = r - l\n            val height = b - t\n\n            updateShadowNodeScreenSize(width, height, t)\n        }\n    }\n\n    internal fun onBottomSheetBehaviorDidLayout(coordinatorLayoutDidChange: Boolean) {}\n\n    override fun onAttachedToWindow() {\n        super.onAttachedToWindow()\n\n        // Insets handler for formSheet\n        if (usesFormSheetPresentation()) {\n            Unit\n        }\n    }\n\n    private fun dispatchSheetDetentChanged(\n        detentIndex: Int,\n        isStable: Boolean,\n    ) {}\n}\n`;

const patchedScreen = patchScreen(screenFixture);
for (const needle of [
  'NestedScrollingParent3',
  'ReactNativeNestedScrollParentController(this)',
  'ReactNativeVerticalScrollSourceLocator.findUniqueDescendant(root)',
  'requestNestedScrollInteropBinding()',
  'nestedScrollInterop.onOwnerAttached()',
  'nestedScrollInterop.onOwnerDetached()',
  'nestedScrollInterop.onStartNestedScroll(',
  'nestedScrollInterop.onNestedPreScroll(',
  'nestedScrollInterop.onNestedScroll(',
]) {
  expect(patchedScreen.includes(needle), `Screen patch missing ${needle}`);
}
expect(
  patchScreen(patchedScreen) === patchedScreen,
  'Screen patch must be idempotent'
);

for (const forbidden of [
  'material3',
  'MaterialTopAppBar',
  'MaterialToolbar',
  'expo-router',
  'expo.modules',
]) {
  expect(
    !pluginSource.includes(forbidden),
    `react-native-screens adapter must stay navigation/Material/Expo neutral: ${forbidden}`
  );
}

for (const required of [
  'ScreenNestedScrollDelegate',
  'NestedScrollingParent3',
  'With no delegate installed',
  'Keep the current fail-closed 4.26.x patcher',
  'Remove source patching for supported upstream versions',
]) {
  expect(upstreamPlan.includes(required), `upstream react-native-screens plan missing ${required}`);
}

if (violations.length > 0) {
  console.error('react-native-screens interop plugin invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('react-native-screens interop plugin invariant: PASS');
console.log('  supported line is version-scoped to react-native-screens 4.26.x');
console.log('  legacy Screen.kt becomes the real NestedScrollingParent3 ancestor');
console.log('  Screen forwards to ReactNativeNestedScrollParentController');
console.log('  screen-owned content subtree resolves exactly one RN vertical source');
console.log('  adapter contains no Material3, navigation-library or Expo concepts');
console.log('  upstream-neutral AndroidX delegate seam is documented');
console.log('  Gradle dependency on react-native-scroll-interop is injected idempotently');
