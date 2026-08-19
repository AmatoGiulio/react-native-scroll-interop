#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const androidGradle = readFileSync(new URL('../android/build.gradle', import.meta.url), 'utf8');

const expectedName = 'react-native-scroll-interop';
const expectedVersion = '0.1.0-alpha.1';
const expectedRepository = 'git+https://github.com/AmatoGiulio/react-native-scroll-interop.git';
const expectedFiles = [
  'android/build.gradle',
  'android/src/main',
  'android-shared/README.md',
  'android-shared/src/main',
  'plugin',
  'src',
  'index.ts',
  'router.tsx',
  'app.plugin.js',
  'expo-module.config.json',
  'ARCHITECTURE.md',
  'PRODUCT.md',
  'README.md',
  'LICENSE',
];
const violations = [];

if (packageJson.name !== expectedName) {
  violations.push(`unexpected package name: ${packageJson.name ?? '<missing>'}`);
}
if (packageJson.version !== expectedVersion) {
  violations.push(`unexpected package version: ${packageJson.version ?? '<missing>'}`);
}
if (packageJson.private === true) {
  violations.push('public release package must not be private');
}
if (packageJson.license !== 'MIT') {
  violations.push(`unexpected package license: ${packageJson.license ?? '<missing>'}`);
}
if (packageJson.repository?.url !== expectedRepository) {
  violations.push(`unexpected repository URL: ${packageJson.repository?.url ?? '<missing>'}`);
}
if (packageJson.homepage !== 'https://github.com/AmatoGiulio/react-native-scroll-interop#readme') {
  violations.push(`unexpected homepage: ${packageJson.homepage ?? '<missing>'}`);
}
if (packageJson.bugs?.url !== 'https://github.com/AmatoGiulio/react-native-scroll-interop/issues') {
  violations.push(`unexpected bugs URL: ${packageJson.bugs?.url ?? '<missing>'}`);
}
if (packageJson.publishConfig?.access !== 'public') {
  violations.push('publishConfig.access must be public');
}
if (packageJson.publishConfig?.tag !== 'next') {
  violations.push('alpha publishConfig.tag must be next');
}
if (packageJson.scripts?.prepublishOnly !== 'npm run check') {
  violations.push('prepublishOnly must run the complete package gate');
}
if (packageJson.scripts?.['check:navigation-integration'] !== 'node scripts/check-navigation-integration.mjs') {
  violations.push('navigation integration guard must remain in the package gate');
}
if (packageJson.scripts?.['check:rnscreens-interop-plugin'] !== 'node scripts/check-rnscreens-interop-plugin.mjs') {
  violations.push('react-native-screens interop guard must remain in the package gate');
}
if (!packageJson.scripts?.check?.includes('check:navigation-integration')) {
  violations.push('npm run check must execute the navigation integration guard');
}
if (!packageJson.scripts?.check?.includes('check:rnscreens-interop-plugin')) {
  violations.push('npm run check must execute the react-native-screens interop guard');
}
if (packageJson.peerDependencies?.['expo-router'] !== '>=57.0.0 <58.0.0') {
  violations.push('Expo Router SDK 57 must remain an explicit optional peer for the router subpath');
}
if (packageJson.peerDependenciesMeta?.['expo-router']?.optional !== true) {
  violations.push('Expo Router peer must remain optional for non-router consumers');
}
if (JSON.stringify(packageJson.files) !== JSON.stringify(expectedFiles)) {
  violations.push('package files allowlist must stay narrow and release-controlled');
}
if (!androidGradle.includes(`version = '${expectedVersion}'`)) {
  violations.push('Android library version must match package version');
}
if (!androidGradle.includes(`versionName '${expectedVersion}'`)) {
  violations.push('Android versionName must match package version');
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(
  npmCommand,
  ['pack', '--dry-run', '--json', '--ignore-scripts'],
  { encoding: 'utf8' },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'npm pack --dry-run failed\n');
  process.exit(result.status ?? 1);
}

let pack;
try {
  const parsed = JSON.parse(result.stdout);
  pack = parsed[0];
} catch (error) {
  console.error('Package surface invariant: FAIL');
  console.error(`  unable to parse npm pack output: ${error}`);
  process.exit(1);
}

if (pack?.name !== expectedName) {
  violations.push(`npm pack resolved unexpected package name: ${pack?.name ?? '<missing>'}`);
}
if (pack?.version !== expectedVersion) {
  violations.push(`npm pack resolved unexpected package version: ${pack?.version ?? '<missing>'}`);
}

const files = new Set((pack?.files ?? []).map((entry) => entry.path));
const required = [
  'package.json',
  'README.md',
  'LICENSE',
  'ARCHITECTURE.md',
  'PRODUCT.md',
  'index.ts',
  'router.tsx',
  'app.plugin.js',
  'expo-module.config.json',
  'plugin/withRn086AndroidXScroll.js',
  'plugin/rn086AndroidXPatch.js',
  'plugin/reactNativeScreensInteropPatch.js',
  'src/NativeScrollHost.tsx',
  'src/NativeScrollHost.android.tsx',
  'src/MaterialTopAppBar.types.ts',
  'src/MaterialTopAppBar.android.tsx',
  'src/ExpoMaterialTopAppBarNativeView.tsx',
  'android/build.gradle',
  'android/src/main/AndroidManifest.xml',
  'android/src/main/java/expo/modules/materialtoolbar/ExpoMaterialTopAppBarModule.kt',
  'android/src/main/java/expo/modules/materialtoolbar/ExpoMaterialTopAppBarView.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollParentController.kt',
  'android/src/main/res/drawable/react_native_scroll_interop_arrow_back.xml',
  'android-shared/src/main/java/com/reactnativescroll/interop/core/VerticalNestedScrollTransactionDispatcher.kt',
  'android/src/main/java/com/reactnativescroll/interop/material3/TopAppBarScrollConsumer.kt',
  'android/src/main/java/com/reactnativescroll/interop/material3/FloatingToolbarScrollConsumer.kt',
];

const forbiddenPrefixes = [
  'example/',
  'rn087-bare-probe/',
  'docs/',
  'scripts/',
  '.github/',
  'android/.gradle/',
  'android/.cxx/',
  'android/.kotlin/',
  'android/build/',
  'android/src/debug/',
  'android-shared/.gradle/',
  'android-shared/build/',
];
const forbiddenExact = new Set([
  'AGENTS.md',
  'ROADMAP.md',
  'TESTING.md',
  'RELEASE.md',
  'bun.lock',
]);

for (const path of required) {
  if (!files.has(path)) violations.push(`missing required package file: ${path}`);
}

for (const path of files) {
  if (forbiddenExact.has(path)) violations.push(`repository-only file leaked into package: ${path}`);
  for (const prefix of forbiddenPrefixes) {
    if (path.startsWith(prefix)) violations.push(`repository/generated path leaked into package: ${path}`);
  }
}

const unpackedSize = pack?.unpackedSize ?? Number.POSITIVE_INFINITY;
if (files.size > 100) {
  violations.push(`package file count unexpectedly high: ${files.size} > 100`);
}
if (unpackedSize > 2_000_000) {
  violations.push(`package unpacked size unexpectedly high: ${unpackedSize} > 2000000 bytes`);
}

if (violations.length > 0) {
  console.error('Package surface invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('Package surface invariant: PASS');
console.log(`  package: ${expectedName}@${expectedVersion}`);
console.log('  license: MIT');
console.log('  npm dist-tag: next');
console.log(`  files: ${files.size}`);
console.log(`  unpacked size: ${unpackedSize} bytes`);
console.log('  runtime Android/JS/plugin/navigation-header/screens/router interoperability surface included');
console.log('  generated Android artifacts, debug sources and repository-only files excluded');
