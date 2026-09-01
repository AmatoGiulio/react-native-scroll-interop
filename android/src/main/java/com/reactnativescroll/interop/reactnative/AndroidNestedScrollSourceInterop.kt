package com.reactnativescroll.interop.reactnative

import android.view.View
import android.view.ViewGroup

/** Native source-owned seam for scroll-away geometry that must update synchronously with PRE. */
internal interface AndroidScrollAwayGeometry {
  val owner: View

  fun update(expandedHeightPx: Int, collapseAmountPx: Float)
}

/**
 * Capabilities for one Android target admitted by the React Native host boundary.
 *
 * Transaction participation and React Native scroll-away geometry are deliberately separate.
 * A hosted Compose source can dispatch the real Android nested-scroll lifecycle without exposing
 * React Native's unstable scroll-away padding primitive.
 */
internal data class AndroidNestedScrollSourceCapabilities(
  val view: ViewGroup,
  val reactNative: ReactVerticalScrollSourceCapabilities?,
  val hostedScrollAwayGeometry: AndroidScrollAwayGeometry?,
) {
  val supportsReactNativeScrollAwayGeometry: Boolean
    get() = reactNative != null
}

/** Resolves supported Android nested-scroll targets without leaking source typing into consumers. */
internal object AndroidNestedScrollSourceInterop {
  fun resolve(source: View): AndroidNestedScrollSourceCapabilities? {
    ReactVerticalScrollSourceInterop.resolve(source)?.let { reactNative ->
      return AndroidNestedScrollSourceCapabilities(
        view = reactNative.view,
        reactNative = reactNative,
        hostedScrollAwayGeometry = null,
      )
    }

    val compose = ComposeVerticalScrollSourceInterop.resolve(source) ?: return null
    return AndroidNestedScrollSourceCapabilities(
      view = compose.view,
      reactNative = null,
      hostedScrollAwayGeometry = compose.scrollAwayGeometry,
    )
  }
}
