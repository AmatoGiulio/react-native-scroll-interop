const { withMainApplication } = require('@expo/config-plugins');

const MARKER = 'RN087_NESTED_SCROLL_EXPERIMENT';
const ENABLED = process.env.RN_NESTED_SCROLL_ANDROID === '1';

/**
 * Android-only React Native 0.87 experiment.
 *
 * RN 0.87 ships ReactNestedScrollView behind useNestedScrollViewAndroid=false. The normal RN
 * application entry point installs the Stable feature-flag provider during loadReactNative(), so
 * overriding the flag before that call would simply be overwritten. For the experiment we replace
 * that provider immediately after loadReactNative() returns, before the lazy ReactHost creates the
 * MainReactPackage / ScrollView manager.
 *
 * The delegated provider preserves every RN 0.87 Stable value and changes exactly one flag.
 * dangerouslyForceOverride is intentionally confined to this diagnostic host and must not become
 * production/upstream integration code.
 */
module.exports = function withRn087NestedScrollExperiment(config) {
  return withMainApplication(config, (config) => {
    if (!ENABLED) {
      return config;
    }

    if (config.modResults.language !== 'kt') {
      throw new Error('RN 0.87 nested-scroll experiment expects a Kotlin MainApplication.');
    }

    let contents = config.modResults.contents;
    if (contents.includes(MARKER)) {
      return config;
    }

    const importAnchor = 'import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint\n';
    if (!contents.includes(importAnchor)) {
      throw new Error('Could not find DefaultNewArchitectureEntryPoint import in MainApplication.kt');
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
      throw new Error('Could not find loadReactNative(this) in MainApplication.kt');
    }

    const experiment = `    // ${MARKER}\n` +
      '    val rn087PreviouslyAccessedFlags = ReactNativeFeatureFlags.dangerouslyForceOverride(\n' +
      '      object : ReactNativeFeatureFlagsProvider by ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android() {\n' +
      '        override fun useNestedScrollViewAndroid(): Boolean = true\n' +
      '      }\n' +
      '    )\n' +
      '    check(rn087PreviouslyAccessedFlags?.contains("useNestedScrollViewAndroid") != true) {\n' +
      '      "useNestedScrollViewAndroid was accessed before the RN 0.87 experiment override: $rn087PreviouslyAccessedFlags"\n' +
      '    }\n' +
      '    android.util.Log.i(\n' +
      '      "Rn087NestedScroll",\n' +
      '      "enabled=${ReactNativeFeatureFlags.useNestedScrollViewAndroid()} previouslyAccessed=$rn087PreviouslyAccessedFlags",\n' +
      '    )\n';

    config.modResults.contents = contents.replace(loadAnchor, loadAnchor + experiment);
    return config;
  });
};
