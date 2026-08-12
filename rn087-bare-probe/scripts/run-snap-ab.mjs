#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import {spawnSync} from 'node:child_process';

const variant = process.argv[2];
if (variant !== 'legacy' && variant !== 'stock' && variant !== 'patched') {
  console.error('Usage: node scripts/run-snap-ab.mjs legacy|stock|patched');
  process.exit(2);
}

const root = process.cwd();
const runner = path.join(root, 'scripts', 'run-android.mjs');
const runnerMode = variant === 'legacy' ? 'off' : variant === 'stock' ? 'on' : 'on-source';

const result = spawnSync(process.execPath, [runner, runnerMode], {
  cwd: root,
  stdio: 'inherit',
  env: {...process.env, RN_SCROLL_PROBE_MODE: 'snap'},
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const logPath = `/tmp/rn087-bare-snap-${variant}.log`;
console.log('');
console.log(`RN 0.87 snap A/B variant=${variant}`);
console.log(`  native source: ${variant === 'legacy' ? 'ReactScrollView' : 'ReactNestedScrollView'}`);
console.log(`  RN source patch: ${variant === 'patched' ? 'V3 enabled' : 'disabled'}`);
console.log('  JS props: identical pagingEnabled + snapToInterval');
console.log(`Capture: adb logcat -v time -s Rn087NestedScroll:I '*:S' | tee ${logPath}`);
console.log('Compare the feel using the same gesture sequence for each variant.');
