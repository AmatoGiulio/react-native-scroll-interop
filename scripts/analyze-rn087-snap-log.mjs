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
    if (expected !== 'direct' && expected !== 'direct-chrome' && expected !== 'paging') {
      console.error(
        'Usage: analyze-rn087-snap-log.mjs <log> --expect direct|direct-chrome|paging',
      );
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
  console.error('Usage: analyze-rn087-snap-log.mjs <log> --expect direct|direct-chrome|paging');
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
  directPrimes: 0,
  directSessions: [],
  directSegments: [],
  directStopsWithoutTarget: 0,
  directStopsWithoutSourceY: 0,
  pagingRequests: [],
  animatorStarts: [],
  animatorEnds: [],
};

let nonTouchSessionActive = false;
let pendingDirectTarget = null;
let activeDirectTarget = null;
let activeDirectSegment = null;

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

  const direct = line.match(
    /SOURCE_SNAP_PATCH mode=direct-scroller targetY=(-?\d+) velocityY=(-?\d+)/,
  );
  if (direct) {
    const request = {targetY: Number(direct[1]), velocityY: Number(direct[2])};
    stats.direct.push(request);
    if (nonTouchSessionActive) activeDirectTarget = request.targetY;
    else pendingDirectTarget = request.targetY;
  }

  const start = line.match(/NESTED_START .*type=(TOUCH|NON_TOUCH)/);
  if (start) {
    stats.starts[start[1]] += 1;
    if (start[1] === 'NON_TOUCH') {
      nonTouchSessionActive = true;
      activeDirectTarget = pendingDirectTarget;
      pendingDirectTarget = null;
    }
  }

  const prime = line.match(
    /SOURCE_NESTED_PRIME reason=snap-direct mode=direct-baseline .*baselineY=(-?\d+) started=(true|false)/,
  );
  if (prime) {
    stats.directPrimes += 1;
    if (activeDirectSegment != null && !activeDirectSegment.stopped) {
      activeDirectSegment.superseded = true;
    }
    activeDirectSegment = {
      targetY: activeDirectTarget,
      baselineY: Number(prime[1]),
      requestedY: 0,
      started: prime[2] === 'true',
      stopped: false,
      superseded: false,
      sourceY: null,
    };
    stats.directSegments.push(activeDirectSegment);
  }

  const pre = line.match(/NESTED_PRE type=(TOUCH|NON_TOUCH).*\bdy=(-?\d+)/);
  if (pre) {
    stats.pres[pre[1]] += 1;
    if (pre[1] === 'NON_TOUCH' && activeDirectSegment != null) {
      activeDirectSegment.requestedY += Number(pre[2]);
    }
  } else {
    const preTypeOnly = line.match(/NESTED_PRE type=(TOUCH|NON_TOUCH)/);
    if (preTypeOnly) stats.pres[preTypeOnly[1]] += 1;
  }

  const post = line.match(/NESTED_POST type=(TOUCH|NON_TOUCH)/);
  if (post) stats.posts[post[1]] += 1;

  const stopType = line.match(/NESTED_STOP .*type=(TOUCH|NON_TOUCH)/);
  if (stopType) {
    stats.stops[stopType[1]] += 1;
    if (stopType[1] === 'NON_TOUCH') {
      const sourceYMatch = line.match(/sourceY=(-?\d+)/);
      if (activeDirectTarget == null) {
        stats.directStopsWithoutTarget += 1;
      } else if (!sourceYMatch) {
        stats.directStopsWithoutSourceY += 1;
      } else {
        stats.directSessions.push({
          targetY: activeDirectTarget,
          sourceY: Number(sourceYMatch[1]),
        });
      }
      if (activeDirectSegment != null) {
        activeDirectSegment.stopped = true;
        activeDirectSegment.sourceY = sourceYMatch ? Number(sourceYMatch[1]) : null;
      }
      nonTouchSessionActive = false;
      activeDirectTarget = null;
      activeDirectSegment = null;
    }
  }

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
  const mismatches = stats.directSessions.filter(item => item.targetY !== item.sourceY);
  const completedWithTarget = stats.directSessions.length;
  const completedExpected = stats.stops.NON_TOUCH;

  pathPass =
    stats.direct.length > 0 &&
    stats.directPrimes === stats.direct.length &&
    nonTouchBalance &&
    completedWithTarget > 0 &&
    completedWithTarget === completedExpected &&
    stats.directStopsWithoutTarget === 0 &&
    stats.directStopsWithoutSourceY === 0;
  targetPass = pathPass && mismatches.length === 0;
  targetSummary =
    `session target/stop matches ${completedWithTarget - mismatches.length}/${completedWithTarget}; ` +
    `requests ${stats.direct.length}; primes ${stats.directPrimes}` +
    (mismatches.length
      ? `; mismatches=${mismatches
          .slice(0, 5)
          .map((item, index) => `${index + 1}:${item.targetY}->${item.sourceY}`)
          .join(',')}`
      : '');
} else if (expected === 'direct-chrome') {
  const cleanSegments = stats.directSegments.filter(
    item => item.started && item.stopped && !item.superseded && item.targetY != null,
  );
  const superseded = stats.directSegments.filter(item => item.superseded).length;
  const malformed = stats.directSegments.filter(item => item.targetY == null || !item.started).length;
  const mismatches = cleanSegments.filter(
    item => item.requestedY !== item.targetY - item.baselineY,
  );

  pathPass =
    stats.direct.length > 0 &&
    stats.directPrimes === stats.direct.length &&
    nonTouchBalance &&
    cleanSegments.length > 0 &&
    malformed === 0;
  targetPass = pathPass && mismatches.length === 0;
  targetSummary =
    `scroller delta matches ${cleanSegments.length - mismatches.length}/${cleanSegments.length}; ` +
    `requests ${stats.direct.length}; primes ${stats.directPrimes}; superseded ${superseded}` +
    (mismatches.length
      ? `; mismatches=${mismatches
          .slice(0, 5)
          .map(
            (item, index) =>
              `${index + 1}:expected=${item.targetY - item.baselineY}->requested=${item.requestedY}`,
          )
          .join(',')}`
      : '');
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
console.log(`  direct nested primes        ${stats.directPrimes}`);
console.log(`  direct completed sessions   ${stats.directSessions.length}`);
console.log(`  direct delta segments       ${stats.directSegments.length}`);
console.log(`  stops without target        ${stats.directStopsWithoutTarget}`);
console.log(`  stops without sourceY       ${stats.directStopsWithoutSourceY}`);
console.log(`  paging-animator requests    ${stats.pagingRequests.length}`);
console.log(`  animator starts / ends      ${stats.animatorStarts.length} / ${stats.animatorEnds.length}`);
console.log(`  ${targetSummary}`);
console.log('');
console.log(`bootstrap                    ${bootstrapPass ? 'PASS' : 'FAIL'}`);
console.log(`source class                 ${sourcePass ? 'PASS' : 'FAIL'}`);
console.log(`NON_TOUCH session balance    ${nonTouchBalance ? 'PASS' : 'FAIL'}`);
console.log(`NON_TOUCH frame dispatch     ${nonTouchFrames ? 'PASS' : 'FAIL'}`);
const pathLabel =
  expected === 'paging' ? 'paging animator path' : expected === 'direct-chrome' ? 'direct chrome path' : 'direct snap path';
console.log(`${pathLabel.padEnd(29)}${pathPass ? 'PASS' : 'FAIL'}`);
console.log(`snap target accounting       ${targetPass ? 'PASS' : 'FAIL'}`);

process.exitCode =
  bootstrapPass && sourcePass && nonTouchBalance && nonTouchFrames && pathPass && targetPass ? 0 : 1;
