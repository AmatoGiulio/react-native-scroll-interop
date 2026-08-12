#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const cwd = process.cwd();
const nodeModulesRoot = path.join(cwd, 'node_modules');
const minimum = [2, 2, 0];
const targetVersion = '2.2.0';
const kotlinPluginPattern = /kotlin\("jvm"\) version "([^"]+)"/g;

function fail(message) {
  console.error(`RN 0.87 Expo Kotlin gate: FAIL\n${message}`);
  process.exit(1);
}

function compareVersion(version, expected) {
  const parsed = version.split('.').map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < expected.length; index += 1) {
    const value = parsed[index] ?? 0;
    if (value > expected[index]) return 1;
    if (value < expected[index]) return -1;
  }
  return 0;
}

function isExpoGradlePath(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  return (
    normalized.startsWith('node_modules/expo') ||
    normalized.includes('/node_modules/expo') ||
    normalized.includes('/node_modules/@expo/')
  );
}

function collectBuildGradleFiles(directory, output) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'build' || entry.name === '.gradle') continue;
      collectBuildGradleFiles(absolutePath, output);
      continue;
    }
    if (entry.isFile() && entry.name === 'build.gradle.kts') {
      const relativePath = path.relative(cwd, absolutePath);
      if (isExpoGradlePath(relativePath)) output.push(relativePath);
    }
  }
}

if (!fs.existsSync(nodeModulesRoot)) {
  fail('Missing node_modules. Run npm install from example/ first.');
}

const candidates = [];
collectBuildGradleFiles(nodeModulesRoot, candidates);
candidates.sort();

let found = 0;
let patched = 0;

for (const relativePath of candidates) {
  const absolutePath = path.join(cwd, relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  const matches = [...source.matchAll(kotlinPluginPattern)];
  if (matches.length === 0) continue;

  found += 1;
  let next = source;
  let changed = false;

  for (const match of matches) {
    const currentVersion = match[1];
    if (compareVersion(currentVersion, minimum) >= 0) continue;
    next = next.replace(
      `kotlin("jvm") version "${currentVersion}"`,
      `kotlin("jvm") version "${targetVersion}"`,
    );
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(absolutePath, next);
    patched += 1;
    console.log(`Expo Gradle Kotlin: ${relativePath} -> ${targetVersion}`);
  } else {
    const versions = matches.map((match) => match[1]).join(', ');
    console.log(`Expo Gradle Kotlin: ${relativePath} already ${versions}`);
  }
}

if (found === 0) {
  fail('No Expo Gradle plugin Kotlin builds were found under node_modules.');
}

const stale = [];
for (const relativePath of candidates) {
  const source = fs.readFileSync(path.join(cwd, relativePath), 'utf8');
  for (const match of source.matchAll(kotlinPluginPattern)) {
    if (compareVersion(match[1], minimum) < 0) {
      stale.push(`${relativePath}: ${match[1]}`);
    }
  }
}

if (stale.length > 0) {
  fail(`Kotlin JVM plugin is still below 2.2.0:\n${stale.join('\n')}`);
}

console.log(`RN 0.87 Expo Kotlin gate: PASS (${found} plugin builds, ${patched} patched)`);
