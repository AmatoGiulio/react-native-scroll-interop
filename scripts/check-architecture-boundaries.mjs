#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const violations = [];

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

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

function forbid(relativePath, source, needle, reason = needle) {
  if (source.includes(needle)) violations.push(`${relativePath}: forbidden ${reason}`);
}

function requireMarker(relativePath, source, marker, reason = marker) {
  if (!source.includes(marker)) violations.push(`${relativePath}: missing ${reason}`);
}

// 1. Neutral core must not know React Native, Material3, Expo or navigation.
for (const relativePath of filesUnder('android/src/main/java/com/reactnativescroll/interop/core', '.kt')) {
  const source = read(relativePath);
  for (const needle of [
    'com.facebook.react',
    'com.reactnativescroll.interop.reactnative',
    'com.reactnativescroll.interop.material3',
    'expo.modules',
    'com.swmansion.rnscreens',
  ]) {
    forbid(relativePath, source, needle, `core dependency ${needle}`);
  }
}

// 2. RN transport/boundary is generic. The package composition root is intentionally excluded:
// it selects Material3 as this package's reference consumer, while controller/host/bridges do not.
for (const relativePath of [
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollParentController.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollParticipants.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollHostView.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeScreenNestedScrollBridge.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeVerticalScrollSourceLocator.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactVerticalScrollSourceInterop.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeScrollTracing.kt',
]) {
  const source = read(relativePath);
  for (const needle of [
    'com.reactnativescroll.interop.material3',
    'expo.modules',
    'com.swmansion.rnscreens',
  ]) {
    forbid(relativePath, source, needle, `RN boundary dependency ${needle}`);
  }
}

const controllerPath =
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollParentController.kt';
const controller = read(controllerPath);
for (const marker of [
  'ReactNativeNestedScrollParticipants.prepare(source)',
  'ReactNativeNestedScrollParticipants.bind(source)',
  'VerticalNestedScrollTransactionDispatcher()',
  'SourceScopedNestedScrollLifecycle()',
]) {
  requireMarker(controllerPath, controller, marker);
}
for (const needle of ['TopAppBar', 'FloatingToolbar', 'Material3NestedScroll']) {
  forbid(controllerPath, controller, needle, `consumer-specific RN controller symbol ${needle}`);
}

// 3. react-native-screens patch sees one neutral bridge only.
const screensPatchPath = 'plugin/reactNativeScreensInteropPatch.js';
const screensPatch = read(screensPatchPath);
requireMarker(screensPatchPath, screensPatch, 'ReactNativeScreenNestedScrollBridge');
for (const needle of [
  'ReactNativeNestedScrollParentController',
  'ReactNativeVerticalScrollSourceLocator',
  'com.reactnativescroll.interop.material3',
  'expo.modules.materialtoolbar',
]) {
  forbid(screensPatchPath, screensPatch, needle, `screens adapter coupling ${needle}`);
}

// 4. Material3 owns its participant provider and adapters above the RN/core boundary.
const materialProviderPath =
  'android/src/main/java/com/reactnativescroll/interop/material3/Material3NestedScrollParticipantProvider.kt';
const materialProvider = read(materialProviderPath);
for (const marker of [
  'ReactNativeNestedScrollParticipantProvider',
  'Material3TopAppBarNestedScrollAdapter',
  'Material3FloatingToolbarNestedScrollAdapter',
  'ReactNativeNestedScrollParticipantSession',
]) {
  requireMarker(materialProviderPath, materialProvider, marker);
}

const packageRootPath =
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeScrollInteropPackage.kt';
const packageRoot = read(packageRootPath);
requireMarker(packageRootPath, packageRoot, 'ReactNativeNestedScrollParticipants.install(Material3NestedScrollParticipantProvider)');
forbid(packageRootPath, packageRoot, 'expo.modules.materialtoolbar', 'private Compose implementation package');

// 5. Navigation semantics live in one navigator-neutral mapper.
const mapperPath = 'src/navigation/material3NavigationMapper.ts';
const mapper = read(mapperPath);
for (const needle of ['expo-router', '@react-navigation', 'NativeScrollHost', 'onNestedScroll', 'scrollY']) {
  forbid(mapperPath, mapper, needle, `navigation mapper coupling ${needle}`);
}
for (const marker of [
  'resolveMaterial3Navigation',
  'resolveMaterial3TopAppBarDescriptor',
  'SUPPORTED_HEADER_KEYS',
]) {
  requireMarker(mapperPath, mapper, marker);
}

for (const [relativePath, requiredNavigator, forbiddenNavigator] of [
  ['router.tsx', 'expo-router', '@react-navigation'],
  ['react-navigation.tsx', 'resolveMaterial3Navigation', 'expo-router'],
]) {
  const source = read(relativePath);
  requireMarker(relativePath, source, requiredNavigator);
  requireMarker(relativePath, source, 'resolveMaterial3Navigation');
  requireMarker(relativePath, source, 'Material3NavigationHeader');
  forbid(relativePath, source, forbiddenNavigator);
  for (const needle of ['SUPPORTED_HEADER_KEYS', 'onNestedScroll', 'scrollY']) {
    forbid(relativePath, source, needle, `adapter-owned mapping/scroll logic ${needle}`);
  }
}
forbid('react-navigation.tsx', read('react-navigation.tsx'), '@react-navigation', 'runtime React Navigation dependency');

// 6. Expo Modules runtime is gone. Historical private Kotlin package names are tolerated only for
// Compose view implementation; importing Expo Modules APIs is not.
const androidGradle = read('android/build.gradle');
forbid('android/build.gradle', androidGradle, 'expo-module-gradle-plugin');
if (existsSync(path.join(root, 'expo-module.config.json'))) {
  violations.push('expo-module.config.json: Expo Modules registration file must remain removed');
}
const packageJson = read('package.json');
forbid('package.json', packageJson, '"expo": "*"', 'required Expo peer');
for (const relativePath of filesUnder('android/src/main/java', '.kt')) {
  const source = read(relativePath);
  forbid(relativePath, source, 'expo.modules.kotlin', 'Expo Modules Kotlin API');
}

for (const obsoletePath of [
  'src/ExpoMaterialTopAppBarNativeView.tsx',
  'src/ExpoMaterialToolbarNativeView.tsx',
  'android/src/main/java/expo/modules/materialtoolbar/ReactNativeNestedScrollHostView.kt',
  'android/src/main/java/expo/modules/materialtoolbar/ReactNativeNestedScrollHostManager.kt',
]) {
  if (existsSync(path.join(root, obsoletePath))) {
    violations.push(`${obsoletePath}: obsolete Expo-named RN boundary must be removed`);
  }
}

if (violations.length) {
  console.error('Architecture boundary invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('Architecture boundary invariant: PASS');
console.log('  neutral core has no RN/Material/Expo dependency');
console.log('  RN transport has no Material3/screens/Expo dependency');
console.log('  react-native-screens patch integrates one neutral screen bridge');
console.log('  Material3 is installed as a participant provider above the RN boundary');
console.log('  Expo Router and React Navigation share one navigator-neutral mapper');
console.log('  Expo Modules APIs/plugin/registration remain absent');
