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
      'Do not opt out of AGP built-in Kotlin/new DSL blindly; update this compatibility gate instead.',
  );
}

let properties = fs.readFileSync(gradleProperties, 'utf8');

function setGradleProperty(name, value) {
  const pattern = new RegExp(`^${name.replace(/\./g, '\\.')}=.*$`, 'm');
  const line = `${name}=${value}`;
  if (pattern.test(properties)) {
    properties = properties.replace(pattern, line);
    return;
  }
  if (!properties.endsWith('\n')) properties += '\n';
  properties += `${line}\n`;
}

if (!properties.includes('# RN 0.87 + Expo 57 compatibility:')) {
  if (!properties.endsWith('\n')) properties += '\n';
  properties +=
    '\n# RN 0.87 + Expo 57 compatibility: generated Expo build still applies kotlin-android.\n' +
    '# AGP 9 requires opting out of both built-in Kotlin and the new DSL for that legacy plugin.\n';
}

setGradleProperty('android.builtInKotlin', 'false');
setGradleProperty('android.newDsl', 'false');

fs.writeFileSync(gradleProperties, properties);

const verified = fs.readFileSync(gradleProperties, 'utf8');
const builtInKotlinDisabled = /^android\.builtInKotlin=false$/m.test(verified);
const newDslDisabled = /^android\.newDsl=false$/m.test(verified);

if (!builtInKotlinDisabled || !newDslDisabled) {
  fail(
    'Expected android.builtInKotlin=false and android.newDsl=false in android/gradle.properties.',
  );
}

console.log('RN 0.87 AGP 9 Kotlin: generated Expo kotlin-android plugin detected');
console.log('RN 0.87 AGP 9 Kotlin: android.builtInKotlin=false');
console.log('RN 0.87 AGP 9 Kotlin: android.newDsl=false');
console.log('RN 0.87 AGP 9 Kotlin compatibility gate: PASS');
