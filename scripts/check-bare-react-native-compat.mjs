import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  ensureBareReactNativeSourceBuildSettings,
} = require('../plugin/bareReactNativeScrollCompat.js');

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

console.log('Bare React Native compatibility adapter invariant: PASS');
console.log('  standard RN community settings.gradle shape is required');
console.log('  ReactAndroid source substitution is added idempotently');
console.log('  Hermes remains on the prebuilt Android artifact path');
console.log('  Expo autolinking is not required by the bare adapter');
console.log('  partial or conflicting source-build shapes fail closed');
