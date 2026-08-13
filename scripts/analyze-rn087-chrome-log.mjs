#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';

const logPath = process.argv[2];
const expectFloating = process.argv.includes('--expect-floating');
const expectSnap = process.argv.includes('--expect-snap');
const expectPaging = process.argv.includes('--expect-paging');
if (!logPath || (expectSnap && expectPaging)) {
  console.error(
    'Usage: node scripts/analyze-rn087-chrome-log.mjs <log-path> [--expect-floating] [--expect-snap|--expect-paging]',
  );
  process.exit(2);
}
if (!fs.existsSync(logPath)) {
  console.error(`RN 0.87 chrome report: missing log ${logPath}`);
  process.exit(2);
}

const text = fs.readFileSync(logPath, 'utf8');
const lines = text.split(/\r?\n/);
const count = pattern => lines.filter(line => pattern.test(line)).length;

const bootstrapTrue = count(/Rn087NestedScroll.*enabled=true/) > 0;
const nestedClassLines = count(/com\.facebook\.react\.views\.scroll\.ReactNestedScrollView/);
const touchStarts = count(/NESTED_START .*type=TOUCH/);
const nonTouchStarts = count(/NESTED_START .*type=NON_TOUCH/);
const touchStops = count(/NESTED_STOP .*type=TOUCH/);
const nonTouchStops = count(/NESTED_STOP .*type=NON_TOUCH/);
const sourcePatchFlings = count(/SOURCE_FLING_PATCH/);
const sourcePatchSnapStarts = count(/SOURCE_SNAP_DIRECT_START mode=post-only-target-lock/);
const sourcePatchPagingStarts = count(/SOURCE_SNAP_ANIMATOR_START/);
const sourcePatchRuntime = expectSnap
  ? sourcePatchSnapStarts > 0
  : expectPaging
    ? sourcePatchPagingStarts > 0
    : sourcePatchFlings > 0;
const scrollAwaySuccess = count(/CHROME_SCROLL_AWAY .*target=[1-9][0-9]* success=true/);
const settleStarts = count(/CHROME_SETTLE_START/);
const settleEnds = count(/CHROME_SETTLE_END/);

const settleByGen = new Map();
for (const line of lines) {
  const start = line.match(/CHROME_SETTLE_START gen=(\d+) reason=([^ ]+)/);
  if (start) {
    settleByGen.set(Number(start[1]), {
      gen: Number(start[1]),
      reason: start[2],
      completed: null,
    });
    continue;
  }

  const end = line.match(/CHROME_SETTLE_END gen=(\d+) completed=(true|false)/);
  if (end) {
    const gen = Number(end[1]);
    const entry = settleByGen.get(gen) ?? {gen, reason: 'unknown', completed: null};
    entry.completed = end[2] === 'true';
    settleByGen.set(gen, entry);
  }
}

const settleReasonCounts = new Map();
let settleCompleted = 0;
let settleCancelled = 0;
let settleMissingEnd = 0;
let touchStopCancelled = 0;
let momentumStopCancelled = 0;
for (const entry of settleByGen.values()) {
  settleReasonCounts.set(entry.reason, (settleReasonCounts.get(entry.reason) ?? 0) + 1);
  if (entry.completed === true) settleCompleted += 1;
  else if (entry.completed === false) {
    settleCancelled += 1;
    if (entry.reason === 'touch-stop') touchStopCancelled += 1;
    if (entry.reason === 'momentum-stop') momentumStopCancelled += 1;
  } else settleMissingEnd += 1;
}

function movementFrames(type) {
  let frames = 0;
  for (const line of lines) {
    if (!line.includes(`type=${type}`)) continue;
    if (!line.includes('CHROME_PRE') && !line.includes('CHROME_POST')) continue;
    const match = line.match(/movement=(-?\d+)/);
    if (match && Number.parseInt(match[1], 10) !== 0) frames += 1;
  }
  return frames;
}

function childMovementPostFrames(type) {
  let frames = 0;
  for (const line of lines) {
    if (!line.includes(`NESTED_POST type=${type}`)) continue;
    const match = line.match(/childConsumedY=(-?\d+)/);
    if (match && Number.parseInt(match[1], 10) !== 0) frames += 1;
  }
  return frames;
}

function floatingPostStats(type) {
  let posts = 0;
  let movement = 0;
  for (const line of lines) {
    if (!line.includes(`FLOAT_POST type=${type}`)) continue;
    posts += 1;
    const match = line.match(/movement=(-?\d+)/);
    if (match && Number.parseInt(match[1], 10) !== 0) movement += 1;
  }
  return {posts, movement};
}

const touchChromeMovement = movementFrames('TOUCH');
const nonTouchChromeMovement = movementFrames('NON_TOUCH');
const childTouchPostMovement = childMovementPostFrames('TOUCH');
const childNonTouchPostMovement = childMovementPostFrames('NON_TOUCH');
const floatingTouch = floatingPostStats('TOUCH');
const floatingNonTouch = floatingPostStats('NON_TOUCH');
const floatingBehaviorBinds = count(/FLOAT_BEHAVIOR bound=true/);
const floatingGeometry = count(/FLOAT_GEOMETRY .*limit=-[1-9][0-9.]*/);
const floatingSettleStarts = count(/FLOAT_SETTLE_START/);
const floatingSettleEnds = count(/FLOAT_SETTLE_END/);

// A pre-only frame is complete when the parent consumed the whole requested delta. AndroidX
// NestedScrollView's touch path still calls dispatchNestedScroll after pre-scroll, but at that point
// all child/post deltas are zero; NestedScrollingChildHelper deliberately suppresses the parent
// callback for an all-zero dispatch ("No motion, no dispatch"). The fling path can also finish at
// pre-scroll when nothing remains. Therefore both TOUCH and NON_TOUCH full-pre frames are valid.
//
// V6 target-locked snap is deliberately post-only. NestedScrollProbeLayout synthesizes a ledger
// pre-record with chromePre=0 from childConsumed+unconsumed before recording that post callback, so
// the exact same conservation equation remains valid for both transaction shapes.
let pendingPre = null;
let ledgerPostFrames = 0;
let ledgerBroken = 0;
let fullPreTouchFrames = 0;
let fullPreNonTouchFrames = 0;
let unexpectedOrphans = 0;
let partialTouchOrphans = 0;
let partialNonTouchOrphans = 0;
let unknownOrphans = 0;
const unexpectedExamples = [];

for (const line of lines) {
  const pre = line.match(
    /CHROME_LEDGER_PRE type=(TOUCH|NON_TOUCH) requested=(-?\d+) chromePre=(-?\d+)/,
  );
  if (pre) {
    pendingPre = {
      type: pre[1],
      requested: Number.parseInt(pre[2], 10),
      chromePre: Number.parseInt(pre[3], 10),
      line,
    };
    continue;
  }

  if (/CHROME_LEDGER type=/.test(line)) {
    ledgerPostFrames += 1;
    if (/balanced=false/.test(line)) ledgerBroken += 1;
    pendingPre = null;
    continue;
  }

  if (!/CHROME_LEDGER_ORPHAN/.test(line)) continue;

  const values = line.match(/requested=(-?\d+) chromePre=(-?\d+)/);
  const requested = values ? Number.parseInt(values[1], 10) : pendingPre?.requested;
  const chromePre = values ? Number.parseInt(values[2], 10) : pendingPre?.chromePre;
  const type = pendingPre?.type ?? 'UNKNOWN';
  const fullPreConsumed = requested != null && chromePre != null && requested === chromePre;

  if (fullPreConsumed && type === 'TOUCH') {
    fullPreTouchFrames += 1;
  } else if (fullPreConsumed && type === 'NON_TOUCH') {
    fullPreNonTouchFrames += 1;
  } else {
    unexpectedOrphans += 1;
    if (type === 'TOUCH') partialTouchOrphans += 1;
    else if (type === 'NON_TOUCH') partialNonTouchOrphans += 1;
    else unknownOrphans += 1;

    if (unexpectedExamples.length < 5) {
      unexpectedExamples.push(
        `type=${type} requested=${requested ?? '?'} chromePre=${chromePre ?? '?'} ${line.trim()}`,
      );
    }
  }
  pendingPre = null;
}

const fullPreFrames = fullPreTouchFrames + fullPreNonTouchFrames;
const ledgerCompleteFrames = ledgerPostFrames + fullPreFrames;
const ledgerConserved =
  ledgerCompleteFrames > 0 && ledgerBroken === 0 && unexpectedOrphans === 0;

const gates = [
  ['bootstrap', bootstrapTrue],
  ['source class', nestedClassLines > 0],
  ['source patch runtime', sourcePatchRuntime],
  ['TOUCH session balance', touchStarts > 0 && touchStarts === touchStops],
  ['NON_TOUCH session balance', nonTouchStarts > 0 && nonTouchStarts === nonTouchStops],
  ['scroll-away geometry', scrollAwaySuccess > 0],
  ['TOUCH chrome movement', touchChromeMovement > 0],
  expectPaging
    ? ['NON_TOUCH paging source movement', childNonTouchPostMovement > 0]
    : ['NON_TOUCH chrome movement', nonTouchChromeMovement > 0],
  ['ledger conservation', ledgerConserved],
  ['Material settle', settleStarts > 0 && settleEnds > 0],
];

if (expectFloating) {
  gates.push(
    ['floating behavior', floatingBehaviorBinds > 0],
    ['floating geometry', floatingGeometry > 0],
    [
      'floating TOUCH coverage',
      childTouchPostMovement > 0 && floatingTouch.posts === childTouchPostMovement,
    ],
    [
      'floating NON_TOUCH coverage',
      childNonTouchPostMovement > 0 && floatingNonTouch.posts === childNonTouchPostMovement,
    ],
    ['floating TOUCH movement', floatingTouch.movement > 0],
    ['floating NON_TOUCH movement', floatingNonTouch.movement > 0],
    [
      'floating settle balance',
      floatingSettleStarts > 0 && floatingSettleStarts === floatingSettleEnds,
    ],
  );
}

console.log(`RN 0.87 chrome report: ${logPath}\n`);
console.log('Source');
console.log(`  bootstrap true              ${bootstrapTrue}`);
console.log(`  ReactNestedScrollView lines ${nestedClassLines}`);
console.log(`  source patch flings         ${sourcePatchFlings}`);
console.log(`  target-lock snap starts     ${sourcePatchSnapStarts}`);
console.log(`  paging animator starts      ${sourcePatchPagingStarts}`);
console.log('');
console.log('Nested sessions');
console.log(`  starts TOUCH / NON_TOUCH    ${touchStarts} / ${nonTouchStarts}`);
console.log(`  stops  TOUCH / NON_TOUCH    ${touchStops} / ${nonTouchStops}`);
console.log('');
console.log('Material3 TopAppBar');
console.log(`  scroll-away success         ${scrollAwaySuccess}`);
console.log(`  movement TOUCH / NON_TOUCH  ${touchChromeMovement} / ${nonTouchChromeMovement}`);
if (expectPaging && nonTouchChromeMovement === 0) {
  console.log('  paging NON_TOUCH chrome     no positional change in this capture');
}
console.log(`  settle start / end          ${settleStarts} / ${settleEnds}`);
console.log(
  `  settle completed/cancelled ${settleCompleted} / ${settleCancelled}` +
    (settleMissingEnd ? ` missing=${settleMissingEnd}` : ''),
);
const reasonSummary = [...settleReasonCounts.entries()]
  .map(([reason, value]) => `${reason}=${value}`)
  .join(' ');
console.log(`  settle reasons              ${reasonSummary || 'none'}`);
console.log(
  `  cancelled touch/momentum   ${touchStopCancelled} / ${momentumStopCancelled}`,
);
console.log('');
console.log('Transaction ledger');
console.log(`  post-complete frames        ${ledgerPostFrames}`);
console.log(`  full-pre TOUCH frames       ${fullPreTouchFrames}`);
console.log(`  full-pre NON_TOUCH frames   ${fullPreNonTouchFrames}`);
console.log(`  complete frames             ${ledgerCompleteFrames}`);
console.log(`  broken complete frames      ${ledgerBroken}`);
console.log(`  unexpected orphan pre       ${unexpectedOrphans}`);
console.log(`    TOUCH partial             ${partialTouchOrphans}`);
console.log(`    NON_TOUCH partial         ${partialNonTouchOrphans}`);
console.log(`    UNKNOWN                   ${unknownOrphans}`);
if (unexpectedExamples.length > 0) {
  console.log('  first unexpected orphan examples');
  for (const example of unexpectedExamples) console.log(`    ${example}`);
}

if (expectFloating) {
  console.log('');
  console.log('Material3 FloatingToolbar');
  console.log(`  behavior binds              ${floatingBehaviorBinds}`);
  console.log(`  geometry samples            ${floatingGeometry}`);
  console.log(
    `  child movement post T/NT   ${childTouchPostMovement} / ${childNonTouchPostMovement}`,
  );
  console.log(`  observed posts T/NT         ${floatingTouch.posts} / ${floatingNonTouch.posts}`);
  console.log(
    `  visual movement T/NT       ${floatingTouch.movement} / ${floatingNonTouch.movement}`,
  );
  console.log(`  settle start / end          ${floatingSettleStarts} / ${floatingSettleEnds}`);
}
console.log('');

let failed = false;
for (const [name, passed] of gates) {
  if (!passed) failed = true;
  console.log(`${name.padEnd(30)} ${passed ? 'PASS' : 'FAIL'}`);
}

if (failed) process.exitCode = 1;
