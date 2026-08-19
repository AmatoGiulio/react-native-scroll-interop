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
  package: read('package.json'),
  appJson: read('example/app.json'),
  topTypes: read('src/MaterialTopAppBar.types.ts'),
  topAndroid: read('src/MaterialTopAppBar.android.tsx'),
  topNative: read('src/ExpoMaterialTopAppBarNativeView.tsx'),
  topModule: read('android/src/main/java/expo/modules/materialtoolbar/ExpoMaterialTopAppBarModule.kt'),
  topView: read('android/src/main/java/expo/modules/materialtoolbar/ExpoMaterialTopAppBarView.kt'),
  layout: read('example/app/navigation-first/_layout.tsx'),
  home: read('example/app/navigation-first/index.tsx'),
  details: read('example/app/navigation-first/details.tsx'),
  readme: read('README.md'),
  release: read('RELEASE.md'),
};

for (const [needle, label] of [
  ['"expo": "*"', 'unversioned Expo module peer'],
  ['"expo-router": ">=57.0.0 <58.0.0"', 'Expo Router 57 peer'],
  ['"react-native": ">=0.86.0 <0.88.0"', 'RN 0.86/0.87 peer'],
  ['"react-native-screens": ">=4.26.0 <4.27.0"', 'react-native-screens 4.26 peer'],
]) {
  requireText('package.json', sources.package, needle, label);
}

for (const needle of [
  "MaterialTopAppBarNavigationIcon = 'none' | 'back'",
  "MaterialTopAppBarPlacement = 'overlay' | 'header'",
  'onNavigationPress?: () => void',
]) {
  requireText('src/MaterialTopAppBar.types.ts', sources.topTypes, needle);
}

for (const [needle, label] of [
  ["props.placement ?? 'overlay'", 'overlay placement default'],
  ["=== 'header'", 'header placement branch'],
  ['useSafeAreaInsets()', 'header safe-area ownership'],
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
  ['onNavigationPress(emptyMap<String, Any>())', 'native navigation event'],
]) {
  requireText('ExpoMaterialTopAppBarView.kt', sources.topView, needle, label);
}
requireText('ExpoMaterialTopAppBarNativeView.tsx', sources.topNative, 'onNavigationPress?:');
requireText('ExpoMaterialTopAppBarModule.kt', sources.topModule, 'Events("onNavigationPress")');

for (const [needle, label] of [
  ['Stack as ExpoStack', 'Expo Router Stack delegation'],
  ["Platform.OS !== 'android'", 'non-Android pass-through'],
  ['Material3StackNavigationOptions', 'Material3 namespace'],
  ['SUPPORTED_HEADER_KEYS', 'explicit supported header surface'],
  ['hasUnsupportedHeaderOptions', 'native-header fallback guard'],
  ['options.unstable_nativeProps !== undefined', 'unstable native props fallback'],
  ['headerLargeTitleEnabled === true || options.headerLargeTitle === true', 'large-title mapping'],
  ["variant === 'large' ? 'exitUntilCollapsed' : 'none'", 'large-title behavior mapping'],
  ["navigationIcon={canGoBack ? 'back' : 'none'}", 'automatic back affordance'],
  ['headerProps.navigation.goBack()', 'navigation-owned Back action'],
  ['material3.topAppBar === false', 'native-header opt-out'],
  ['Object.assign(MaterialStack, ExpoStack)', 'Expo Stack statics preservation'],
]) {
  requireText('router.tsx', sources.router, needle, label);
}
forbidText('router.tsx', sources.router, 'export default', 'second Stack export path');

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
    forbidText(filePath, content, forbidden);
  }
}

const root = fileURLToPath(new URL('../', import.meta.url));
for (const absolutePath of collectSourceFiles(path.join(root, 'example', 'app'))) {
  const content = readFileSync(absolutePath, 'utf8');
  if (content.includes('expo-material-toolbar')) {
    violations.push(`${path.relative(root, absolutePath)}: legacy package import expo-material-toolbar`);
  }
}

for (const typeName of [...exportedTypeNames(sources.index), ...exportedTypeNames(sources.router)]) {
  requireText('README.md', sources.readme, typeName, `public type ${typeName}`);
}
for (const valueName of ['MaterialTopAppBar', 'MaterialToolbar', 'NativeScrollHost', 'Stack']) {
  requireText('README.md', sources.readme, valueName, `public value ${valueName}`);
}
for (const needle of [
  '## Compatibility',
  'reactNativeScrollCompat',
  'React Native 0.86.x',
  'React Native 0.87.x',
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
console.log('  one canonical named Stack export');
console.log('  Android navigation semantics map to MaterialTopAppBar without owning navigation state');
console.log('  unsupported header behavior falls back to the platform-native header');
console.log('  mirrored JS/native TopAppBar geometry is guarded');
console.log('  navigation pages are plain RN ScrollView content');
console.log('  README covers every exported public type from root and router entrypoints');
