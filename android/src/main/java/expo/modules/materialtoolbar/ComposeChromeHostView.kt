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
 * completing the child pass against the bounds React Native already assigned is what keeps the two
 * in sync. The host never asks Android to reposition itself; it only remeasures and relays out its
 * Compose child inside the Fabric-owned rectangle.
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
   * Complete a Compose-child measure/layout pass on the next message, coalescing the many requests a
   * single recomposition can raise into one.
   *
   * Do not delegate this retry through the parent ViewGroup's requestLayout chain: Fabric owns that
   * chain and may already consider the native host laid out. Instead use the host's current non-zero
   * Fabric bounds directly, measure the Compose child, then dispatch this host's child-layout method.
   */
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
      onLayout(
        false,
        left,
        top,
        right,
        bottom,
      )
      hostMeasurePending = false

      // A first expanded TopAppBar layout can pin its Compose surface and request one follow-up pass.
      // Honour that request without involving the Fabric parent and without spinning while stable.
      if (composeView.isLayoutRequested) {
        scheduleHostMeasureAndLayout()
      }
    }
  }

  /**
   * Honour Android-level size requests that can genuinely change this Compose surface. React Native
   * owns the parent geometry through Yoga, so such requests otherwise stop at the first RN parent.
   *
   * A continuously-collapsing TopAppBar must not make the Android surface itself change size each
   * frame; that host pins a fixed Compose root after its expanded geometry is known. With fixed root
   * constraints Compose can remeasure the inner app bar during its own draw pass, while this bridge
   * remains responsible only for real host-geometry changes (insets, variant, font/configuration).
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
    // Fabric can attach this host either before or after final Yoga bounds have reached Android.
    // The posted pass handles the latter immediately; onSizeChanged closes the former ordering.
    scheduleHostMeasureAndLayout()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    if (!isAttachedToWindow || w <= 0 || h <= 0) return
    scheduleHostMeasureAndLayout()
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val width = View.MeasureSpec.getSize(widthMeasureSpec)
    val height = View.MeasureSpec.getSize(heightMeasureSpec)
    setMeasuredDimension(width, height)

    // AbstractComposeView creates its composition on the first measure, and creating it requires a
    // window: it resolves the recomposer from the view tree. Fabric measures a view before attaching
    // it, so skip the child while detached; attach/size-change will run the child pass directly.
    if (!isAttachedToWindow) return

    onMeasureComposeChild(width, height)
  }
}
