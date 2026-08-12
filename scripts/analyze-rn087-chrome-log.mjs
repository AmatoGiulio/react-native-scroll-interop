#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';

const logPath = process.argv[2];
if (!logPath) {
  console.error('Usage: node scripts/analyze-rn087-chrome-log.mjs <log-path>');
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
const scrollAwaySuccess = count(/CHROME_SCROLL_AWAY .*target=[1-9][0-9]* success=true/);
const settleStarts = count(/CHROME_SETTLE_START/);
const settleEnds = count(/CHROME_SETTLE_END/);

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

const touchChromeMovement = movementFrames('TOUCH');
const nonTouchChromeMovement = movementFrames('NON_TOUCH');

// A pre-only frame is complete when the parent consumed the whole requested delta. AndroidX
// NestedScrollView's touch path still calls dispatchNestedScroll after pre-scroll, but at that point
// all child/post deltas are zero; NestedScrollingChildHelper deliberately suppresses the parent
// callback for an all-zero dispatch ("No motion, no dispatch"). The fling path can also finish at
// pre-scroll when nothing remains. Therefore both TOUCH and NON_TOUCH full-pre frames are valid.
// Any pre-only frame with partial consumption remains an error.
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
  ['source patch runtime', sourcePatchFlings > 0],
  ['TOUCH session balance', touchStarts > 0 && touchStarts === touchStops],
  ['NON_TOUCH session balance', nonTouchStarts > 0 && nonTouchStarts === nonTouchStops],
  ['scroll-away geometry', scrollAwaySuccess > 0],
  ['TOUCH chrome movement', touchChromeMovement > 0],
  ['NON_TOUCH chrome movement', nonTouchChromeMovement > 0],
  ['ledger conservation', ledgerConserved],
  ['Material settle', settleStarts > 0 && settleEnds > 0],
];

console.log(`RN 0.87 chrome report: ${logPath}\n`);
console.log('Source');
console.log(`  bootstrap true              ${bootstrapTrue}`);
console.log(`  ReactNestedScrollView lines ${nestedClassLines}`);
console.log(`  source patch flings         ${sourcePatchFlings}`);
console.log('');
console.log('Nested sessions');
console.log(`  starts TOUCH / NON_TOUCH    ${touchStarts} / ${nonTouchStarts}`);
console.log(`  stops  TOUCH / NON_TOUCH    ${touchStops} / ${nonTouchStops}`);
console.log('');
console.log('Material3 chrome');
console.log(`  scroll-away success         ${scrollAwaySuccess}`);
console.log(`  movement TOUCH / NON_TOUCH  ${touchChromeMovement} / ${nonTouchChromeMovement}`);
console.log(`  settle start / end          ${settleStarts} / ${settleEnds}`);
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
console.log('');

let failed = false;
for (const [name, passed] of gates) {
  if (!passed) failed = true;
  console.log(`${name.padEnd(28)} ${passed ? 'PASS' : 'FAIL'}`);
}

if (failed) process.exitCode = 1;
