#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const reactNativeRoot = path.join(root, 'node_modules', 'react-native');
const packagePath = path.join(reactNativeRoot, 'package.json');
const sourcePath = path.join(
  reactNativeRoot,
  'ReactAndroid',
  'src',
  'main',
  'java',
  'com',
  'facebook',
  'react',
  'views',
  'scroll',
  'ReactNestedScrollView.kt',
);

if (!fs.existsSync(packagePath) || !fs.existsSync(sourcePath)) {
  console.error('RN 0.87 source probe: react-native source tree is missing. Run npm install first.');
  process.exit(1);
}

const reactNativePackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
if (reactNativePackage.version !== '0.87.0') {
  console.error(
    `RN 0.87 source probe: expected react-native 0.87.0, found ${reactNativePackage.version}.`,
  );
  process.exit(1);
}

const marker = 'RN087_NESTED_FLING_SOURCE_PATCH';
let source = fs.readFileSync(sourcePath, 'utf8');

if (source.includes(marker)) {
  console.log('RN 0.87 source fling patch: already applied');
  process.exit(0);
}

const functionStart = '  override fun fling(velocityY: Int) {';
const functionEnd = '\n  private fun correctFlingVelocityY';
const start = source.indexOf(functionStart);
const end = source.indexOf(functionEnd, start);

if (start === -1 || end === -1) {
  console.error('RN 0.87 source probe: could not locate ReactNestedScrollView.fling().');
  process.exit(1);
}

const originalFunction = source.slice(start, end);
if (
  !originalFunction.includes('scroller.fling(') ||
  !originalFunction.includes('postInvalidateOnAnimation()') ||
  !originalFunction.includes('super.fling(correctedVelocityY)')
) {
  console.error(
    'RN 0.87 source probe: ReactNestedScrollView.fling() no longer matches the expected 0.87.0 implementation.',
  );
  process.exit(1);
}

const patchedFunction = `  override fun fling(velocityY: Int) {
    val correctedVelocityY = correctFlingVelocityY(velocityY)

    if (pagingEnabled) {
      flingAndSnap(correctedVelocityY)
    } else {
      // ${marker}: the generated nested implementation must use AndroidX's fling path.
      // NestedScrollView.fling() starts TYPE_NON_TOUCH, initializes its scroller baseline,
      // and computeScroll() then owns the real pre/child/post transaction frame by frame.
      android.util.Log.i(
          "Rn087NestedScroll",
          "SOURCE_FLING_PATCH velocityY=$correctedVelocityY",
      )
      super.fling(correctedVelocityY)
    }
    handlePostTouchScrolling(0, correctedVelocityY)
  }
`;

source = source.slice(0, start) + patchedFunction + source.slice(end);
fs.writeFileSync(sourcePath, source);

console.log('RN 0.87 source fling patch: ReactNestedScrollView delegates ordinary fling to AndroidX');
