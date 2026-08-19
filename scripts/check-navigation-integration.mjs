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

function collectSourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectSourceFiles(absolutePath));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(absolutePath);
  }
  return files;
}

const index = read('index.ts');
const router = read('router.tsx');
const pkg = read('package.json');
const appJson = read('example/app.json');
const topTypes = read('src/MaterialTopAppBar.types.ts');
const topAndroid = read('src/MaterialTopAppBar.android.tsx');
const topNative = read('src/ExpoMaterialTopAppBarNativeView.tsx');
const topModule = read('android/src/main/java/expo/modules/materialtoolbar/ExpoMaterialTopAppBarModule.kt');
const topView = read('android/src/main/java/expo/modules/materialtoolbar/ExpoMaterialTopAppBarView.kt');
const expoLayout = read('example/app/navigation-first/_layout.tsx');
const expoHome = read('example/app/navigation-first/index.tsx');
const expoDetails = read('example/app/navigation-first/details.tsx');
const readme = read('README.md');
const release = read('RELEASE.md');

requireText('src/MaterialTopAppBar.types.ts', topTypes, "MaterialTopAppBarNavigationIcon = 'none' | 'back'", 'navigation icon public type');
requireText('src/MaterialTopAppBar.types.ts', topTypes, "MaterialTopAppBarPlacement = 'overlay' | 'header'", 'header placement public type');
requireText('src/MaterialTopAppBar.types.ts', topTypes, 'onNavigationPress?: () => void', 'navigation callback prop');
requireText('index.ts', index, 'MaterialTopAppBarNavigationIcon', 'navigation icon type export');
requireText('index.ts', index, 'MaterialTopAppBarPlacement', 'header placement type export');
requireText('package.json', pkg, '"expo": "*"', 'unversioned Expo module peer');
requireText('package.json', pkg, '"react-native": ">=0.86.0 <0.88.0"', 'RN 0.86/0.87 peer range');
requireText('package.json', pkg, '"expo-router": ">=57.0.0 <58.0.0"', 'Expo Router optional peer');
requireText('package.json', pkg, '"react-native-screens": ">=4.26.0 <4.27.0"', 'react-native-screens certified peer');

requireText('src/MaterialTopAppBar.android.tsx', topAndroid, "props.placement ?? 'overlay'", 'overlay placement default');
requireText('src/MaterialTopAppBar.android.tsx', topAndroid, "=== 'header'", 'navigator header placement branch');
requireText('src/MaterialTopAppBar.android.tsx', topAndroid, 'useSafeAreaInsets()', 'header safe-area ownership');
requireText('src/MaterialTopAppBar.android.tsx', topAndroid, 'small: 64', 'JS small Material3 expanded height');
requireText('src/MaterialTopAppBar.android.tsx', topAndroid, 'medium: 112', 'JS medium Material3 expanded height');
requireText('src/MaterialTopAppBar.android.tsx', topAndroid, 'large: 152', 'JS large Material3 expanded height');
requireText('android/src/main/java/expo/modules/materialtoolbar/ExpoMaterialTopAppBarView.kt', topView, '"small" -> 64f', 'native small Material3 expanded height');
requireText('android/src/main/java/expo/modules/materialtoolbar/ExpoMaterialTopAppBarView.kt', topView, '"large" -> 152f', 'native large Material3 expanded height');
requireText('android/src/main/java/expo/modules/materialtoolbar/ExpoMaterialTopAppBarView.kt', topView, 'else -> 112f', 'native medium Material3 expanded height');
requireText('src/MaterialTopAppBar.android.tsx', topAndroid, "navigationIcon = 'none'", 'navigation icon default');
requireText('src/ExpoMaterialTopAppBarNativeView.tsx', topNative, 'onNavigationPress?:', 'native navigation event prop');
requireText('android/src/main/java/expo/modules/materialtoolbar/ExpoMaterialTopAppBarModule.kt', topModule, 'Events("onNavigationPress")', 'Expo navigation event registration');
requireText('android/src/main/java/expo/modules/materialtoolbar/ExpoMaterialTopAppBarView.kt', topView, 'IconButton(', 'native Material navigation button');
requireText('android/src/main/java/expo/modules/materialtoolbar/ExpoMaterialTopAppBarView.kt', topView, 'onNavigationPress(emptyMap<String, Any>())', 'native Material navigation event dispatch');

requireText('router.tsx', router, 'Stack as ExpoStack', 'Expo Router Stack delegation');
requireText('router.tsx', router, "Platform.OS !== 'android'", 'non-Android pass-through');
requireText('router.tsx', router, 'Material3StackNavigationOptions', 'Material3 option namespace');
requireText('router.tsx', router, 'headerLargeTitleEnabled === true || options.headerLargeTitle === true', 'standard large-title mapping');
requireText('router.tsx', router, "variant === 'large' ? 'exitUntilCollapsed' : 'none'", 'large-title behavior mapping');
requireText('router.tsx', router, "navigationIcon={canGoBack ? 'back' : 'none'}", 'automatic Material back affordance');
requireText('router.tsx', router, 'headerProps.navigation.goBack()', 'automatic navigation back action');
requireText('router.tsx', router, 'UNSUPPORTED_MATERIAL_HEADER_KEYS', 'lossless native-header fallback guard');
requireText('router.tsx', router, 'material3.topAppBar === false', 'per-screen native header opt-out');
requireText('router.tsx', router, 'Object.assign(MaterialStack, ExpoStack)', 'Expo Stack static API preservation');

requireText('example/app.json', appJson, '"reactNativeScrollCompat": true', 'RN 0.86/0.87 compatibility option');
requireText('example/app.json', appJson, '"reactNativeScreensInterop": true', 'direct react-native-screens interop option');
forbidText('example/app.json', appJson, 'rn086AndroidXScroll', 'obsolete RN 0.86-only config option');
requireText('example/app/navigation-first/_layout.tsx', expoLayout, "from 'react-native-scroll-interop/router'", 'package-owned Stack import');
requireText('example/app/navigation-first/_layout.tsx', expoLayout, 'headerLargeTitle: true', 'standard large-title option');
requireText('example/app/navigation-first/_layout.tsx', expoLayout, 'material3:', 'Material3-only option namespace');
requireText('example/app/navigation-first/_layout.tsx', expoLayout, "variant: 'medium'", 'Material3 medium TopAppBar override');
requireText('example/app/navigation-first/_layout.tsx', expoLayout, "scrollBehavior: 'enterAlways'", 'Material3 behavior override');
requireText('example/app/navigation-first/_layout.tsx', expoLayout, '<MaterialToolbar.Root', 'layout-owned persistent FloatingToolbar');
forbidText('example/app/navigation-first/_layout.tsx', expoLayout, '<Stack.Header', 'manual Expo Router custom header');
forbidText('example/app/navigation-first/_layout.tsx', expoLayout, 'MaterialTopAppBar', 'manual MaterialTopAppBar declaration');
forbidText('example/app/navigation-first/_layout.tsx', expoLayout, 'headerTransparent', 'app-owned transparent-header wiring');
forbidText('example/app/navigation-first/_layout.tsx', expoLayout, 'navigationIcon=', 'app-owned back icon wiring');
forbidText('example/app/navigation-first/_layout.tsx', expoLayout, 'TOP_APP_BAR_HEIGHT', 'app-owned TopAppBar height constants');

for (const [filePath, content] of [
  ['example/app/navigation-first/index.tsx', expoHome],
  ['example/app/navigation-first/details.tsx', expoDetails],
]) {
  requireText(filePath, content, '<ScrollView', 'screen-local React Native ScrollView');
  forbidText(filePath, content, 'NativeScrollHost', 'app-level NativeScrollHost');
  forbidText(filePath, content, 'MaterialTopAppBar', 'screen-local TopAppBar declaration');
  forbidText(filePath, content, 'MaterialToolbar', 'screen-local FloatingToolbar declaration');
}

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const exampleAppRoot = path.join(repositoryRoot, 'example', 'app');
for (const absolutePath of collectSourceFiles(exampleAppRoot)) {
  const content = readFileSync(absolutePath, 'utf8');
  if (content.includes('expo-material-toolbar')) {
    violations.push(`${path.relative(repositoryRoot, absolutePath)}: contains legacy package import expo-material-toolbar`);
  }
}

requireText('README.md', readme, '## Compatibility', 'compatibility table');
requireText('README.md', readme, 'reactNativeScrollCompat', 'dual-version plugin documentation');
requireText('README.md', readme, 'React Native 0.86.x', 'RN 0.86 documentation');
requireText('README.md', readme, 'React Native 0.87.x', 'RN 0.87 documentation');
requireText('RELEASE.md', release, '### React Native 0.86.x gate', 'RN 0.86 release gate');
requireText('RELEASE.md', release, '### React Native 0.87.x gate', 'RN 0.87 release gate');

if (violations.length > 0) {
  console.error('Navigation integration invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('Navigation integration invariant: PASS');
console.log('  Expo Router Stack API is preserved through react-native-scroll-interop/router');
console.log('  iOS/web pass through existing Expo Router native-stack behavior');
console.log('  Android title/large-title/back semantics map to MaterialTopAppBar');
console.log('  mirrored JS/native TopAppBar header geometry is guarded');
console.log('  navigation screens contain plain RN ScrollView without NativeScrollHost');
console.log('  example uses the canonical dual-version compatibility plugin option');
