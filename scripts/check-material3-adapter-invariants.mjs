#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const files = {
  adapters: 'android/src/main/java/com/reactnativescroll/interop/material3/Material3NestedScrollAdapters.kt',
  transaction: 'android/src/main/java/com/reactnativescroll/interop/material3/Material3NestedScrollTransaction.kt',
  topBar: 'android/src/main/java/com/reactnativescroll/interop/material3/TopAppBarScrollConsumer.kt',
  toolbar: 'android/src/main/java/com/reactnativescroll/interop/material3/FloatingToolbarScrollConsumer.kt',
  registry: 'android/src/main/java/com/reactnativescroll/interop/material3/ui/NativeNestedScrollRegistry.kt',
  bindings: 'android/src/main/java/com/reactnativescroll/interop/material3/ui/Material3ConsumerBindings.kt',
  placement: 'android/src/main/java/com/reactnativescroll/interop/material3/ui/NativeFloatingToolbarPlacement.kt',
  topView: 'android/src/main/java/com/reactnativescroll/interop/material3/ui/MaterialTopAppBarView.kt',
  toolbarView: 'android/src/main/java/com/reactnativescroll/interop/material3/ui/MaterialToolbarView.kt',
};

const violations = [];
function read(relativePath) {
  const absolutePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absolutePath)) {
    violations.push(`${relativePath}: missing required file`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}
function requireText(file, source, needle) {
  if (!source.includes(needle)) violations.push(`${file}: missing ${needle}`);
}
function forbid(file, source, pattern, label) {
  if (pattern.test(source)) violations.push(`${file}: forbidden ${label}`);
}

const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));

for (const marker of [
  'VerticalNestedPreScrollConsumer',
  'VerticalNestedPostScrollConsumer',
  'VerticalNestedPostScrollObserver',
  'class Material3TopAppBarNestedScrollAdapter',
  'class Material3FloatingToolbarNestedScrollAdapter',
  'ViewCompat.TYPE_NON_TOUCH',
  'consumer.nestedPostScroll(childConsumedY, inputType.toNativeNestedInputType())',
]) requireText(files.adapters, source.adapters, marker);

for (const [pattern, label] of [
  [/\bOverScroller\b|\bScroller\b/, 'parent-owned scroller'],
  [/\.scrollBy\s*\(|\.scrollTo\s*\(/, 'source mutation'],
  [/ViewCompat\.startNestedScroll\s*\(/, 'parent-started nested session'],
  [/\b(postDelayed|Timer|scheduleAtFixedRate)\b/, 'timer reconstruction'],
  [/\bscrollY\b/, 'source-position sampling'],
  [/\b(ReactScrollView|ReactNestedScrollView)\b/, 'concrete RN source type'],
  [/expo\.modules\./, 'Expo package dependency'],
]) forbid(files.adapters, source.adapters, pattern, label);

for (const marker of [
  'enum class NativeNestedInputType',
  'data class NativeNestedPreResult',
  'data class NativeNestedPostResult',
]) requireText(files.transaction, source.transaction, marker);
forbid(files.transaction, source.transaction, /expo\.modules\./, 'Expo transaction dependency');

for (const marker of [
  'class TopAppBarScrollConsumer',
  'ReactVerticalScrollSourceInterop',
  'NativeNestedInputType',
  'Velocity.Zero',
]) requireText(files.topBar, source.topBar, marker);
for (const marker of [
  'open class FloatingToolbarScrollConsumer',
  'current.onPostScroll(',
  'Velocity.Zero',
  'WeakHashMap<ViewGroup, RetainedBehaviorState>()',
  'fun prepareNestedSource(source: ViewGroup): Boolean',
  'val retained = sourceStates[source]',
  'preparedSource = source',
]) requireText(files.toolbar, source.toolbar, marker);
for (const [name, content] of [['topBar', source.topBar], ['toolbar', source.toolbar]]) {
  forbid(files[name], content, /expo\.modules\.kotlin/, 'Expo Modules runtime API');
  forbid(files[name], content, /MaterialTopAppBarView|MaterialToolbarView|NativeNestedScrollRegistry/, 'Material UI ownership in behavior consumer');
}

const prepareStart = source.toolbar.indexOf('fun prepareNestedSource(source: ViewGroup): Boolean');
const prepareEnd = source.toolbar.indexOf('private fun restoreRetainedBehaviorState', prepareStart);
if (prepareStart < 0 || prepareEnd < 0) {
  violations.push(`${files.toolbar}: cannot isolate prepareNestedSource`);
} else {
  const body = source.toolbar.slice(prepareStart, prepareEnd);
  const retainedRead = body.indexOf('val retained = sourceStates[source]');
  const geometrySync = body.indexOf('syncGeometryNow()', retainedRead + 1);
  const firstSwitch = body.indexOf('preparedSource = source');
  const finalSwitch = body.lastIndexOf('preparedSource = source');
  const persist = body.indexOf('rememberBehaviorState(current)', finalSwitch);
  if (
    retainedRead < 0 || geometrySync <= retainedRead || firstSwitch <= retainedRead ||
    finalSwitch <= geometrySync || persist <= finalSwitch
  ) {
    violations.push(`${files.toolbar}: source-scoped state ordering changed`);
  }
}

for (const marker of [
  'frontmostScreenParentFor(departingOwner)?.requestNestedChromeBindingRefresh()',
  'if (!isFrontmostScreenSource(source)) return null',
  'consumer.prepareNestedSource(sourceGroup)',
  'private fun sameScreenStackScope(first: View, second: View): Boolean',
  'MaterialTopAppBarView',
  'MaterialToolbarView',
]) requireText(files.registry, source.registry, marker);
forbid(files.registry, source.registry, /expo\.modules\./, 'Expo registry dependency');

for (const marker of [
  'class MaterialFloatingToolbarScrollConsumer',
  ': FloatingToolbarScrollConsumer(',
  'placementInsets = { NativeFloatingToolbarPlacement.apply(hostView, composeView) }',
]) requireText(files.bindings, source.bindings, marker);

for (const marker of [
  'package com.reactnativescroll.interop.material3.ui',
  'object NativeFloatingToolbarPlacement',
  'WeakHashMap<MaterialToolbarView, State>()',
  'fun apply(host: ViewGroup, childOverride: ComposeView? = null): Insets?',
]) requireText(files.placement, source.placement, marker);

for (const [file, content, className] of [
  [files.topView, source.topView, 'class MaterialTopAppBarView'],
  [files.toolbarView, source.toolbarView, 'class MaterialToolbarView'],
]) {
  requireText(file, content, 'package com.reactnativescroll.interop.material3.ui');
  requireText(file, content, className);
  forbid(file, content, /expo\.modules\./, 'Expo package dependency');
}

const oldExpoTree = path.join(process.cwd(), 'android/src/main/java/expo');
if (fs.existsSync(oldExpoTree)) {
  violations.push('android/src/main/java/expo: legacy Expo implementation tree must be removed');
}

if (violations.length) {
  console.error('Material3 adapter invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('Material3 adapter invariant: PASS');
console.log('  behavior consumers live in the Material3 layer above the neutral core');
console.log('  native Material views/managers/registry live in material3.ui');
console.log('  Material consumers contain no Expo Modules dependency');
console.log('  FloatingToolbar remains observation-only and source-scoped');
console.log('  legacy android/src/main/java/expo implementation tree is removed');
