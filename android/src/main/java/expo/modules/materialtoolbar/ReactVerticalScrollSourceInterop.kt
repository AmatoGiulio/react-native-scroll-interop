package expo.modules.materialtoolbar

import android.view.View
import android.view.ViewGroup
import java.lang.reflect.Method

/**
 * Compatibility boundary between the stable ReactScrollView path and the RN 0.87 generated
 * ReactNestedScrollView path.
 *
 * ReactNestedScrollView is Kotlin-internal in RN 0.87, so app/module code must not import its type.
 * Runtime class identity is used only to decide whether a View is a supported RN vertical source.
 * The actual nested-scroll transaction still comes from Android's target callback.
 *
 * Reflection is restricted to RN's unstable scroll-away geometry primitive. It never participates
 * in gesture/fling physics and is never used per frame.
 */
internal object ReactVerticalScrollSourceInterop {
  private const val LEGACY_CLASS = "com.facebook.react.views.scroll.ReactScrollView"
  private const val NESTED_CLASS = "com.facebook.react.views.scroll.ReactNestedScrollView"

  private const val MODERN_SCROLL_AWAY_METHOD = "setScrollAwayPaddingEnabledUnstable"
  private const val LEGACY_SCROLL_AWAY_METHOD = "setScrollAwayTopPaddingEnabledUnstable"

  fun asSupported(source: View): ViewGroup? {
    val group = source as? ViewGroup ?: return null
    return group.takeIf(::isSupported)
  }

  fun isSupported(source: View): Boolean =
    hasClassInHierarchy(source, LEGACY_CLASS) || hasClassInHierarchy(source, NESTED_CLASS)

  fun setScrollAwayPadding(source: ViewGroup, topPadding: Int, bottomPadding: Int): Boolean {
    val intType = Int::class.javaPrimitiveType ?: return false

    findPublicMethod(source, MODERN_SCROLL_AWAY_METHOD, intType, intType)?.let { method ->
      return invoke(method, source, topPadding, bottomPadding)
    }

    if (bottomPadding != 0) return false
    findPublicMethod(source, LEGACY_SCROLL_AWAY_METHOD, intType)?.let { method ->
      return invoke(method, source, topPadding)
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

  private fun findPublicMethod(source: ViewGroup, name: String, vararg parameters: Class<*>): Method? =
    runCatching { source.javaClass.getMethod(name, *parameters) }.getOrNull()

  private fun invoke(method: Method, source: ViewGroup, vararg args: Any): Boolean =
    runCatching { method.invoke(source, *args) }.isSuccess
}
