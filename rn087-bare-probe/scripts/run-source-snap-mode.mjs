#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import {spawnSync} from 'node:child_process';

const mode = process.argv[2];
const harness = process.argv[3] ?? 'source-only';
if (mode !== 'snap' && mode !== 'snap-stress' && mode !== 'paging') {
  console.error(
    'Usage: node scripts/run-source-snap-mode.mjs snap|snap-stress|paging [source-only|multi-chrome]',
  );
  process.exit(2);
}
if (harness !== 'source-only' && harness !== 'multi-chrome') {
  console.error(
    'Usage: node scripts/run-source-snap-mode.mjs snap|snap-stress|paging [source-only|multi-chrome]',
  );
  process.exit(2);
}

const root = process.cwd();
const runner = path.join(root, 'scripts', 'run-android.mjs');
const runnerMode = harness === 'multi-chrome' ? 'on-source-multi-chrome' : 'on-source';
const result = spawnSync(process.execPath, [runner, runnerMode], {
  cwd: root,
  stdio: 'inherit',
  env: {...process.env, RN_SCROLL_PROBE_MODE: mode},
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const logPath =
  harness === 'multi-chrome'
    ? `/tmp/rn087-bare-on-source-multi-chrome-${mode}.log`
    : `/tmp/rn087-bare-on-source-${mode}.log`;
console.log('');
console.log(`RN 0.87 ${mode} probe is active (${harness}).`);
if (harness === 'multi-chrome') {
  console.log('The screen must show both the Material3 TopAppBar and FloatingToolbar.');
  console.log('This is the product-shape gate: source transaction + consuming chrome + observing chrome.');
} else {
  console.log('This is the source-only diagnostic harness; Material3 chrome is intentionally absent.');
}
console.log('Capture the same Rn087NestedScroll tag, but write this mode-specific log:');
console.log(`  adb logcat -v time -s Rn087NestedScroll:I '*:S' | tee ${logPath}`);
if (mode === 'snap-stress') {
  console.log('Stress sequence:');
  console.log('  1. Complete one clean snap in each direction.');
  console.log('  2. Release into a snap, touch again before it settles, then reverse and release. Repeat twice.');
  console.log('  3. Reach the top edge and complete a snap into it.');
  console.log('  4. Reach the bottom edge and complete a snap into it.');
  console.log('  5. Stop logcat only after the final animation is idle.');
} else {
  console.log('Use clean drag/release gestures first and let each snap settle before stopping logcat.');
}
