#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const adapterRelativePath =
  'android/src/main/java/com/reactnativescroll/interop/material3/Material3NestedScrollAdapters.kt';
const transactionRelativePath =
  'android/src/main/java/com/reactnativescroll/interop/material3/Material3NestedScrollTransaction.kt';
const registryRelativePath =
  'android/src/main/java/com/reactnativescroll/interop/material3/Material3NestedScrollRegistry.kt';
const providerRelativePath =
  'android/src/main/java/com/reactnativescroll/interop/material3/Material3NestedScrollParticipantProvider.kt';
const controllerRelativePath =
  'android/src/main/java/com/reactnativescroll/interop/reactnative/ReactNativeNestedScrollParentController.kt';
const topBarRelativePath =
  'android/src/main/java/com/reactnativescroll/interop/material3/TopAppBarScrollConsumer.kt';
const floatingToolbarRelativePath =
  'android/src/main/java/com/reactnativescroll/interop/material3/FloatingToolbarScrollConsumer.kt';
const legacyTopBarRelativePath =
  'android/src/main/java/expo/modules/materialtoolbar/TopAppBarScrollConsumer.kt';
const legacyFloatingToolbarRelativePath =
  'android/src/main/java/expo/modules/materialtoolbar/FloatingToolbarScrollConsumer.kt';
const consumerBindingsRelativePath =
  'android/src/main/java/expo/modules/materialtoolbar/Material3ConsumerBindings.kt';
const legacyConsumerBindingsRelativePath =
  'android/src/main/java/expo/modules/materialtoolbar/Material3ConsumerAliases.kt';
const placementRelativePath =
  'android/src/main/java/expo/modules/materialtoolbar/NativeFloatingToolbarPlacement.kt';
const violations = [];

function read(relativePath) {
  const absolutePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absolutePath)) {
    violations.push(`${relativePath}: missing required file`);
    return null;
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

const source = read(adapterRelativePath);
if (source != null) {
  const required = [
    'package com.reactnativescroll.interop.material3',
    'VerticalNestedPreScrollConsumer',
    'VerticalNestedPostScrollConsumer',
    'VerticalNestedPostScrollObserver',
    'class Material3TopAppBarNestedScrollAdapter',
    ': VerticalNestedPreScrollConsumer, VerticalNestedPostScrollConsumer',
    'class Material3FloatingToolbarNestedScrollAdapter',
    ': VerticalNestedPostScrollObserver',
    'ViewCompat.TYPE_NON_TOUCH',
  ];

  for (const marker of required) {
    if (!source.includes(marker)) {
      violations.push(`${adapterRelativePath}: missing required adapter marker: ${marker}`);
    }
  }

  const forbidden = [
    ['parent-owned OverScroller', /\bOverScroller\b/],
    ['parent-owned Scroller', /\bScroller\b/],
    ['child scrollBy mutation', /\.scrollBy\s*\(/],
    ['child scrollTo mutation', /\.scrollTo\s*\(/],
    ['parent-started nested session', /ViewCompat\.startNestedScroll\s*\(/],
    ['timer-based reconstruction', /\b(postDelayed|Timer|scheduleAtFixedRate)\b/],
    ['velocity integration', /\bVelocity\b/],
    ['source-position sampling', /\bscrollY\b/],
    ['concrete RN source type', /\b(ReactScrollView|ReactNestedScrollView)\b/],
    ['direct Compose nested-scroll ownership', /androidx\.compose\.ui\.input\.nestedscroll/],
    ['Expo Modules API dependency', /expo\.modules\.kotlin/],
  ];

  for (const [name, pattern] of forbidden) {
    if (pattern.test(source)) violations.push(`${adapterRelativePath}: forbidden ${name}`);
  }

  const floatingHeader = source.match(
    /class Material3FloatingToolbarNestedScrollAdapter[\s\S]*?\)\s*:\s*([^\{]+)\{/,
  );
  if (!floatingHeader) {
    violations.push(`${adapterRelativePath}: cannot resolve FloatingToolbar adapter interface list`);
  } else if (/VerticalNested(Post|Pre)ScrollConsumer/.test(floatingHeader[1])) {
    violations.push(`${adapterRelativePath}: FloatingToolbar must remain observation-only`);
  }

  if (!source.includes('consumer.nestedPostScroll(childConsumedY, inputType.toNativeNestedInputType())')) {
    violations.push(`${adapterRelativePath}: FloatingToolbar must observe the real child-consumed POST delta`);
  }
}

const transactionSource = read(transactionRelativePath);
if (transactionSource != null) {
  for (const marker of [
    'package com.reactnativescroll.interop.material3',
    'enum class NativeNestedInputType',
    'data class NativeNestedPreResult',
    'data class NativeNestedPostResult',
  ]) {
    if (!transactionSource.includes(marker)) {
      violations.push(`${transactionRelativePath}: missing Material3 transaction marker: ${marker}`);
    }
  }
  if (/\bexpo\.modules\./.test(transactionSource)) {
    violations.push(`${transactionRelativePath}: Material3 transaction types must not depend on Expo`);
  }
}

const registrySource = read(registryRelativePath);
if (registrySource != null) {
  for (const marker of [
    'package com.reactnativescroll.interop.material3',
    'frontmostScreenParentFor(departingOwner)?.requestNestedParticipantBindingRefresh()',
    'if (!isFrontmostScreenSource(source)) return null',
    'consumer.prepareNestedSource(sourceGroup)',
    'private fun sameScreenStackScope(first: View, second: View): Boolean',
  ]) {
    if (!registrySource.includes(marker)) {
      violations.push(`${registryRelativePath}: missing Material3 registry marker: ${marker}`);
    }
  }
}

const providerSource = read(providerRelativePath);
if (providerSource != null) {
  for (const marker of [
    'ReactNativeNestedScrollParticipantProvider',
    'ReactNativeNestedScrollParticipantSession',
    'Material3TopAppBarNestedScrollAdapter',
    'Material3FloatingToolbarNestedScrollAdapter',
    'preConsumers =',
    'postConsumers =',
    'postObservers =',
  ]) {
    if (!providerSource.includes(marker)) {
      violations.push(`${providerRelativePath}: missing participant-provider marker: ${marker}`);
    }
  }
}

const controllerSource = read(controllerRelativePath);
if (controllerSource != null) {
  for (const forbidden of [
    'com.reactnativescroll.interop.material3',
    'TopAppBarScrollConsumer',
    'FloatingToolbarScrollConsumer',
    'NativeNestedScrollRegistry',
  ]) {
    if (controllerSource.includes(forbidden)) {
      violations.push(`${controllerRelativePath}: RN controller must not know Material3 detail: ${forbidden}`);
    }
  }
  for (const marker of [
    'ReactNativeNestedScrollParticipants.prepare(source)',
    'ReactNativeNestedScrollParticipants.bind(source)',
    'participantSession.preConsumers',
    'participantSession.postConsumers',
    'participantSession.postObservers',
  ]) {
    if (!controllerSource.includes(marker)) {
      violations.push(`${controllerRelativePath}: missing neutral participant boundary marker: ${marker}`);
    }
  }
}

const topBarSource = read(topBarRelativePath);
if (topBarSource != null) {
  for (const marker of [
    'package com.reactnativescroll.interop.material3',
    'enum class TopAppBarInteropMode',
    'class TopAppBarScrollConsumer',
    'ReactVerticalScrollSourceInterop',
    'NativeNestedInputType',
    'NativeNestedPreResult',
    'NativeNestedPostResult',
    'Velocity.Zero',
  ]) {
    if (!topBarSource.includes(marker)) {
      violations.push(`${topBarRelativePath}: missing moved TopAppBar marker: ${marker}`);
    }
  }

  for (const pattern of [/ExpoMaterialTopAppBarView/, /NativeNestedScrollRegistry/, /expo\.modules\.kotlin/]) {
    if (pattern.test(topBarSource)) {
      violations.push(`${topBarRelativePath}: TopAppBar consumer depends on view/runtime API: ${pattern}`);
    }
  }
}

const floatingToolbarSource = read(floatingToolbarRelativePath);
if (floatingToolbarSource != null) {
  for (const marker of [
    'package com.reactnativescroll.interop.material3',
    'open class FloatingToolbarScrollConsumer',
    'NativeNestedInputType',
    'current.onPostScroll(',
    'Velocity.Zero',
    'placementInsets() ?: visibleFrameInsets()',
    'WeakHashMap<ViewGroup, RetainedBehaviorState>()',
    'fun prepareNestedSource(source: ViewGroup): Boolean',
    'preparedSource !== source',
    'sourceStates[source]',
  ]) {
    if (!floatingToolbarSource.includes(marker)) {
      violations.push(`${floatingToolbarRelativePath}: missing moved/source-scoped FloatingToolbar marker: ${marker}`);
    }
  }

  for (const pattern of [
    /ExpoMaterialToolbarView/,
    /NativeFloatingToolbarPlacement/,
    /NativeNestedScrollRegistry/,
    /expo\.modules\.kotlin/,
  ]) {
    if (pattern.test(floatingToolbarSource)) {
      violations.push(`${floatingToolbarRelativePath}: FloatingToolbar consumer depends on view/runtime API: ${pattern}`);
    }
  }

  const prepareStart = floatingToolbarSource.indexOf('fun prepareNestedSource(source: ViewGroup): Boolean');
  const prepareEnd = floatingToolbarSource.indexOf('private fun restoreRetainedBehaviorState', prepareStart);
  if (prepareStart < 0 || prepareEnd < 0) {
    violations.push(`${floatingToolbarRelativePath}: cannot isolate prepareNestedSource for source-state ordering check`);
  } else {
    const prepareBody = floatingToolbarSource.slice(prepareStart, prepareEnd);
    const retainedRead = prepareBody.indexOf('val retained = sourceStates[source]');
    const geometrySync = prepareBody.indexOf('syncGeometryNow()', retainedRead + 1);
    const firstAuthoritySwitch = prepareBody.indexOf('preparedSource = source');
    const finalAuthoritySwitch = prepareBody.lastIndexOf('preparedSource = source');
    const restoredPersist = prepareBody.indexOf('rememberBehaviorState(current)', finalAuthoritySwitch);

    if (
      retainedRead < 0 ||
      geometrySync < 0 ||
      firstAuthoritySwitch < 0 ||
      finalAuthoritySwitch < 0 ||
      restoredPersist < 0 ||
      firstAuthoritySwitch <= retainedRead ||
      geometrySync <= retainedRead ||
      finalAuthoritySwitch <= geometrySync ||
      restoredPersist <= finalAuthoritySwitch
    ) {
      violations.push(
        `${floatingToolbarRelativePath}: incoming source state must be captured before preparedSource switches, ` +
          'while outgoing geometry/state must be saved before the incoming source becomes authoritative',
      );
    }
  }
}

for (const legacyPath of [
  legacyTopBarRelativePath,
  legacyFloatingToolbarRelativePath,
  legacyConsumerBindingsRelativePath,
]) {
  if (fs.existsSync(path.join(process.cwd(), legacyPath))) {
    violations.push(`${legacyPath}: legacy Material3 consumer source must be removed`);
  }
}

const bindingsSource = read(consumerBindingsRelativePath);
if (bindingsSource != null) {
  for (const marker of [
    'typealias TopAppBarScrollConsumer',
    'com.reactnativescroll.interop.material3.TopAppBarScrollConsumer',
    'typealias TopAppBarInteropMode',
    'com.reactnativescroll.interop.material3.TopAppBarInteropMode',
    'class FloatingToolbarScrollConsumer',
    ': com.reactnativescroll.interop.material3.FloatingToolbarScrollConsumer(',
    'placementInsets = { NativeFloatingToolbarPlacement.apply(hostView, composeView) }',
  ]) {
    if (!bindingsSource.includes(marker)) {
      violations.push(`${consumerBindingsRelativePath}: missing private view-to-Material3 binding marker: ${marker}`);
    }
  }
}

const placementSource = read(placementRelativePath);
if (placementSource != null) {
  for (const marker of [
    'object NativeFloatingToolbarPlacement',
    'WeakHashMap<ExpoMaterialToolbarView, State>()',
    'fun apply(host: ViewGroup, childOverride: ComposeView? = null): Insets?',
  ]) {
    if (!placementSource.includes(marker)) {
      violations.push(`${placementRelativePath}: missing Material view placement marker: ${marker}`);
    }
  }
}

if (violations.length) {
  console.error('Material3 adapter invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('Material3 adapter invariant: PASS');
console.log('  neutral PRE/POST/observer ports are the RN/Material3 boundary');
console.log('  RN controller has no Material3 consumer knowledge');
console.log('  Material3 provider owns consumer resolution and transaction binding');
console.log('  FloatingToolbar remains observation-only');
console.log('  persistent FloatingToolbar scroll state is scoped to the frontmost RN source');
console.log('  incoming FloatingToolbar state is captured before source authority switches');
console.log('  no source physics, position sampling, timers or concrete RN source typing in adapters');
