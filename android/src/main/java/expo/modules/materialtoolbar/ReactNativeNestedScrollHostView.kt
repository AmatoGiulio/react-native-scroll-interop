package expo.modules.materialtoolbar

import android.content.Context
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.core.view.NestedScrollingParent3
import com.reactnativescroll.interop.reactnative.ReactNativeNestedScrollParentController
import com.reactnativescroll.interop.reactnative.ReactVerticalScrollSourceInterop
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * Standalone Expo adapter that makes a React Native vertical scroll source a descendant of a real
 * Android nested-scrolling parent.
 *
 * Source discovery remains here because this wrapper can contain an arbitrary React tree. The
 * actual transaction lifecycle and PRE/POST dispatch live in [ReactNativeNestedScrollParentController]
 * so a navigation screen that already knows its content ScrollView can reuse the same parent logic
 * without inserting this View into application code.
 */
class ReactNativeNestedScrollHostView(
  context: Context,
  appContext: AppContext,
) : ExpoView(context, appContext), NestedScrollingParent3 {

  private val nestedScrollController = ReactNativeNestedScrollParentController(this)

  // Fabric mount order is asynchronous. Discovery waits on the real native tree instead of using
  // timer guesses, and never gains transaction authority from this preparation pass.
  private var waitingForSourceLayout = false
  private val sourceLayoutListener = ViewTreeObserver.OnGlobalLayoutListener {
    if (!isAttachedToWindow) {
      stopWaitingForSourceLayout()
      return@OnGlobalLayoutListener
    }
    if (refreshNestedChromeBinding()) stopWaitingForSourceLayout()
  }

  init {
    clipChildren = false
    clipToPadding = false
  }

  override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
    nestedScrollController.traceTouchEvent(ev)
    return super.dispatchTouchEvent(ev)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    NativeNestedScrollRegistry.registerHost(this)
  }

  override fun onDetachedFromWindow() {
    NativeNestedScrollRegistry.unregisterHost(this)
    stopWaitingForSourceLayout()
    nestedScrollController.onOwnerDetached()
    super.onDetachedFromWindow()
  }

  fun addHostChild(child: View, index: Int) {
    addView(child, index)
    requestNestedChromeBindingRefresh()
  }

  fun removeHostChild(child: View) {
    removeView(child)
    requestNestedChromeBindingRefresh()
  }

  fun removeHostChildAt(index: Int) {
    removeViewAt(index)
    requestNestedChromeBindingRefresh()
  }

  fun requestNestedChromeBindingRefresh() {
    if (!isAttachedToWindow) return
    post {
      if (!isAttachedToWindow) return@post
      if (refreshNestedChromeBinding()) {
        stopWaitingForSourceLayout()
      } else {
        startWaitingForSourceLayout()
      }
    }
  }

  /**
   * Prepare the unique supported RN vertical source before the first gesture.
   *
   * Discovery is wrapper-specific. Once a source is known, all preparation and subsequent Android
   * nested-scroll transaction handling is delegated to [ReactNativeNestedScrollParentController].
   */
  fun refreshNestedChromeBinding(): Boolean {
    if (!isAttachedToWindow) return false

    val reactSources = mutableListOf<ViewGroup>()
    collectReactVerticalScrollSources(this, reactSources)
    if (reactSources.isEmpty()) {
      nestedScrollController.traceNoReactVerticalSource(childCount)
      return false
    }

    reactSources.forEach(nestedScrollController::ensureNestedScrollingEnabled)

    if (reactSources.size != 1) {
      nestedScrollController.traceAmbiguousReactSources(reactSources.size)
      return true
    }

    return nestedScrollController.prepareNestedSource(reactSources.single())
  }

  private fun startWaitingForSourceLayout() {
    if (waitingForSourceLayout) return
    val observer = viewTreeObserver
    if (!observer.isAlive) return
    observer.addOnGlobalLayoutListener(sourceLayoutListener)
    waitingForSourceLayout = true
  }

  private fun stopWaitingForSourceLayout() {
    if (!waitingForSourceLayout) return
    val observer = viewTreeObserver
    if (observer.isAlive) observer.removeOnGlobalLayoutListener(sourceLayoutListener)
    waitingForSourceLayout = false
  }

  // ---------------------------------------------------------------------------
  // NestedScrollingParent3 adapter surface.
  // ---------------------------------------------------------------------------

  override fun onStartNestedScroll(child: View, target: View, axes: Int): Boolean =
    nestedScrollController.onStartNestedScroll(child, target, axes)

  override fun onNestedScrollAccepted(child: View, target: View, axes: Int) =
    nestedScrollController.onNestedScrollAccepted(child, target, axes)

  override fun onStopNestedScroll(target: View) =
    nestedScrollController.onStopNestedScroll(target)

  override fun onNestedPreScroll(target: View, dx: Int, dy: Int, consumed: IntArray) =
    nestedScrollController.onNestedPreScroll(target, dx, dy, consumed)

  override fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
  ) = nestedScrollController.onNestedScroll(
    target,
    dxConsumed,
    dyConsumed,
    dxUnconsumed,
    dyUnconsumed,
  )

  override fun onNestedPreFling(target: View, velocityX: Float, velocityY: Float): Boolean =
    nestedScrollController.onNestedPreFling(target, velocityX, velocityY)

  override fun onNestedFling(
    target: View,
    velocityX: Float,
    velocityY: Float,
    consumed: Boolean,
  ): Boolean = nestedScrollController.onNestedFling(target, velocityX, velocityY, consumed)

  override fun getNestedScrollAxes(): Int = nestedScrollController.getNestedScrollAxes()

  override fun onStartNestedScroll(child: View, target: View, axes: Int, type: Int): Boolean =
    nestedScrollController.onStartNestedScroll(child, target, axes, type)

  override fun onNestedScrollAccepted(child: View, target: View, axes: Int, type: Int) =
    nestedScrollController.onNestedScrollAccepted(child, target, axes, type)

  override fun onStopNestedScroll(target: View, type: Int) =
    nestedScrollController.onStopNestedScroll(target, type)

  override fun onNestedPreScroll(
    target: View,
    dx: Int,
    dy: Int,
    consumed: IntArray,
    type: Int,
  ) = nestedScrollController.onNestedPreScroll(target, dx, dy, consumed, type)

  override fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
    type: Int,
  ) = nestedScrollController.onNestedScroll(
    target,
    dxConsumed,
    dyConsumed,
    dxUnconsumed,
    dyUnconsumed,
    type,
  )

  override fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
    type: Int,
    consumed: IntArray,
  ) = nestedScrollController.onNestedScroll(
    target,
    dxConsumed,
    dyConsumed,
    dxUnconsumed,
    dyUnconsumed,
    type,
    consumed,
  )

  private fun collectReactVerticalScrollSources(view: View, output: MutableList<ViewGroup>) {
    if (view !== this) ReactVerticalScrollSourceInterop.asSupported(view)?.let(output::add)
    if (view !is ViewGroup) return
    for (index in 0 until view.childCount) {
      collectReactVerticalScrollSources(view.getChildAt(index), output)
    }
  }
}
