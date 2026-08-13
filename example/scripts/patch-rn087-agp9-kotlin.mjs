#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const cwd = process.cwd();
const appBuildGradle = path.join(cwd, 'android', 'app', 'build.gradle');
const gradleProperties = path.join(cwd, 'android', 'gradle.properties');

function fail(message) {
  console.error(`RN 0.87 AGP 9 Kotlin compatibility gate: FAIL\n${message}`);
  process.exit(1);
}

if (!fs.existsSync(appBuildGradle)) {
  fail('Missing android/app/build.gradle. Run this patch after expo prebuild.');
}
if (!fs.existsSync(gradleProperties)) {
  fail('Missing android/gradle.properties. Run this patch after expo prebuild.');
}

const appBuild = fs.readFileSync(appBuildGradle, 'utf8');
const legacyKotlinPlugin =
  /apply\s+plugin:\s*["']org\.jetbrains\.kotlin\.android["']/.test(appBuild) ||
  /apply\s+plugin:\s*["']kotlin-android["']/.test(appBuild);

if (!legacyKotlinPlugin) {
  fail(
    'Expo prebuild no longer applies the legacy Kotlin Android plugin. ' +
      'Do not disable AGP built-in Kotlin blindly; update this compatibility gate instead.',
  );
}

let properties = fs.readFileSync(gradleProperties, 'utf8');
const propertyPattern = /^android\.builtInKotlin=.*$/m;
if (propertyPattern.test(properties)) {
  properties = properties.replace(propertyPattern, 'android.builtInKotlin=false');
} else {
  if (!properties.endsWith('\n')) properties += '\n';
  properties += '\n# RN 0.87 + Expo 57 compatibility: Expo still applies kotlin-android while AGP 9\n';
  properties += '# enables built-in Kotlin by default. Keep the generated Expo plugin path authoritative.\n';
  properties += 'android.builtInKotlin=false\n';
}

fs.writeFileSync(gradleProperties, properties);

const verified = fs.readFileSync(gradleProperties, 'utf8');
if (!/^android\.builtInKotlin=false$/m.test(verified)) {
  fail('android.builtInKotlin=false was not persisted to android/gradle.properties.');
}

console.log('RN 0.87 AGP 9 Kotlin: generated Expo kotlin-android plugin detected');
console.log('RN 0.87 AGP 9 Kotlin: android.builtInKotlin=false');
console.log('RN 0.87 AGP 9 Kotlin compatibility gate: PASS');
