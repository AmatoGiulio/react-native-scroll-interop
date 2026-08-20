#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const violations = [];

function requireText(filePath, content, needle, label = needle) {
  if (!content.includes(needle)) violations.push(`${filePath}: missing ${label}`);
}

function forbidText(filePath, content, needle, label = needle) {
  if (content.includes(needle)) violations.push(`${filePath}: contains forbidden ${label}`);
}

function forbidComponentUse(filePath, content, identifier) {
  const importStatements = content.match(/import[\s\S]*?from\s+['"][^'"]+['"];?/g) ?? [];
  const identifierPattern = new RegExp(`\\b${identifier}\\b`);
  if (importStatements.some((statement) => identifierPattern.test(statement))) {
    violations.push(`${filePath}: contains forbidden ${identifier} import`);
  }

  const jsxPattern = new RegExp(`<\\s*${identifier}(?:\\.|\\s|/?>)`);
  if (jsxPattern.test(content)) {
    violations.push(`${filePath}: contains forbidden ${identifier} JSX`);
  }
}

function exportedTypeNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/export type\s*\{([\s\S]*?)\}\s*from/g)) {
    for (const entry of match[1].split(',')) {
      const name = entry.trim().match(/^([A-Za-z_$][\w$]*)/)?.[1];
      if (name) names.add(name);
    }
  }
  for (const match of source.matchAll(/export type\s+([A-Za-z_$][\w$]*)\s*=/g)) {
    names.add(match[1]);
  }
  return [...names];
}

function declaredMemberNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/^\s*([A-Za-z_$][\w$]*)\??:\s/gm)) names.add(match[1]);
  for (const match of source.matchAll(/^\s*([A-Za-z_$][\w$]*)\([^)]*\):\s/gm)) names.add(match[1]);
  return [...names];
}

function collectSourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectSourceFiles(absolutePath));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(absolutePath);
  }
  return files;
}

const sources = {
  index: read('index.ts'),
  router: read('router.tsx'),
  reactNavigation: read('react-navigation.tsx'),
  mapper: read('src/navigation/material3NavigationMapper.ts'),
  package: read('package.json'),
  rnConfig: read('react-native.config.js'),
  appJson: read('example/app.json'),
  topTypes: read('src/MaterialTopAppBar.types.ts'),
  toolbarTypes: read('src/MaterialToolbar.types.ts'),
  topAndroid: read('src/MaterialTopAppBar.android.tsx'),
  topNative: read('src/MaterialTopAppBarNativeView.tsx'),
  toolbarNative: read('src/MaterialToolbarNativeView.tsx'),
  hostNative: read('src/NativeScrollHost.android.tsx'),
  topView: read('android/src/main/java/expo/modules/materialtoolbar/ExpoMaterialTopAppBarView.kt'),
  packageView: read('android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeScrollInteropPackage.kt'),
  layout: read('example/app/navigation-first/_layout.tsx'),
  home: read('example/app/navigation-first/index.tsx'),
  details: read('example/app/navigation-first/details.tsx'),
  readme: read('README.md'),
  release: read('RELEASE.md'),
};

for (const [needle, label] of [
  ['"expo-router": ">=57.0.0 <58.0.0"', 'Expo Router 57 peer'],
  ['"@react-navigation/native-stack": ">=7.0.0 <8.0.0"', 'React Navigation native-stack 7 peer'],
  ['"react-native": ">=0.86.0 <0.87.0 || >=0.87.0-rc.3 <0.88.0"', 'RN 0.86/0.87 peer'],
  ['"react-native-screens": ">=4.26.0 <4.27.0"', 'react-native-screens 4.26 peer'],
]) {
  requireText('package.json', sources.package, needle, label);
}
forbidText('package.json', sources.package, '"expo": "*"', 'required Expo runtime peer');
requireText('react-native.config.js', sources.rnConfig, 'ReactNativeScrollInteropPackage', 'React Native package autolinking');

for (const needle of [
  "MaterialTopAppBarNavigationIcon = 'none' | 'back'",
  "MaterialTopAppBarPlacement = 'overlay' | 'header'",
  'onNavigationPress?: () => void',
]) {
  requireText('src/MaterialTopAppBar.types.ts', sources.topTypes, needle);
}

for (const [needle, label] of [
  ["props.placement ?? 'overlay'", 'overlay placement default'],
  ['useSafeAreaInsets()', 'safe-area ownership'],
  ['small: 64', 'JS small height'],
  ['medium: 112', 'JS medium height'],
  ['large: 152', 'JS large height'],
  ["navigationIcon = 'none'", 'navigation icon default'],
]) {
  requireText('src/MaterialTopAppBar.android.tsx', sources.topAndroid, needle, label);
}

for (const [needle, label] of [
  ['"small" -> 64f', 'native small height'],
  ['else -> 112f', 'native medium height'],
  ['"large" -> 152f', 'native large height'],
  ['IconButton(', 'native navigation button'],
  ['emitDirectEvent("topNavigationPress")', 'React Native navigation event'],
]) {
  requireText('ExpoMaterialTopAppBarView.kt', sources.topView, needle, label);
}

requireText('src/MaterialTopAppBarNativeView.tsx', sources.topNative, 'requireNativeComponent');
requireText('src/MaterialTopAppBarNativeView.tsx', sources.topNative, 'RNSIMaterialTopAppBar');
requireText('src/MaterialToolbarNativeView.tsx', sources.toolbarNative, 'RNSIMaterialToolbar');
requireText('src/NativeScrollHost.android.tsx', sources.hostNative, 'RNSINestedScrollHost');
for (const forbidden of ['requireNativeViewManager', 'expo-modules-core']) {
  forbidText('src/MaterialTopAppBarNativeView.tsx', sources.topNative, forbidden);
  forbidText('src/MaterialToolbarNativeView.tsx', sources.toolbarNative, forbidden);
  forbidText('src/NativeScrollHost.android.tsx', sources.hostNative, forbidden);
}
for (const manager of ['ReactNativeNestedScrollHostManager()', 'MaterialTopAppBarManager()', 'MaterialToolbarManager()']) {
  requireText('ReactNativeScrollInteropPackage.kt', sources.packageView, manager);
}

for (const [needle, label] of [
  ['SUPPORTED_HEADER_KEYS', 'explicit supported header surface'],
  ['hasUnsupportedMaterial3HeaderOptions', 'native-header fallback guard'],
  ['options.unstable_nativeProps !== undefined', 'unstable native props fallback'],
  ['headerLargeTitleEnabled === true || options.headerLargeTitle === true', 'large-title mapping'],
  ["variant === 'large' ? 'exitUntilCollapsed' : 'none'", 'large-title behavior mapping'],
  ['material3?.topAppBar === false', 'native-header opt-out'],
  ['resolveMaterial3HeaderDecision', 'shared navigation decision'],
]) {
  requireText('src/navigation/material3NavigationMapper.ts', sources.mapper, needle, label);
}
for (const forbidden of ['expo-router', '@react-navigation', 'NativeScrollHost', 'onScroll', 'scrollBy(', 'scrollTo(']) {
  forbidText('src/navigation/material3NavigationMapper.ts', sources.mapper, forbidden, `adapter-specific/transport dependency ${forbidden}`);
}

for (const [needle, label] of [
  ['Stack as ExpoStack', 'Expo Router Stack delegation'],
  ['resolveMaterial3HeaderDecision', 'shared mapper consumption'],
  ['MaterialTopAppBar', 'Material3 header rendering'],
  ['headerProps.navigation.goBack()', 'navigation-owned Back action'],
  ['Object.assign(MaterialStack, ExpoStack)', 'Expo Stack statics preservation'],
]) {
  requireText('router.tsx', sources.router, needle, label);
}
forbidText('router.tsx', sources.router, 'SUPPORTED_HEADER_KEYS', 'duplicated header mapping table');
forbidText('router.tsx', sources.router, 'export default', 'second Stack export path');

for (const [needle, label] of [
  ["from '@react-navigation/native-stack'", 'React Navigation native-stack type boundary'],
  ['resolveMaterial3HeaderDecision', 'shared mapper consumption'],
  ['material3NativeStackNavigatorOptions', 'navigator-level adapter'],
  ['material3NativeStackScreenOptions', 'screen-level adapter'],
  ['withMaterial3NativeStackOptions', 'factory adapter'],
  ['headerProps.navigation.goBack()', 'navigation-owned Back action'],
]) {
  requireText('react-navigation.tsx', sources.reactNavigation, needle, label);
}
forbidText('react-navigation.tsx', sources.reactNavigation, 'SUPPORTED_HEADER_KEYS', 'duplicated header mapping table');
for (const [filePath, content] of [
  ['router.tsx', sources.router],
  ['react-navigation.tsx', sources.reactNavigation],
]) {
  for (const forbidden of ['NativeScrollHost', 'onScroll=', 'scrollBy(', 'scrollTo(', 'ReactNativeNestedScrollParentController']) {
    forbidText(filePath, content, forbidden, `scroll transport logic ${forbidden}`);
  }
}

for (const [needle, label] of [
  ['"reactNativeScrollCompat": true', 'RN 0.86/0.87 compatibility option'],
  ['"reactNativeScreensInterop": true', 'screen-owned navigation option'],
]) {
  requireText('example/app.json', sources.appJson, needle, label);
}
forbidText('example/app.json', sources.appJson, 'rn086AndroidXScroll', 'obsolete RN 0.86-only option');

for (const [needle, label] of [
  ["from 'react-native-scroll-interop/router'", 'package Stack import'],
  ['headerLargeTitle: true', 'standard large title'],
  ['material3:', 'Material3 option namespace'],
  ["variant: 'medium'", 'medium details TopAppBar'],
  ["scrollBehavior: 'enterAlways'", 'details scroll behavior'],
  ['<MaterialToolbar.Root', 'layout-owned persistent toolbar'],
]) {
  requireText('example/app/navigation-first/_layout.tsx', sources.layout, needle, label);
}
for (const forbidden of [
  '<Stack.Header',
  'MaterialTopAppBar',
  'headerTransparent',
  'navigationIcon=',
  'TOP_APP_BAR_HEIGHT',
]) {
  forbidText('example/app/navigation-first/_layout.tsx', sources.layout, forbidden);
}

for (const [filePath, content] of [
  ['example/app/navigation-first/index.tsx', sources.home],
  ['example/app/navigation-first/details.tsx', sources.details],
]) {
  requireText(filePath, content, '<ScrollView');
  for (const forbidden of ['NativeScrollHost', 'MaterialTopAppBar', 'MaterialToolbar']) {
    forbidComponentUse(filePath, content, forbidden);
  }
}

const root = fileURLToPath(new URL('../', import.meta.url));
for (const absolutePath of collectSourceFiles(path.join(root, 'example', 'app'))) {
  const content = readFileSync(absolutePath, 'utf8');
  if (content.includes('expo-material-toolbar')) {
    violations.push(`${path.relative(root, absolutePath)}: legacy package import expo-material-toolbar`);
  }
}

for (const typeName of [
  ...exportedTypeNames(sources.index),
  ...exportedTypeNames(sources.router),
  ...exportedTypeNames(sources.reactNavigation),
]) {
  requireText('README.md', sources.readme, typeName, `public type ${typeName}`);
}
for (const memberName of new Set([
  ...declaredMemberNames(sources.topTypes),
  ...declaredMemberNames(sources.toolbarTypes),
])) {
  requireText('README.md', sources.readme, memberName, `public component prop/member ${memberName}`);
}
for (const valueName of [
  'MaterialTopAppBar',
  'MaterialToolbar',
  'NativeScrollHost',
  'Stack',
  'material3NativeStackNavigatorOptions',
  'material3NativeStackScreenOptions',
  'withMaterial3NativeStackOptions',
]) {
  requireText('README.md', sources.readme, valueName, `public value ${valueName}`);
}
for (const needle of [
  '## Compatibility',
  'reactNativeScrollCompat',
  'React Native 0.86.x',
  'React Native 0.87.x',
  'React Navigation',
  'shared Material3/navigation mapper',
]) {
  requireText('README.md', sources.readme, needle);
}
requireText('RELEASE.md', sources.release, '### React Native 0.86.x gate');
requireText('RELEASE.md', sources.release, '### React Native 0.87.x gate');

if (violations.length) {
  console.error('Navigation integration invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('Navigation integration invariant: PASS');
console.log('  standard React Native native-view bridge (no Expo Modules runtime)');
console.log('  one shared Material3/navigation mapper owns header semantics');
console.log('  Expo Router and React Navigation adapters contain no scroll transport logic');
console.log('  unsupported header behavior falls back to the navigation library native header');
console.log('  mirrored JS/native TopAppBar geometry is guarded');
console.log('  navigation pages are plain RN ScrollView content');
