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
  router: 'router.tsx',
  reactNavigation: 'react-navigation.tsx',
  topAndroid: 'src/MaterialTopAppBar.android.tsx',
  topNative: 'src/MaterialTopAppBarNativeView.tsx',
  toolbarNative: 'src/MaterialToolbarNativeView.tsx',
  hostNative: 'src/NativeScrollHost.android.tsx',
  topView: 'android/src/main/java/com/reactnativescroll/interop/material3/ui/MaterialTopAppBarView.kt',
  rnPackage: 'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeScrollInteropPackage.kt',
  readme: 'README.md',
  architecture: 'ARCHITECTURE.md',
};
const s = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));

for (const needle of [
  '"expo-router": ">=57.0.0 <58.0.0"',
  '"@react-navigation/native-stack": ">=7.0.0 <8.0.0"',
  '"react-native": ">=0.86.0 <0.87.0 || >=0.87.0-rc.3 <0.88.0"',
]) requireText(files.pkg, s.pkg, needle);
forbidText(files.pkg, s.pkg, '"expo": "*"', 'required Expo runtime peer');

for (const needle of [
  'SUPPORTED_HEADER_KEYS',
  'hasUnsupportedMaterial3HeaderOptions',
  'resolveMaterial3HeaderDecision',
  'headerLargeTitleEnabled === true || options.headerLargeTitle === true',
  "variant === 'large' ? 'exitUntilCollapsed' : 'none'",
  'material3?.topAppBar === false',
]) requireText(files.mapper, s.mapper, needle);
for (const forbidden of ['expo-router', '@react-navigation', 'NativeScrollHost', 'onScroll', 'scrollBy(', 'scrollTo(']) {
  forbidText(files.mapper, s.mapper, forbidden, `adapter/transport dependency ${forbidden}`);
}

for (const needle of [
  'Stack as ExpoStack',
  'resolveMaterial3HeaderDecision',
  'MaterialTopAppBar',
  'headerProps.navigation.goBack()',
  'Object.assign(MaterialStack, ExpoStack)',
]) requireText(files.router, s.router, needle);
forbidText(files.router, s.router, 'SUPPORTED_HEADER_KEYS', 'duplicated mapping table');

for (const needle of [
  "from '@react-navigation/native-stack'",
  'resolveMaterial3HeaderDecision',
  'material3NativeStackNavigatorOptions',
  'material3NativeStackScreenOptions',
  'withMaterial3NativeStackOptions',
  'headerProps.navigation.goBack()',
]) requireText(files.reactNavigation, s.reactNavigation, needle);
forbidText(files.reactNavigation, s.reactNavigation, 'SUPPORTED_HEADER_KEYS', 'duplicated mapping table');

for (const [file, source] of [[files.router, s.router], [files.reactNavigation, s.reactNavigation]]) {
  for (const forbidden of ['NativeScrollHost', 'onScroll=', 'scrollBy(', 'scrollTo(', 'ReactNativeNestedScrollParentController']) {
    forbidText(file, source, forbidden, `scroll transport logic ${forbidden}`);
  }
}

for (const [file, source, nativeName] of [
  [files.topNative, s.topNative, 'RNSIMaterialTopAppBar'],
  [files.toolbarNative, s.toolbarNative, 'RNSIMaterialToolbar'],
  [files.hostNative, s.hostNative, 'RNSINestedScrollHost'],
]) {
  requireText(file, source, 'requireNativeComponent');
  requireText(file, source, nativeName);
  forbidText(file, source, 'requireNativeViewManager');
  forbidText(file, source, 'expo-modules-core');
}

for (const needle of ['small: 64', 'medium: 112', 'large: 152', "props.placement ?? 'overlay'", 'useSafeAreaInsets()']) {
  requireText(files.topAndroid, s.topAndroid, needle);
}
for (const needle of ['"small" -> 64f', 'else -> 112f', '"large" -> 152f', 'emitDirectEvent("topNavigationPress")']) {
  requireText(files.topView, s.topView, needle);
}
forbidText(files.topView, s.topView, 'expo.modules.', 'Expo package dependency');

for (const manager of ['ReactNativeNestedScrollHostManager()', 'MaterialTopAppBarManager()', 'MaterialToolbarManager()']) {
  requireText(files.rnPackage, s.rnPackage, manager);
}
forbidText(files.rnPackage, s.rnPackage, 'expo.modules.', 'Expo manager import');

for (const needle of [
  'React Navigation',
  'react-native-scroll-interop/react-navigation',
  'material3NativeStackNavigatorOptions',
  'material3NativeStackScreenOptions',
  'withMaterial3NativeStackOptions',
  'shared Material3/navigation mapper',
]) requireText(files.readme, s.readme, needle);
for (const needle of [
  'Neutral core',
  'React Native boundary',
  'Material3 consumers',
  'React Navigation adapter',
  'Expo Router adapter',
  'UPSTREAM_REACT_NATIVE_SCREENS.md',
]) requireText(files.architecture, s.architecture, needle);

if (violations.length) {
  console.error('Navigation integration invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('Navigation integration invariant: PASS');
console.log('  one shared Material3/navigation mapper owns navigation semantics');
console.log('  Expo Router and React Navigation are thin adapters');
console.log('  adapters contain no nested-scroll transport logic');
console.log('  native bridge uses standard React Native components');
