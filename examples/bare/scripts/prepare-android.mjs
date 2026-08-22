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
    console.error(`Missing React Native Gradle wrapper artifact: ${source}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.copyFileSync(source, target);
}

fs.chmodSync(path.join(root, 'android', 'gradlew'), 0o755);
console.log('Android Gradle wrapper prepared from @react-native/gradle-plugin.');
