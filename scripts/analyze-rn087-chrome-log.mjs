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
const ledgerFrames = count(/CHROME_LEDGER type=/);
const ledgerBroken = count(/CHROME_LEDGER type=.*balanced=false/);
const ledgerOrphans = count(/CHROME_LEDGER_ORPHAN/);
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

const gates = [
  ['bootstrap', bootstrapTrue],
  ['source class', nestedClassLines > 0],
  ['source patch runtime', sourcePatchFlings > 0],
  ['TOUCH session balance', touchStarts > 0 && touchStarts === touchStops],
  ['NON_TOUCH session balance', nonTouchStarts > 0 && nonTouchStarts === nonTouchStops],
  ['scroll-away geometry', scrollAwaySuccess > 0],
  ['TOUCH chrome movement', touchChromeMovement > 0],
  ['NON_TOUCH chrome movement', nonTouchChromeMovement > 0],
  ['ledger conservation', ledgerFrames > 0 && ledgerBroken === 0 && ledgerOrphans === 0],
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
console.log(`  frames                      ${ledgerFrames}`);
console.log(`  broken                      ${ledgerBroken}`);
console.log(`  orphan pre                  ${ledgerOrphans}`);
console.log('');

let failed = false;
for (const [name, passed] of gates) {
  if (!passed) failed = true;
  console.log(`${name.padEnd(28)} ${passed ? 'PASS' : 'FAIL'}`);
}

if (failed) process.exitCode = 1;
