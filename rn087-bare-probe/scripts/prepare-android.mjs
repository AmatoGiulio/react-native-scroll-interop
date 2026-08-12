#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const pluginRoot = path.join(root, 'node_modules', '@react-native', 'gradle-plugin');
const copies = [
  ['gradlew', path.join('android', 'gradlew')],
  [path.join('gradle', 'wrapper', 'gradle-wrapper.jar'), path.join('android', 'gradle', 'wrapper', 'gradle-wrapper.jar')],
  [path.join('gradle', 'wrapper', 'gradle-wrapper.properties'), path.join('android', 'gradle', 'wrapper', 'gradle-wrapper.properties')],
];

for (const [sourceRelative, targetRelative] of copies) {
  const source = path.join(pluginRoot, sourceRelative);
  const target = path.join(root, targetRelative);
  if (!fs.existsSync(source)) {
    console.error(`Missing RN 0.87 Gradle wrapper artifact: ${source}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.copyFileSync(source, target);
}

fs.chmodSync(path.join(root, 'android', 'gradlew'), 0o755);

const wrapperProperties = fs.readFileSync(
  path.join(root, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties'),
  'utf8',
);
if (!wrapperProperties.includes('gradle-9.4.1-bin.zip')) {
  console.error('Expected the RN 0.87 Gradle 9.4.1 wrapper.');
  process.exit(1);
}

console.log('RN 0.87 Android wrapper prepared from @react-native/gradle-plugin 0.87.0');
