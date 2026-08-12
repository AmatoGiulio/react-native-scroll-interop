#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
let logPath = null;
let expected = null;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--expect') {
    expected = args[++index] ?? null;
    if (expected !== 'direct' && expected !== 'paging') {
      console.error('Usage: analyze-rn087-snap-log.mjs <log> --expect direct|paging');
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

if (logPath == null || expected == null || !fs.existsSync(logPath)) {
  console.error('Usage: analyze-rn087-snap-log.mjs <log> --expect direct|paging');
  process.exit(2);
}

const LEGACY = 'com.facebook.react.views.scroll.ReactScrollView';
const NESTED = 'com.facebook.react.views.scroll.ReactNestedScrollView';
const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/);

const stats = {
  bootstrapEnabled: null,
  sourceClasses: new Map(),
  starts: {TOUCH: 0, NON_TOUCH: 0},
  stops: {TOUCH: 0, NON_TOUCH: 0},
  pres: {TOUCH: 0, NON_TOUCH: 0},
  posts: {TOUCH: 0, NON_TOUCH: 0},
  direct: [],
  pagingRequests: [],
  animatorStarts: [],
  animatorEnds: [],
  nonTouchStopY: [],
};

function addSource(name) {
  if (!name) return;
  stats.sourceClasses.set(name, (stats.sourceClasses.get(name) ?? 0) + 1);
}

for (const line of lines) {
  if (line.includes('Rn087NestedScroll') && line.includes('enabled=')) {
    const match = line.match(/enabled=(true|false)/);
    if (match) stats.bootstrapEnabled = match[1] === 'true';
  }

  const source = line.match(/target=([A-Za-z0-9_.$]+)#/);
  if (source) addSource(source[1]);

  const start = line.match(/NESTED_START .*type=(TOUCH|NON_TOUCH)/);
  if (start) stats.starts[start[1]] += 1;

  const stop = line.match(/NESTED_STOP .*type=(TOUCH|NON_TOUCH).*sourceY=(-?\d+)/);
  if (stop) {
    stats.stops[stop[1]] += 1;
    if (stop[1] === 'NON_TOUCH') stats.nonTouchStopY.push(Number(stop[2]));
  } else {
    const stopWithoutY = line.match(/NESTED_STOP .*type=(TOUCH|NON_TOUCH)/);
    if (stopWithoutY) stats.stops[stopWithoutY[1]] += 1;
  }

  const pre = line.match(/NESTED_PRE type=(TOUCH|NON_TOUCH)/);
  if (pre) stats.pres[pre[1]] += 1;

  const post = line.match(/NESTED_POST type=(TOUCH|NON_TOUCH)/);
  if (post) stats.posts[post[1]] += 1;

  const direct = line.match(
    /SOURCE_SNAP_PATCH mode=direct-scroller targetY=(-?\d+) velocityY=(-?\d+)/,
  );
  if (direct) stats.direct.push({targetY: Number(direct[1]), velocityY: Number(direct[2])});

  const paging = line.match(
    /SOURCE_SNAP_PATCH mode=paging-animator targetY=(-?\d+) velocityY=(-?\d+)/,
  );
  if (paging) stats.pagingRequests.push({targetY: Number(paging[1]), velocityY: Number(paging[2])});

  const animatorStart = line.match(
    /SOURCE_SNAP_ANIMATOR_START startY=(-?\d+) targetY=(-?\d+) started=(true|false)/,
  );
  if (animatorStart) {
    stats.animatorStarts.push({
      startY: Number(animatorStart[1]),
      targetY: Number(animatorStart[2]),
      started: animatorStart[3] === 'true',
    });
  }

  const animatorEnd = line.match(
    /SOURCE_SNAP_ANIMATOR_END reason=([A-Za-z0-9_-]+) targetY=(-?\d+) actualY=(-?\d+)/,
  );
  if (animatorEnd) {
    stats.animatorEnds.push({
      reason: animatorEnd[1],
      targetY: Number(animatorEnd[2]),
      actualY: Number(animatorEnd[3]),
    });
  }
}

const legacySeen = stats.sourceClasses.has(LEGACY);
const nestedSeen = stats.sourceClasses.has(NESTED);
const bootstrapPass = stats.bootstrapEnabled === true;
const sourcePass = nestedSeen && !legacySeen;
const nonTouchBalance =
  stats.starts.NON_TOUCH > 0 && stats.starts.NON_TOUCH === stats.stops.NON_TOUCH;
const nonTouchFrames = stats.pres.NON_TOUCH > 0 && stats.posts.NON_TOUCH > 0;

let pathPass = false;
let targetPass = false;
let targetSummary = '';

if (expected === 'direct') {
  const pairCount = Math.min(stats.direct.length, stats.nonTouchStopY.length);
  const mismatches = [];
  for (let index = 0; index < pairCount; index += 1) {
    if (stats.direct[index].targetY !== stats.nonTouchStopY[index]) {
      mismatches.push(
        `${index + 1}:${stats.direct[index].targetY}->${stats.nonTouchStopY[index]}`,
      );
    }
  }
  pathPass = stats.direct.length > 0;
  targetPass =
    stats.direct.length > 0 &&
    stats.nonTouchStopY.length === stats.direct.length &&
    mismatches.length === 0;
  targetSummary =
    `direct target/stop matches ${pairCount - mismatches.length}/${stats.direct.length}` +
    (mismatches.length ? ` mismatches=${mismatches.slice(0, 5).join(',')}` : '');
} else {
  const endedNormally = stats.animatorEnds.filter(item => item.reason === 'end');
  const exact = endedNormally.filter(item => item.targetY === item.actualY);
  pathPass =
    stats.pagingRequests.length > 0 &&
    stats.animatorStarts.length > 0 &&
    stats.animatorStarts.every(item => item.started) &&
    stats.animatorEnds.length === stats.animatorStarts.length;
  targetPass =
    stats.animatorEnds.length > 0 &&
    endedNormally.length === stats.animatorEnds.length &&
    exact.length === stats.animatorEnds.length;
  targetSummary = `animator target matches ${exact.length}/${stats.animatorEnds.length}`;
}

console.log(`RN 0.87 snap report: ${path.resolve(logPath)}`);
console.log(`Expected path: ${expected}`);
console.log('');
console.log('Source');
console.log(`  bootstrap true              ${stats.bootstrapEnabled}`);
for (const [name, count] of stats.sourceClasses) console.log(`  ${name}  ${count}`);
console.log('');
console.log('Nested sessions');
console.log(`  starts TOUCH / NON_TOUCH    ${stats.starts.TOUCH} / ${stats.starts.NON_TOUCH}`);
console.log(`  stops  TOUCH / NON_TOUCH    ${stats.stops.TOUCH} / ${stats.stops.NON_TOUCH}`);
console.log(`  pre    TOUCH / NON_TOUCH    ${stats.pres.TOUCH} / ${stats.pres.NON_TOUCH}`);
console.log(`  post   TOUCH / NON_TOUCH    ${stats.posts.TOUCH} / ${stats.posts.NON_TOUCH}`);
console.log('');
console.log('Snap source');
console.log(`  direct-scroller requests    ${stats.direct.length}`);
console.log(`  paging-animator requests    ${stats.pagingRequests.length}`);
console.log(`  animator starts / ends      ${stats.animatorStarts.length} / ${stats.animatorEnds.length}`);
console.log(`  ${targetSummary}`);
console.log('');
console.log(`bootstrap                    ${bootstrapPass ? 'PASS' : 'FAIL'}`);
console.log(`source class                 ${sourcePass ? 'PASS' : 'FAIL'}`);
console.log(`NON_TOUCH session balance    ${nonTouchBalance ? 'PASS' : 'FAIL'}`);
console.log(`NON_TOUCH frame dispatch     ${nonTouchFrames ? 'PASS' : 'FAIL'}`);
console.log(`${expected === 'direct' ? 'direct snap path' : 'paging animator path'}          ${pathPass ? 'PASS' : 'FAIL'}`);
console.log(`snap final target            ${targetPass ? 'PASS' : 'FAIL'}`);

process.exitCode =
  bootstrapPass && sourcePass && nonTouchBalance && nonTouchFrames && pathPass && targetPass ? 0 : 1;
