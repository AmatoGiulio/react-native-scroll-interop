#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const cwd = process.cwd();

function fail(message) {
  console.error(`RN 0.87 host gate: FAIL\n${message}`);
  process.exit(1);
}

function readJson(relativePath) {
  const absolutePath = path.join(cwd, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`Missing ${relativePath}. Run npm install from example/ before prebuilding.`);
  }
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function requireFile(relativePath, description) {
  const absolutePath = path.join(cwd, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`Installed React Native is missing ${description}: ${relativePath}`);
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

const reactNative = readJson('node_modules/react-native/package.json');
const gradlePlugin = readJson('node_modules/@react-native/gradle-plugin/package.json');

console.log(
  `React Native host: react-native=${reactNative.version} @react-native/gradle-plugin=${gradlePlugin.version}`,
);

if (reactNative.version !== '0.87.0') {
  fail(`Expected react-native=0.87.0, resolved ${reactNative.version}.`);
}

if (gradlePlugin.version !== reactNative.version) {
  fail(
    `Expected @react-native/gradle-plugin=${reactNative.version}, resolved ${gradlePlugin.version}.`,
  );
}

const featureFlagsProvider = requireFile(
  'node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/internal/featureflags/ReactNativeFeatureFlagsProvider.kt',
  'ReactNativeFeatureFlagsProvider.kt',
);

if (!featureFlagsProvider.includes('fun useNestedScrollViewAndroid(): Boolean')) {
  fail(
    'The installed ReactAndroid feature-flag provider does not expose useNestedScrollViewAndroid().',
  );
}

requireFile(
  'node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/views/scroll/ReactNestedScrollView.kt',
  'ReactNestedScrollView.kt',
);

const mainReactPackage = requireFile(
  'node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/shell/MainReactPackage.kt',
  'MainReactPackage.kt',
);

if (!mainReactPackage.includes('ReactNativeFeatureFlags.useNestedScrollViewAndroid()')) {
  fail('The installed MainReactPackage does not contain the RN 0.87 nested ScrollView switch.');
}

console.log('RN 0.87 source artifacts: feature flag + ReactNestedScrollView present');
console.log('RN 0.87 host gate: PASS');
