#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {spawn, spawnSync} from 'node:child_process';

const mode = process.argv[2];
if (mode !== 'off' && mode !== 'on' && mode !== 'on-shim') {
  console.error('Usage: node scripts/run-android.mjs off|on|on-shim');
  process.exit(2);
}

const root = process.cwd();
const gradlew = path.join(root, 'android', 'gradlew');
if (!fs.existsSync(gradlew)) {
  console.error('Missing android/gradlew. Run npm install first.');
  process.exit(1);
}

const enabled = mode !== 'off';
const flingSessionShim = mode === 'on-shim';
const appId = 'com.rn087nestedscrollprobe';
const sdkRoots = [
  process.env.ANDROID_SDK_ROOT,
  process.env.ANDROID_HOME,
  path.join(os.homedir(), 'Library', 'Android', 'sdk'),
  path.join(os.homedir(), 'Android', 'Sdk'),
].filter(Boolean);

function shellLookup(command) {
  const result = spawnSync('sh', ['-lc', `command -v ${command}`], {
    encoding: 'utf8',
    env: process.env,
  });
  return (result.stdout ?? '').trim() || null;
}

function findSdkBinary(relativeParts, fallbackCommand) {
  for (const sdkRoot of sdkRoots) {
    const candidate = path.join(sdkRoot, ...relativeParts);
    if (fs.existsSync(candidate)) return candidate;
  }
  return shellLookup(fallbackCommand);
}

const adbBinary = findSdkBinary(['platform-tools', 'adb'], 'adb');
if (!adbBinary) {
  console.error(
    'RN 0.87 probe: adb executable not found.\n' +
      'Expected it under ~/Library/Android/sdk/platform-tools/adb or ANDROID_SDK_ROOT.',
  );
  process.exit(1);
}

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

function adbCapture(args, allowFailure = false) {
  return capture(adbBinary, args, root, allowFailure);
}

function readAdbDevices() {
  return adbCapture(['devices'])
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
  return findSdkBinary(['emulator', 'emulator'], 'emulator');
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
    const completed = adbCapture(
      ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'],
      true,
    ).trim();
    if (completed === '1') return;
    sleep(1000);
  }
  console.error(`RN 0.87 probe: ${serial} connected but Android did not finish booting.`);
  process.exit(1);
}

function printEmulatorLog(logPath) {
  if (!fs.existsSync(logPath)) return;
  const log = fs.readFileSync(logPath, 'utf8').trim();
  if (!log) return;
  console.error(`\nAndroid emulator startup log (${logPath}):\n${log}\n`);
}

function startFirstAvailableEmulator() {
  const emulator = findEmulatorBinary();
  if (!emulator) {
    console.error(
      'RN 0.87 probe: Android emulator executable not found.\n' +
        'Expected it under ~/Library/Android/sdk/emulator/emulator or ANDROID_SDK_ROOT.',
    );
    process.exit(1);
  }

  console.log(`RN 0.87 probe emulator binary: ${emulator}`);
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

  const logPath = path.join(os.tmpdir(), 'rn087-emulator-startup.log');
  const logFd = fs.openSync(logPath, 'w');
  console.log(`RN 0.87 probe: starting Android emulator ${avd}`);
  console.log(`RN 0.87 probe: emulator startup log ${logPath}`);

  const child = spawn(emulator, ['-avd', avd, '-no-snapshot-load'], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: process.env,
  });
  child.unref();
  fs.closeSync(logFd);

  sleep(2500);
  try {
    process.kill(child.pid, 0);
  } catch {
    printEmulatorLog(logPath);
    console.error(`RN 0.87 probe: emulator ${avd} exited immediately.`);
    process.exit(1);
  }

  const serial = waitForReadyDevice();
  if (!serial) {
    printEmulatorLog(logPath);
    console.error(`RN 0.87 probe: emulator ${avd} did not become available to adb.`);
    process.exit(1);
  }
  waitForAndroidBoot(serial);
  return serial;
}

console.log(`RN 0.87 probe adb binary: ${adbBinary}`);
run(adbBinary, ['start-server']);

const requestedSerial = process.env.ANDROID_SERIAL ?? null;
const adbDevices = readAdbDevices();
let deviceSerial = null;

if (requestedSerial) {
  const requested = adbDevices.find(device => device.serial === requestedSerial);
  if (requested?.state === 'device') {
    deviceSerial = requestedSerial;
  } else if (requested?.serial?.startsWith('emulator-')) {
    deviceSerial = waitForReadyDevice(requestedSerial);
  }

  if (!deviceSerial) {
    console.error(
      `ANDROID_SERIAL=${requestedSerial} is not an available connected device.\n` +
        `adb devices:\n${adbDevices.map(device => `  ${device.serial}\t${device.state}`).join('\n') || '  none'}`,
    );
    process.exit(1);
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

const adb = args => run(adbBinary, ['-s', deviceSerial, ...args]);
console.log(`RN 0.87 probe device: ${deviceSerial}`);

run(
  './gradlew',
  [
    ':app:installDebug',
    `-PrnNestedScrollAndroid=${enabled}`,
    `-PrnNestedScrollFlingShim=${flingSessionShim}`,
    '--no-daemon',
  ],
  path.join(root, 'android'),
);

// Keep the process bootstrap in the log buffer: the analyzer uses it to verify the flag.
adb(['logcat', '-c']);
adb(['reverse', 'tcp:8081', 'tcp:8081']);
adb(['shell', 'am', 'force-stop', appId]);
adb(['shell', 'am', 'start', '-n', `${appId}/.MainActivity`]);

const logPath =
  mode === 'off'
    ? '/tmp/rn087-bare-off.log'
    : mode === 'on'
      ? '/tmp/rn087-bare-on.log'
      : '/tmp/rn087-bare-on-shim.log';

console.log(
  `RN 0.87 probe launched with useNestedScrollViewAndroid=${enabled} flingSessionShim=${flingSessionShim}`,
);
console.log('Do not run `adb logcat -c` after this launch; the bootstrap line is part of the gate.');
console.log(
  `Capture: ${adbBinary} -s ${deviceSerial} logcat -v time -s Rn087NestedScroll:I '*:S' | tee ${logPath}`,
);
