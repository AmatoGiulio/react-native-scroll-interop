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
  directRequests: [],
  directSegments: [],
  directFrames: 0,
  directFrameBroken: 0,
  directOrphanFrames: 0,
  directOrphanEnds: 0,
  directOverlappingStarts: 0,
  pagingRequests: [],
  animatorStarts: [],
  animatorEnds: [],
};

let lastDirectRequest = null;
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

  const nestedStart = line.match(/NESTED_START .*type=(TOUCH|NON_TOUCH)/);
  if (nestedStart) stats.starts[nestedStart[1]] += 1;

  const nestedStop = line.match(/NESTED_STOP .*type=(TOUCH|NON_TOUCH)/);
  if (nestedStop) stats.stops[nestedStop[1]] += 1;

  const pre = line.match(/NESTED_PRE type=(TOUCH|NON_TOUCH)/);
  if (pre) stats.pres[pre[1]] += 1;

  const post = line.match(/NESTED_POST type=(TOUCH|NON_TOUCH)/);
  if (post) stats.posts[post[1]] += 1;

  const directRequest = line.match(
    /SOURCE_SNAP_PATCH mode=direct-scroller targetY=(-?\d+) velocityY=(-?\d+)/,
  );
  if (directRequest) {
    lastDirectRequest = {
      targetY: Number(directRequest[1]),
      velocityY: Number(directRequest[2]),
    };
    stats.directRequests.push(lastDirectRequest);
  }

  const directStart = line.match(
    /SOURCE_SNAP_DIRECT_START mode=post-only-target-lock targetY=(-?\d+) sourceVelocityY=(-?\d+) baselineY=(-?\d+) started=(true|false)/,
  );
  if (directStart) {
    if (activeDirectSegment != null && !activeDirectSegment.ended) {
      stats.directOverlappingStarts += 1;
    }

    const segment = {
      targetY: Number(directStart[1]),
      sourceVelocityY: Number(directStart[2]),
      baselineY: Number(directStart[3]),
      started: directStart[4] === 'true',
      requestTargetY: lastDirectRequest?.targetY ?? null,
      requestedNetY: 0,
      childNetY: 0,
      frames: 0,
      frameBroken: 0,
      ended: false,
      reason: null,
      endTargetY: null,
      sourceY: null,
      scrollerY: null,
    };
    stats.directSegments.push(segment);
    activeDirectSegment = segment;
    lastDirectRequest = null;
  }

  const directFrame = line.match(
    /SOURCE_SNAP_FRAME mode=post-only-target-lock requestedY=(-?\d+) childConsumedY=(-?\d+) remainingY=(-?\d+) parentPostConsumedY=(-?\d+) scrollerY=(-?\d+) sourceY=(-?\d+)/,
  );
  if (directFrame) {
    stats.directFrames += 1;
    if (activeDirectSegment == null) {
      stats.directOrphanFrames += 1;
    } else {
      const requestedY = Number(directFrame[1]);
      const childConsumedY = Number(directFrame[2]);
      const remainingY = Number(directFrame[3]);
      activeDirectSegment.requestedNetY += requestedY;
      activeDirectSegment.childNetY += childConsumedY;
      activeDirectSegment.frames += 1;
      if (requestedY !== childConsumedY + remainingY) {
        activeDirectSegment.frameBroken += 1;
        stats.directFrameBroken += 1;
      }
    }
  }

  const directEnd = line.match(
    /SOURCE_SNAP_DIRECT_END reason=([A-Za-z0-9_-]+) targetY=(-?\d+) sourceY=(-?\d+) scrollerY=(-?\d+)/,
  );
  if (directEnd) {
    if (activeDirectSegment == null) {
      stats.directOrphanEnds += 1;
    } else {
      activeDirectSegment.ended = true;
      activeDirectSegment.reason = directEnd[1];
      activeDirectSegment.endTargetY = Number(directEnd[2]);
      activeDirectSegment.sourceY = Number(directEnd[3]);
      activeDirectSegment.scrollerY = Number(directEnd[4]);
      activeDirectSegment = null;
    }
  }

  const paging = line.match(
    /SOURCE_SNAP_PATCH mode=paging-animator targetY=(-?\d+) velocityY=(-?\d+)/,
  );
  if (paging) {
    stats.pagingRequests.push({targetY: Number(paging[1]), velocityY: Number(paging[2])});
  }

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

let pathPass = false;
let targetPass = false;
let nonTouchFramesPass = false;
let prePolicyPass = true;
let targetSummary = '';

if (expected === 'direct' || expected === 'direct-chrome') {
  const clean = stats.directSegments.filter(item => item.started && item.ended);
  const requestMismatches = clean.filter(
    item => item.requestTargetY == null || item.requestTargetY !== item.targetY,
  );
  const deltaMismatches = clean.filter(
    item => item.requestedNetY !== item.targetY - item.baselineY,
  );
  const finalMismatches = clean.filter(
    item =>
      item.endTargetY !== item.targetY ||
      item.sourceY !== item.targetY ||
      item.scrollerY !== item.targetY,
  );
  const unfinished = stats.directSegments.filter(item => !item.ended).length;

  // V6 deliberately bypasses pre-consumption for a target-locked direct snap. Any NON_TOUCH pre
  // callback here means the snap has fallen back into the path that can shorten RN's absolute
  // target and trigger a later corrective snap.
  prePolicyPass = stats.pres.NON_TOUCH === 0;
  nonTouchFramesPass = stats.directFrames > 0 && stats.posts.NON_TOUCH > 0;

  pathPass =
    stats.directRequests.length > 0 &&
    stats.directSegments.length === stats.directRequests.length &&
    clean.length === stats.directSegments.length &&
    stats.directSegments.every(item => item.started) &&
    requestMismatches.length === 0 &&
    stats.directFrameBroken === 0 &&
    stats.directOrphanFrames === 0 &&
    stats.directOrphanEnds === 0 &&
    stats.directOverlappingStarts === 0 &&
    unfinished === 0 &&
    nonTouchBalance &&
    prePolicyPass;

  targetPass = pathPass && deltaMismatches.length === 0 && finalMismatches.length === 0;
  targetSummary =
    `target-lock delta matches ${clean.length - deltaMismatches.length}/${clean.length}; ` +
    `final matches ${clean.length - finalMismatches.length}/${clean.length}; ` +
    `requests ${stats.directRequests.length}; starts ${stats.directSegments.length}` +
    (deltaMismatches.length || finalMismatches.length
      ? `; deltaMismatch=${deltaMismatches.length} finalMismatch=${finalMismatches.length}`
      : '');
} else {
  const endedNormally = stats.animatorEnds.filter(item => item.reason === 'end');
  const exact = endedNormally.filter(item => item.targetY === item.actualY);
  nonTouchFramesPass = stats.pres.NON_TOUCH > 0 && stats.posts.NON_TOUCH > 0;
  pathPass =
    stats.pagingRequests.length > 0 &&
    stats.animatorStarts.length > 0 &&
    stats.animatorStarts.every(item => item.started) &&
    stats.animatorEnds.length === stats.animatorStarts.length &&
    nonTouchBalance;
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
console.log(`  direct-scroller requests    ${stats.directRequests.length}`);
console.log(`  target-lock segments        ${stats.directSegments.length}`);
console.log(`  target-lock frames          ${stats.directFrames}`);
console.log(`  broken source frames        ${stats.directFrameBroken}`);
console.log(`  orphan frames / ends        ${stats.directOrphanFrames} / ${stats.directOrphanEnds}`);
console.log(`  overlapping starts          ${stats.directOverlappingStarts}`);
console.log(`  paging-animator requests    ${stats.pagingRequests.length}`);
console.log(`  animator starts / ends      ${stats.animatorStarts.length} / ${stats.animatorEnds.length}`);
console.log(`  ${targetSummary}`);
console.log('');
console.log(`bootstrap                    ${bootstrapPass ? 'PASS' : 'FAIL'}`);
console.log(`source class                 ${sourcePass ? 'PASS' : 'FAIL'}`);
console.log(`NON_TOUCH session balance    ${nonTouchBalance ? 'PASS' : 'FAIL'}`);
console.log(`NON_TOUCH frame dispatch     ${nonTouchFramesPass ? 'PASS' : 'FAIL'}`);
if (expected !== 'paging') {
  console.log(`target-lock pre bypass       ${prePolicyPass ? 'PASS' : 'FAIL'}`);
}
const pathLabel =
  expected === 'paging'
    ? 'paging animator path'
    : expected === 'direct-chrome'
      ? 'direct chrome path'
      : 'direct snap path';
console.log(`${pathLabel.padEnd(29)}${pathPass ? 'PASS' : 'FAIL'}`);
console.log(`snap target accounting       ${targetPass ? 'PASS' : 'FAIL'}`);

process.exitCode =
  bootstrapPass &&
  sourcePass &&
  nonTouchBalance &&
  nonTouchFramesPass &&
  pathPass &&
  targetPass
    ? 0
    : 1;
