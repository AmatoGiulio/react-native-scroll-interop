package com.reactnativescroll.interop.reactnative

import expo.modules.materialtoolbar.BuildConfig

internal const val NATIVE_SCROLL_LOG_TAG = "ReactNativeScrollInterop"

/**
 * Diagnostic switch for per-frame nested-scroll tracing.
 *
 * Diagnostics never participate in source motion or transaction accounting. They are enabled in
 * debug builds and disabled in release builds.
 */
internal object NativeScrollTracing {
  var enabled: Boolean = BuildConfig.DEBUG
}
