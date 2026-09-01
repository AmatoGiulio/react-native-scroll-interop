#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const violations = [];
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

function filesUnder(relativeDir, extension) {
  const absoluteDir = path.join(root, relativeDir);
  if (!existsSync(absoluteDir)) return [];
  const result = [];
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) result.push(...filesUnder(relativePath, extension));
    else if (entry.name.endsWith(extension)) result.push(relativePath.replaceAll('\\', '/'));
  }
  return result;
}

const forbid = (file, source, needle, label = needle) => {
  if (source.includes(needle)) violations.push(`${file}: forbidden ${label}`);
};
const requireMarker = (file, source, marker, label = marker) => {
  if (!source.includes(marker)) violations.push(`${file}: missing ${label}`);
};

// Neutral core: no RN, Material3, Expo, screens or navigation knowledge.
for (const file of filesUnder('android/src/main/java/com/reactnativescroll/interop/core', '.kt')) {
  const source = read(file);
  for (const needle of [
    'com.facebook.react',
    'com.reactnativescroll.interop.reactnative',
    'com.reactnativescroll.interop.material3',
    'expo.modules',
    'com.swmansion.rnscreens',
  ]) forbid(file, source, needle, `core dependency ${needle}`);
}

// RN transport/boundary: no Material3, screens or Expo knowledge. The package composition root is
// intentionally excluded because it selects the shipped reference consumer.
const rnBoundaryFiles = [
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollParentController.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollControllerCore.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollParticipants.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollHostView.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeScreenNestedScrollBridge.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeVerticalScrollSourceLocator.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/AndroidNestedScrollSourceInterop.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ComposeVerticalScrollSourceInterop.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactVerticalScrollSourceInterop.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeScrollTracing.kt',
];
for (const file of rnBoundaryFiles) {
  const source = read(file);
  for (const needle of [
    'com.reactnativescroll.interop.material3',
    'expo.modules',
    'com.swmansion.rnscreens',
  ]) forbid(file, source, needle, `RN boundary dependency ${needle}`);
}

const viewEventsPath =
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeViewEvents.kt';
const viewEvents = read(viewEventsPath);
for (const marker of [
  'UIManagerHelper.getEventDispatcher(reactContext)',
  'UIManagerHelper.getSurfaceId(reactContext)',
  'Event<DirectViewEvent>',
]) requireMarker(viewEventsPath, viewEvents, marker);
forbid(
  viewEventsPath,
  viewEvents,
  'RCTEventEmitter',
  'legacy RCTEventEmitter direct-event transport'
);

const corePath = 'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollControllerCore.kt';
const controllerCore = read(corePath);
for (const marker of [
  'ReactNativeNestedScrollParticipants.prepare(source)',
  'ReactNativeNestedScrollParticipants.bind(source)',
  'VerticalNestedScrollTransactionDispatcher()',
  'SourceScopedNestedScrollLifecycle()',
  'dispatcher.bindParticipants(',
  'AndroidNestedScrollSourceInterop.resolve(target)',
]) requireMarker(corePath, controllerCore, marker);
for (const forbidden of [
  'ReactVerticalScrollSourceInterop.resolve(target)',
  'ComposeVerticalScrollSourceInterop.asSupported(target)',
]) forbid(corePath, controllerCore, forbidden, `controller-owned source branch ${forbidden}`);
for (const forbidden of ['TopAppBar', 'FloatingToolbar', 'Material3NestedScroll', 'NativeNestedScrollRegistry']) {
  forbid(corePath, controllerCore, forbidden, `consumer-specific controller symbol ${forbidden}`);
}

// react-native-screens knows one RN-neutral bridge only.
const screensPath = 'plugin/reactNativeScreensInteropPatch.js';
const screens = read(screensPath);
requireMarker(screensPath, screens, 'ReactNativeScreenNestedScrollBridge');
for (const forbidden of [
  'ReactNativeNestedScrollParentController',
  'ReactNativeVerticalScrollSourceLocator',
  'com.reactnativescroll.interop.material3',
  'expo.modules.materialtoolbar',
]) forbid(screensPath, screens, forbidden, `screens adapter coupling ${forbidden}`);

// Material3 installs neutral participants above the RN/core boundary.
const providerPath =
  'android/src/main/java/com/reactnativescroll/interop/material3/ui/Material3NestedScrollParticipantProvider.kt';
const provider = read(providerPath);
for (const marker of [
  'ReactNativeNestedScrollParticipantProvider',
  'ReactNativeNestedScrollParticipantSession',
  'Material3TopAppBarNestedScrollAdapter',
  'Material3FloatingToolbarNestedScrollAdapter',
  'NativeNestedScrollRegistry.resolveTopBar',
  'NativeNestedScrollRegistry.resolveToolbar',
]) requireMarker(providerPath, provider, marker);

const packagePath =
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeScrollInteropPackage.kt';
const packageRoot = read(packagePath);
requireMarker(
  packagePath,
  packageRoot,
  'ReactNativeNestedScrollParticipants.install(Material3NestedScrollParticipantProvider)'
);
forbid(packagePath, packageRoot, 'expo.modules', 'Expo composition dependency');

// Navigation semantics live in one navigator-neutral mapper/header renderer.
const mapperPath = 'src/navigation/material3NavigationMapper.ts';
const mapper = read(mapperPath);
for (const forbidden of ['expo-router', '@react-navigation', 'NativeScrollHost', 'onNestedScroll', 'scrollY']) {
  forbid(mapperPath, mapper, forbidden, `navigation mapper coupling ${forbidden}`);
}
for (const marker of [
  'resolveMaterial3Navigation',
  'resolveMaterial3TopAppBarDescriptor',
  'SUPPORTED_HEADER_KEYS',
]) requireMarker(mapperPath, mapper, marker);

const headerPath = 'src/navigation/Material3NavigationHeader.tsx';
const header = read(headerPath);
requireMarker(headerPath, header, 'MaterialTopAppBar');
requireMarker(headerPath, header, 'resolveMaterial3TopAppBarDescriptor');
for (const forbidden of ['expo-router', '@react-navigation', 'NativeScrollHost', 'onNestedScroll']) {
  forbid(headerPath, header, forbidden, `shared header coupling ${forbidden}`);
}

for (const [file, navigator, forbiddenNavigator] of [
  ['router.tsx', 'expo-router', '@react-navigation'],
  ['react-navigation.tsx', 'resolveMaterial3Navigation', 'expo-router'],
]) {
  const source = read(file);
  requireMarker(file, source, navigator);
  requireMarker(file, source, 'resolveMaterial3Navigation');
  requireMarker(file, source, 'Material3NavigationHeader');
  forbid(file, source, forbiddenNavigator, `adapter dependency ${forbiddenNavigator}`);
  for (const forbidden of ['SUPPORTED_HEADER_KEYS', 'onNestedScroll', 'scrollY', 'NativeScrollHost']) {
    forbid(file, source, forbidden, `adapter-owned mapping/scroll logic ${forbidden}`);
  }
}
forbid(
  'react-navigation.tsx',
  read('react-navigation.tsx'),
  "from '@react-navigation",
  'runtime/type import from React Navigation'
);

// Expo Modules runtime and historical implementation tree stay gone.
const androidGradle = read('android/build.gradle');
forbid('android/build.gradle', androidGradle, 'expo-module-gradle-plugin');
if (existsSync(path.join(root, 'expo-module.config.json'))) {
  violations.push('expo-module.config.json: Expo Modules registration must remain removed');
}
if (existsSync(path.join(root, 'android/src/main/java/expo'))) {
  violations.push('android/src/main/java/expo: legacy Expo implementation tree must remain removed');
}
for (const file of filesUnder('android/src/main/java', '.kt')) {
  forbid(file, read(file), 'expo.modules.kotlin', 'Expo Modules Kotlin API');
}

if (violations.length) {
  console.error('Architecture boundary invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('Architecture boundary invariant: PASS');
console.log('  neutral core has no RN/Material/Expo dependency');
console.log('  RN transport has no Material3/screens/Expo dependency');
console.log('  native view events use the New Architecture EventDispatcher path');
console.log('  react-native-screens integrates one neutral RN screen bridge');
console.log('  Material3 is installed through the neutral participant provider');
console.log('  Expo Router and React Navigation share mapper/header semantics');
console.log('  Expo Modules runtime/implementation tree remains absent');
