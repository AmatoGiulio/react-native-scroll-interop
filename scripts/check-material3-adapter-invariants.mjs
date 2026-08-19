#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const adapterRelativePath =
  'android/src/main/java/com/reactnativescroll/interop/material3/Material3NestedScrollAdapters.kt';
const transactionRelativePath =
  'android/src/main/java/com/reactnativescroll/interop/material3/Material3NestedScrollTransaction.kt';
const registryRelativePath =
  'android/src/main/java/expo/modules/materialtoolbar/NativeNestedScrollInterop.kt';
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
    ['Expo TopAppBar consumer import', /expo\.modules\.materialtoolbar\.TopAppBarScrollConsumer/],
    ['Expo FloatingToolbar consumer import', /expo\.modules\.materialtoolbar\.FloatingToolbarScrollConsumer/],
  ];

  for (const [name, pattern] of forbidden) {
    if (pattern.test(source)) violations.push(`${adapterRelativePath}: forbidden ${name}`);
  }

  if (source.includes('expo.modules.materialtoolbar.NativeNestedInputType')) {
    violations.push(`${adapterRelativePath}: Material3 input type must not come from Expo package`);
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
  for (const typeName of ['NativeNestedInputType', 'NativeNestedPreResult', 'NativeNestedPostResult']) {
    if (registrySource.includes(typeName)) {
      violations.push(`${registryRelativePath}: Material3 transaction type remains in Expo registry: ${typeName}`);
    }
  }

  for (const marker of [
    'frontmostScreenParentFor(departingOwner)?.requestNestedChromeBindingRefresh()',
    'if (!isFrontmostScreenSource(source)) return null',
    'consumer.prepareNestedSource(sourceGroup)',
    'private fun sameScreenStackScope(first: View, second: View): Boolean',
  ]) {
    if (!registrySource.includes(marker)) {
      violations.push(`${registryRelativePath}: missing source-scoped FloatingToolbar lifecycle marker: ${marker}`);
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
      violations.push(`${topBarRelativePath}: TopAppBar consumer depends on Expo runtime/view API: ${pattern}`);
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
      violations.push(`${floatingToolbarRelativePath}: FloatingToolbar consumer depends on Expo runtime/view API: ${pattern}`);
    }
  }

  const prepareStart = floatingToolbarSource.indexOf('fun prepareNestedSource(source: ViewGroup): Boolean');
  const prepareEnd = floatingToolbarSource.indexOf('private fun restoreRetainedBehaviorState', prepareStart);
  if (prepareStart < 0 || prepareEnd < 0) {
    violations.push(`${floatingToolbarRelativePath}: cannot isolate prepareNestedSource for source-state ordering check`);
  } else {
    const prepareBody = floatingToolbarSource.slice(prepareStart, prepareEnd);
    const retainedRead = prepareBody.indexOf('val retained = sourceStates[source]');
    const geometrySync = prepareBody.indexOf('syncGeometryNow()');
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
    violations.push(`${legacyPath}: legacy Expo Material3 source must be removed`);
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
      violations.push(`${consumerBindingsRelativePath}: missing Expo-to-Material3 binding marker: ${marker}`);
    }
  }
}

const placementSource = read(placementRelativePath);
if (placementSource != null) {
  for (const marker of [
    'package expo.modules.materialtoolbar',
    'object NativeFloatingToolbarPlacement',
    'WeakHashMap<ExpoMaterialToolbarView, State>()',
    'fun apply(host: ViewGroup, childOverride: ComposeView? = null): Insets?',
  ]) {
    if (!placementSource.includes(marker)) {
      violations.push(`${placementRelativePath}: missing Expo placement marker: ${marker}`);
    }
  }
}

if (violations.length) {
  console.error('Material3 adapter invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('Material3 adapter invariant: PASS');
console.log('  neutral PRE/POST ports are used');
console.log('  Material3 transaction types stay outside the Expo registry layer');
console.log('  TopAppBar consumer source is owned by the Material3 package');
console.log('  FloatingToolbar consumer source is owned by the Material3 package');
console.log('  FloatingToolbar placement remains in the Expo view layer');
console.log('  FloatingToolbar remains observation-only');
console.log('  persistent FloatingToolbar scroll state is scoped to the frontmost RN source');
console.log('  incoming FloatingToolbar state is captured before source authority switches');
console.log('  pop refresh restores the newly frontmost screen state without source sampling');
console.log('  no source physics, position sampling, timers or concrete RN source typing in adapters');
