import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  ensureBareReactNativeSourceBuildSettings,
} = require('../plugin/bareReactNativeScrollCompat.js');
const {
  resolveReactNativePrebuiltHermesCoordinate,
} = require('../plugin/reactNativeScrollCompatPatch.js');

const templateSettings = `pluginManagement { includeBuild("../node_modules/@react-native/gradle-plugin") }
plugins { id("com.facebook.react.settings") }
extensions.configure(com.facebook.react.ReactSettingsExtension){ ex -> ex.autolinkLibrariesFromCommand() }
rootProject.name = 'BareGate'
include ':app'
includeBuild('../node_modules/@react-native/gradle-plugin')
`;

const patched = ensureBareReactNativeSourceBuildSettings(templateSettings);

assert.match(patched, /REACT_NATIVE_SCROLL_INTEROP_SOURCE_BUILD/);
assert.match(patched, /includeBuild\("\.\.\/node_modules\/react-native"\)/);
assert.match(
  patched,
  /substitute\(module\("com\.facebook\.react:react-android"\)\)\.using\(project\(":packages:react-native:ReactAndroid"\)\)/
);
assert.match(
  patched,
  /substitute\(module\("com\.facebook\.react:react-native"\)\)\.using\(project\(":packages:react-native:ReactAndroid"\)\)/
);
assert.doesNotMatch(patched, /hermes-android|hermes-engine/);
assert.doesNotMatch(patched, /expoAutolinking/);
assert.equal(ensureBareReactNativeSourceBuildSettings(patched), patched);

assert.throws(
  () =>
    ensureBareReactNativeSourceBuildSettings(
      `${templateSettings}\nincludeBuild("../node_modules/react-native")\n`
    ),
  /partial or conflicting bare React Native source-build configuration/
);

assert.throws(
  () =>
    ensureBareReactNativeSourceBuildSettings(
      `${templateSettings}\nsubstitute(module("com.facebook.react:hermes-android"))\n`
    ),
  /Hermes must remain on the prebuilt Android artifact/
);

assert.throws(
  () => ensureBareReactNativeSourceBuildSettings("rootProject.name = 'Unsupported'\n"),
  /does not match the validated React Native community template shape/
);

const rn087HermesRoot = mkdtempSync(path.join(tmpdir(), 'rnsi-rn087-hermes-'));
try {
  const reactNativeRoot = path.join(rn087HermesRoot, 'react-native');
  const consumerRoot = path.join(rn087HermesRoot, 'consumer');
  mkdirSync(path.join(reactNativeRoot, 'ReactAndroid'), { recursive: true });
  mkdirSync(path.join(reactNativeRoot, 'sdks', 'hermes-engine'), { recursive: true });
  mkdirSync(path.join(consumerRoot, 'android'), { recursive: true });

  writeFileSync(
    path.join(reactNativeRoot, 'package.json'),
    JSON.stringify({ name: 'react-native', version: '0.87.0-rc.3' })
  );
  writeFileSync(
    path.join(reactNativeRoot, 'ReactAndroid', 'gradle.properties'),
    'react.internal.hermesPublishingGroup=com.facebook.hermes\n'
  );
  writeFileSync(
    path.join(reactNativeRoot, 'sdks', 'hermes-engine', 'version.properties'),
    'HERMES_VERSION_NAME=250829098.0.14\n'
  );
  writeFileSync(
    path.join(consumerRoot, 'android', 'gradle.properties'),
    'hermesV1Enabled=false\nreact.hermesV1Enabled=false\n'
  );

  assert.equal(
    resolveReactNativePrebuiltHermesCoordinate(reactNativeRoot, consumerRoot),
    'com.facebook.hermes:hermes-android:250829098.0.14',
    'RN 0.87 must use the unified HERMES_VERSION_NAME and ignore removed Hermes V1 toggles'
  );

  writeFileSync(
    path.join(reactNativeRoot, 'sdks', 'hermes-engine', 'version.properties'),
    'HERMES_V1_VERSION_NAME=250829098.0.14\n'
  );
  assert.throws(
    () => resolveReactNativePrebuiltHermesCoordinate(reactNativeRoot, consumerRoot),
    /Invalid React Native Hermes metadata for HERMES_VERSION_NAME/
  );
} finally {
  rmSync(rn087HermesRoot, { recursive: true, force: true });
}

console.log('Bare React Native compatibility adapter invariant: PASS');
console.log('  standard RN community settings.gradle shape is required');
console.log('  ReactAndroid source substitution is added idempotently');
console.log('  Hermes remains on the prebuilt Android artifact path');
console.log('  RN 0.87 unified Hermes metadata is resolved without removed V1 toggles');
console.log('  Expo autolinking is not required by the bare adapter');
console.log('  partial or conflicting source-build shapes fail closed');
