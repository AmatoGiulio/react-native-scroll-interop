#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const relativePath =
  'android/src/main/java/com/reactnativescroll/interop/material3/Material3NestedScrollAdapters.kt';
const absolutePath = path.join(process.cwd(), relativePath);
const violations = [];

if (!fs.existsSync(absolutePath)) {
  violations.push(`${relativePath}: missing Material3 nested-scroll adapter boundary`);
} else {
  const source = fs.readFileSync(absolutePath, 'utf8');

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
      violations.push(`${relativePath}: missing required adapter marker: ${marker}`);
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
      violations.push(`${relativePath}: forbidden ${name}`);
    }
  }

  const floatingHeader = source.match(
    /class Material3FloatingToolbarNestedScrollAdapter[\s\S]*?\)\s*:\s*([^\{]+)\{/,
  );
  if (!floatingHeader) {
    violations.push(`${relativePath}: cannot resolve FloatingToolbar adapter interface list`);
  } else if (/VerticalNested(Post|Pre)ScrollConsumer/.test(floatingHeader[1])) {
    violations.push(`${relativePath}: FloatingToolbar must remain observation-only`);
  }

  if (!source.includes('consumer.nestedPostScroll(childConsumedY, inputType.toNativeNestedInputType())')) {
    violations.push(`${relativePath}: FloatingToolbar must observe the real child-consumed POST delta`);
  }
}

if (violations.length > 0) {
  console.error('Material3 adapter invariant: FAIL');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('Material3 adapter invariant: PASS');
console.log('  neutral PRE/POST ports are used');
console.log('  FloatingToolbar remains observation-only');
console.log('  no source physics, position sampling, timers or concrete RN source typing');
