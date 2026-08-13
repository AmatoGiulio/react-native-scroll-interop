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

  final override val pointerEvents: PointerEvents
    get() = PointerEvents.BOX_NONE

  protected val composeView: ComposeView = ComposeView(context).apply {
    setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
  }

  private var hostMeasurePending = false
  private var lastNativeImeVisible: Boolean? = null
  private var lastTraceIncomingImeVisible: Boolean? = null
  private var lastRootImeVisible: Boolean? = null

  init {
    isClickable = false
    isFocusable = false
    addView(composeView)
  }

  protected abstract fun onMeasureComposeChild(hostWidthPx: Int, hostHeightPx: Int)

  protected open fun onNativeImeVisibilityChanged(visible: Boolean) = Unit

  protected fun scheduleHostMeasureAndLayout() {
    if (hostMeasurePending) return
    hostMeasurePending = true
    post {
      if (!isAttachedToWindow || width <= 0 || height <= 0) {
        hostMeasurePending = false
        return@post
      }

      val hostWidth = width
      val hostHeight = height
      onMeasureComposeChild(hostWidth, hostHeight)
      onLayout(false, left, top, right, bottom)
      hostMeasurePending = false

      if (composeView.isLayoutRequested) {
        scheduleHostMeasureAndLayout()
      }
    }
  }

  override fun requestLayout() {
    super.requestLayout()
    if (!isAttachedToWindow) return
    scheduleHostMeasureAndLayout()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    scheduleHostMeasureAndLayout()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    if (!isAttachedToWindow || w <= 0 || h <= 0) return
    scheduleHostMeasureAndLayout()
  }

  override fun onApplyWindowInsets(insets: android.view.WindowInsets): android.view.WindowInsets {
    val applied = super.onApplyWindowInsets(insets)
    val incomingImeVisible = WindowInsetsCompat
      .toWindowInsetsCompat(applied, this)
      .isVisible(WindowInsetsCompat.Type.ime())

    // Let Compose consume the new inset snapshot first. On IME close this means the toolbar can be
    // made visible only after the child has already received the non-IME geometry.
    composeView.dispatchApplyWindowInsets(applied)

    if (incomingImeVisible != lastNativeImeVisible) {
      lastNativeImeVisible = incomingImeVisible
      onNativeImeVisibilityChanged(incomingImeVisible)
    }

    traceImeInsets(applied)
    scheduleHostMeasureAndLayout()
    return applied
  }

  private fun traceImeInsets(insets: android.view.WindowInsets) {
    if (!NativeScrollTracing.enabled) return

    val incomingImeVisible = WindowInsetsCompat
      .toWindowInsetsCompat(insets, this)
      .isVisible(WindowInsetsCompat.Type.ime())
    val rootImeVisible = ViewCompat
      .getRootWindowInsets(this)
      ?.isVisible(WindowInsetsCompat.Type.ime())

    if (
      incomingImeVisible == lastTraceIncomingImeVisible &&
      rootImeVisible == lastRootImeVisible
    ) {
      return
    }

    lastTraceIncomingImeVisible = incomingImeVisible
    lastRootImeVisible = rootImeVisible
    logImeSnapshot("apply", incomingImeVisible, rootImeVisible)

    post {
      if (!isAttachedToWindow || !NativeScrollTracing.enabled) return@post
      val postedRootImeVisible = ViewCompat
        .getRootWindowInsets(this)
        ?.isVisible(WindowInsetsCompat.Type.ime())
      logImeSnapshot("post", incomingImeVisible, postedRootImeVisible)
    }
  }

  private fun logImeSnapshot(
    phase: String,
    incomingImeVisible: Boolean,
    rootImeVisible: Boolean?,
  ) {
    val visibility = when (composeView.visibility) {
      View.VISIBLE -> "VISIBLE"
      View.INVISIBLE -> "INVISIBLE"
      View.GONE -> "GONE"
      else -> composeView.visibility.toString()
    }

    Log.d(
      NATIVE_SCROLL_LOG_TAG,
      "CHROME_IME phase=$phase hostClass=${javaClass.simpleName} " +
        "incoming=$incomingImeVisible root=$rootImeVisible " +
        "host=${width}x${height} " +
        "composeMeasured=${composeView.measuredWidth}x${composeView.measuredHeight} " +
        "composeBounds=${composeView.left},${composeView.top},${composeView.right},${composeView.bottom} " +
        "composeVisibility=$visibility layoutRequested=${composeView.isLayoutRequested}",
    )
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val width = View.MeasureSpec.getSize(widthMeasureSpec)
    val height = View.MeasureSpec.getSize(heightMeasureSpec)
    setMeasuredDimension(width, height)

    if (!isAttachedToWindow) return
    onMeasureComposeChild(width, height)
  }
}