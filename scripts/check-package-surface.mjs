#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const gradle = readFileSync(new URL('../android/build.gradle', import.meta.url), 'utf8');
const rnConfig = readFileSync(new URL('../react-native.config.js', import.meta.url), 'utf8');
const expectedName = 'react-native-scroll-interop';
const expectedVersion = '0.1.0-alpha.1';
const expectedCheck =
  'npm run check:architecture-boundaries && npm run check:scroll-invariants && npm run check:navigation-integration && npm run check:react-native-compat-plugin && npm run check:bare-react-native-compat && npm run check:rnscreens-interop-plugin && npm run check:package-surface';
const violations = [];
const expect = (condition, message) => { if (!condition) violations.push(message); };

expect(pkg.name === expectedName, `unexpected package name: ${pkg.name ?? '<missing>'}`);
expect(pkg.version === expectedVersion, `unexpected version: ${pkg.version ?? '<missing>'}`);
expect(pkg.private !== true, 'public package must not be private');
expect(pkg.license === 'MIT', 'license must be MIT');
expect(pkg.publishConfig?.access === 'public', 'publishConfig.access must be public');
expect(pkg.publishConfig?.tag === 'next', 'alpha tag must be next');
expect(pkg.scripts?.prepublishOnly === 'npm run check', 'prepublishOnly must run full check');
expect(pkg.scripts?.check === expectedCheck, 'npm run check must include the architecture boundary gate');
expect(
  pkg.scripts?.['check:architecture-boundaries'] === 'node scripts/check-architecture-boundaries.mjs',
  'architecture boundary gate is missing'
);
expect(pkg.peerDependencies?.expo === undefined, 'native runtime must not require Expo');
expect(pkg.peerDependencies?.['expo-router'] === '>=57.0.0 <58.0.0', 'Expo Router peer mismatch');
expect(pkg.peerDependenciesMeta?.['expo-router']?.optional === true, 'Expo Router must be optional');
expect(pkg.peerDependencies?.['@react-navigation/native-stack'] === '>=7.0.0 <8.0.0', 'React Navigation native-stack peer mismatch');
expect(pkg.peerDependenciesMeta?.['@react-navigation/native-stack']?.optional === true, 'React Navigation native-stack must be optional');
expect(pkg.peerDependencies?.['react-native-screens'] === '>=4.26.0 <4.27.0', 'react-native-screens peer mismatch');
expect(pkg.peerDependenciesMeta?.['react-native-screens']?.optional === true, 'react-native-screens must be optional');
expect(pkg.peerDependencies?.['react-native'] === '>=0.86.0 <0.87.0 || >=0.87.0-rc.3 <0.88.0', 'React Native peer mismatch');
expect(gradle.includes("namespace 'com.reactnativescroll.interop'"), 'Android namespace must be neutral');
expect(!gradle.includes('expo-module-gradle-plugin'), 'Expo Modules Gradle plugin must stay removed');
expect(rnConfig.includes('ReactNativeScrollInteropPackage'), 'standard RN autolinking package missing');
expect(!pkg.files?.includes('navigation.ts'), 'shared navigation mapper must not add a third public entry point');

for (const obsolete of [
  'expo-module.config.json',
  'android/src/main/java/expo',
  'src/ExpoMaterialTopAppBarNativeView.tsx',
  'src/ExpoMaterialToolbarNativeView.tsx',
  'android-shared',
  'rn087-bare-probe',
]) {
  expect(!existsSync(new URL(`../${obsolete}`, import.meta.url)), `obsolete path remains: ${obsolete}`);
}

const npmArgs = ['pack', '--dry-run', '--json', '--ignore-scripts'];
const npmExecPath = process.env.npm_execpath;
const npmCommand = npmExecPath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmCommandArgs = npmExecPath ? [npmExecPath, ...npmArgs] : npmArgs;
const result = spawnSync(npmCommand, npmCommandArgs, {
  encoding: 'utf8',
  shell: npmExecPath == null && process.platform === 'win32',
});
if (result.error || result.status !== 0) {
  console.error('Package surface invariant: FAIL');
  console.error(result.error?.message ?? result.stderr ?? result.stdout);
  process.exit(result.status ?? 1);
}

let pack;
try {
  pack = JSON.parse(result.stdout)[0];
} catch (error) {
  console.error(`Package surface invariant: FAIL\n  invalid npm pack JSON: ${error}`);
  process.exit(1);
}

expect(pack?.name === expectedName, 'npm pack name mismatch');
expect(pack?.version === expectedVersion, 'npm pack version mismatch');
const files = new Set((pack?.files ?? []).map((entry) => entry.path));

for (const required of [
  'package.json', 'README.md', 'LICENSE', 'index.ts', 'router.tsx', 'react-navigation.tsx',
  'app.plugin.js', 'react-native.config.js',
  'plugin/withScrollInterop.js', 'plugin/bareReactNativeScrollCompat.js',
  'plugin/reactNativeScrollCompatPatch.js', 'plugin/reactNativeScreensInteropPatch.js',
  'src/navigation/material3NavigationMapper.ts', 'src/navigation/Material3NavigationHeader.tsx',
  'src/NativeScrollHost.android.tsx', 'src/MaterialTopAppBarNativeView.tsx', 'src/MaterialToolbarNativeView.tsx',
  'android/src/main/java/com/reactnativescroll/interop/core/VerticalNestedScrollTransactionDispatcher.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollParentController.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollControllerCore.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollParticipants.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeScreenNestedScrollBridge.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollHostView.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollHostManager.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeScrollInteropPackage.kt',
  'android/src/main/java/com/reactnativescroll/interop/material3/TopAppBarScrollConsumer.kt',
  'android/src/main/java/com/reactnativescroll/interop/material3/FloatingToolbarScrollConsumer.kt',
  'android/src/main/java/com/reactnativescroll/interop/material3/ui/Material3NestedScrollParticipantProvider.kt',
  'android/src/main/java/com/reactnativescroll/interop/material3/ui/MaterialTopAppBarView.kt',
  'android/src/main/java/com/reactnativescroll/interop/material3/ui/MaterialTopAppBarManager.kt',
  'android/src/main/java/com/reactnativescroll/interop/material3/ui/MaterialToolbarView.kt',
  'android/src/main/java/com/reactnativescroll/interop/material3/ui/MaterialToolbarManager.kt',
  'android/src/main/java/com/reactnativescroll/interop/material3/ui/NativeNestedScrollRegistry.kt',
]) {
  expect(files.has(required), `missing package file: ${required}`);
}
expect(!files.has('navigation.ts'), 'unexpected public /navigation entry point leaked into tarball');

for (const file of files) {
  if (file.startsWith('android/src/main/java/expo/')) violations.push(`legacy Expo implementation leaked: ${file}`);
  for (const prefix of ['example/', 'scripts/', '.github/', 'android/build/', 'android/.gradle/', 'android/.cxx/']) {
    if (file.startsWith(prefix)) violations.push(`repository/generated path leaked: ${file}`);
  }
  if (['ARCHITECTURE.md', 'RELEASE.md', 'UPSTREAM_REACT_NATIVE_SCREENS.md'].includes(file)) {
    violations.push(`repository-only doc leaked: ${file}`);
  }
}

const unpackedSize = pack?.unpackedSize ?? Infinity;
if (files.size > 110) violations.push(`package file count unexpectedly high: ${files.size}`);
if (unpackedSize > 1_150_000) violations.push(`package unpacked size unexpectedly high: ${unpackedSize}`);

if (violations.length) {
  console.error('Package surface invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}
console.log('Package surface invariant: PASS');
console.log(`  package: ${expectedName}@${expectedVersion}`);
console.log('  architecture: neutral core + generic RN boundary + Material3 reference provider');
console.log('  navigation: internal shared mapper/header + optional Expo Router / React Navigation adapters');
console.log(`  files: ${files.size}`);
console.log(`  unpacked size: ${unpackedSize} bytes`);
