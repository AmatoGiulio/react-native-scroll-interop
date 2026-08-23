package com.reactnativescroll.interop.reactnative

import android.view.View
import android.view.ViewGroup

/**
 * POC boundary for a Compose scrollable that participates in Android View nested scrolling through
 * rememberNestedScrollInteropConnection().
 *
 * Compose's default interop connection is created from LocalView.current. In a hosted composition
 * that callback target is commonly the internal AndroidComposeView, while the outer Android view
 * hierarchy still contains the enclosing ComposeView. Keep this detection reflection-free and
 * compile-time Compose-free by recognizing the target through its ancestor chain.
 */
internal object ComposeVerticalScrollSourceInterop {
  private const val COMPOSE_VIEW_CLASS = "androidx.compose.ui.platform.ComposeView"
  private const val ANDROID_COMPOSE_VIEW_CLASS = "androidx.compose.ui.platform.AndroidComposeView"

  fun asSupported(source: View): ViewGroup? {
    val group = source as? ViewGroup ?: return null
    return group.takeIf { isComposeNestedScrollTarget(source) }
  }

  private fun isComposeNestedScrollTarget(source: View): Boolean {
    if (hasClassInHierarchy(source, COMPOSE_VIEW_CLASS) ||
      hasClassInHierarchy(source, ANDROID_COMPOSE_VIEW_CLASS)
    ) {
      return true
    }

    var ancestor = source.parent as? View
    while (ancestor != null) {
      if (hasClassInHierarchy(ancestor, COMPOSE_VIEW_CLASS)) return true
      ancestor = ancestor.parent as? View
    }
    return false
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
