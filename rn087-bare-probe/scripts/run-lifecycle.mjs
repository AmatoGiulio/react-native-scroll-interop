#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const runAndroid = path.join(scriptDir, 'run-android.mjs');
const result = spawnSync(process.execPath, [runAndroid, 'on-source-multi-chrome'], {
  cwd: path.dirname(scriptDir),
  stdio: 'inherit',
  env: {
    ...process.env,
    RN_LIFECYCLE_PROBE: 'true',
  },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
