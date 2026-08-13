#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const logPath = process.argv[2];
if (!logPath || !fs.existsSync(logPath)) {
  console.error('Usage: analyze-rn087-snap-interruption-log.mjs <log>');
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
  requests: [],
  skips: [],
  segments: [],
  frames: 0,
  brokenFrames: 0,
  orphanFrames: 0,
  orphanEnds: 0,
  overlappingStarts: 0,
};

let lastRequest = null;
let active = null;
let lastEnded = null;

function addSource(name) {
  if (!name) return;
  stats.sourceClasses.set(name, (stats.sourceClasses.get(name) ?? 0) + 1);
}

function direction(segment) {
  const targetDirection = Math.sign(segment.targetY - segment.baselineY);
  return targetDirection !== 0 ? targetDirection : Math.sign(segment.sourceVelocityY);
}

for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
  const line = lines[lineIndex];

  if (line.includes('Rn087NestedScroll') && line.includes('enabled=')) {
    const match = line.match(/enabled=(true|false)/);
    if (match) stats.bootstrapEnabled = match[1] === 'true';
  }

  const source = line.match(/target=([A-Za-z0-9_.$]+)#/);
  if (source) addSource(source[1]);

  const nestedStart = line.match(/NESTED_START .*type=(TOUCH|NON_TOUCH)/);
  if (nestedStart) {
    const type = nestedStart[1];
    stats.starts[type] += 1;
    if (type === 'TOUCH') {
      if (active != null && !active.ended) {
        active.touchStartWhileActive = true;
        active.touchStartLine = lineIndex;
      } else if (
        lastEnded != null &&
        lastEnded.sourceY !== lastEnded.targetY &&
        lineIndex - lastEnded.endLine <= 20
      ) {
        // Android may abort its OverScroller on ACTION_DOWN before touch slop is crossed and before
        // the parent receives the new TYPE_TOUCH nested start. An immediately preceding direct snap
        // that ended short of its old target is therefore a legitimate interrupted segment.
        lastEnded.touchStartAfterEarlyEnd = true;
        lastEnded.touchStartLine = lineIndex;
      }
    }
  }

  const nestedStop = line.match(/NESTED_STOP .*type=(TOUCH|NON_TOUCH)/);
  if (nestedStop) stats.stops[nestedStop[1]] += 1;
  const pre = line.match(/NESTED_PRE type=(TOUCH|NON_TOUCH)/);
  if (pre) stats.pres[pre[1]] += 1;
  const post = line.match(/NESTED_POST type=(TOUCH|NON_TOUCH)/);
  if (post) stats.posts[post[1]] += 1;

  const request = line.match(
    /SOURCE_SNAP_PATCH mode=direct-scroller targetY=(-?\d+) velocityY=(-?\d+)/,
  );
  if (request) {
    lastRequest = {targetY: Number(request[1]), velocityY: Number(request[2])};
    stats.requests.push(lastRequest);
  }

  const skip = line.match(
    /SOURCE_SNAP_DIRECT_SKIP reason=([A-Za-z0-9_-]+) targetY=(-?\d+) sourceVelocityY=(-?\d+) sourceY=(-?\d+)/,
  );
  if (skip) {
    stats.skips.push({
      reason: skip[1],
      targetY: Number(skip[2]),
      sourceVelocityY: Number(skip[3]),
      sourceY: Number(skip[4]),
      requestTargetY: lastRequest?.targetY ?? null,
      requestVelocityY: lastRequest?.velocityY ?? null,
    });
    lastRequest = null;
  }

  const start = line.match(
    /SOURCE_SNAP_DIRECT_START mode=post-only-target-lock targetY=(-?\d+) sourceVelocityY=(-?\d+) baselineY=(-?\d+) started=(true|false)/,
  );
  if (start) {
    if (active != null && !active.ended) stats.overlappingStarts += 1;
    const segment = {
      index: stats.segments.length + 1,
      startLine: lineIndex,
      targetY: Number(start[1]),
      sourceVelocityY: Number(start[2]),
      baselineY: Number(start[3]),
      started: start[4] === 'true',
      requestTargetY: lastRequest?.targetY ?? null,
      requestVelocityY: lastRequest?.velocityY ?? null,
      frames: 0,
      requestedNetY: 0,
      childNetY: 0,
      touchStartWhileActive: false,
      touchStartAfterEarlyEnd: false,
      touchStartLine: null,
      postTouchFrames: 0,
      ended: false,
      endLine: null,
      reason: null,
      sourceY: null,
      scrollerY: null,
      scrollerFinished: null,
    };
    stats.segments.push(segment);
    active = segment;
    lastEnded = null;
    lastRequest = null;
  }

  const frame = line.match(
    /SOURCE_SNAP_FRAME mode=post-only-target-lock requestedY=(-?\d+) childConsumedY=(-?\d+) remainingY=(-?\d+) parentPostConsumedY=(-?\d+)(?: residualY=(-?\d+) edgeAbort=(true|false))? scrollerY=(-?\d+) sourceY=(-?\d+)/,
  );
  if (frame) {
    stats.frames += 1;
    if (active == null) {
      stats.orphanFrames += 1;
    } else {
      const requestedY = Number(frame[1]);
      const childConsumedY = Number(frame[2]);
      const remainingY = Number(frame[3]);
      active.frames += 1;
      active.requestedNetY += requestedY;
      active.childNetY += childConsumedY;
      if (active.touchStartWhileActive) active.postTouchFrames += 1;
      if (requestedY !== childConsumedY + remainingY) stats.brokenFrames += 1;
    }
  }

  const end = line.match(
    /SOURCE_SNAP_DIRECT_END reason=([A-Za-z0-9_-]+) targetY=(-?\d+) sourceY=(-?\d+) scrollerY=(-?\d+)(?: scrollerFinished=(true|false))?/,
  );
  if (end) {
    if (active == null) {
      stats.orphanEnds += 1;
    } else {
      active.ended = true;
      active.endLine = lineIndex;
      active.reason = end[1];
      active.endTargetY = Number(end[2]);
      active.sourceY = Number(end[3]);
      active.scrollerY = Number(end[4]);
      active.scrollerFinished = end[5] == null ? null : end[5] === 'true';
      lastEnded = active;
      active = null;
    }
  }
}

const legacySeen = stats.sourceClasses.has(LEGACY);
const nestedSeen = stats.sourceClasses.has(NESTED);
const bootstrapPass = stats.bootstrapEnabled === true;
const sourcePass = nestedSeen && !legacySeen;
const touchBalance = stats.starts.TOUCH > 0 && stats.starts.TOUCH === stats.stops.TOUCH;
const nonTouchBalance =
  stats.starts.NON_TOUCH > 0 && stats.starts.NON_TOUCH === stats.stops.NON_TOUCH;
const nonTouchDispatch = stats.frames > 0 && stats.posts.NON_TOUCH > 0;
const prePolicyPass = stats.pres.NON_TOUCH === 0;

const ended = stats.segments.filter(item => item.started && item.ended);
const unfinished = stats.segments.filter(item => !item.ended);
const requestMismatches = ended.filter(
  item =>
    item.requestTargetY == null ||
    item.requestTargetY !== item.targetY ||
    item.requestVelocityY !== item.sourceVelocityY,
);
const skipMismatches = stats.skips.filter(
  item =>
    item.reason !== 'no-op' ||
    item.requestTargetY == null ||
    item.requestTargetY !== item.targetY ||
    item.requestVelocityY !== item.sourceVelocityY ||
    item.sourceVelocityY !== 0 ||
    item.sourceY !== item.targetY,
);

const interrupted = ended.filter(
  item => item.touchStartWhileActive || item.touchStartAfterEarlyEnd,
);
const completed = ended.filter(item => !interrupted.includes(item));
const completedTargetMismatches = completed.filter(item => item.sourceY !== item.targetY);
const interruptionMotionLeaks = interrupted.filter(item => item.postTouchFrames !== 0);
const incompleteWithoutTouch = completed.filter(item => item.sourceY !== item.targetY);

let reversals = 0;
for (const item of interrupted) {
  const next = stats.segments.find(candidate => candidate.startLine > (item.touchStartLine ?? item.endLine));
  if (next == null) continue;
  const before = direction(item);
  const after = direction(next);
  if (before !== 0 && after !== 0 && before === -after) reversals += 1;
}

const topTargetCompleted = completed.filter(item => item.targetY === 0 && item.sourceY === 0).length;
const velocities = stats.segments
  .map(item => Math.abs(item.sourceVelocityY))
  .filter(value => value > 0);
const minVelocity = velocities.length ? Math.min(...velocities) : 0;
const maxVelocity = velocities.length ? Math.max(...velocities) : 0;

const accountingPass =
  stats.requests.length > 0 &&
  stats.segments.length + stats.skips.length === stats.requests.length &&
  ended.length === stats.segments.length &&
  stats.segments.every(item => item.started) &&
  requestMismatches.length === 0 &&
  skipMismatches.length === 0 &&
  unfinished.length === 0 &&
  stats.brokenFrames === 0 &&
  stats.orphanFrames === 0 &&
  stats.orphanEnds === 0 &&
  stats.overlappingStarts === 0;
const completedTargetsPass = completed.length > 0 && completedTargetMismatches.length === 0;
const interruptionPass = interrupted.length >= 2 && interruptionMotionLeaks.length === 0;
const reversalPass = reversals > 0;

console.log(`RN 0.87 direct-snap interruption report: ${path.resolve(logPath)}`);
console.log('');
console.log('Source');
console.log(`  bootstrap true                ${stats.bootstrapEnabled}`);
for (const [name, count] of stats.sourceClasses) console.log(`  ${name}  ${count}`);
console.log('');
console.log('Nested sessions');
console.log(`  starts TOUCH / NON_TOUCH      ${stats.starts.TOUCH} / ${stats.starts.NON_TOUCH}`);
console.log(`  stops  TOUCH / NON_TOUCH      ${stats.stops.TOUCH} / ${stats.stops.NON_TOUCH}`);
console.log(`  pre    TOUCH / NON_TOUCH      ${stats.pres.TOUCH} / ${stats.pres.NON_TOUCH}`);
console.log(`  post   TOUCH / NON_TOUCH      ${stats.posts.TOUCH} / ${stats.posts.NON_TOUCH}`);
console.log('');
console.log('Direct snap interruption');
console.log(`  requests / no-op skips        ${stats.requests.length} / ${stats.skips.length}`);
console.log(`  segments / frames             ${stats.segments.length} / ${stats.frames}`);
console.log(`  interrupted segments          ${interrupted.length}`);
console.log(
  `    TOUCH start while active   ${interrupted.filter(x => x.touchStartWhileActive).length}`,
);
console.log(
  `    TOUCH after early end      ${interrupted.filter(x => x.touchStartAfterEarlyEnd).length}`,
);
console.log(
  `  post-touch old-snap frames   ${interruptionMotionLeaks.reduce((n, x) => n + x.postTouchFrames, 0)}`,
);
console.log(`  reversal pairs                ${reversals}`);
console.log(
  `  completed target matches     ${completed.length - completedTargetMismatches.length}/${completed.length}`,
);
console.log(`  completed top targets         ${topTargetCompleted}`);
console.log(`  velocity |min| / |max|        ${minVelocity} / ${maxVelocity}`);
console.log(
  `  broken/orphan/overlap        ${stats.brokenFrames} / ${stats.orphanFrames + stats.orphanEnds} / ${stats.overlappingStarts}`,
);
console.log(`  incomplete without touch      ${incompleteWithoutTouch.length}`);

if (interruptionMotionLeaks.length || incompleteWithoutTouch.length) {
  console.log('  mismatch details');
  for (const item of [...interruptionMotionLeaks, ...incompleteWithoutTouch].slice(0, 10)) {
    console.log(
      `    #${item.index} reason=${item.reason} base=${item.baselineY} target=${item.targetY} ` +
        `sourceY=${item.sourceY} v=${item.sourceVelocityY} ` +
        `touchActive=${item.touchStartWhileActive} touchAfterEnd=${item.touchStartAfterEarlyEnd} ` +
        `postTouchFrames=${item.postTouchFrames}`,
    );
  }
}

const gates = [
  ['bootstrap', bootstrapPass],
  ['source class', sourcePass],
  ['TOUCH session balance', touchBalance],
  ['NON_TOUCH session balance', nonTouchBalance],
  ['NON_TOUCH frame dispatch', nonTouchDispatch],
  ['target-lock pre bypass', prePolicyPass],
  ['direct request accounting', accountingPass],
  ['completed target accounting', completedTargetsPass],
  ['touch interruption quiescence', interruptionPass],
  ['immediate reversal coverage', reversalPass],
];

console.log('');
let failed = false;
for (const [name, passed] of gates) {
  if (!passed) failed = true;
  console.log(`${name.padEnd(31)} ${passed ? 'PASS' : 'FAIL'}`);
}
if (failed) process.exitCode = 1;
