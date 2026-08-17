package expo.modules.materialtoolbar

import android.content.Context
import android.util.Log
import android.view.View
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.facebook.react.uimanager.PointerEvents
import com.facebook.react.uimanager.ReactPointerEventsView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

abstract class ComposeChromeHostView(
  context: Context,
  appContext: AppContext,
) : ExpoView(context, appContext), ReactPointerEventsView {
  final override val pointerEvents get() = PointerEvents.BOX_NONE

  protected val composeView = ComposeView(context).apply {
    setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindowOrReleasedFromPool)
  }

  private var measurePending = false
  private var lastNativeIme: Boolean? = null
  private var lastTraceIme: Boolean? = null
  private var lastRootIme: Boolean? = null

  init {
    isClickable = false
    isFocusable = false
    addView(composeView)
    addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
      NativeFloatingToolbarPlacement.afterLayout(this, composeView)
    }
  }

  protected abstract fun onMeasureComposeChild(hostWidthPx: Int, hostHeightPx: Int)
  protected open fun onNativeImeVisibilityChanged(visible: Boolean) = Unit

  protected fun scheduleHostMeasureAndLayout() {
    if (measurePending) return
    measurePending = true
    post {
      if (!isAttachedToWindow || width <= 0 || height <= 0) {
        measurePending = false
        return@post
      }
      onMeasureComposeChild(width, height)
      onLayout(false, left, top, right, bottom)
      NativeFloatingToolbarPlacement.afterLayout(this, composeView)
      measurePending = false
      if (composeView.isLayoutRequested) scheduleHostMeasureAndLayout()
    }
  }

  override fun requestLayout() {
    super.requestLayout()
    if (isAttachedToWindow) scheduleHostMeasureAndLayout()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    scheduleHostMeasureAndLayout()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    if (isAttachedToWindow && w > 0 && h > 0) scheduleHostMeasureAndLayout()
  }

  override fun onApplyWindowInsets(insets: android.view.WindowInsets): android.view.WindowInsets {
    val applied = super.onApplyWindowInsets(insets)
    val compat = WindowInsetsCompat.toWindowInsetsCompat(applied, this)
    val ime = compat.isVisible(WindowInsetsCompat.Type.ime())
    composeView.dispatchApplyWindowInsets(applied)
    NativeFloatingToolbarPlacement.windowInsets(this, compat)
    if (ime != lastNativeIme) {
      lastNativeIme = ime
      onNativeImeVisibilityChanged(ime)
    }
    traceInsets(applied)
    scheduleHostMeasureAndLayout()
    return applied
  }

  private fun traceInsets(insets: android.view.WindowInsets) {
    if (!NativeScrollTracing.enabled) return
    val ime = WindowInsetsCompat.toWindowInsetsCompat(insets, this)
      .isVisible(WindowInsetsCompat.Type.ime())
    val rootIme = ViewCompat.getRootWindowInsets(this)
      ?.isVisible(WindowInsetsCompat.Type.ime())
    if (ime == lastTraceIme && rootIme == lastRootIme) return
    lastTraceIme = ime
    lastRootIme = rootIme
    logInsets("apply", ime, rootIme)
    post {
      if (!isAttachedToWindow || !NativeScrollTracing.enabled) return@post
      logInsets(
        "post",
        ime,
        ViewCompat.getRootWindowInsets(this)?.isVisible(WindowInsetsCompat.Type.ime()),
      )
    }
  }

  private fun logInsets(phase: String, ime: Boolean, rootIme: Boolean?) {
    val visibility = when (composeView.visibility) {
      View.VISIBLE -> "VISIBLE"
      View.INVISIBLE -> "INVISIBLE"
      View.GONE -> "GONE"
      else -> composeView.visibility.toString()
    }
    Log.d(
      NATIVE_SCROLL_LOG_TAG,
      "CHROME_IME phase=$phase hostClass=${javaClass.simpleName} incoming=$ime root=$rootIme " +
        "host=${width}x${height} composeMeasured=${composeView.measuredWidth}x${composeView.measuredHeight} " +
        "composeBounds=${composeView.left},${composeView.top},${composeView.right},${composeView.bottom} " +
        "composeVisibility=$visibility layoutRequested=${composeView.isLayoutRequested}",
    )
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val width = View.MeasureSpec.getSize(widthMeasureSpec)
    val height = View.MeasureSpec.getSize(heightMeasureSpec)
    setMeasuredDimension(width, height)
    if (isAttachedToWindow) onMeasureComposeChild(width, height)
  }
}
