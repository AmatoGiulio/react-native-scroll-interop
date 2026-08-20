#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const hostPath =
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollHostView.kt';
const controllerPath =
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollParentController.kt';
const participantsPath =
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollParticipants.kt';
const screenBridgePath =
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeScreenNestedScrollBridge.kt';
const composeHostPath =
  'android/src/main/java/expo/modules/materialtoolbar/ComposeChromeHostView.kt';
const topBarConsumerPath =
  'android/src/main/java/com/reactnativescroll/interop/material3/TopAppBarScrollConsumer.kt';
const floatingToolbarConsumerPath =
  'android/src/main/java/com/reactnativescroll/interop/material3/FloatingToolbarScrollConsumer.kt';
const lifecyclePath =
  'android/src/main/java/com/reactnativescroll/interop/core/SourceScopedNestedScrollLifecycle.kt';
const ledgerPath =
  'android/src/main/java/com/reactnativescroll/interop/core/NestedScrollConservationLedger.kt';
const dispatcherPath =
  'android/src/main/java/com/reactnativescroll/interop/core/VerticalNestedScrollTransactionDispatcher.kt';
const registryPath =
  'android/src/main/java/com/reactnativescroll/interop/material3/Material3NestedScrollRegistry.kt';
const sourceAdapterPath =
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactVerticalScrollSourceInterop.kt';

const files = [
  hostPath,
  controllerPath,
  participantsPath,
  screenBridgePath,
  lifecyclePath,
  ledgerPath,
  dispatcherPath,
  topBarConsumerPath,
  floatingToolbarConsumerPath,
  registryPath,
];

const obsoletePaths = [
  'android-shared',
  'android/src/main/java/expo/modules/materialtoolbar/FloatingToolbarScrollConsumer.kt',
  'android/src/main/java/expo/modules/materialtoolbar/ReactNativeNestedScrollHostView.kt',
  'android/src/main/java/expo/modules/materialtoolbar/ReactNativeNestedScrollHostManager.kt',
];

const forbidden = [
  { name: 'parent-owned OverScroller', pattern: /\bOverScroller\s*\(/ },
  { name: 'parent-owned Scroller', pattern: /\bScroller\s*\(/ },
  { name: 'child scrollBy mutation', pattern: /\.scrollBy\s*\(/ },
  { name: 'child scrollTo mutation', pattern: /\.scrollTo\s*\(/ },
  { name: 'parent-started nested session', pattern: /ViewCompat\.startNestedScroll\s*\(/ },
  { name: 'timer-based scroll reconstruction', pattern: /\b(postDelayed|Timer|scheduleAtFixedRate)\b/ },
];

const concreteRnSourceType = /\b(ReactScrollView|ReactNestedScrollView)\b/;
const violations = [];

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    violations.push(`${relativePath}: missing required file`);
    return '';
  }
  return stripComments(fs.readFileSync(absolutePath, 'utf8'));
}

for (const relativePath of obsoletePaths) {
  if (fs.existsSync(path.join(root, relativePath))) {
    violations.push(`${relativePath}: obsolete source path must be removed`);
  }
}

for (const relativePath of files) {
  const source = read(relativePath);
  if (!source) continue;
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
        `${relativePath}:${index + 1}: concrete RN scroll source type escaped ${sourceAdapterPath}: ${line.trim()}`,
      );
    }
  });
}

const adapter = read(sourceAdapterPath);
if (adapter) {
  if (!adapter.includes('ReactVerticalScrollSourceCapabilities')) {
    violations.push(`${sourceAdapterPath}: missing explicit source capability model`);
  }
  if (!adapter.includes('ReactScrollView') || !adapter.includes('ReactNestedScrollView')) {
    violations.push(`${sourceAdapterPath}: must recognize both supported RN vertical source implementations`);
  }
}

const lifecycle = read(lifecyclePath);
if (lifecycle) {
  if (!lifecycle.includes('class SourceScopedNestedScrollLifecycle')) {
    violations.push(`${lifecyclePath}: missing source-scoped lifecycle kernel`);
  }
  if (!lifecycle.includes('var activeSource: ViewGroup?')) {
    violations.push(`${lifecyclePath}: missing active source ownership`);
  }
  if (!lifecycle.includes('var momentumSource: ViewGroup?')) {
    violations.push(`${lifecyclePath}: missing source-scoped momentum ownership`);
  }
  if (!lifecycle.includes('StopDecision.Stale')) {
    violations.push(`${lifecyclePath}: stale stop must fail closed`);
  }
}

const ledger = read(ledgerPath);
if (ledger) {
  if (!ledger.includes('class NestedScrollConservationLedger')) {
    violations.push(`${ledgerPath}: missing conservation ledger`);
  }
  if (!ledger.includes('sumY == pre.requestedY')) {
    violations.push(`${ledgerPath}: conservation equation is missing`);
  }
  if (!ledger.includes('fun flushPending(): OrphanPre?')) {
    violations.push(`${ledgerPath}: orphan pre-scroll accounting is missing`);
  }
}

const dispatcher = read(dispatcherPath);
if (dispatcher) {
  if (!dispatcher.includes('class VerticalNestedScrollTransactionDispatcher')) {
    violations.push(`${dispatcherPath}: missing vertical transaction dispatcher`);
  }
  if (!dispatcher.includes('fun bindParticipants(')) {
    violations.push(`${dispatcherPath}: missing neutral participant binding API`);
  }
  if (!dispatcher.includes('ledger.beginFrame(requestedY, consumedY)')) {
    violations.push(`${dispatcherPath}: PRE dispatch must feed conservation accounting`);
  }
  if (!dispatcher.includes('ledger.completeFrame(childConsumedY, availableY, consumedY)')) {
    violations.push(`${dispatcherPath}: POST dispatch must complete conservation accounting`);
  }
  const postConsumer = dispatcher.indexOf('for (consumer in postConsumers)');
  const postObserver = dispatcher.indexOf('for (observer in postObservers)');
  if (postConsumer < 0 || postObserver < 0 || postConsumer > postObserver) {
    violations.push(`${dispatcherPath}: POST observers must run after consuming POST participants`);
  }
}

const androidGradle = fs.readFileSync(path.join(root, 'android/build.gradle'), 'utf8');
if (androidGradle.includes('android-shared')) {
  violations.push('android/build.gradle: obsolete external source-set wiring must be removed');
}

const host = read(hostPath);
if (host) {
  if (!host.includes('private val nestedScrollController = ReactNativeNestedScrollParentController(this)')) {
    violations.push(`${hostPath}: standalone host must delegate to the reusable parent controller`);
  }
  if (!host.includes('nestedScrollController.prepareNestedSource(reactSources.single())')) {
    violations.push(`${hostPath}: discovered source must be prepared through the reusable controller`);
  }
  if (
    !host.includes('nestedScrollController.onNestedPreScroll(') ||
    !host.includes('nestedScrollController.onNestedScroll(')
  ) {
    violations.push(`${hostPath}: NestedScrollingParent callbacks must delegate to the controller`);
  }
  for (const forbiddenOwnership of [
    'SourceScopedNestedScrollLifecycle()',
    'VerticalNestedScrollTransactionDispatcher()',
    'Material3TopAppBarNestedScrollAdapter(',
    'Material3FloatingToolbarNestedScrollAdapter(',
    'TX_ABORT reason=source-replaced',
    'TX_STALE_PRE',
    'TX_STALE_POST',
  ]) {
    if (host.includes(forbiddenOwnership)) {
      violations.push(`${hostPath}: transaction ownership leaked out of the controller: ${forbiddenOwnership}`);
    }
  }
}

const participants = read(participantsPath);
if (participants) {
  for (const marker of [
    'interface ReactNativeNestedScrollParticipantProvider',
    'class ReactNativeNestedScrollParticipantSession',
    'VerticalNestedPreScrollConsumer',
    'VerticalNestedPostScrollConsumer',
    'VerticalNestedPostScrollObserver',
  ]) {
    if (!participants.includes(marker)) {
      violations.push(`${participantsPath}: missing neutral participant contract: ${marker}`);
    }
  }
  for (const forbiddenDependency of ['material3', 'expo.modules', 'com.swmansion.rnscreens']) {
    if (participants.includes(forbiddenDependency)) {
      violations.push(`${participantsPath}: neutral participant contract knows ${forbiddenDependency}`);
    }
  }
}

const screenBridge = read(screenBridgePath);
if (screenBridge) {
  for (const marker of [
    'class ReactNativeScreenNestedScrollBridge(',
    'ReactNativeNestedScrollParentController(owner)',
    'ReactNativeVerticalScrollSourceLocator.findUniqueDescendant',
    'NestedScrollingParent3',
  ]) {
    if (!screenBridge.includes(marker)) {
      violations.push(`${screenBridgePath}: missing reusable screen bridge marker: ${marker}`);
    }
  }
  for (const forbiddenDependency of ['material3', 'expo.modules', 'com.swmansion.rnscreens']) {
    if (screenBridge.includes(forbiddenDependency)) {
      violations.push(`${screenBridgePath}: neutral screen bridge knows ${forbiddenDependency}`);
    }
  }
}

const controller = read(controllerPath);
if (controller) {
  if (!controller.includes('class ReactNativeNestedScrollParentController')) {
    violations.push(`${controllerPath}: missing reusable parent controller`);
  }
  if (!controller.includes('private val sourceLifecycle = SourceScopedNestedScrollLifecycle()')) {
    violations.push(`${controllerPath}: controller must own source-scoped lifecycle`);
  }
  if (!controller.includes('private val transactionDispatcher = VerticalNestedScrollTransactionDispatcher()')) {
    violations.push(`${controllerPath}: controller must own the PRE/POST dispatcher`);
  }
  if (
    !controller.includes('transactionDispatcher.dispatchPre(') ||
    !controller.includes('transactionDispatcher.dispatchPost(')
  ) {
    violations.push(`${controllerPath}: controller PRE/POST must route through dispatcher`);
  }
  for (const forbiddenDependency of [
    'com.reactnativescroll.interop.material3',
    'TopAppBarScrollConsumer',
    'FloatingToolbarScrollConsumer',
    'NativeNestedScrollRegistry',
  ]) {
    if (controller.includes(forbiddenDependency)) {
      violations.push(`${controllerPath}: consumer-specific dependency leaked into RN controller: ${forbiddenDependency}`);
    }
  }
  for (const marker of [
    'ReactNativeNestedScrollParticipants.prepare(source)',
    'ReactNativeNestedScrollParticipants.bind(source)',
    'preConsumers = participantSession.preConsumers',
    'postConsumers = participantSession.postConsumers',
    'postObservers = participantSession.postObservers',
    'transactionDispatcher.bindParticipants(',
  ]) {
    if (!controller.includes(marker)) {
      violations.push(`${controllerPath}: missing generic participant binding: ${marker}`);
    }
  }
  if (!controller.includes('TX_ABORT reason=source-replaced')) {
    violations.push(`${controllerPath}: missing source replacement abort path`);
  }
  if (!controller.includes('TX_STALE_PRE') || !controller.includes('TX_STALE_POST')) {
    violations.push(`${controllerPath}: stale PRE/POST callbacks must fail closed`);
  }
  if (controller.includes('NestedScrollConservationLedger')) {
    violations.push(`${controllerPath}: controller must use conservation accounting through dispatcher only`);
  }

  const assertStopOrder = ({ label, signature, helperCall }) => {
    const stopStart = controller.indexOf(signature);
    const nextPre = controller.indexOf('fun onNestedPreScroll(', stopStart);
    const stop = stopStart >= 0 && nextPre > stopStart ? controller.slice(stopStart, nextPre) : '';
    const classify = stop.indexOf('sourceLifecycle.stop(');
    const staleGuard = stop.indexOf('StopDecision.Stale');
    const helper = stop.indexOf(helperCall);
    if (classify < 0 || staleGuard < 0 || helper < 0 || classify > staleGuard || staleGuard > helper) {
      violations.push(
        `${controllerPath}: ${label} stale STOP must be rejected before NestedScrollingParentHelper`,
      );
    }
  };

  assertStopOrder({
    label: 'typed',
    signature: 'fun onStopNestedScroll(target: View, type: Int)',
    helperCall: 'nestedParentHelper.onStopNestedScroll(target, type)',
  });
  assertStopOrder({
    label: 'platform',
    signature: 'fun onStopNestedScroll(target: View)',
    helperCall: 'nestedParentHelper.onStopNestedScroll(target)',
  });
}

const composeHost = read(composeHostPath);
if (composeHost) {
  if (!composeHost.includes('onMeasureComposeChild(width, height)')) {
    violations.push(`${composeHostPath}: Fabric retry must directly measure the Compose child`);
  }
  if (!composeHost.includes('onLayout(')) {
    violations.push(`${composeHostPath}: Fabric retry must directly lay out the Compose child`);
  }
}

const topBar = read(topBarConsumerPath);
if (topBar) {
  if (!topBar.includes('hasResolvedHeightOffsetLimit')) {
    violations.push(`${topBarConsumerPath}: unresolved Material heightOffsetLimit is not guarded`);
  }
  if (!topBar.includes('limit > -Float.MAX_VALUE')) {
    violations.push(`${topBarConsumerPath}: Material -Float.MAX_VALUE sentinel must fail closed`);
  }
  if (!topBar.includes('private var transactionActive = false')) {
    violations.push(`${topBarConsumerPath}: readiness must be fixed for the whole transaction`);
  }
  if (!topBar.includes('TX_TOP_BEGIN rejected=geometry-unresolved')) {
    violations.push(`${topBarConsumerPath}: missing unresolved-geometry diagnostic`);
  }
}

if (violations.length > 0) {
  console.error('Native scroll invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('Native scroll invariant: PASS');
console.log('  core and RN compatibility boundary live in the standard Android source tree');
console.log('  no parent-owned scroller or child scroll mutation');
console.log('  concrete RN scroll source types confined to compatibility boundary');
console.log('  lifecycle, conservation ledger and PRE/POST dispatcher preserved');
console.log('  standalone host is source-discovery + delegation only');
console.log('  reusable RN controller owns nested lifecycle and generic transaction dispatch');
console.log('  Material3 is not imported by the RN controller/participant/screen bridge');
console.log('  stale nested callbacks fail closed before parent helper mutation');
console.log('  unresolved Material TopAppBar geometry fails closed');
