#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const androidGradle = readFileSync(new URL('../android/build.gradle', import.meta.url), 'utf8');

const expectedName = 'react-native-scroll-interop';
const expectedVersion = '0.1.0-alpha.1';
const expectedFiles = [
  'android/build.gradle',
  'android/src/main',
  'plugin',
  'src',
  'index.ts',
  'router.tsx',
  'app.plugin.js',
  'expo-module.config.json',
];
const expectedCheck =
  'npm run check:scroll-invariants && npm run check:navigation-integration && npm run check:react-native-compat-plugin && npm run check:rnscreens-interop-plugin && npm run check:package-surface';
const violations = [];

function expect(condition, message) {
  if (!condition) violations.push(message);
}

expect(packageJson.name === expectedName, `unexpected package name: ${packageJson.name ?? '<missing>'}`);
expect(packageJson.version === expectedVersion, `unexpected package version: ${packageJson.version ?? '<missing>'}`);
expect(packageJson.private !== true, 'public release package must not be private');
expect(packageJson.license === 'MIT', `unexpected package license: ${packageJson.license ?? '<missing>'}`);
expect(packageJson.publishConfig?.access === 'public', 'publishConfig.access must be public');
expect(packageJson.publishConfig?.tag === 'next', 'alpha publishConfig.tag must be next');
expect(packageJson.scripts?.prepublishOnly === 'npm run check', 'prepublishOnly must run the complete package gate');
expect(packageJson.scripts?.check === expectedCheck, 'npm run check does not match the release gate');
expect(
  packageJson.scripts?.['check:react-native-compat-plugin'] ===
    'node scripts/check-react-native-compat-plugin.mjs',
  'React Native compatibility gate is missing',
);
expect(packageJson.peerDependencies?.expo === '*', 'Expo module peer should not pin the router SDK line');
expect(
  packageJson.peerDependencies?.['expo-router'] === '>=57.0.0 <58.0.0',
  'Expo Router peer must match the certified router adapter line',
);
expect(
  packageJson.peerDependenciesMeta?.['expo-router']?.optional === true,
  'Expo Router must remain optional for root-only consumers',
);
expect(
  packageJson.peerDependencies?.['react-native'] === '>=0.86.0 <0.88.0',
  'React Native peer range must cover the 0.86.x and 0.87.x lines only',
);
expect(
  packageJson.peerDependencies?.['react-native-screens'] === '>=4.26.0 <4.27.0',
  'react-native-screens peer range must match the version-scoped direct integration',
);
expect(
  packageJson.peerDependenciesMeta?.['react-native-screens']?.optional === true,
  'react-native-screens must remain optional for standalone consumers',
);
expect(
  JSON.stringify(packageJson.files) === JSON.stringify(expectedFiles),
  'package files allowlist must stay runtime-only',
);
expect(androidGradle.includes(`version = '${expectedVersion}'`), 'Android library version must match package version');
expect(androidGradle.includes(`versionName '${expectedVersion}'`), 'Android versionName must match package version');
expect(!androidGradle.includes('android-shared'), 'Android build must not use an external shared source tree');

for (const obsoletePath of [
  'android-shared',
  'rn087-bare-probe',
  'docs',
  'assets',
  'android/src/debug',
  'example/src',
  'example/scripts',
  'example/app/(tabs)',
  'plugin/withRn086AndroidXScroll.js',
  'plugin/rn086AndroidXPatch.js',
  'scripts/check-rn086-androidx-plugin.mjs',
]) {
  if (existsSync(new URL(`../${obsoletePath}`, import.meta.url))) {
    violations.push(`obsolete repository path must stay removed: ${obsoletePath}`);
  }
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  encoding: 'utf8',
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'npm pack --dry-run failed\n');
  process.exit(result.status ?? 1);
}

let pack;
try {
  pack = JSON.parse(result.stdout)[0];
} catch (error) {
  console.error('Package surface invariant: FAIL');
  console.error(`  unable to parse npm pack output: ${error}`);
  process.exit(1);
}

expect(pack?.name === expectedName, `npm pack resolved unexpected package name: ${pack?.name ?? '<missing>'}`);
expect(pack?.version === expectedVersion, `npm pack resolved unexpected package version: ${pack?.version ?? '<missing>'}`);

const files = new Set((pack?.files ?? []).map((entry) => entry.path));
const required = [
  'package.json',
  'README.md',
  'LICENSE',
  'index.ts',
  'router.tsx',
  'app.plugin.js',
  'expo-module.config.json',
  'plugin/withScrollInterop.js',
  'plugin/reactNativeScrollCompatPatch.js',
  'plugin/reactNativeScreensInteropPatch.js',
  'src/NativeScrollHost.tsx',
  'src/NativeScrollHost.android.tsx',
  'src/MaterialTopAppBar.types.ts',
  'src/MaterialTopAppBar.tsx',
  'src/MaterialTopAppBar.android.tsx',
  'src/MaterialToolbar.types.ts',
  'src/MaterialToolbar.tsx',
  'src/MaterialToolbar.android.tsx',
  'android/build.gradle',
  'android/src/main/AndroidManifest.xml',
  'android/src/main/java/com/reactnativescroll/interop/core/NestedScrollConservationLedger.kt',
  'android/src/main/java/com/reactnativescroll/interop/core/SourceScopedNestedScrollLifecycle.kt',
  'android/src/main/java/com/reactnativescroll/interop/core/VerticalNestedScrollParticipants.kt',
  'android/src/main/java/com/reactnativescroll/interop/core/VerticalNestedScrollTransactionDispatcher.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactVerticalScrollSourceInterop.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeVerticalScrollSourceLocator.kt',
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollParentController.kt',
];

for (const file of required) {
  if (!files.has(file)) violations.push(`missing required package file: ${file}`);
}

const forbiddenPrefixes = [
  'example/',
  'docs/',
  'scripts/',
  '.github/',
  'android/.gradle/',
  'android/.cxx/',
  'android/.kotlin/',
  'android/build/',
  'android/src/debug/',
  'android-shared/',
];
const forbiddenExact = new Set(['ARCHITECTURE.md', 'RELEASE.md']);

for (const file of files) {
  if (forbiddenExact.has(file)) violations.push(`repository-only documentation leaked into package: ${file}`);
  for (const prefix of forbiddenPrefixes) {
    if (file.startsWith(prefix)) violations.push(`repository/generated path leaked into package: ${file}`);
  }
}

const unpackedSize = pack?.unpackedSize ?? Number.POSITIVE_INFINITY;
if (files.size > 80) violations.push(`package file count unexpectedly high: ${files.size} > 80`);
if (unpackedSize > 1_000_000) {
  violations.push(`package unpacked size unexpectedly high: ${unpackedSize} > 1000000 bytes`);
}

if (violations.length > 0) {
  console.error('Package surface invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('Package surface invariant: PASS');
console.log(`  package: ${expectedName}@${expectedVersion}`);
console.log('  React Native peer: 0.86.x / 0.87.x');
console.log('  Expo Router adapter: 57.x');
console.log('  historical/debug repository trees remain removed');
console.log(`  files: ${files.size}`);
console.log(`  unpacked size: ${unpackedSize} bytes`);
console.log('  tarball contains one Android runtime tree plus plugin/JS entry sources');
