#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const rnRoot = path.join(root, 'node_modules', 'react-native');
const pkgPath = path.join(rnRoot, 'package.json');
const scrollPath = path.join(rnRoot, 'ReactAndroid', 'src', 'main', 'java', 'com', 'facebook', 'react', 'views', 'scroll', 'ReactNestedScrollView.java');
const packagePath = path.join(rnRoot, 'ReactAndroid', 'src', 'main', 'java', 'com', 'facebook', 'react', 'shell', 'MainReactPackage.kt');

for (const file of [pkgPath, scrollPath, packagePath]) {
  if (!fs.existsSync(file)) {
    console.error(`RN 0.86 AndroidX experiment: missing ${file}`);
    process.exit(1);
  }
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (pkg.version !== '0.86.0') {
  console.error(`RN 0.86 AndroidX experiment: expected react-native 0.86.0, found ${pkg.version}`);
  process.exit(1);
}

const flingMarker = 'RN086_ANDROIDX_FLING_SOURCE_PATCH';
let scroll = fs.readFileSync(scrollPath, 'utf8');
if (!scroll.includes(flingMarker)) {
  const startToken = '  @Override\n  public void fling(int velocityY) {';
  const endToken = '\n  private int correctFlingVelocityY';
  const start = scroll.indexOf(startToken);
  const end = scroll.indexOf(endToken, start);
  if (start < 0 || end < 0) {
    console.error('RN 0.86 AndroidX experiment: could not locate ReactNestedScrollView.fling().');
    process.exit(1);
  }
  const original = scroll.slice(start, end);
  if (!original.includes('mScroller.fling(') || !original.includes('super.fling(correctedVelocityY)')) {
    console.error('RN 0.86 AndroidX experiment: unexpected ReactNestedScrollView.fling() implementation.');
    process.exit(1);
  }
  const replacement = `  @Override\n  public void fling(int velocityY) {\n    final int correctedVelocityY = correctFlingVelocityY(velocityY);\n\n    if (mPagingEnabled) {\n      flingAndSnap(correctedVelocityY);\n    } else {\n      // ${flingMarker}: keep RN physics but enter AndroidX TYPE_NON_TOUCH nested scrolling.\n      android.util.Log.i(\"ExpoRn086AndroidX\", \"SOURCE_FLING_PATCH velocityY=\" + correctedVelocityY);\n      super.fling(correctedVelocityY);\n    }\n    handlePostTouchScrolling(0, correctedVelocityY);\n  }\n`;
  scroll = scroll.slice(0, start) + replacement + scroll.slice(end);
  fs.writeFileSync(scrollPath, scroll);
  console.log('RN 0.86 AndroidX experiment: patched ReactNestedScrollView.fling()');
} else {
  console.log('RN 0.86 AndroidX experiment: fling patch already applied');
}

const managerMarker = 'RN086_ANDROIDX_MANAGER_PATCH';
let mainPackage = fs.readFileSync(packagePath, 'utf8');
if (!mainPackage.includes(managerMarker)) {
  const original = `if (ReactNativeFeatureFlags.useNestedScrollViewAndroid())\n                    ReactNestedScrollViewManager()\n                else ReactScrollViewManager()`;
  if (!mainPackage.includes(original)) {
    console.error('RN 0.86 AndroidX experiment: could not locate ScrollView manager feature gate.');
    process.exit(1);
  }
  const replacement = `/* ${managerMarker}: experiment branch always selects the existing RN 0.86 AndroidX source. */\n                ReactNestedScrollViewManager()`;
  mainPackage = mainPackage.replace(original, replacement);
  fs.writeFileSync(packagePath, mainPackage);
  console.log('RN 0.86 AndroidX experiment: selected ReactNestedScrollViewManager');
} else {
  console.log('RN 0.86 AndroidX experiment: manager patch already applied');
}
