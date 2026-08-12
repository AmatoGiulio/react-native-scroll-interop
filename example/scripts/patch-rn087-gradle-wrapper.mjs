#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const wrapperPath = path.join(
  process.cwd(),
  'android',
  'gradle',
  'wrapper',
  'gradle-wrapper.properties',
);

if (!fs.existsSync(wrapperPath)) {
  console.error(`RN 0.87 Gradle wrapper gate: FAIL\nMissing ${wrapperPath}`);
  process.exit(1);
}

const expectedVersion = '9.4.1';
const expectedUrl = `https\\://services.gradle.org/distributions/gradle-${expectedVersion}-bin.zip`;
const current = fs.readFileSync(wrapperPath, 'utf8');
const next = current.replace(
  /^distributionUrl=.*$/m,
  `distributionUrl=${expectedUrl}`,
);

if (next === current && !current.includes(`gradle-${expectedVersion}-bin.zip`)) {
  console.error(
    'RN 0.87 Gradle wrapper gate: FAIL\nCould not locate distributionUrl in gradle-wrapper.properties',
  );
  process.exit(1);
}

fs.writeFileSync(wrapperPath, next);

const verified = fs.readFileSync(wrapperPath, 'utf8');
if (!verified.includes(`gradle-${expectedVersion}-bin.zip`)) {
  console.error(
    `RN 0.87 Gradle wrapper gate: FAIL\nExpected Gradle ${expectedVersion} after patch.`,
  );
  process.exit(1);
}

console.log(`RN 0.87 Gradle wrapper: ${expectedVersion}`);
console.log('RN 0.87 Gradle wrapper gate: PASS');
