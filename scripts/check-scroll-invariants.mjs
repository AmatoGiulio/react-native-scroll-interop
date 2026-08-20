#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const files = {
  host: 'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollHostView.kt',
  facade: 'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollParentController.kt',
  controller: 'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollControllerCore.kt',
  participants: 'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollParticipants.kt',
  source: 'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactVerticalScrollSourceInterop.kt',
  lifecycle: 'android/src/main/java/com/reactnativescroll/interop/core/SourceScopedNestedScrollLifecycle.kt',
  ledger: 'android/src/main/java/com/reactnativescroll/interop/core/NestedScrollConservationLedger.kt',
  dispatcher: 'android/src/main/java/com/reactnativescroll/interop/core/VerticalNestedScrollTransactionDispatcher.kt',
  top: 'android/src/main/java/com/reactnativescroll/interop/material3/TopAppBarScrollConsumer.kt',
  toolbar: 'android/src/main/java/com/reactnativescroll/interop/material3/FloatingToolbarScrollConsumer.kt',
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
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
const requireText = (key, needle) => {
  if (!source[key].includes(needle)) violations.push(`${files[key]}: missing ${needle}`);
};
const forbid = (key, pattern, label) => {
  if (pattern.test(source[key])) violations.push(`${files[key]}: forbidden ${label}`);
};

if (fs.existsSync(path.join(root, 'android/src/main/java/expo'))) {
  violations.push('android/src/main/java/expo: legacy Expo implementation tree remains');
}
if (fs.existsSync(path.join(root, 'android-shared'))) {
  violations.push('android-shared: obsolete source tree remains');
}

for (const key of Object.keys(source)) {
  for (const [pattern, label] of [
    [/\bOverScroller\s*\(|\bScroller\s*\(/, 'parent-owned scroller'],
    [/\.scrollBy\s*\(|\.scrollTo\s*\(/, 'source mutation'],
    [/ViewCompat\.startNestedScroll\s*\(/, 'parent-started nested session'],
    [/\b(postDelayed|Timer|scheduleAtFixedRate)\b/, 'timer reconstruction'],
  ]) forbid(key, pattern, label);
}

for (const key of ['host', 'facade', 'controller', 'participants', 'lifecycle', 'ledger', 'dispatcher', 'top', 'toolbar']) {
  forbid(key, /\b(ReactScrollView|ReactNestedScrollView)\b/, 'concrete RN source type outside compatibility boundary');
}
requireText('source', 'ReactVerticalScrollSourceCapabilities');
requireText('source', 'ReactScrollView');
requireText('source', 'ReactNestedScrollView');

for (const marker of [
  'class SourceScopedNestedScrollLifecycle',
  'var activeSource: ViewGroup?',
  'var momentumSource: ViewGroup?',
  'StopDecision.Stale',
]) requireText('lifecycle', marker);
for (const marker of [
  'class NestedScrollConservationLedger',
  'sumY == pre.requestedY',
  'fun flushPending(): OrphanPre?',
]) requireText('ledger', marker);
for (const marker of [
  'class VerticalNestedScrollTransactionDispatcher',
  'fun interface PreConsumer',
  'fun interface PostConsumer',
  'fun interface PostObserver',
  'fun bindParticipants(',
  'ledger.beginFrame(requestedY, consumedY)',
  'ledger.completeFrame(childConsumedY, availableY, consumedY)',
]) requireText('dispatcher', marker);
const postConsumer = source.dispatcher.indexOf('for (consumer in postConsumers)');
const postObserver = source.dispatcher.indexOf('for (observer in postObservers)');
if (postConsumer < 0 || postObserver < 0 || postConsumer > postObserver) {
  violations.push(`${files.dispatcher}: POST observers must run after POST consumers`);
}

for (const marker of [
  'ReactNativeNestedScrollParticipants.registerStandaloneHost(this)',
  'ReactNativeNestedScrollParticipants.unregisterStandaloneHost(this)',
  'nestedScrollController.prepareNestedSource(reactSources.single())',
  'nestedScrollController.onNestedPreScroll(',
  'nestedScrollController.onNestedScroll(',
]) requireText('host', marker);
forbid('host', /com\.reactnativescroll\.interop\.material3/, 'Material3 dependency in NativeScrollHost');

for (const marker of [
  'class ReactNativeNestedScrollParentController',
  'ReactNativeNestedScrollControllerCore(owner, this)',
  'requestNestedParticipantBindingRefresh()',
]) requireText('facade', marker);
forbid('facade', /com\.reactnativescroll\.interop\.material3|TopAppBar|FloatingToolbar/, 'consumer dependency in RN facade');

for (const marker of [
  'class ReactNativeNestedScrollControllerCore',
  'SourceScopedNestedScrollLifecycle()',
  'VerticalNestedScrollTransactionDispatcher()',
  'ReactNativeNestedScrollParticipants.prepare(source)',
  'ReactNativeNestedScrollParticipants.bind(source)',
  'dispatcher.dispatchPre(',
  'dispatcher.dispatchPost(',
  'dispatcher.bindParticipants(',
  'TX_ABORT reason=source-replaced',
  'TX_STALE_PRE',
  'TX_STALE_POST',
  'activeSession?.end(source, reason)',
]) requireText('controller', marker);
forbid('controller', /com\.reactnativescroll\.interop\.material3|TopAppBar|FloatingToolbar|NativeNestedScrollRegistry/, 'consumer dependency in RN controller');

for (const marker of [
  'interface ReactNativeNestedScrollParticipantProvider',
  'class ReactNativeNestedScrollParticipantSession',
  'VerticalNestedPreScrollConsumer',
  'VerticalNestedPostScrollConsumer',
  'VerticalNestedPostScrollObserver',
]) requireText('participants', marker);
forbid('participants', /com\.reactnativescroll\.interop\.material3|expo\.modules|com\.swmansion/, 'consumer/container dependency in participant contract');

requireText('top', 'hasResolvedHeightOffsetLimit');
requireText('top', 'TX_TOP_BEGIN rejected=geometry-unresolved');
forbid('top', /expo\.modules\./, 'Expo dependency in Material3 consumer');
forbid('toolbar', /expo\.modules\./, 'Expo dependency in Material3 consumer');

if (violations.length) {
  console.error('Native scroll invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('Native scroll invariant: PASS');
console.log('  neutral core owns lifecycle/conservation/dispatch');
console.log('  RN boundary owns source recognition and parent callbacks only');
console.log('  native consumers enter through neutral participant ports');
console.log('  no parent scroller/source mutation/timer reconstruction');
console.log('  source motion remains owned by React Native');
