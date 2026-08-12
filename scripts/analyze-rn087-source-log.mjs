#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
let logPath = null;
let expected = null;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--expect') {
    expected = args[++i] ?? null;
    if (expected !== 'off' && expected !== 'on' && expected !== 'on-source') {
      console.error('Usage: analyze-rn087-source-log.mjs <log> [--expect off|on|on-source]');
      process.exit(2);
    }
  } else if (arg.startsWith('-')) {
    console.error(`Unknown option: ${arg}`);
    process.exit(2);
  } else if (logPath == null) {
    logPath = arg;
  } else {
    console.error(`Unexpected argument: ${arg}`);
    process.exit(2);
  }
}

if (logPath == null || !fs.existsSync(logPath)) {
  console.error('Usage: analyze-rn087-source-log.mjs <log> [--expect off|on|on-source]');
  process.exit(2);
}

const LEGACY = 'com.facebook.react.views.scroll.ReactScrollView';
const NESTED = 'com.facebook.react.views.scroll.ReactNestedScrollView';
const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/);

const stats = {
  bootstrapEnabled: null,
  bootstrapLines: [],
  sourceClasses: new Map(),
  starts: { TOUCH: 0, NON_TOUCH: 0 },
  stops: { TOUCH: 0, NON_TOUCH: 0 },
  pres: { TOUCH: 0, NON_TOUCH: 0 },
  preFling: 0,
  fling: 0,
  sourcePatchFlings: 0,
};

function addSource(name) {
  if (!name) return;
  stats.sourceClasses.set(name, (stats.sourceClasses.get(name) ?? 0) + 1);
}

for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];

  if (line.includes('Rn087NestedScroll') && line.includes('enabled=')) {
    const match = line.match(/enabled=(true|false)/);
    if (match) stats.bootstrapEnabled = match[1] === 'true';
    stats.bootstrapLines.push(index + 1);
  }

  const source = line.match(/target=([A-Za-z0-9_.$]+)#/);
  if (source) addSource(source[1]);

  if (line.includes('NESTED_START')) {
    const typed = line.match(/type=(TOUCH|NON_TOUCH)/);
    const type = typed?.[1] ?? (line.includes('contract=platform') ? 'TOUCH' : null);
    if (type) stats.starts[type] += 1;
  }

  if (line.includes('NESTED_STOP')) {
    const typed = line.match(/type=(TOUCH|NON_TOUCH)/);
    const type = typed?.[1] ?? (line.includes('contract=platform') ? 'TOUCH' : null);
    if (type) stats.stops[type] += 1;
  }

  if (line.includes('NESTED_PRE type=')) {
    const typed = line.match(/type=(TOUCH|NON_TOUCH)/);
    if (typed) stats.pres[typed[1]] += 1;
  }

  if (line.includes('NESTED_PRE_FLING')) stats.preFling += 1;
  if (line.includes('NESTED_FLING')) stats.fling += 1;
  if (line.includes('SOURCE_FLING_PATCH')) stats.sourcePatchFlings += 1;
}

const legacySeen = stats.sourceClasses.has(LEGACY);
const nestedSeen = stats.sourceClasses.has(NESTED);
const nonTouchSeen = stats.starts.NON_TOUCH > 0 && stats.pres.NON_TOUCH > 0;

console.log(`RN 0.87 source report: ${path.resolve(logPath)}`);
console.log('');
console.log('Bootstrap');
console.log(`  explicit experiment flag  ${stats.bootstrapEnabled == null ? 'not logged' : stats.bootstrapEnabled}`);
console.log(`  bootstrap log lines        ${stats.bootstrapLines.join(', ') || 'none'}`);
console.log('');
console.log('Native source classes');
if (stats.sourceClasses.size === 0) {
  console.log('  none found');
} else {
  for (const [name, count] of stats.sourceClasses) console.log(`  ${name}  ${count}`);
}
console.log('');
console.log('Nested sessions');
console.log(`  starts TOUCH / NON_TOUCH   ${stats.starts.TOUCH} / ${stats.starts.NON_TOUCH}`);
console.log(`  stops  TOUCH / NON_TOUCH   ${stats.stops.TOUCH} / ${stats.stops.NON_TOUCH}`);
console.log(`  pre    TOUCH / NON_TOUCH   ${stats.pres.TOUCH} / ${stats.pres.NON_TOUCH}`);
console.log(`  pre-fling / fling          ${stats.preFling} / ${stats.fling}`);
console.log(`  source patch flings        ${stats.sourcePatchFlings}`);
console.log('');

if (expected === 'off') {
  const sourcePass = legacySeen && !nestedSeen;
  const baselineExpected = !nonTouchSeen;
  console.log(`OFF source-class gate:       ${sourcePass ? 'PASS' : 'FAIL'}`);
  console.log(`OFF stock momentum baseline: ${baselineExpected ? 'NO NON_TOUCH (expected)' : 'NON_TOUCH PRESENT (investigate)'}`);
  process.exitCode = sourcePass ? 0 : 1;
} else if (expected === 'on' || expected === 'on-source') {
  const bootstrapPass = stats.bootstrapEnabled === true;
  const sourcePass = nestedSeen && !legacySeen;
  const momentumPass = nonTouchSeen;
  const sourcePatchPass = expected !== 'on-source' || stats.sourcePatchFlings > 0;
  console.log(`ON bootstrap gate:           ${bootstrapPass ? 'PASS' : 'FAIL'}`);
  console.log(`ON source-class gate:        ${sourcePass ? 'PASS' : 'FAIL'}`);
  console.log(`ON NON_TOUCH source gate:    ${momentumPass ? 'PASS' : 'FAIL'}`);
  if (expected === 'on-source') {
    console.log(`ON source-patch runtime gate:${sourcePatchPass ? ' PASS' : ' FAIL'}`);
  }
  process.exitCode = bootstrapPass && sourcePass && momentumPass && sourcePatchPass ? 0 : 1;
} else {
  console.log(`Legacy ReactScrollView seen: ${legacySeen}`);
  console.log(`ReactNestedScrollView seen:  ${nestedSeen}`);
  console.log(`NON_TOUCH movement seen:     ${nonTouchSeen}`);
}
