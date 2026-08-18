#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(
  npmCommand,
  ['pack', '--dry-run', '--json', '--ignore-scripts'],
  { encoding: 'utf8' },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'npm pack --dry-run failed\n');
  process.exit(result.status ?? 1);
}

let pack;
try {
  const parsed = JSON.parse(result.stdout);
  pack = parsed[0];
} catch (error) {
  console.error('Package surface invariant: FAIL');
  console.error(`  unable to parse npm pack output: ${error}`);
  process.exit(1);
}

const files = new Set((pack?.files ?? []).map((entry) => entry.path));
const required = [
  'package.json',
  'README.md',
  'ARCHITECTURE.md',
  'PRODUCT.md',
  'index.ts',
  'app.plugin.js',
  'expo-module.config.json',
  'plugin/withRn086AndroidXScroll.js',
  'plugin/rn086AndroidXPatch.js',
  'src/NativeScrollHost.tsx',
  'src/NativeScrollHost.android.tsx',
  'android/build.gradle',
  'android-shared/src/main/java/com/reactnativescroll/interop/core/VerticalNestedScrollTransactionDispatcher.kt',
  'android/src/main/java/com/reactnativescroll/interop/material3/TopAppBarScrollConsumer.kt',
  'android/src/main/java/com/reactnativescroll/interop/material3/FloatingToolbarScrollConsumer.kt',
];

const forbiddenPrefixes = [
  'example/',
  'rn087-bare-probe/',
  'docs/',
  'scripts/',
  '.github/',
];
const forbiddenExact = new Set([
  'AGENTS.md',
  'ROADMAP.md',
  'TESTING.md',
  'bun.lock',
]);

const violations = [];
for (const path of required) {
  if (!files.has(path)) violations.push(`missing required package file: ${path}`);
}

for (const path of files) {
  if (forbiddenExact.has(path)) violations.push(`repository-only file leaked into package: ${path}`);
  for (const prefix of forbiddenPrefixes) {
    if (path.startsWith(prefix)) violations.push(`repository-only path leaked into package: ${path}`);
  }
}

if (violations.length > 0) {
  console.error('Package surface invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('Package surface invariant: PASS');
console.log(`  files: ${files.size}`);
console.log(`  unpacked size: ${pack?.unpackedSize ?? 'unknown'} bytes`);
console.log('  runtime Android/JS/plugin surface included');
console.log('  examples, probes, repository docs and scripts excluded');
