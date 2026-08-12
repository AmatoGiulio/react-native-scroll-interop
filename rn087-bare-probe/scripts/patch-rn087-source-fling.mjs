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

const marker = 'RN087_NESTED_FLING_SOURCE_PATCH_V2';
const previousMarker = 'RN087_NESTED_FLING_SOURCE_PATCH';
let source = fs.readFileSync(sourcePath, 'utf8');

if (source.includes(marker)) {
  console.log('RN 0.87 source fling patch v2: already applied');
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
const upgradingPreviousProbePatch = originalFunction.includes(previousMarker);
if (
  !upgradingPreviousProbePatch &&
  (!originalFunction.includes('scroller.fling(') ||
    !originalFunction.includes('postInvalidateOnAnimation()') ||
    !originalFunction.includes('super.fling(correctedVelocityY)'))
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
    } else if (scroller != null) {
      // ${marker}
      // Prime AndroidX's animated nested-scroll bookkeeping, then overwrite the same reflected
      // mScroller before any frame runs with RN 0.87's original fling parameters. This preserves
      // RN's trajectory/overfling configuration while keeping TYPE_NON_TOUCH + mLastScrollerY.
      android.util.Log.i(
          "Rn087NestedScroll",
          "SOURCE_FLING_PATCH mode=prime-then-rn velocityY=$correctedVelocityY",
      )
      super.fling(correctedVelocityY)

      val scrollWindowHeight = height - paddingBottom - paddingTop
      scroller.fling(
          scrollX, // startX
          scrollY, // startY
          0, // velocityX
          correctedVelocityY, // velocityY
          0, // minX
          0, // maxX
          0, // minY
          Int.MAX_VALUE, // maxY
          0, // overX
          scrollWindowHeight / 2, // overY
      )
      postInvalidateOnAnimation()
    } else {
      android.util.Log.i(
          "Rn087NestedScroll",
          "SOURCE_FLING_PATCH mode=androidx-fallback velocityY=$correctedVelocityY",
      )
      super.fling(correctedVelocityY)
    }
    handlePostTouchScrolling(0, correctedVelocityY)
  }
`;

source = source.slice(0, start) + patchedFunction + source.slice(end);
fs.writeFileSync(sourcePath, source);

console.log(
  upgradingPreviousProbePatch
    ? 'RN 0.87 source fling patch: upgraded probe patch to v2 (AndroidX prime + original RN scroller)'
    : 'RN 0.87 source fling patch v2: AndroidX prime + original RN scroller parameters',
);
