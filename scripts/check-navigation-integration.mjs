#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const violations = [];
const requireText = (file, source, needle, label = needle) => {
  if (!source.includes(needle)) violations.push(`${file}: missing ${label}`);
};
const forbidText = (file, source, needle, label = needle) => {
  if (source.includes(needle)) violations.push(`${file}: contains forbidden ${label}`);
};

const files = {
  pkg: 'package.json',
  mapper: 'src/navigation/material3NavigationMapper.ts',
  header: 'src/navigation/Material3NavigationHeader.tsx',
  router: 'router.tsx',
  reactNavigation: 'react-navigation.tsx',
  topAndroid: 'src/MaterialTopAppBar.android.tsx',
  topNative: 'src/MaterialTopAppBarNativeView.tsx',
  toolbarNative: 'src/MaterialToolbarNativeView.tsx',
  hostNative: 'src/NativeScrollHost.android.tsx',
  topView: 'android/src/main/java/com/reactnativescroll/interop/material3/ui/MaterialTopAppBarView.kt',
  rnPackage: 'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeScrollInteropPackage.kt',
  readme: 'README.md',
  architecture: 'docs/architecture.md',
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));

for (const needle of [
  '"expo-router": ">=57.0.0 <58.0.0"',
  '"@react-navigation/native-stack": ">=7.0.0 <8.0.0"',
  '"react-native": ">=0.86.0 <0.87.0 || >=0.87.0-rc.3 <0.88.0"',
]) requireText(files.pkg, source.pkg, needle);
forbidText(files.pkg, source.pkg, '"expo": "*"', 'required Expo runtime peer');

for (const needle of [
  'SUPPORTED_HEADER_KEYS',
  'hasUnsupportedMaterial3HeaderOptions',
  'resolveMaterial3Navigation',
  'resolveMaterial3TopAppBarDescriptor',
  'headerLargeTitleEnabled === true || input.options.headerLargeTitle === true',
  "variant === 'small' ? 'pinned' : 'exitUntilCollapsed'",
]) requireText(files.mapper, source.mapper, needle);
for (const forbidden of ['expo-router', '@react-navigation', 'NativeScrollHost', 'onNestedScroll', 'scrollBy(', 'scrollTo(']) {
  forbidText(files.mapper, source.mapper, forbidden, `adapter/transport dependency ${forbidden}`);
}

for (const needle of [
  'MaterialTopAppBar',
  'resolveMaterial3TopAppBarDescriptor',
  "placement=\"header\"",
  "descriptor.navigationIcon === 'back' ? goBack : undefined",
]) requireText(files.header, source.header, needle);
for (const forbidden of ['expo-router', '@react-navigation', 'NativeScrollHost', 'onNestedScroll']) {
  forbidText(files.header, source.header, forbidden, `navigator/transport dependency ${forbidden}`);
}

for (const needle of [
  'Stack as ExpoStack',
  'resolveMaterial3Navigation',
  'Material3NavigationHeader',
  'Object.assign(MaterialStack, ExpoStack)',
]) requireText(files.router, source.router, needle);
for (const forbidden of ['SUPPORTED_HEADER_KEYS', 'MaterialTopAppBar', 'NativeScrollHost', 'onNestedScroll']) {
  forbidText(files.router, source.router, forbidden, `duplicated mapping/scroll logic ${forbidden}`);
}

for (const needle of [
  'resolveMaterial3Navigation',
  'Material3NavigationHeader',
  'material3NativeStackNavigatorOptions',
  'material3NativeStackScreenOptions',
  'withMaterial3NativeStackOptions',
]) requireText(files.reactNavigation, source.reactNavigation, needle);
for (const forbidden of [
  "from '@react-navigation",
  'SUPPORTED_HEADER_KEYS',
  'MaterialTopAppBar',
  'NativeScrollHost',
  'onNestedScroll',
]) forbidText(files.reactNavigation, source.reactNavigation, forbidden, `React Navigation adapter coupling ${forbidden}`);

for (const [file, content, nativeName] of [
  [files.topNative, source.topNative, 'RNSIMaterialTopAppBar'],
  [files.toolbarNative, source.toolbarNative, 'RNSIMaterialToolbar'],
  [files.hostNative, source.hostNative, 'RNSINestedScrollHost'],
]) {
  requireText(file, content, 'requireNativeComponent');
  requireText(file, content, nativeName);
  forbidText(file, content, 'requireNativeViewManager');
  forbidText(file, content, 'expo-modules-core');
}

for (const needle of [
  'small: 64',
  'medium: 112',
  'large: 152',
  "props.placement ?? 'overlay'",
  'useSafeAreaInsets()',
]) {
  requireText(files.topAndroid, source.topAndroid, needle);
}
for (const needle of [
  '"small" -> 64f',
  'else -> 112f',
  '"large" -> 152f',
  'emitDirectEvent("topNavigationPress")',
]) {
  requireText(files.topView, source.topView, needle);
}
forbidText(files.topView, source.topView, 'expo.modules.', 'Expo package dependency');

for (const manager of ['ReactNativeNestedScrollHostManager()', 'MaterialTopAppBarManager()', 'MaterialToolbarManager()']) {
  requireText(files.rnPackage, source.rnPackage, manager);
}
requireText(
  files.rnPackage,
  source.rnPackage,
  'ReactNativeNestedScrollParticipants.install(Material3NestedScrollParticipantProvider)'
);
forbidText(files.rnPackage, source.rnPackage, 'expo.modules.', 'Expo manager import');

for (const needle of [
  'React Navigation',
  'react-native-scroll-interop/react-navigation',
  'material3NativeStackNavigatorOptions',
  'material3NativeStackScreenOptions',
  'withMaterial3NativeStackOptions',
  'Expo Router and React Navigation share one internal navigator-neutral mapper',
]) requireText(files.readme, source.readme, needle);
for (const needle of [
  'Neutral core',
  'React Native boundary',
  'Material3 consumers',
  'React Navigation adapter',
  'Expo Router adapter',
  'react-native-screens.md',
]) requireText(files.architecture, source.architecture, needle);

if (violations.length) {
  console.error('Navigation integration invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('Navigation integration invariant: PASS');
console.log('  one shared navigator-neutral mapper owns navigation semantics');
console.log('  one shared Material3 header renderer owns UI translation');
console.log('  Expo Router and React Navigation adapters contain no scroll transport logic');
console.log('  native bridge uses standard React Native components');
