#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const cwd = process.cwd();
const minimum = [2, 2, 0];
const targetVersion = '2.2.0';

const candidates = [
  'node_modules/expo-modules-autolinking/android/expo-gradle-plugin/build.gradle.kts',
  'node_modules/expo-modules-core/expo-module-gradle-plugin/build.gradle.kts',
  'node_modules/expo-dev-launcher/expo-dev-launcher-gradle-plugin/build.gradle.kts',
  'node_modules/expo-network-addons/expo-network-addons-gradle-plugin/build.gradle.kts',
  'node_modules/expo-brownfield/gradle-plugins/build.gradle.kts',
];

function fail(message) {
  console.error(`RN 0.87 Expo Kotlin gate: FAIL\n${message}`);
  process.exit(1);
}

function compareVersion(version, expected) {
  const parsed = version.split('.').map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < expected.length; index += 1) {
    const value = parsed[index] ?? 0;
    if (value > expected[index]) return 1;
    if (value < expected[index]) return -1;
  }
  return 0;
}

let found = 0;
let patched = 0;

for (const relativePath of candidates) {
  const absolutePath = path.join(cwd, relativePath);
  if (!fs.existsSync(absolutePath)) continue;
  found += 1;

  const source = fs.readFileSync(absolutePath, 'utf8');
  const match = source.match(/kotlin\("jvm"\) version "([^"]+)"/);
  if (!match) {
    fail(`Could not find the Kotlin JVM plugin version in ${relativePath}`);
  }

  const currentVersion = match[1];
  if (compareVersion(currentVersion, minimum) >= 0) {
    console.log(`Expo Gradle Kotlin: ${relativePath} already ${currentVersion}`);
    continue;
  }

  const next = source.replace(
    `kotlin("jvm") version "${currentVersion}"`,
    `kotlin("jvm") version "${targetVersion}"`,
  );
  fs.writeFileSync(absolutePath, next);
  patched += 1;
  console.log(`Expo Gradle Kotlin: ${relativePath} ${currentVersion} -> ${targetVersion}`);
}

if (found === 0) {
  fail('No Expo Gradle plugin included builds were found under node_modules. Run npm install first.');
}

for (const relativePath of candidates) {
  const absolutePath = path.join(cwd, relativePath);
  if (!fs.existsSync(absolutePath)) continue;
  const source = fs.readFileSync(absolutePath, 'utf8');
  const match = source.match(/kotlin\("jvm"\) version "([^"]+)"/);
  if (!match || compareVersion(match[1], minimum) < 0) {
    fail(`Kotlin JVM plugin is still below 2.2.0 in ${relativePath}`);
  }
}

console.log(`RN 0.87 Expo Kotlin gate: PASS (${found} plugin builds, ${patched} patched)`);
