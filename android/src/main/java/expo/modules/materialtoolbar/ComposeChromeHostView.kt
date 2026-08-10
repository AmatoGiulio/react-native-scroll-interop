package expo.modules.materialtoolbar

import android.content.Context
import android.view.View
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import com.facebook.react.uimanager.PointerEvents
import com.facebook.react.uimanager.ReactPointerEventsView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * Shared Android host for the Material3 Compose chrome views.
 *
 * Both chrome hosts face the same two problems, and neither belongs to a Material component: they
 * are properties of embedding a Compose surface in a React Native view tree.
 *
 * **Hit testing.** The host covers the screen so placement and safe-area can be resolved natively,
 * but only the wrap-content Compose child may be interactive. The outer ViewGroup reports
 * [PointerEvents.BOX_NONE], so touches outside that child still reach the React Native siblings
 * underneath — list rows, Pressables, the tab navigator.
 *
 * **Layout.** `ReactViewGroup.requestLayout()` is deliberately a no-op: React Native lays out its
 * own tree from Yoga and terminates the Android layout-request chain. A `requestLayout()` raised by
 * the ComposeView when its intrinsic size changes therefore dies at the first React Native ancestor
 * and never reaches ViewRootImpl, so nothing measures the Compose child again after the window
 * insets, a prop or the font scale changed what it wants to be. Observing that request here and
 * completing the pass against the bounds React Native already assigned is what keeps the two in
 * sync. This is the contract [shouldUseAndroidLayout] describes, plus the guard that stops a request
 * raised before React Native has sized the host from laying it out at 0x0.
 *
 * Subclasses describe geometry only: which measure spec the Compose child gets, and where it sits.
 */
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

  init {
    isClickable = false
    isFocusable = false
    addView(composeView)
  }

  /**
   * Measure [composeView] against the host bounds React Native assigned. Each host picks the spec
   * that matches its Material geometry — a full-width app bar is not measured like a wrap-content
   * floating toolbar — but neither may exceed the host.
   */
  protected abstract fun onMeasureComposeChild(hostWidthPx: Int, hostHeightPx: Int)

  /**
   * Complete a measure/layout pass on the next message, coalescing the many requests a single
   * recomposition can raise into one. Runs against the bounds React Native already assigned, so it
   * never fights React Native for ownership of this view's position.
   */
  protected fun scheduleHostMeasureAndLayout() {
    if (hostMeasurePending) return
    hostMeasurePending = true
    post {
      hostMeasurePending = false
      if (!isAttachedToWindow || width <= 0 || height <= 0) return@post
      measureAndLayout()
    }
  }

  /**
   * Every intrinsic-size request has to be honoured, including the one the Compose child raises on
   * each frame of a Material collapse animation. This host is the only thing that can grant the
   * child a layout pass — React Native will not — so skipping any of them starves the animation:
   * Material's state keeps advancing and the React Native content keeps scrolling, while the Compose
   * surface goes on drawing the app bar at its previous height and the list slides under it.
   *
   * (An earlier attempt gated this while the app bar animated, to avoid feeding the transient height
   * back into Material — measured as a `heightOffsetLimit` of -167.5 instead of -168 for a frame or
   * two when a drag interrupted a running snap. That sub-pixel artifact self-corrects and never
   * drifts; starving the layout is visible. The gate was the worse trade.)
   */
  override fun requestLayout() {
    super.requestLayout()
    // `addView` in this class's own initializer raises a layout request before the subclass fields
    // exist. Nothing raised before attach needs handling here: onAttachedToWindow schedules a pass.
    if (!isAttachedToWindow) return
    scheduleHostMeasureAndLayout()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    // Fabric measures this view from SurfaceMountingManager.updateLayout before attaching it, and
    // onMeasure skips the Compose child while detached. Complete that deferred pass now that a
    // window exists.
    scheduleHostMeasureAndLayout()
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val width = View.MeasureSpec.getSize(widthMeasureSpec)
    val height = View.MeasureSpec.getSize(heightMeasureSpec)
    setMeasuredDimension(width, height)

    // AbstractComposeView creates its composition on the first measure, and creating it requires a
    // window: it resolves the recomposer from the view tree. Fabric measures a view before attaching
    // it — reliably so when a screen is pushed rather than mounted with the surface — and measuring
    // the child here would throw "Cannot locate windowRecomposer". Skip it while detached;
    // onAttachedToWindow asks again.
    if (!isAttachedToWindow) return

    onMeasureComposeChild(width, height)
  }
}
