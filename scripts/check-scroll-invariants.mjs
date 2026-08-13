#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const hostPath =
  'android/src/main/java/expo/modules/materialtoolbar/ExpoNestedScrollHostView.kt';
const composeHostPath =
  'android/src/main/java/expo/modules/materialtoolbar/ComposeChromeHostView.kt';
const topBarConsumerPath =
  'android/src/main/java/expo/modules/materialtoolbar/TopAppBarScrollConsumer.kt';
const sharedLifecyclePath =
  'android-shared/src/main/java/com/material3scroll/transport/SourceScopedNestedScrollLifecycle.kt';
const bareHostPath =
  'rn087-bare-probe/android/app/src/main/java/com/rn087nestedscrollprobe/NestedScrollProbeLayout.kt';
const files = [
  hostPath,
  sharedLifecyclePath,
  topBarConsumerPath,
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
    violations.push(`${relativePath}: missing production/shared transport file`);
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

const sharedLifecycleAbsolutePath = path.join(root, sharedLifecyclePath);
if (fs.existsSync(sharedLifecycleAbsolutePath)) {
  const lifecycle = stripComments(fs.readFileSync(sharedLifecycleAbsolutePath, 'utf8'));
  if (!lifecycle.includes('class SourceScopedNestedScrollLifecycle')) {
    violations.push(`${sharedLifecyclePath}: missing shared source-scoped lifecycle kernel`);
  }
  if (!lifecycle.includes('var activeSource: ViewGroup?')) {
    violations.push(`${sharedLifecyclePath}: missing active source ownership`);
  }
  if (!lifecycle.includes('var momentumSource: ViewGroup?')) {
    violations.push(`${sharedLifecyclePath}: missing source-scoped momentum ownership`);
  }
  if (!lifecycle.includes('StopDecision.Stale')) {
    violations.push(`${sharedLifecyclePath}: stale stop must fail closed`);
  }
}

const expoGradlePath = path.join(root, 'android/build.gradle');
const bareGradlePath = path.join(root, 'rn087-bare-probe/android/app/build.gradle');
for (const [label, gradlePath] of [
  ['Expo module', expoGradlePath],
  ['bare RN 0.87 host', bareGradlePath],
]) {
  if (!fs.existsSync(gradlePath)) {
    violations.push(`${label}: missing Gradle build file`);
    continue;
  }
  const gradle = fs.readFileSync(gradlePath, 'utf8');
  if (!gradle.includes('android-shared/src/main/java')) {
    violations.push(`${label}: shared Android transport source set is not compiled`);
  }
}

const bareHostAbsolutePath = path.join(root, bareHostPath);
if (!fs.existsSync(bareHostAbsolutePath)) {
  violations.push(`${bareHostPath}: missing bare RN 0.87 transport host`);
} else {
  const bareHost = stripComments(fs.readFileSync(bareHostAbsolutePath, 'utf8'));
  if (!bareHost.includes('SourceScopedNestedScrollLifecycle')) {
    violations.push(`${bareHostPath}: bare RN 0.87 host is not using the shared lifecycle kernel`);
  }
  if (bareHost.includes('private var momentumSource:')) {
    violations.push(`${bareHostPath}: bare host must not duplicate shared momentum ownership`);
  }
  if (bareHost.includes('private var activeSource:')) {
    violations.push(`${bareHostPath}: bare host must not duplicate shared active-source ownership`);
  }
}

const hostAbsolutePath = path.join(root, hostPath);
if (fs.existsSync(hostAbsolutePath)) {
  const host = stripComments(fs.readFileSync(hostAbsolutePath, 'utf8'));

  if (host.includes('momentumSessionActive')) {
    violations.push(`${hostPath}: momentum lifecycle must not be host-global`);
  }
  if (!host.includes('SourceScopedNestedScrollLifecycle')) {
    violations.push(`${hostPath}: production host is not using the shared lifecycle kernel`);
  }
  if (!host.includes('private val sourceLifecycle = SourceScopedNestedScrollLifecycle()')) {
    violations.push(`${hostPath}: production host must delegate lifecycle ownership to shared kernel`);
  }
  if (host.includes('private var momentumSource:')) {
    violations.push(`${hostPath}: production host must not duplicate shared momentum ownership`);
  }
  if (host.includes('private var activeSource:')) {
    violations.push(`${hostPath}: production host must not duplicate shared active-source ownership`);
  }
  if (!host.includes('TX_ABORT reason=source-replaced')) {
    violations.push(`${hostPath}: missing source replacement abort path`);
  }
  if (!host.includes('TX_STALE_PRE') || !host.includes('TX_STALE_POST')) {
    violations.push(`${hostPath}: stale PRE/POST callbacks must fail closed`);
  }

  const assertStopOrder = ({label, signature, helperCall}) => {
    const stopStart = host.indexOf(signature);
    const stopEnd = host.indexOf('override fun onNestedPreScroll(', stopStart);
    const stop = stopStart >= 0 && stopEnd > stopStart ? host.slice(stopStart, stopEnd) : '';
    const classify = stop.indexOf('sourceLifecycle.stop(');
    const staleGuard = stop.indexOf('StopDecision.Stale');
    const helper = stop.indexOf(helperCall);
    if (
      classify < 0 ||
      staleGuard < 0 ||
      helper < 0 ||
      classify > staleGuard ||
      staleGuard > helper
    ) {
      violations.push(
        `${hostPath}: ${label} stale STOP must be classified and rejected before NestedScrollingParentHelper`,
      );
    }
  };

  assertStopOrder({
    label: 'typed',
    signature: 'override fun onStopNestedScroll(target: View, type: Int)',
    helperCall: 'nestedParentHelper.onStopNestedScroll(target, type)',
  });
  assertStopOrder({
    label: 'platform',
    signature: 'override fun onStopNestedScroll(target: View)',
    helperCall: 'nestedParentHelper.onStopNestedScroll(target)',
  });
}

const composeHostAbsolutePath = path.join(root, composeHostPath);
if (!fs.existsSync(composeHostAbsolutePath)) {
  violations.push(`${composeHostPath}: missing Compose/Fabric chrome host`);
} else {
  const composeHost = stripComments(fs.readFileSync(composeHostAbsolutePath, 'utf8'));
  if (!composeHost.includes('onMeasureComposeChild(hostWidth, hostHeight)')) {
    violations.push(`${composeHostPath}: Fabric retry must directly measure the Compose child`);
  }
  if (!composeHost.includes('onLayout(')) {
    violations.push(`${composeHostPath}: Fabric retry must directly lay out the Compose child`);
  }
}

const topBarConsumerAbsolutePath = path.join(root, topBarConsumerPath);
if (!fs.existsSync(topBarConsumerAbsolutePath)) {
  violations.push(`${topBarConsumerPath}: missing TopAppBar consumer`);
} else {
  const topBar = stripComments(fs.readFileSync(topBarConsumerAbsolutePath, 'utf8'));
  if (!topBar.includes('hasResolvedHeightOffsetLimit')) {
    violations.push(`${topBarConsumerPath}: unresolved Material heightOffsetLimit is not guarded`);
  }
  if (!topBar.includes('limit > -Float.MAX_VALUE')) {
    violations.push(`${topBarConsumerPath}: Material -Float.MAX_VALUE sentinel must fail closed`);
  }
  if (!topBar.includes('private var transactionActive = false')) {
    violations.push(`${topBarConsumerPath}: TopAppBar readiness must be fixed for the whole transaction`);
  }
  if (!topBar.includes('TX_TOP_BEGIN rejected=geometry-unresolved')) {
    violations.push(`${topBarConsumerPath}: missing unresolved-geometry diagnostic`);
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
console.log('  shared Android lifecycle kernel compiled by Expo and bare RN hosts');
console.log('  bare RN 0.87 host uses shared source-scoped lifecycle ownership');
console.log('  production host uses shared source-scoped lifecycle ownership');
console.log('  stale nested callbacks fail closed before parent helper mutation');
console.log('  Compose chrome child remeasured directly from Fabric-owned bounds');
console.log('  unresolved Material TopAppBar geometry fails closed');
