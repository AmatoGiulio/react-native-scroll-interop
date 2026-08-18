#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const hostPath =
  'android/src/main/java/expo/modules/materialtoolbar/ReactNativeNestedScrollHostView.kt';
const controllerPath =
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollParentController.kt';
const composeHostPath =
  'android/src/main/java/expo/modules/materialtoolbar/ComposeChromeHostView.kt';
const topBarConsumerPath =
  'android/src/main/java/com/reactnativescroll/interop/material3/TopAppBarScrollConsumer.kt';
const floatingToolbarConsumerPath =
  'android/src/main/java/com/reactnativescroll/interop/material3/FloatingToolbarScrollConsumer.kt';
const sharedLifecyclePath =
  'android-shared/src/main/java/com/reactnativescroll/interop/core/SourceScopedNestedScrollLifecycle.kt';
const sharedLedgerPath =
  'android-shared/src/main/java/com/reactnativescroll/interop/core/NestedScrollConservationLedger.kt';
const sharedDispatcherPath =
  'android-shared/src/main/java/com/reactnativescroll/interop/core/VerticalNestedScrollTransactionDispatcher.kt';
const bareHostPath =
  'rn087-bare-probe/android/app/src/main/java/com/rn087nestedscrollprobe/NestedScrollProbeLayout.kt';
const registryPath =
  'android/src/main/java/expo/modules/materialtoolbar/NativeNestedScrollInterop.kt';
const sourceAdapter =
  'android-shared/src/main/java/com/reactnativescroll/interop/reactnative/ReactVerticalScrollSourceInterop.kt';

const files = [
  hostPath,
  controllerPath,
  sharedLifecyclePath,
  sharedLedgerPath,
  sharedDispatcherPath,
  topBarConsumerPath,
  floatingToolbarConsumerPath,
  registryPath,
];

const legacyPhysicalPaths = [
  'android-shared/src/main/java/com/material3scroll/transport/SourceScopedNestedScrollLifecycle.kt',
  'android-shared/src/main/java/com/material3scroll/transport/NestedScrollConservationLedger.kt',
  'android-shared/src/main/java/com/material3scroll/transport/VerticalNestedScrollTransactionDispatcher.kt',
  'android/src/main/java/expo/modules/materialtoolbar/FloatingToolbarScrollConsumer.kt',
];

const forbidden = [
  {name: 'parent-owned OverScroller', pattern: /\bOverScroller\s*\(/},
  {name: 'parent-owned Scroller', pattern: /\bScroller\s*\(/},
  {name: 'child scrollBy mutation', pattern: /\.scrollBy\s*\(/},
  {name: 'child scrollTo mutation', pattern: /\.scrollTo\s*\(/},
  {name: 'parent-started nested session', pattern: /ViewCompat\.startNestedScroll\s*\(/},
  {name: 'timer-based scroll reconstruction', pattern: /\b(postDelayed|Timer|scheduleAtFixedRate)\b/},
];

const concreteRnSourceType = /\b(ReactScrollView|ReactNestedScrollView)\b/;
const violations = [];

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map(line => line.replace(/\/\/.*$/, ''))
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

for (const relativePath of legacyPhysicalPaths) {
  if (fs.existsSync(path.join(root, relativePath))) {
    violations.push(`${relativePath}: legacy physical source path must be removed`);
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
        `${relativePath}:${index + 1}: concrete RN scroll source type escaped ${sourceAdapter}: ${line.trim()}`,
      );
    }
  });
}

const adapter = read(sourceAdapter);
if (adapter) {
  if (!adapter.includes('ReactVerticalScrollSourceCapabilities')) {
    violations.push(`${sourceAdapter}: missing explicit source capability model`);
  }
  if (!adapter.includes('ReactScrollView') || !adapter.includes('ReactNestedScrollView')) {
    violations.push(`${sourceAdapter}: must recognize both supported RN vertical source implementations`);
  }
}

const lifecycle = read(sharedLifecyclePath);
if (lifecycle) {
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

const ledger = read(sharedLedgerPath);
if (ledger) {
  if (!ledger.includes('class NestedScrollConservationLedger')) {
    violations.push(`${sharedLedgerPath}: missing shared conservation ledger`);
  }
  if (!ledger.includes('sumY == pre.requestedY')) {
    violations.push(`${sharedLedgerPath}: conservation equation is missing`);
  }
  if (!ledger.includes('fun flushPending(): OrphanPre?')) {
    violations.push(`${sharedLedgerPath}: orphan pre-scroll accounting is missing`);
  }
}

const dispatcher = read(sharedDispatcherPath);
if (dispatcher) {
  if (!dispatcher.includes('class VerticalNestedScrollTransactionDispatcher')) {
    violations.push(`${sharedDispatcherPath}: missing shared vertical transaction dispatcher`);
  }
  for (const phase of ['PreConsumer', 'PostConsumer', 'PostObserver']) {
    if (!dispatcher.includes(`fun interface ${phase}`)) {
      violations.push(`${sharedDispatcherPath}: missing ${phase} dispatch port`);
    }
  }
  if (!dispatcher.includes('fun bindParticipants(')) {
    violations.push(`${sharedDispatcherPath}: missing neutral participant binding API`);
  }
  if (!dispatcher.includes('ledger.beginFrame(requestedY, consumedY)')) {
    violations.push(`${sharedDispatcherPath}: PRE dispatch must feed shared conservation accounting`);
  }
  if (!dispatcher.includes('ledger.completeFrame(childConsumedY, availableY, consumedY)')) {
    violations.push(`${sharedDispatcherPath}: POST dispatch must complete shared conservation accounting`);
  }
  const postConsumer = dispatcher.indexOf('for (consumer in postConsumers)');
  const postObserver = dispatcher.indexOf('for (observer in postObservers)');
  if (postConsumer < 0 || postObserver < 0 || postConsumer > postObserver) {
    violations.push(`${sharedDispatcherPath}: POST observers must run after consuming POST participants`);
  }
}

for (const [label, gradlePath] of [
  ['Expo module', path.join(root, 'android/build.gradle')],
  ['bare RN 0.87 host', path.join(root, 'rn087-bare-probe/android/app/build.gradle')],
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

const bareHost = read(bareHostPath);
if (bareHost) {
  if (!bareHost.includes('SourceScopedNestedScrollLifecycle')) {
    violations.push(`${bareHostPath}: bare RN 0.87 host is not using the shared lifecycle kernel`);
  }
  if (!bareHost.includes('VerticalNestedScrollTransactionDispatcher')) {
    violations.push(`${bareHostPath}: bare RN 0.87 host is not using the shared PRE/POST dispatcher`);
  }
  if (!bareHost.includes('dispatcher.dispatchPre(') || !bareHost.includes('dispatcher.dispatchPost(')) {
    violations.push(`${bareHostPath}: bare host PRE/POST callbacks must route through shared dispatcher`);
  }
  if (bareHost.includes('NestedScrollConservationLedger')) {
    violations.push(`${bareHostPath}: bare host must not own the shared ledger outside the dispatcher`);
  }
}

const host = read(hostPath);
if (host) {
  if (!host.includes('private val nestedScrollController = ReactNativeNestedScrollParentController(this)')) {
    violations.push(`${hostPath}: standalone host must delegate to the reusable parent controller`);
  }
  if (!host.includes('nestedScrollController.prepareNestedSource(reactSources.single())')) {
    violations.push(`${hostPath}: discovered source must be prepared through the reusable controller`);
  }
  if (!host.includes('nestedScrollController.onNestedPreScroll(') ||
      !host.includes('nestedScrollController.onNestedScroll(')) {
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
      violations.push(`${hostPath}: transaction ownership leaked back out of the parent controller: ${forbiddenOwnership}`);
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
  if (!controller.includes('transactionDispatcher.dispatchPre(') ||
      !controller.includes('transactionDispatcher.dispatchPost(')) {
    violations.push(`${controllerPath}: controller PRE/POST must route through shared dispatcher`);
  }
  if (!controller.includes('Material3TopAppBarNestedScrollAdapter')) {
    violations.push(`${controllerPath}: TopAppBar must bind through the Material3 neutral adapter`);
  }
  if (!controller.includes('Material3FloatingToolbarNestedScrollAdapter')) {
    violations.push(`${controllerPath}: FloatingToolbar must bind through the Material3 neutral adapter`);
  }
  if (!controller.includes('transactionDispatcher.bindParticipants(')) {
    violations.push(`${controllerPath}: controller must use neutral participant binding`);
  }
  if (!controller.includes('postObservers = if (toolbarAdapter != null) listOf(toolbarAdapter) else emptyList()')) {
    violations.push(`${controllerPath}: FloatingToolbar must remain observation-only`);
  }
  if (!controller.includes('preConsumers = if (topBarAdapter != null) listOf(topBarAdapter) else emptyList()') ||
      !controller.includes('postConsumers = if (topBarAdapter != null) listOf(topBarAdapter) else emptyList()')) {
    violations.push(`${controllerPath}: TopAppBar PRE/POST participation must be fixed at bind time`);
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

  const assertStopOrder = ({label, signature, helperCall}) => {
    const stopStart = controller.indexOf(signature);
    const nextPre = controller.indexOf('fun onNestedPreScroll(', stopStart);
    const stop = stopStart >= 0 && nextPre > stopStart ? controller.slice(stopStart, nextPre) : '';
    const classify = stop.indexOf('sourceLifecycle.stop(');
    const staleGuard = stop.indexOf('StopDecision.Stale');
    const helper = stop.indexOf(helperCall);
    if (classify < 0 || staleGuard < 0 || helper < 0 || classify > staleGuard || staleGuard > helper) {
      violations.push(
        `${controllerPath}: ${label} stale STOP must be classified and rejected before NestedScrollingParentHelper`,
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
  console.error(
    '\nRN must remain the sole owner of scroll physics. The standalone host may discover a source, but transaction ownership must stay in the reusable parent controller.',
  );
  process.exit(1);
}

console.log('Native scroll invariant: PASS');
console.log('  no parent-owned scroller or child scroll mutation');
console.log('  concrete RN scroll source types confined to compatibility adapter');
console.log('  shared lifecycle, conservation ledger and PRE/POST dispatcher preserved');
console.log('  standalone Expo host is source-discovery + delegation only');
console.log('  reusable parent controller owns nested lifecycle and transaction dispatch');
console.log('  Material3 consumers bind through neutral participant adapters');
console.log('  FloatingToolbar remains observation-only');
console.log('  stale nested callbacks fail closed before parent helper mutation');
console.log('  unresolved Material TopAppBar geometry fails closed');
