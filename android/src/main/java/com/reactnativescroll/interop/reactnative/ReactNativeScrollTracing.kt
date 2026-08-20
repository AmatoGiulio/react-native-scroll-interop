package com.reactnativescroll.interop.reactnative

import android.content.Context
import android.content.pm.ApplicationInfo

internal const val NATIVE_SCROLL_LOG_TAG = "ReactNativeScrollInterop"

/**
 * Diagnostic switch for per-frame nested-scroll tracing.
 *
 * Diagnostics never participate in source motion or transaction accounting. The package initializes
 * this from the host application's debuggable flag, avoiding any dependency on a generated module
 * BuildConfig namespace.
 */
internal object NativeScrollTracing {
  @Volatile
  var enabled: Boolean = false
    private set

  fun initialize(context: Context) {
    enabled = context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
  }
}
