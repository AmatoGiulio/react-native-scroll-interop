#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  assertSupportedReactNativeScreensVersion,
  patchReactNativeScreensGradle,
  patchScreen,
} = require('../plugin/reactNativeScreensInteropPatch');

const violations = [];
const bridgeSource = readFileSync(
  new URL('../android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeScreenNestedScrollBridge.kt', import.meta.url),
  'utf8'
);

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
  'ReactNativeScreenNestedScrollBridge(',
  'nestedScrollInterop.onOwnerAttached()',
  'nestedScrollInterop.onOwnerLayout()',
  'nestedScrollInterop.onOwnerDetached()',
  'nestedScrollInterop.onStartNestedScroll(',
  'nestedScrollInterop.onNestedPreScroll(',
  'nestedScrollInterop.onNestedScroll(',
]) {
  expect(patchedScreen.includes(needle), `Screen patch missing ${needle}`);
}
for (const forbidden of [
  'ReactNativeNestedScrollParentController',
  'ReactNativeVerticalScrollSourceLocator',
  'com.reactnativescroll.interop.material3',
  'expo.modules.materialtoolbar',
]) {
  expect(!patchedScreen.includes(forbidden), `Screen patch must not know ${forbidden}`);
}
expect(patchScreen(patchedScreen) === patchedScreen, 'Screen patch must be idempotent');

for (const forbidden of [
  'com.reactnativescroll.interop.material3',
  'expo.modules.materialtoolbar',
  'com.swmansion.rnscreens',
]) {
  expect(!bridgeSource.includes(forbidden), `neutral screen bridge must not know ${forbidden}`);
}
for (const needle of [
  'ReactNativeNestedScrollParentController(owner)',
  'ReactNativeVerticalScrollSourceLocator.findUniqueDescendant',
  'NestedScrollingParent3',
  'fun onOwnerAttached()',
  'fun onOwnerLayout()',
  'fun onOwnerDetached()',
]) {
  expect(bridgeSource.includes(needle), `neutral screen bridge missing ${needle}`);
}

if (violations.length > 0) {
  console.error('react-native-screens interop plugin invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('react-native-screens interop plugin invariant: PASS');
console.log('  supported patch line remains react-native-screens 4.26.x');
console.log('  Screen.kt only integrates the neutral ReactNativeScreenNestedScrollBridge');
console.log('  controller/source discovery stay inside the reusable React Native boundary');
console.log('  screens patch contains no Material3 or Expo Modules knowledge');
console.log('  Gradle dependency on react-native-scroll-interop is injected idempotently');
