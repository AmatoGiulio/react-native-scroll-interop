const fs = require('node:fs');
const path = require('node:path');
const {withMainApplication} = require('@expo/config-plugins');

const SUPPORTED_RN_VERSION = '0.87.0';
const MARKER = 'EXPO_MATERIAL_TOOLBAR_RN087_NESTED_SCROLL';

function readReactNativeVersion(projectRoot) {
  const packagePath = require.resolve('react-native/package.json', {paths: [projectRoot]});
  return JSON.parse(fs.readFileSync(packagePath, 'utf8')).version;
}

/**
 * Explicit React Native 0.87.0 compatibility opt-in for the AndroidX-backed vertical ScrollView.
 *
 * RN 0.87's generated application entry point installs the Stable feature-flag provider during
 * loadReactNative(). Calling ordinary ReactNativeFeatureFlags.override() before or after that entry
 * point is therefore invalid: RN permits override only once. This compatibility plugin performs a
 * narrowly controlled force-override immediately after loadReactNative() and delegates every flag
 * back to RN's Stable Android provider except useNestedScrollViewAndroid.
 *
 * The changed flag must not have been accessed already. If it was, startup fails rather than
 * running with mixed ScrollView implementations.
 */
module.exports = function withRn087NestedScroll(config, options = {}) {
  if (options.enabled === false) return config;

  return withMainApplication(config, config => {
    const projectRoot = config.modRequest.projectRoot;
    const version = readReactNativeVersion(projectRoot);
    if (version !== SUPPORTED_RN_VERSION) {
      throw new Error(
        `expo-material-toolbar RN nested-scroll opt-in is locked to react-native ${SUPPORTED_RN_VERSION}; found ${version}. ` +
          'Remove this plugin or use a compatibility path validated for that RN version.',
      );
    }

    if (config.modResults.language !== 'kt') {
      throw new Error('RN 0.87 nested-scroll opt-in requires a Kotlin MainApplication.');
    }

    let contents = config.modResults.contents;
    if (contents.includes(MARKER)) return config;

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

    const optIn = `    // ${MARKER}\n` +
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
};
