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

function capture(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout ?? '';
}

const adbDevices = capture('adb', ['devices'])
  .split(/\r?\n/)
  .slice(1)
  .map(line => line.trim())
  .filter(Boolean)
  .map(line => {
    const [serial, state] = line.split(/\s+/);
    return {serial, state};
  });

const requestedSerial = process.env.ANDROID_SERIAL ?? null;
let deviceSerial = requestedSerial;

if (requestedSerial) {
  const requested = adbDevices.find(device => device.serial === requestedSerial);
  if (!requested || requested.state !== 'device') {
    console.error(
      `ANDROID_SERIAL=${requestedSerial} is not an available connected device.\n` +
        `adb devices:\n${adbDevices.map(device => `  ${device.serial}\t${device.state}`).join('\n') || '  none'}`,
    );
    process.exit(1);
  }
} else {
  const readyDevices = adbDevices.filter(device => device.state === 'device');
  if (readyDevices.length === 0) {
    console.error(
      'RN 0.87 probe: no connected Android device/emulator.\n' +
        'Start an emulator or connect a device, verify it with `adb devices`, then rerun this command.',
    );
    process.exit(1);
  }
  if (readyDevices.length > 1) {
    console.error(
      'RN 0.87 probe: multiple Android devices are connected.\n' +
        readyDevices.map(device => `  ${device.serial}`).join('\n') +
        '\nSet ANDROID_SERIAL=<serial> and rerun the command.',
    );
    process.exit(1);
  }
  deviceSerial = readyDevices[0].serial;
}

const adb = args => run('adb', ['-s', deviceSerial, ...args]);
console.log(`RN 0.87 probe device: ${deviceSerial}`);

run(
  './gradlew',
  [':app:installDebug', `-PrnNestedScrollAndroid=${enabled}`, '--no-daemon'],
  path.join(root, 'android'),
);
adb(['reverse', 'tcp:8081', 'tcp:8081']);
adb(['shell', 'am', 'force-stop', appId]);
adb(['shell', 'am', 'start', '-n', `${appId}/.MainActivity`]);

console.log(`RN 0.87 probe launched with useNestedScrollViewAndroid=${enabled}`);
console.log(`Capture: adb -s ${deviceSerial} logcat -v time -s Rn087NestedScroll:I '*:S'`);
