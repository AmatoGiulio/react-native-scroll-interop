#!/usr/bin/env node

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  assertSupportedReactNativeScreensVersion,
  patchReactNativeScreensGradle,
  patchStackScreen,
} = require('../plugin/reactNativeScreensInteropPatch');

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

const stackScreenFixture = `package com.swmansion.rnscreens.stack.screen\n\nimport android.view.ViewGroup\nimport com.facebook.react.uimanager.ThemedReactContext\nimport com.swmansion.rnscreens.common.FragmentProviding\nimport com.swmansion.rnscreens.common.container.ContainerItem\nimport com.swmansion.rnscreens.common.container.ContainerItemSupport\nimport com.swmansion.rnscreens.scrollviewmarker.ScrollViewMarker\nimport com.swmansion.rnscreens.scrollviewmarker.ScrollViewSeeking\n\nclass StackScreen(\n    private val reactContext: ThemedReactContext,\n) : ViewGroup(reactContext),\n    FragmentProviding,\n    ScrollViewSeeking,\n    ContainerItem {\n    private val containerItemSupport = ContainerItemSupport()\n\n    // region ScrollViewSeeking\n\n    override fun registerScrollView(\n        marker: ScrollViewMarker,\n        scrollView: ViewGroup,\n    ) {\n        containerItemSupport.registerScrollView(scrollView)\n        headerConfig?.onContentScrollViewChanged()\n    }\n\n    // endregion\n\n    internal lateinit var eventEmitter: StackScreenEventEmitter\n\n    override fun findContentScrollView(): ViewGroup? = containerItemSupport.findContentScrollView(this)\n}\n`;

const patchedStack = patchStackScreen(stackScreenFixture);
for (const needle of [
  'NestedScrollingParent3',
  'ReactNativeNestedScrollParentController(this)',
  'nestedScrollInterop.prepareNestedSource(scrollView)',
  'nestedScrollInterop.onOwnerAttached()',
  'nestedScrollInterop.onOwnerDetached()',
  'nestedScrollInterop.onStartNestedScroll(',
  'nestedScrollInterop.onNestedPreScroll(',
  'nestedScrollInterop.onNestedScroll(',
  'findContentScrollView()?.let(nestedScrollInterop::prepareNestedSource)',
]) {
  expect(patchedStack.includes(needle), `StackScreen patch missing ${needle}`);
}
expect(
  patchStackScreen(patchedStack) === patchedStack,
  'StackScreen patch must be idempotent'
);

if (violations.length > 0) {
  console.error('react-native-screens interop plugin invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('react-native-screens interop plugin invariant: PASS');
console.log('  supported line is version-scoped to react-native-screens 4.26.x');
console.log('  StackScreen becomes the real NestedScrollingParent3 ancestor');
console.log('  StackScreen forwards to ReactNativeNestedScrollParentController');
console.log('  screen-owned content ScrollView is prepared directly');
console.log('  Gradle dependency on react-native-scroll-interop is injected idempotently');
