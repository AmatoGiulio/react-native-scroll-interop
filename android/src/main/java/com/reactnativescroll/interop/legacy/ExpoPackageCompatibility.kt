@file:Suppress("DEPRECATION")

package expo.modules.materialtoolbar

import android.view.View
import com.reactnativescroll.interop.material3.FloatingToolbarScrollConsumer
import com.reactnativescroll.interop.material3.TopAppBarScrollConsumer
import com.reactnativescroll.interop.reactnative.ReactNativeNestedScrollParentController

/**
 * Temporary source-compatibility shim while internal imports are migrated off the historical
 * Expo package name. It has no dependency on Expo Modules and is not a public API.
 */
@Deprecated("Internal migration shim; use com.reactnativescroll.interop.BuildConfig")
internal object BuildConfig {
  val DEBUG: Boolean
    get() = com.reactnativescroll.interop.BuildConfig.DEBUG
}

@Deprecated("Internal migration shim; use com.reactnativescroll.interop.NATIVE_SCROLL_LOG_TAG")
internal const val NATIVE_SCROLL_LOG_TAG: String = com.reactnativescroll.interop.NATIVE_SCROLL_LOG_TAG

@Deprecated("Internal migration shim; use com.reactnativescroll.interop.NativeScrollTracing")
internal object NativeScrollTracing {
  var enabled: Boolean
    get() = com.reactnativescroll.interop.NativeScrollTracing.enabled
    set(value) {
      com.reactnativescroll.interop.NativeScrollTracing.enabled = value
    }
}

@Deprecated("Internal migration shim; use the Material3 UI registry directly")
internal object NativeNestedScrollRegistry {
  fun registerScreenParent(parent: ReactNativeNestedScrollParentController) =
    com.reactnativescroll.interop.material3.ui.NativeNestedScrollRegistry.registerScreenParent(parent)

  fun unregisterScreenParent(parent: ReactNativeNestedScrollParentController) =
    com.reactnativescroll.interop.material3.ui.NativeNestedScrollRegistry.unregisterScreenParent(parent)

  fun resolveTopBar(source: View): TopAppBarScrollConsumer? =
    com.reactnativescroll.interop.material3.ui.NativeNestedScrollRegistry.resolveTopBar(source)

  fun resolveToolbar(source: View): FloatingToolbarScrollConsumer? =
    com.reactnativescroll.interop.material3.ui.NativeNestedScrollRegistry.resolveToolbar(source)
}
