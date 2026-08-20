#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const p = {
  host: 'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollHostView.kt',
  controller: 'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollParentController.kt',
  source: 'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactVerticalScrollSourceInterop.kt',
  lifecycle: 'android/src/main/java/com/reactnativescroll/interop/core/SourceScopedNestedScrollLifecycle.kt',
  ledger: 'android/src/main/java/com/reactnativescroll/interop/core/NestedScrollConservationLedger.kt',
  dispatcher: 'android/src/main/java/com/reactnativescroll/interop/core/VerticalNestedScrollTransactionDispatcher.kt',
  top: 'android/src/main/java/com/reactnativescroll/interop/material3/TopAppBarScrollConsumer.kt',
  toolbar: 'android/src/main/java/com/reactnativescroll/interop/material3/FloatingToolbarScrollConsumer.kt',
  registry: 'android/src/main/java/com/reactnativescroll/interop/material3/ui/NativeNestedScrollRegistry.kt',
  compose: 'android/src/main/java/com/reactnativescroll/interop/material3/ui/ComposeChromeHostView.kt',
};
const violations = [];
function read(file) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) {
    violations.push(`${file}: missing required file`);
    return '';
  }
  return fs.readFileSync(absolute, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/).map((line) => line.replace(/\/\/.*$/, '')).join('\n');
}
const s = Object.fromEntries(Object.entries(p).map(([k, file]) => [k, read(file)]));
const requireText = (key, needle) => {
  if (!s[key].includes(needle)) violations.push(`${p[key]}: missing ${needle}`);
};
const forbid = (key, pattern, label) => {
  if (pattern.test(s[key])) violations.push(`${p[key]}: forbidden ${label}`);
};

if (fs.existsSync(path.join(root, 'android/src/main/java/expo'))) {
  violations.push('android/src/main/java/expo: legacy Expo implementation tree remains');
}
if (fs.existsSync(path.join(root, 'android-shared'))) {
  violations.push('android-shared: obsolete source tree remains');
}

for (const key of Object.keys(s)) {
  for (const [pattern, label] of [
    [/\bOverScroller\s*\(|\bScroller\s*\(/, 'parent-owned scroller'],
    [/\.scrollBy\s*\(|\.scrollTo\s*\(/, 'source mutation'],
    [/ViewCompat\.startNestedScroll\s*\(/, 'parent-started nested session'],
    [/\b(postDelayed|Timer|scheduleAtFixedRate)\b/, 'timer reconstruction'],
  ]) forbid(key, pattern, label);
}

for (const key of ['host', 'controller', 'lifecycle', 'ledger', 'dispatcher', 'top', 'toolbar', 'registry']) {
  forbid(key, /\b(ReactScrollView|ReactNestedScrollView)\b/, 'concrete RN source type outside compatibility boundary');
}
requireText('source', 'ReactVerticalScrollSourceCapabilities');
requireText('source', 'ReactScrollView');
requireText('source', 'ReactNestedScrollView');

requireText('lifecycle', 'class SourceScopedNestedScrollLifecycle');
requireText('lifecycle', 'var activeSource: ViewGroup?');
requireText('lifecycle', 'var momentumSource: ViewGroup?');
requireText('lifecycle', 'StopDecision.Stale');

requireText('ledger', 'class NestedScrollConservationLedger');
requireText('ledger', 'sumY == pre.requestedY');
requireText('ledger', 'fun flushPending(): OrphanPre?');

for (const needle of [
  'class VerticalNestedScrollTransactionDispatcher',
  'fun interface PreConsumer',
  'fun interface PostConsumer',
  'fun interface PostObserver',
  'fun bindParticipants(',
  'ledger.beginFrame(requestedY, consumedY)',
  'ledger.completeFrame(childConsumedY, availableY, consumedY)',
]) requireText('dispatcher', needle);
const postConsumer = s.dispatcher.indexOf('for (consumer in postConsumers)');
const postObserver = s.dispatcher.indexOf('for (observer in postObservers)');
if (postConsumer < 0 || postObserver < 0 || postConsumer > postObserver) {
  violations.push(`${p.dispatcher}: POST observers must run after POST consumers`);
}

for (const needle of [
  'private val nestedScrollController = ReactNativeNestedScrollParentController(this)',
  'nestedScrollController.prepareNestedSource(reactSources.single())',
  'nestedScrollController.onNestedPreScroll(',
  'nestedScrollController.onNestedScroll(',
]) requireText('host', needle);
for (const forbidden of ['SourceScopedNestedScrollLifecycle()', 'VerticalNestedScrollTransactionDispatcher()', 'Material3TopAppBarNestedScrollAdapter(']) {
  if (s.host.includes(forbidden)) violations.push(`${p.host}: transaction ownership leaked: ${forbidden}`);
}

for (const needle of [
  'class ReactNativeNestedScrollParentController',
  'private val sourceLifecycle = SourceScopedNestedScrollLifecycle()',
  'private val transactionDispatcher = VerticalNestedScrollTransactionDispatcher()',
  'transactionDispatcher.dispatchPre(',
  'transactionDispatcher.dispatchPost(',
  'Material3TopAppBarNestedScrollAdapter',
  'Material3FloatingToolbarNestedScrollAdapter',
  'transactionDispatcher.bindParticipants(',
  'postObservers = if (toolbarAdapter != null) listOf(toolbarAdapter) else emptyList()',
  'TX_ABORT reason=source-replaced',
  'TX_STALE_PRE',
  'TX_STALE_POST',
]) requireText('controller', needle);
forbid('controller', /expo\.modules\./, 'Expo dependency in RN controller');

requireText('top', 'hasResolvedHeightOffsetLimit');
requireText('top', 'limit > -Float.MAX_VALUE');
requireText('top', 'private var transactionActive = false');
requireText('top', 'TX_TOP_BEGIN rejected=geometry-unresolved');
forbid('top', /expo\.modules\./, 'Expo dependency in Material3 consumer');
forbid('toolbar', /expo\.modules\./, 'Expo dependency in Material3 consumer');

requireText('registry', 'MaterialTopAppBarView');
requireText('registry', 'MaterialToolbarView');
requireText('registry', 'ReactNativeNestedScrollParentController');
forbid('registry', /expo\.modules\./, 'Expo dependency in Material registry');

requireText('compose', 'onMeasureComposeChild(width, height)');
requireText('compose', 'onLayout(');

if (violations.length) {
  console.error('Native scroll invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}
console.log('Native scroll invariant: PASS');
console.log('  neutral core owns lifecycle/conservation/dispatch');
console.log('  RN boundary owns source recognition and parent callbacks');
console.log('  Material3 consumers are above the core');
console.log('  no legacy Expo implementation tree or Expo package dependency');
console.log('  source motion remains owned by React Native');
