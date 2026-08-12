#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const mode = process.argv[2] ?? '--check';
if (mode !== '--check' && mode !== '--apply') {
  console.error('Usage: node scripts/patch-rn087-nested-fling.mjs --check|--apply');
  process.exit(2);
}

const root = process.cwd();
const rnRoot = path.join(root, 'node_modules', 'react-native');
const packagePath = path.join(rnRoot, 'package.json');
const sourcePath = path.join(
  rnRoot,
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

function fail(message) {
  console.error(`RN 0.87 nested fling patch: FAIL\n  ${message}`);
  process.exit(1);
}

if (!fs.existsSync(packagePath) || !fs.existsSync(sourcePath)) {
  fail('react-native source tree is missing; install dependencies first.');
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
if (pkg.version !== '0.87.0') {
  fail(`this patch is locked to react-native 0.87.0; found ${pkg.version}.`);
}

let source = fs.readFileSync(sourcePath, 'utf8');
const functionStart = '  override fun fling(velocityY: Int) {';
const functionEnd = '\n  private fun correctFlingVelocityY';
const start = source.indexOf(functionStart);
const end = source.indexOf(functionEnd, start);
if (start === -1 || end === -1) {
  fail('could not locate ReactNestedScrollView.fling(); upstream source shape changed.');
}

const originalFunction = source.slice(start, end);
const hasPagingPath = originalFunction.includes('if (pagingEnabled)') &&
  originalFunction.includes('flingAndSnap(correctedVelocityY)');
const hasAndroidXPath = originalFunction.includes('super.fling(correctedVelocityY)');
const hasLegacyDirectScroller = originalFunction.includes('scroller.fling(') &&
  originalFunction.includes('postInvalidateOnAnimation()');

if (!hasPagingPath || !hasAndroidXPath) {
  fail('fling implementation does not match the RN 0.87 contract this patch was validated against.');
}

if (!hasLegacyDirectScroller) {
  console.log('RN 0.87 nested fling patch: PASS (AndroidX fling path already active)');
  process.exit(0);
}

if (mode === '--check') {
  fail('patch required: ordinary ReactNestedScrollView fling still bypasses AndroidX NestedScrollView.fling().');
}

const patchedFunction = `  override fun fling(velocityY: Int) {
    val correctedVelocityY = correctFlingVelocityY(velocityY)

    if (pagingEnabled) {
      flingAndSnap(correctedVelocityY)
    } else {
      // expo-material-toolbar RN 0.87 compatibility patch:
      // keep RN as the physics owner, but enter AndroidX's animated nested-scroll path so
      // NestedScrollView opens TYPE_NON_TOUCH and dispatches pre/child/post frame by frame.
      super.fling(correctedVelocityY)
    }
    handlePostTouchScrolling(0, correctedVelocityY)
  }
`;

source = source.slice(0, start) + patchedFunction + source.slice(end);
fs.writeFileSync(sourcePath, source);

console.log('RN 0.87 nested fling patch: APPLIED');
console.log(`  ${path.relative(root, sourcePath)}`);
console.log('Run `npm run check:rn087-nested-fling` to verify the installed source.');
