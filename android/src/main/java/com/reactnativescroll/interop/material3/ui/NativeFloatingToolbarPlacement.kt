@file:OptIn(androidx.compose.material3.ExperimentalMaterial3ExpressiveApi::class)

package com.reactnativescroll.interop.material3.ui

import android.util.Log
import android.view.View
import android.view.ViewGroup
import androidx.compose.material3.FloatingToolbarDefaults
import androidx.compose.ui.platform.ComposeView
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import com.reactnativescroll.interop.NATIVE_SCROLL_LOG_TAG
import com.reactnativescroll.interop.NativeScrollTracing
import java.util.WeakHashMap
import kotlin.math.max
import kotlin.math.roundToInt

internal object NativeFloatingToolbarPlacement {
  private data class State(
    var alignment: String = "bottomCenter",
    var insets: String = "safe",
    var edgeDp: Float? = null,
    var ime: String = "none",
    var system: Insets = Insets.NONE,
    var keyboard: Insets = Insets.NONE,
    var callback: Boolean = false,
  )

  private val states = WeakHashMap<MaterialToolbarView, State>()

  fun alignment(v: MaterialToolbarView, x: String) { state(v).alignment = x; apply(v) }
  fun insets(v: MaterialToolbarView, x: String) { state(v).insets = if (x == "none") "none" else "safe"; apply(v) }
  fun edge(v: MaterialToolbarView, x: Float?) { state(v).edgeDp = x?.coerceAtLeast(0f); apply(v) }
  fun ime(v: MaterialToolbarView, x: String) { state(v).ime = if (x == "hide") "hide" else "none"; apply(v) }

  fun windowInsets(host: ViewGroup, x: WindowInsetsCompat) {
    val v = host as? MaterialToolbarView ?: return
    update(v, state(v), x)
  }

  fun afterLayout(host: ViewGroup, child: ComposeView) {
    if (host is MaterialToolbarView) apply(host, child)
  }

  fun apply(host: ViewGroup, childOverride: ComposeView? = null): Insets? {
    val v = host as? MaterialToolbarView ?: return null
    val s = state(v)
    val i = resolved(s)
    val child = childOverride ?: (v.getChildAt(0) as? ComposeView) ?: return i
    if (v.width <= 0 || v.height <= 0 || child.measuredWidth <= 0 || child.measuredHeight <= 0) return i
    val w = v.width
    val h = v.height
    val cw = child.measuredWidth.coerceAtMost(w)
    val ch = child.measuredHeight.coerceAtMost(h)
    val edge = (((s.edgeDp ?: FloatingToolbarDefaults.ScreenOffset.value) * v.resources.displayMetrics.density).roundToInt()).coerceAtLeast(0)
    val rtl = v.layoutDirection == View.LAYOUT_DIRECTION_RTL
    val x = when {
      s.alignment.endsWith("Start") -> if (rtl) w - i.right - edge - cw else i.left + edge
      s.alignment.endsWith("End") -> if (rtl) i.left + edge else w - i.right - edge - cw
      else -> (w - cw) / 2
    }.coerceIn(0, (w - cw).coerceAtLeast(0))
    val y = when {
      s.alignment.startsWith("top") -> i.top + edge
      s.alignment.startsWith("bottom") -> h - i.bottom - edge - ch
      else -> (h - ch) / 2
    }.coerceIn(0, (h - ch).coerceAtLeast(0))
    child.layout(x, y, x + cw, y + ch)
    if (NativeScrollTracing.enabled) Log.d(
      NATIVE_SCROLL_LOG_TAG,
      "TOOLBAR_LAYOUT alignment=${s.alignment} host=${w}x$h visible=${i.left},${i.top},${i.right},${i.bottom} edge=$edge compose=${cw}x$ch pos=$x,$y-${x + cw},${y + ch}",
    )
    return i
  }

  private fun state(v: MaterialToolbarView): State {
    val s = states.getOrPut(v) { State() }
    if (!s.callback) {
      s.callback = true
      ViewCompat.setWindowInsetsAnimationCallback(
        v,
        object : WindowInsetsAnimationCompat.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
          override fun onProgress(
            x: WindowInsetsCompat,
            a: MutableList<WindowInsetsAnimationCompat>,
          ): WindowInsetsCompat {
            update(v, s, x)
            return x
          }
        },
      )
      ViewCompat.getRootWindowInsets(v)?.let { update(v, s, it) }
    }
    return s
  }

  private fun update(v: MaterialToolbarView, s: State, x: WindowInsetsCompat) {
    val system = x.getInsets(
      WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
    )
    val keyboard = x.getInsets(WindowInsetsCompat.Type.ime())
    if (system == s.system && keyboard == s.keyboard) return
    s.system = system
    s.keyboard = keyboard
    apply(v)
    if (NativeScrollTracing.enabled) Log.d(
      NATIVE_SCROLL_LOG_TAG,
      "TOOLBAR_INSETS system=${system.left},${system.top},${system.right},${system.bottom} ime=${keyboard.left},${keyboard.top},${keyboard.right},${keyboard.bottom}",
    )
  }

  private fun resolved(s: State): Insets {
    if (s.insets != "safe") return Insets.NONE
    if (s.ime == "hide") return s.system
    return Insets.of(
      max(s.system.left, s.keyboard.left),
      max(s.system.top, s.keyboard.top),
      max(s.system.right, s.keyboard.right),
      max(s.system.bottom, s.keyboard.bottom),
    )
  }
}
