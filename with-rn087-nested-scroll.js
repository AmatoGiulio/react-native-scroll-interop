const fs = require('node:fs');
const {withMainApplication, withSettingsGradle} = require('@expo/config-plugins');

const SUPPORTED_RN_VERSION = '0.87.0';
const MAIN_MARKER = 'EXPO_MATERIAL_TOOLBAR_RN087_NESTED_SCROLL';
const SETTINGS_MARKER = 'EXPO_MATERIAL_TOOLBAR_RN087_BUILD_FROM_SOURCE';

function readReactNativeVersion(projectRoot) {
  const packagePath = require.resolve('react-native/package.json', {paths: [projectRoot]});
  return JSON.parse(fs.readFileSync(packagePath, 'utf8')).version;
}

function assertSupportedVersion(projectRoot) {
  const version = readReactNativeVersion(projectRoot);
  if (version !== SUPPORTED_RN_VERSION) {
    throw new Error(
      `expo-material-toolbar RN nested-scroll compatibility is locked to react-native ${SUPPORTED_RN_VERSION}; found ${version}. ` +
        'Remove this plugin or use a compatibility path validated for that RN version.',
    );
  }
}

function withRn087SourceBuild(config) {
  return withSettingsGradle(config, config => {
    assertSupportedVersion(config.modRequest.projectRoot);
    if (config.modResults.language !== 'groovy') {
      throw new Error('RN 0.87 nested-scroll compatibility expects a Groovy settings.gradle.');
    }

    const contents = config.modResults.contents;
    if (contents.includes(SETTINGS_MARKER)) return config;

    const sourceBuild = `\n// ${SETTINGS_MARKER}\n` +
      '// RN 0.87.0 compatibility: the nested-fling fix lives in the npm source tree, so the app\n' +
      '// must compile react-android from that exact source instead of consuming the Maven AAR.\n' +
      "includeBuild('../node_modules/react-native') {\n" +
      '  dependencySubstitution {\n' +
      '    substitute module("com.facebook.react:react-android") using project(":packages:react-native:ReactAndroid")\n' +
      '    substitute module("com.facebook.react:react-native") using project(":packages:react-native:ReactAndroid")\n' +
      '    substitute module("com.facebook.react:hermes-android") using project(":packages:react-native:ReactAndroid:hermes-engine")\n' +
      '    substitute module("com.facebook.react:hermes-engine") using project(":packages:react-native:ReactAndroid:hermes-engine")\n' +
      '  }\n' +
      '}\n';

    config.modResults.contents = contents.trimEnd() + '\n' + sourceBuild;
    return config;
  });
}

function withRn087FeatureFlag(config) {
  return withMainApplication(config, config => {
    const projectRoot = config.modRequest.projectRoot;
    assertSupportedVersion(projectRoot);

    if (config.modResults.language !== 'kt') {
      throw new Error('RN 0.87 nested-scroll opt-in requires a Kotlin MainApplication.');
    }

    let contents = config.modResults.contents;
    if (contents.includes(MAIN_MARKER)) return config;

    const importAnchor = 'import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint\n';
    if (!contents.includes(importAnchor)) {
      throw new Error('Could not locate the RN DefaultNewArchitectureEntryPoint import.');
    }

    contents = contents.replace(
      importAnchor,
      importAnchor +
        'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags\n' +
        'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android\n' +
        'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsProvider\n',
    );

    const loadAnchor = '    loadReactNative(this)\n';
    if (!contents.includes(loadAnchor)) {
      throw new Error('Could not locate loadReactNative(this) in MainApplication.kt.');
    }

    const optIn = `    // ${MAIN_MARKER}\n` +
      '    val nestedScrollPreviouslyAccessedFlags = ReactNativeFeatureFlags.dangerouslyForceOverride(\n' +
      '      object : ReactNativeFeatureFlagsProvider by ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android() {\n' +
      '        override fun useNestedScrollViewAndroid(): Boolean = true\n' +
      '      }\n' +
      '    )\n' +
      '    check(nestedScrollPreviouslyAccessedFlags?.contains("useNestedScrollViewAndroid") != true) {\n' +
      '      "useNestedScrollViewAndroid was accessed before expo-material-toolbar could opt in: $nestedScrollPreviouslyAccessedFlags"\n' +
      '    }\n' +
      '    check(ReactNativeFeatureFlags.useNestedScrollViewAndroid()) {\n' +
      '      "expo-material-toolbar failed to enable useNestedScrollViewAndroid"\n' +
      '    }\n';

    config.modResults.contents = contents.replace(loadAnchor, loadAnchor + optIn);
    return config;
  });
}

/**
 * Explicit React Native 0.87.0 compatibility opt-in.
 *
 * This plugin does two version-locked things:
 * 1. builds react-android from node_modules/react-native so the maintained source patch is real;
 * 2. enables useNestedScrollViewAndroid immediately after RN installs its Stable provider, changing
 *    only that flag and aborting if it was already read.
 *
 * The source patch itself remains explicit: run `npm run patch:rn087-nested-fling` in this repo, or
 * the equivalent packaged setup command, before the Android build. The plugin never silently edits
 * React Native source.
 */
module.exports = function withRn087NestedScroll(config, options = {}) {
  if (options.enabled === false) return config;
  config = withRn087SourceBuild(config);
  config = withRn087FeatureFlag(config);
  return config;
};
