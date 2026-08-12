#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage: node scripts/analyze-scroll-log.mjs <log-file> [options]\n\nOptions:\n  --exclude-saturated       Exclude whole gestures whose fling reaches the saturation threshold.\n                            Use this only when the test operator knows those gestures came from an\n                            emulator/trackpad artifact rather than a deliberate single-pointer fling.\n  --saturation <px/s>       Saturation threshold. Default: 20000.\n  --json                    Emit machine-readable JSON instead of the human summary.\n  -h, --help                Show this help.\n\nThe script never treats orphan pre-scroll records as transaction failures. On the legacy\nandroid.widget.ScrollView touch path a fully pre-consumed frame may legitimately have no post.\n`);
  process.exit(exitCode);
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  usage(args.length === 0 ? 1 : 0);
}

let logPath = null;
let excludeSaturated = false;
let saturation = 20000;
let json = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--exclude-saturated') {
    excludeSaturated = true;
  } else if (arg === '--json') {
    json = true;
  } else if (arg === '--saturation') {
    const next = args[++i];
    if (next == null || !Number.isFinite(Number(next)) || Number(next) <= 0) {
      console.error('Invalid --saturation value.');
      usage(1);
    }
    saturation = Number(next);
  } else if (arg.startsWith('-')) {
    console.error(`Unknown option: ${arg}`);
    usage(1);
  } else if (logPath == null) {
    logPath = arg;
  } else {
    console.error(`Unexpected argument: ${arg}`);
    usage(1);
  }
}

if (logPath == null) usage(1);
if (!fs.existsSync(logPath)) {
  console.error(`Log file not found: ${logPath}`);
  process.exit(2);
}

const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/);

const ledgerPattern = /TX_LEDGER type=(TOUCH|NON_TOUCH).*?balanced=(true|false) broken=(\d+) orphanPre=(\d+)/;
const flingPattern = /NESTED_PRE_FLING vx=([-+]?\d+(?:\.\d+)?) vy=([-+]?\d+(?:\.\d+)?)/;
const touchDownPattern = /TOUCH_DOWN pointers=(\d+)/;
const floatSettlePattern = /FLOAT_SETTLE_END .*?completed=(true|false).*?offset=([-+]?\d+(?:\.\d+)?) limit=([-+]?\d+(?:\.\d+)?) fraction=([-+]?\d+(?:\.\d+)?)/;
const topSettlePattern = /TX_TOP_SETTLE_END .*?completed=(true|false).*?heightOffset=([-+]?\d+(?:\.\d+)?) limit=([-+]?\d+(?:\.\d+)?) fraction=([-+]?\d+(?:\.\d+)?)/;

// Material3's own settleAppBar() treats collapsedFraction < 0.01 as already expanded and returns
// without running the snap. Mirror that semantic instead of inventing a stricter pixel threshold
// that would classify a valid Material terminal state as drift.
const TOP_APP_BAR_EXPANDED_FRACTION_EPSILON = 0.01;
const COLLAPSED_ENDPOINT_PX_EPSILON = 1.0;

const gestures = [];
let currentGesture = null;
let armed = 0;
let removed = 0;
let ambiguousSources = 0;
let maxPointers = 0;
let allOrphanPreMax = 0;
const allFrames = [];
const floatingSettles = [];
const topSettles = [];

function finishGesture(endLine) {
  if (currentGesture == null) return;
  currentGesture.endLine = endLine;
  gestures.push(currentGesture);
  currentGesture = null;
}

function isFloatingEndpoint(completed, offset, limit) {
  return !completed || Math.min(Math.abs(offset), Math.abs(offset - limit)) <= 1.0;
}

function isTopAppBarEndpoint(completed, offset, limit, fraction) {
  if (!completed) return true;
  if (fraction < TOP_APP_BAR_EXPANDED_FRACTION_EPSILON) return true;
  return Math.abs(offset - limit) <= COLLAPSED_ENDPOINT_PX_EPSILON;
}

for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];

  if (line.includes('SOURCE_WAIT layout-listener=armed')) armed += 1;
  if (line.includes('SOURCE_WAIT layout-listener=removed')) removed += 1;
  if (line.includes('ambiguousReactSources')) ambiguousSources += 1;

  const touchDown = line.match(touchDownPattern);
  if (touchDown) {
    finishGesture(index - 1);
    maxPointers = Math.max(maxPointers, Number(touchDown[1]));
    currentGesture = {
      startLine: index + 1,
      endLine: null,
      maxPointers: Number(touchDown[1]),
      flingVelocitiesY: [],
      saturated: false,
      frames: [],
    };
  }

  const fling = line.match(flingPattern);
  if (fling && currentGesture != null) {
    const vy = Number(fling[2]);
    currentGesture.flingVelocitiesY.push(vy);
    if (Math.abs(vy) >= saturation) currentGesture.saturated = true;
  }

  const ledger = line.match(ledgerPattern);
  if (ledger) {
    const frame = {
      line: index + 1,
      type: ledger[1],
      balanced: ledger[2] === 'true',
      broken: Number(ledger[3]),
      orphanPre: Number(ledger[4]),
    };
    allFrames.push(frame);
    allOrphanPreMax = Math.max(allOrphanPreMax, frame.orphanPre);
    if (currentGesture != null) currentGesture.frames.push(frame);
  }

  const floatSettle = line.match(floatSettlePattern);
  if (floatSettle) {
    const completed = floatSettle[1] === 'true';
    const offset = Number(floatSettle[2]);
    const limit = Number(floatSettle[3]);
    const fraction = Number(floatSettle[4]);
    const endpoint = isFloatingEndpoint(completed, offset, limit);
    floatingSettles.push({ line: index + 1, completed, offset, limit, fraction, endpoint });
  }

  const topSettle = line.match(topSettlePattern);
  if (topSettle) {
    const completed = topSettle[1] === 'true';
    const offset = Number(topSettle[2]);
    const limit = Number(topSettle[3]);
    const fraction = Number(topSettle[4]);
    const endpoint = isTopAppBarEndpoint(completed, offset, limit, fraction);
    topSettles.push({ line: index + 1, completed, offset, limit, fraction, endpoint });
  }
}
finishGesture(lines.length);

const saturatedGestures = gestures.filter((gesture) => gesture.saturated);
const saturatedFrames = saturatedGestures.flatMap((gesture) => gesture.frames);
const representativeGestures = excludeSaturated
  ? gestures.filter((gesture) => !gesture.saturated)
  : gestures;
const selectedFrames = excludeSaturated
  ? representativeGestures.flatMap((gesture) => gesture.frames)
  : allFrames;

function frameStats(frames) {
  return {
    total: frames.length,
    touch: frames.filter((frame) => frame.type === 'TOUCH').length,
    nonTouch: frames.filter((frame) => frame.type === 'NON_TOUCH').length,
    unbalanced: frames.filter((frame) => !frame.balanced).length,
    brokenRecords: frames.filter((frame) => frame.broken > 0).length,
    maxBrokenCounter: frames.reduce((max, frame) => Math.max(max, frame.broken), 0),
  };
}

const allStats = frameStats(allFrames);
const saturatedStats = frameStats(saturatedFrames);
const representativeOnlyStats = frameStats(
  gestures.filter((gesture) => !gesture.saturated).flatMap((gesture) => gesture.frames),
);
const selectedStats = frameStats(selectedFrames);
const completedFloatingSettles = floatingSettles.filter((settle) => settle.completed);
const completedTopSettles = topSettles.filter((settle) => settle.completed);
const nonEndpointFloatingSettles = completedFloatingSettles.filter((settle) => !settle.endpoint);
const nonEndpointTopSettles = completedTopSettles.filter((settle) => !settle.endpoint);

const representativeVelocities = gestures
  .filter((gesture) => !gesture.saturated)
  .flatMap((gesture) => gesture.flingVelocitiesY)
  .map(Math.abs);

const result = {
  file: path.resolve(logPath),
  saturationThreshold: saturation,
  exclusionApplied: excludeSaturated,
  gestures: {
    total: gestures.length,
    saturatedCandidates: saturatedGestures.length,
    representative: gestures.length - saturatedGestures.length,
    maxPointersSeen: maxPointers,
    maxRepresentativeAbsFlingVelocity:
      representativeVelocities.length > 0 ? Math.max(...representativeVelocities) : 0,
  },
  ledger: {
    all: allStats,
    saturatedCandidates: saturatedStats,
    representativeOnly: representativeOnlyStats,
    selected: selectedStats,
    maxOrphanPreCounter: allOrphanPreMax,
  },
  sourcePreparation: {
    waitArmed: armed,
    waitRemoved: removed,
    listenerBalance: armed - removed,
    ambiguousSources,
  },
  settles: {
    floating: {
      total: floatingSettles.length,
      completed: completedFloatingSettles.length,
      canceled: floatingSettles.length - completedFloatingSettles.length,
      nonEndpoint: nonEndpointFloatingSettles.length,
      nonEndpointLines: nonEndpointFloatingSettles.map((settle) => settle.line),
    },
    topAppBar: {
      total: topSettles.length,
      completed: completedTopSettles.length,
      canceled: topSettles.length - completedTopSettles.length,
      nonEndpoint: nonEndpointTopSettles.length,
      nonEndpointLines: nonEndpointTopSettles.map((settle) => settle.line),
    },
  },
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Scroll transaction report: ${result.file}`);
  console.log('');
  console.log('Gestures');
  console.log(`  total                     ${result.gestures.total}`);
  console.log(`  saturated candidates      ${result.gestures.saturatedCandidates}  (|vy| >= ${saturation} px/s)`);
  console.log(`  representative candidates ${result.gestures.representative}`);
  console.log(`  max pointers seen          ${result.gestures.maxPointersSeen}`);
  console.log(`  max representative |vy|   ${result.gestures.maxRepresentativeAbsFlingVelocity} px/s`);
  console.log('');
  console.log('Ledger');
  console.log(`  all frames                 ${allStats.total}`);
  console.log(`    touch / non-touch        ${allStats.touch} / ${allStats.nonTouch}`);
  console.log(`    unbalanced               ${allStats.unbalanced}`);
  console.log(`    max broken counter       ${allStats.maxBrokenCounter}`);
  console.log(`  saturated-candidate frames ${saturatedStats.total}`);
  console.log(`  representative-only frames ${representativeOnlyStats.total}`);
  if (excludeSaturated) {
    console.log(`  SELECTED frames            ${selectedStats.total}`);
    console.log(`    touch / non-touch        ${selectedStats.touch} / ${selectedStats.nonTouch}`);
    console.log(`    unbalanced               ${selectedStats.unbalanced}`);
    console.log(`    max broken counter       ${selectedStats.maxBrokenCounter}`);
  }
  console.log(`  max orphanPre counter      ${allOrphanPreMax}  (diagnostic, not a failure)`);
  console.log('');
  console.log('Source preparation');
  console.log(`  SOURCE_WAIT armed/removed  ${armed} / ${removed}`);
  console.log(`  listener balance           ${armed - removed}`);
  console.log(`  ambiguous React sources    ${ambiguousSources}`);
  console.log('');
  console.log('Material settles');
  console.log(
    `  FloatingToolbar            ${floatingSettles.length} total, ${completedFloatingSettles.length} completed, ${floatingSettles.length - completedFloatingSettles.length} canceled, ${nonEndpointFloatingSettles.length} completed non-endpoint`,
  );
  console.log(
    `  TopAppBar                  ${topSettles.length} total, ${completedTopSettles.length} completed, ${topSettles.length - completedTopSettles.length} canceled, ${nonEndpointTopSettles.length} completed non-endpoint`,
  );
  console.log('');
  if (saturatedGestures.length > 0) {
    console.log('Note: "saturated candidate" is classification, not proof of an invalid gesture.');
    console.log('Use --exclude-saturated only when the operator knows those inputs were trackpad/emulator artifacts.');
    console.log('');
  }
  const ledgerPass = selectedStats.unbalanced === 0 && selectedStats.maxBrokenCounter === 0;
  const sourcePass = ambiguousSources === 0 && armed - removed === 0;
  console.log(`Ledger gate:             ${ledgerPass ? 'PASS' : 'FAIL'}`);
  console.log(`Source-preparation gate: ${sourcePass ? 'PASS' : 'FAIL'}`);
  console.log(`Floating settle check:   ${nonEndpointFloatingSettles.length === 0 ? 'PASS' : 'WARN'}`);
  console.log(`TopAppBar settle check:  ${nonEndpointTopSettles.length === 0 ? 'PASS' : 'WARN'}`);
}

const selectedLedgerFailed = selectedStats.unbalanced > 0 || selectedStats.maxBrokenCounter > 0;
const sourceFailed = ambiguousSources > 0 || armed - removed !== 0;
process.exitCode = selectedLedgerFailed || sourceFailed ? 1 : 0;
