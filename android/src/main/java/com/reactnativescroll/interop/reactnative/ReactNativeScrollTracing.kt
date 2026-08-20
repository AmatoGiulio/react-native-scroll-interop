package com.reactnativescroll.interop.reactnative

import com.reactnativescroll.interop.NativeScrollTracing as RootNativeScrollTracing

internal const val NATIVE_SCROLL_LOG_TAG = "ReactNativeScrollInterop"

/** RN-boundary view of the module-wide diagnostic switch. */
internal object NativeScrollTracing {
  val enabled: Boolean
    get() = RootNativeScrollTracing.enabled
}
