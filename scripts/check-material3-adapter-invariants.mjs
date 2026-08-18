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
  'android/src/main/java/expo/modules/materialtoolbar/TopAppBarScrollConsumer.kt';
const floatingToolbarRelativePath =
  'android/src/main/java/expo/modules/materialtoolbar/FloatingToolbarScrollConsumer.kt';
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
    if (pattern.test(source)) {
      violations.push(`${adapterRelativePath}: forbidden ${name}`);
    }
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
  const required = [
    'package com.reactnativescroll.interop.material3',
    'enum class NativeNestedInputType',
    'data class NativeNestedPreResult',
    'data class NativeNestedPostResult',
  ];
  for (const marker of required) {
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
  for (const typeName of [
    'NativeNestedInputType',
    'NativeNestedPreResult',
    'NativeNestedPostResult',
  ]) {
    if (registrySource.includes(typeName)) {
      violations.push(`${registryRelativePath}: Material3 transaction type remains in Expo registry: ${typeName}`);
    }
  }
}

const topBarSource = read(topBarRelativePath);
if (topBarSource != null) {
  for (const typeName of [
    'NativeNestedInputType',
    'NativeNestedPreResult',
    'NativeNestedPostResult',
  ]) {
    const marker = `import com.reactnativescroll.interop.material3.${typeName}`;
    if (!topBarSource.includes(marker)) {
      violations.push(`${topBarRelativePath}: missing Material3 transaction import: ${typeName}`);
    }
  }
}

const floatingToolbarSource = read(floatingToolbarRelativePath);
if (
  floatingToolbarSource != null &&
  !floatingToolbarSource.includes(
    'import com.reactnativescroll.interop.material3.NativeNestedInputType',
  )
) {
  violations.push(
    `${floatingToolbarRelativePath}: missing Material3 transaction import: NativeNestedInputType`,
  );
}

if (violations.length > 0) {
  console.error('Material3 adapter invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('Material3 adapter invariant: PASS');
console.log('  neutral PRE/POST ports are used');
console.log('  Material3 transaction types are outside the Expo registry layer');
console.log('  FloatingToolbar remains observation-only');
console.log('  no source physics, position sampling, timers or concrete RN source typing');
