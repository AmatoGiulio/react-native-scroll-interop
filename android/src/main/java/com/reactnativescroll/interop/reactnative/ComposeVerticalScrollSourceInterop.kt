package com.reactnativescroll.interop.reactnative

import android.view.View
import android.view.ViewGroup
import java.util.function.BiConsumer

/**
 * POC boundary for a Compose scrollable that participates in Android View nested scrolling through
 * rememberNestedScrollInteropConnection().
 *
 * Compose's default interop connection is created from LocalView.current. In a hosted composition
 * the Android nested-scroll callback target is the internal AndroidComposeView, while the outer
 * hierarchy can carry optional source-owned geometry. Keep
 * target admission exact, reflection-free and compile-time Compose-free; use the ancestor chain
 * only to locate that optional source capability.
 */
internal object ComposeVerticalScrollSourceInterop {
  private const val ANDROID_COMPOSE_VIEW_CLASS = "androidx.compose.ui.platform.AndroidComposeView"
  private const val GEOMETRY_SINK_ID_NAME =
    "react_native_scroll_interop_compose_geometry_sink"

  data class Capabilities(
    val view: ViewGroup,
    val scrollAwayGeometry: AndroidScrollAwayGeometry?,
  )

  fun resolve(source: View): Capabilities? {
    val group = source as? ViewGroup ?: return null
    if (!hasClassInHierarchy(source, ANDROID_COMPOSE_VIEW_CLASS)) return null
    return Capabilities(
      view = group,
      scrollAwayGeometry = findScrollAwayGeometry(source),
    )
  }

  @Suppress("UNCHECKED_CAST")
  private fun findScrollAwayGeometry(source: View): AndroidScrollAwayGeometry? {
    val tagId = source.resources.getIdentifier(
      GEOMETRY_SINK_ID_NAME,
      "id",
      source.context.packageName,
    )
    if (tagId == 0) return null

    var current: View? = source
    while (current != null) {
      val candidate = current.getTag(tagId)
      if (candidate is BiConsumer<*, *>) {
        return ComposeScrollAwayGeometry(
          owner = current,
          sink = candidate as BiConsumer<Int, Float>,
        )
      }
      current = current.parent as? View
    }
    return null
  }

  private fun hasClassInHierarchy(view: View, expectedName: String): Boolean {
    var type: Class<*>? = view.javaClass
    while (type != null) {
      if (type.name == expectedName) return true
      type = type.superclass
    }
    return false
  }

  private class ComposeScrollAwayGeometry(
    override val owner: View,
    private val sink: BiConsumer<Int, Float>,
  ) : AndroidScrollAwayGeometry {
    override fun update(expandedHeightPx: Int, collapseAmountPx: Float) {
      sink.accept(expandedHeightPx, collapseAmountPx)
    }
  }
}
