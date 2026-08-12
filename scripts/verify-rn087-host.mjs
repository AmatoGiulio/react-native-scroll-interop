#!/usr/bin/env node

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const examplePackageJson = path.join(repoRoot, 'example', 'package.json');
const requireFromExample = createRequire(examplePackageJson);

function readVersion(packageName) {
  try {
    return requireFromExample(`${packageName}/package.json`).version;
  } catch (error) {
    console.error(`Unable to resolve ${packageName} from example/: ${error.message}`);
    process.exitCode = 1;
    return null;
  }
}

const reactNative = readVersion('react-native');
const gradlePlugin = readVersion('@react-native/gradle-plugin');

if (!reactNative || !gradlePlugin) process.exit();

console.log(`React Native host: react-native=${reactNative} @react-native/gradle-plugin=${gradlePlugin}`);

const expected = /^0\.87\./;
const mismatches = [];
if (!expected.test(reactNative)) mismatches.push(`react-native=${reactNative}`);
if (!expected.test(gradlePlugin)) mismatches.push(`@react-native/gradle-plugin=${gradlePlugin}`);

if (mismatches.length > 0) {
  console.error('\nRN 0.87 host gate: FAIL');
  console.error(`Resolved the wrong package line: ${mismatches.join(', ')}`);
  console.error('Run from example/: rm -rf node_modules package-lock.json && npm install');
  process.exit(1);
}

console.log('RN 0.87 host gate: PASS');
