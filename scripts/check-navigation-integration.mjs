#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const violations = [];

function requireText(path, content, needle, label) {
  if (!content.includes(needle)) {
    violations.push(`${path}: missing ${label ?? needle}`);
  }
}

function forbidText(path, content, needle, label) {
  if (content.includes(needle)) {
    violations.push(`${path}: contains forbidden ${label ?? needle}`);
  }
}

const index = read('index.ts');
const topTypes = read('src/MaterialTopAppBar.types.ts');
const topAndroid = read('src/MaterialTopAppBar.android.tsx');
const topNative = read('src/ExpoMaterialTopAppBarNativeView.tsx');
const topModule = read('android/src/main/java/expo/modules/materialtoolbar/ExpoMaterialTopAppBarModule.kt');
const topView = read('android/src/main/java/expo/modules/materialtoolbar/ExpoMaterialTopAppBarView.kt');
const expoLayout = read('example/app/navigation-first/_layout.tsx');
const expoHome = read('example/app/navigation-first/index.tsx');
const expoDetails = read('example/app/navigation-first/details.tsx');
const readme = read('README.md');
const product = read('PRODUCT.md');
const release = read('RELEASE.md');

requireText('src/MaterialTopAppBar.types.ts', topTypes, "MaterialTopAppBarNavigationIcon = 'none' | 'back'", 'navigation icon public type');
requireText('src/MaterialTopAppBar.types.ts', topTypes, 'onNavigationPress?: () => void', 'navigation callback prop');
requireText('src/MaterialTopAppBar.types.ts', topTypes, 'navigationAccessibilityLabel?: string', 'navigation accessibility label');
requireText('index.ts', index, 'MaterialTopAppBarNavigationIcon', 'navigation icon type export');

requireText('src/MaterialTopAppBar.android.tsx', topAndroid, "navigationIcon = 'none'", 'navigation icon default');
requireText('src/MaterialTopAppBar.android.tsx', topAndroid, 'onNavigationPress={onNavigationPress ? handleNavigationPress : undefined}', 'native navigation event wiring');
requireText('src/ExpoMaterialTopAppBarNativeView.tsx', topNative, 'onNavigationPress?:', 'native navigation event prop');
requireText('android/src/main/java/expo/modules/materialtoolbar/ExpoMaterialTopAppBarModule.kt', topModule, 'Events("onNavigationPress")', 'Expo navigation event registration');
requireText('android/src/main/java/expo/modules/materialtoolbar/ExpoMaterialTopAppBarModule.kt', topModule, 'Prop("navigationIcon")', 'native navigation icon prop');

requireText('android/src/main/java/expo/modules/materialtoolbar/ExpoMaterialTopAppBarView.kt', topView, 'IconButton(onClick = { onNavigationPress(', 'native Material navigation button');
requireText('android/src/main/java/expo/modules/materialtoolbar/ExpoMaterialTopAppBarView.kt', topView, 'R.drawable.react_native_scroll_interop_arrow_back', 'packaged back drawable');
requireText('android/src/main/java/expo/modules/materialtoolbar/ExpoMaterialTopAppBarView.kt', topView, 'navigationIcon = navigationIcon', 'Material3 TopAppBar navigation slot');

requireText('example/app/navigation-first/_layout.tsx', expoLayout, '<Stack.Header asChild transparent>', 'Expo Router custom transparent header');
requireText('example/app/navigation-first/_layout.tsx', expoLayout, '<MaterialTopAppBar', 'Stack-owned TopAppBar');
requireText('example/app/navigation-first/_layout.tsx', expoLayout, '<MaterialToolbar.Root', 'layout-owned persistent FloatingToolbar');
requireText('example/app/navigation-first/_layout.tsx', expoLayout, 'navigationIcon="back"', 'details back affordance');
requireText('example/app/navigation-first/_layout.tsx', expoLayout, 'onNavigationPress={() => router.back()}', 'Expo Router back ownership');

for (const [path, content] of [
  ['example/app/navigation-first/index.tsx', expoHome],
  ['example/app/navigation-first/details.tsx', expoDetails],
]) {
  requireText(path, content, '<NativeScrollHost', 'screen-local NativeScrollHost');
  forbidText(path, content, 'MaterialTopAppBar', 'screen-local TopAppBar declaration');
  forbidText(path, content, 'MaterialToolbar', 'screen-local FloatingToolbar declaration');
}

requireText('README.md', readme, '## Expo Router SDK 57', 'Expo Router integration docs');
requireText('README.md', readme, '## React Navigation', 'React Navigation integration docs');
requireText('README.md', readme, 'headerTransparent: true', 'React Navigation transparent header contract');
requireText('PRODUCT.md', product, '## Navigation-first product model', 'navigation-first product contract');
requireText('RELEASE.md', release, '## First-public-alpha blocker', 'first publish navigation blocker');
requireText('RELEASE.md', release, '### Expo Router navigation-first gate', 'Expo Router runtime release gate');
requireText('RELEASE.md', release, '### React Navigation navigation-first gate', 'React Navigation runtime release gate');

if (violations.length > 0) {
  console.error('Navigation integration invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('Navigation integration invariant: PASS');
console.log('  Expo Router: Stack-owned MaterialTopAppBar + layout-owned MaterialToolbar');
console.log('  React Navigation: documented custom-header + transparent overlay contract');
console.log('  native Material back action wired without scroll-frame JS transport');
