#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {spawnSync} from 'node:child_process';

const mode = process.argv[2];
if (mode !== 'off' && mode !== 'on') {
  console.error('Usage: node scripts/run-android.mjs off|on');
  process.exit(2);
}

const root = process.cwd();
const gradlew = path.join(root, 'android', 'gradlew');
if (!fs.existsSync(gradlew)) {
  console.error('Missing android/gradlew. Run npm install first.');
  process.exit(1);
}

const enabled = mode === 'on';
const appId = 'com.rn087nestedscrollprobe';

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {cwd, stdio: 'inherit', env: process.env});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('./gradlew', [':app:installDebug', `-PrnNestedScrollAndroid=${enabled}`, '--no-daemon'], path.join(root, 'android'));
run('adb', ['reverse', 'tcp:8081', 'tcp:8081']);
run('adb', ['shell', 'am', 'force-stop', appId]);
run('adb', ['shell', 'am', 'start', '-n', `${appId}/.MainActivity`]);

console.log(`RN 0.87 probe launched with useNestedScrollViewAndroid=${enabled}`);
console.log(`Capture: adb logcat -v time -s Rn087NestedScroll:I '*:S'`);
