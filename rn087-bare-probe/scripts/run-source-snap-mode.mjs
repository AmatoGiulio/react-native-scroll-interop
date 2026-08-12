#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import {spawnSync} from 'node:child_process';

const mode = process.argv[2];
if (mode !== 'snap' && mode !== 'paging') {
  console.error('Usage: node scripts/run-source-snap-mode.mjs snap|paging');
  process.exit(2);
}

const root = process.cwd();
const runner = path.join(root, 'scripts', 'run-android.mjs');
const result = spawnSync(process.execPath, [runner, 'on-source'], {
  cwd: root,
  stdio: 'inherit',
  env: {...process.env, RN_SCROLL_PROBE_MODE: mode},
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const logPath = `/tmp/rn087-bare-on-source-${mode}.log`;
console.log('');
console.log(`RN 0.87 ${mode} probe is active.`);
console.log('Capture the same Rn087NestedScroll tag, but write this mode-specific log:');
console.log(`  adb logcat -v time -s Rn087NestedScroll:I '*:S' | tee ${logPath}`);
console.log('Use clean drag/release gestures first and let each snap settle before stopping logcat.');
