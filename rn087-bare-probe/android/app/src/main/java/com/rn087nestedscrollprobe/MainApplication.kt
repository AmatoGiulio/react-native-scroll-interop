package com.rn087nestedscrollprobe

import android.app.Application
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android
import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsProvider

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList = PackageList(this).packages,
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)

    val requested = BuildConfig.RN_NESTED_SCROLL_ANDROID
    val previouslyAccessedFlags =
      if (requested) {
        ReactNativeFeatureFlags.dangerouslyForceOverride(
          object : ReactNativeFeatureFlagsProvider by ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android() {
            override fun useNestedScrollViewAndroid(): Boolean = true
          },
        )
      } else {
        null
      }

    check(previouslyAccessedFlags?.contains("useNestedScrollViewAndroid") != true) {
      "useNestedScrollViewAndroid was accessed before the probe override: $previouslyAccessedFlags"
    }

    val enabled = ReactNativeFeatureFlags.useNestedScrollViewAndroid()
    check(enabled == requested) {
      "RN 0.87 nested-scroll flag mismatch: requested=$requested enabled=$enabled"
    }

    Log.i(
      "Rn087NestedScroll",
      "enabled=$enabled requested=$requested previouslyAccessed=$previouslyAccessedFlags",
    )
  }
}
