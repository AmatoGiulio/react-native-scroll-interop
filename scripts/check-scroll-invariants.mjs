#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const hostPath =
  'android/src/main/java/expo/modules/materialtoolbar/ExpoNestedScrollHostView.kt';
const files = [
  hostPath,
  'android/src/main/java/expo/modules/materialtoolbar/TopAppBarScrollConsumer.kt',
  'android/src/main/java/expo/modules/materialtoolbar/FloatingToolbarScrollConsumer.kt',
  'android/src/main/java/expo/modules/materialtoolbar/NativeNestedScrollInterop.kt',
];

const sourceAdapter =
  'android/src/main/java/expo/modules/materialtoolbar/ReactVerticalScrollSourceInterop.kt';

const forbidden = [
  {name: 'parent-owned OverScroller', pattern: /\bOverScroller\s*\(/},
  {name: 'parent-owned Scroller', pattern: /\bScroller\s*\(/},
  {name: 'child scrollBy mutation', pattern: /\.scrollBy\s*\(/},
  {name: 'child scrollTo mutation', pattern: /\.scrollTo\s*\(/},
  {name: 'parent-started nested session', pattern: /ViewCompat\.startNestedScroll\s*\(/},
  {name: 'timer-based scroll reconstruction', pattern: /\b(postDelayed|Timer|scheduleAtFixedRate)\b/},
];

const concreteRnSourceType = /\b(ReactScrollView|ReactNestedScrollView)\b/;

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map(line => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

const violations = [];

for (const relativePath of files) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    violations.push(`${relativePath}: missing production transport file`);
    continue;
  }

  const source = stripComments(fs.readFileSync(absolutePath, 'utf8'));
  const lines = source.split(/\r?\n/);

  for (const rule of forbidden) {
    lines.forEach((line, index) => {
      if (rule.pattern.test(line)) {
        violations.push(`${relativePath}:${index + 1}: ${rule.name}: ${line.trim()}`);
      }
    });
  }

  lines.forEach((line, index) => {
    if (concreteRnSourceType.test(line)) {
      violations.push(
        `${relativePath}:${index + 1}: concrete RN scroll source type escaped ${sourceAdapter}: ${line.trim()}`,
      );
    }
  });
}

const adapterPath = path.join(root, sourceAdapter);
if (!fs.existsSync(adapterPath)) {
  violations.push(`${sourceAdapter}: missing RN vertical source compatibility boundary`);
} else {
  const adapter = stripComments(fs.readFileSync(adapterPath, 'utf8'));
  if (!adapter.includes('ReactVerticalScrollSourceCapabilities')) {
    violations.push(`${sourceAdapter}: missing explicit source capability model`);
  }
  if (!adapter.includes('ReactScrollView') || !adapter.includes('ReactNestedScrollView')) {
    violations.push(`${sourceAdapter}: must recognize both supported RN vertical source implementations`);
  }
}

const hostAbsolutePath = path.join(root, hostPath);
if (fs.existsSync(hostAbsolutePath)) {
  const host = stripComments(fs.readFileSync(hostAbsolutePath, 'utf8'));

  if (host.includes('momentumSessionActive')) {
    violations.push(`${hostPath}: momentum lifecycle must not be host-global`);
  }
  if (!host.includes('private var momentumSource: ViewGroup? = null')) {
    violations.push(`${hostPath}: missing source-scoped momentum owner`);
  }
  if (!host.includes('TX_ABORT reason=source-replaced')) {
    violations.push(`${hostPath}: missing source replacement abort path`);
  }
  if (!host.includes('TX_STALE_PRE') || !host.includes('TX_STALE_POST')) {
    violations.push(`${hostPath}: stale PRE/POST callbacks must fail closed`);
  }

  const typedStopStart = host.indexOf(
    'override fun onStopNestedScroll(target: View, type: Int)',
  );
  const typedStopEnd = host.indexOf('override fun onNestedPreScroll(', typedStopStart);
  const typedStop =
    typedStopStart >= 0 && typedStopEnd > typedStopStart
      ? host.slice(typedStopStart, typedStopEnd)
      : '';
  const typedGuard = typedStop.indexOf('if (!activeTarget)');
  const typedHelper = typedStop.indexOf(
    'nestedParentHelper.onStopNestedScroll(target, type)',
  );
  if (typedGuard < 0 || typedHelper < 0 || typedGuard > typedHelper) {
    violations.push(
      `${hostPath}: typed stale STOP must be rejected before NestedScrollingParentHelper`,
    );
  }

  const platformStopStart = host.indexOf('override fun onStopNestedScroll(target: View)');
  const platformStopEnd = host.indexOf('override fun onNestedPreScroll(', platformStopStart);
  const platformStop =
    platformStopStart >= 0 && platformStopEnd > platformStopStart
      ? host.slice(platformStopStart, platformStopEnd)
      : '';
  const platformGuard = platformStop.indexOf('if (!activeTarget)');
  const platformHelper = platformStop.indexOf('nestedParentHelper.onStopNestedScroll(target)');
  if (platformGuard < 0 || platformHelper < 0 || platformGuard > platformHelper) {
    violations.push(
      `${hostPath}: platform stale STOP must be rejected before NestedScrollingParentHelper`,
    );
  }
}

if (violations.length > 0) {
  console.error('Native scroll invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  console.error(
    '\nRN must remain the sole owner of scroll physics, source typing must stay behind the compatibility boundary, and nested lifecycle must stay scoped to the active source.',
  );
  process.exit(1);
}

console.log('Native scroll invariant: PASS');
console.log('  no parent-owned scroller');
console.log('  no child scrollBy/scrollTo mutation');
console.log('  no parent-started nested session');
console.log('  no timer-based scroll reconstruction');
console.log('  concrete RN scroll source types confined to compatibility adapter');
console.log('  explicit RN vertical source capability model present');
console.log('  momentum ownership scoped to active RN source');
console.log('  stale nested callbacks fail closed before parent helper mutation');
