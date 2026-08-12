#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {spawn, spawnSync} from 'node:child_process';

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

function capture(command, args, cwd = root, allowFailure = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout ?? '';
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readAdbDevices() {
  return capture('adb', ['devices'])
    .split(/\r?\n/)
    .slice(1)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [serial, state] = line.split(/\s+/);
      return {serial, state};
    });
}

function findEmulatorBinary() {
  const sdkRoots = [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    path.join(os.homedir(), 'Library', 'Android', 'sdk'),
    path.join(os.homedir(), 'Android', 'Sdk'),
  ].filter(Boolean);

  for (const sdkRoot of sdkRoots) {
    const candidate = path.join(sdkRoot, 'emulator', 'emulator');
    if (fs.existsSync(candidate)) return candidate;
  }

  const pathLookup = spawnSync('sh', ['-lc', 'command -v emulator'], {
    encoding: 'utf8',
    env: process.env,
  });
  const candidate = (pathLookup.stdout ?? '').trim();
  return candidate || null;
}

function waitForReadyDevice(preferredSerial = null) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const devices = readAdbDevices();
    const ready = devices.filter(device => device.state === 'device');
    if (preferredSerial) {
      const match = ready.find(device => device.serial === preferredSerial);
      if (match) return match.serial;
    } else {
      const emulators = ready.filter(device => device.serial.startsWith('emulator-'));
      if (emulators.length === 1) return emulators[0].serial;
      if (ready.length === 1) return ready[0].serial;
    }
    sleep(1000);
  }
  return null;
}

function waitForAndroidBoot(serial) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const completed = capture(
      'adb',
      ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'],
      root,
      true,
    ).trim();
    if (completed === '1') return;
    sleep(1000);
  }
  console.error(`RN 0.87 probe: ${serial} connected but Android did not finish booting.`);
  process.exit(1);
}

function startFirstAvailableEmulator() {
  const emulator = findEmulatorBinary();
  if (!emulator) {
    console.error(
      'RN 0.87 probe: Android emulator executable not found.\n' +
        'Set ANDROID_SDK_ROOT/ANDROID_HOME or start an AVD from Android Studio Device Manager.',
    );
    process.exit(1);
  }

  const avds = capture(emulator, ['-list-avds'])
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (avds.length === 0) {
    console.error(
      'RN 0.87 probe: no Android Virtual Devices are installed.\n' +
        'Create one in Android Studio Device Manager, then rerun this command.',
    );
    process.exit(1);
  }

  const avd = process.env.ANDROID_AVD || avds[0];
  if (!avds.includes(avd)) {
    console.error(
      `RN 0.87 probe: ANDROID_AVD=${avd} does not exist.\nAvailable AVDs:\n` +
        avds.map(name => `  ${name}`).join('\n'),
    );
    process.exit(1);
  }

  console.log(`RN 0.87 probe: starting Android emulator ${avd}`);
  const child = spawn(emulator, ['-avd', avd], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();

  const serial = waitForReadyDevice();
  if (!serial) {
    console.error(`RN 0.87 probe: emulator ${avd} did not become available to adb.`);
    process.exit(1);
  }
  waitForAndroidBoot(serial);
  return serial;
}

const requestedSerial = process.env.ANDROID_SERIAL ?? null;
let adbDevices = readAdbDevices();
let deviceSerial = requestedSerial;

if (requestedSerial) {
  const requested = adbDevices.find(device => device.serial === requestedSerial);
  if (!requested || requested.state !== 'device') {
    if (requested?.serial?.startsWith('emulator-')) {
      deviceSerial = waitForReadyDevice(requestedSerial);
    }
    if (!deviceSerial) {
      console.error(
        `ANDROID_SERIAL=${requestedSerial} is not an available connected device.\n` +
          `adb devices:\n${adbDevices.map(device => `  ${device.serial}\t${device.state}`).join('\n') || '  none'}`,
      );
      process.exit(1);
    }
  }
} else {
  const readyDevices = adbDevices.filter(device => device.state === 'device');
  if (readyDevices.length === 0) {
    const bootingEmulator = adbDevices.find(device => device.serial.startsWith('emulator-'));
    deviceSerial = bootingEmulator
      ? waitForReadyDevice(bootingEmulator.serial)
      : startFirstAvailableEmulator();
    if (!deviceSerial) {
      console.error('RN 0.87 probe: Android device/emulator did not become ready.');
      process.exit(1);
    }
    waitForAndroidBoot(deviceSerial);
  } else if (readyDevices.length > 1) {
    console.error(
      'RN 0.87 probe: multiple Android devices are connected.\n' +
        readyDevices.map(device => `  ${device.serial}`).join('\n') +
        '\nSet ANDROID_SERIAL=<serial> and rerun the command.',
    );
    process.exit(1);
  } else {
    deviceSerial = readyDevices[0].serial;
  }
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
