package com.reactnativescroll.interop.reactnative

import android.view.View
import android.view.ViewGroup

/**
 * POC boundary for a Compose scrollable that participates in Android View nested scrolling through
 * rememberNestedScrollInteropConnection().
 *
 * The Android nested-scroll callback target is the hosting ComposeView, not the LazyColumn itself.
 * Keep the detection here so the transaction core stays free of a compile-time Compose dependency.
 */
internal object ComposeVerticalScrollSourceInterop {
  private const val COMPOSE_VIEW_CLASS = "androidx.compose.ui.platform.ComposeView"

  fun asSupported(source: View): ViewGroup? {
    val group = source as? ViewGroup ?: return null
    return group.takeIf { hasClassInHierarchy(source, COMPOSE_VIEW_CLASS) }
  }

  private fun hasClassInHierarchy(view: View, expectedName: String): Boolean {
    var type: Class<*>? = view.javaClass
    while (type != null) {
      if (type.name == expectedName) return true
      type = type.superclass
    }
    return false
  }
}
