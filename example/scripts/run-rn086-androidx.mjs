#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const settingsPath = path.join(root, 'android', 'settings.gradle');
const marker = 'RN086_ANDROIDX_SOURCE_BUILD';

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('npx', ['expo', 'prebuild', '-p', 'android', '--clean']);

let settings = fs.readFileSync(settingsPath, 'utf8');
if (!settings.includes(marker)) {
  settings += `\n// ${marker}\nincludeBuild(expoAutolinking.reactNative) {\n  dependencySubstitution {\n    substitute(module(\"com.facebook.react:react-android\")).using(project(\":packages:react-native:ReactAndroid\"))\n    substitute(module(\"com.facebook.react:react-native\")).using(project(\":packages:react-native:ReactAndroid\"))\n    substitute(module(\"com.facebook.react:hermes-android\")).using(project(\":packages:react-native:ReactAndroid:hermes-engine\"))\n    substitute(module(\"com.facebook.react:hermes-engine\")).using(project(\":packages:react-native:ReactAndroid:hermes-engine\"))\n  }\n}\n`;
  fs.writeFileSync(settingsPath, settings);
  console.log('RN 0.86 AndroidX experiment: React Native source build enabled in generated settings.gradle');
}

run(process.execPath, ['scripts/patch-rn086-androidx-source.mjs']);
run('npx', ['expo', 'run:android']);
