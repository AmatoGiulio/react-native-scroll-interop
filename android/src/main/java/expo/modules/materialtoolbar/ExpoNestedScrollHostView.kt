package expo.modules.materialtoolbar

import android.content.Context
import android.os.SystemClock
import android.util.Log
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import androidx.core.view.NestedScrollingChild2
import androidx.core.view.NestedScrollingParent3
import androidx.core.view.NestedScrollingParentHelper
import androidx.core.view.ViewCompat
import com.facebook.react.views.scroll.ReactScrollView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * A nested-scrolling ancestor for a React Native scroll source, so native chrome can follow it.
 *
 * Android chrome that reacts to scrolling is driven through nested scrolling. A [ReactScrollView]
 * emits those callbacks to its native ancestors, and nothing in the RN view tree listens — which is
 * why Compose Material3 behaviors, which are themselves NestedScrollConnections, cannot be reached
 * from React Native at all. Being that ancestor is the entire trick; no patch to React Native, no
 * JS involvement, no ref handed anywhere.
 *
 * There is exactly one transaction and exactly one physics.
 *
 * **The source owns the movement.** Touch comes through `ScrollView.onTouchEvent`, momentum through
 * the source's own `TYPE_NON_TOUCH` dispatch (see `docs/upstream/`). This parent runs no scroller
 * and never moves the list: it takes its share in pre-scroll, React Native scrolls the remainder
 * with its own code, and post-scroll reports what actually happened. `scrollY` therefore only ever
 * means "where React Native scrolled to".
 *
 * **Every consumer joins the same transaction**, each in its own phase: an app bar that can withhold
 * distance in pre, a floating toolbar that only watches the list in post.
 *
 * Being an explicit component the app wraps around its list is a limitation of this module, not of
 * the approach: the natural home for this is the screen layer, which already wraps screen content
 * in a view group of its own.
 */
class ExpoNestedScrollHostView(
  context: Context,
  appContext: AppContext,
) : ExpoView(context, appContext), NestedScrollingParent3 {

  private val nestedParentHelper = NestedScrollingParentHelper(this)

  private var eventSequence = 0L
  private var preCount = 0L
  private var postCount = 0L
  private var transactionCount = 0L

  private var activeTopBar: TopAppBarScrollConsumer? = null
  private var activeToolbar: FloatingToolbarScrollConsumer? = null
  private var activeSource: ReactScrollView? = null
  private var directTransactionActive = false

  // True between the source's own TYPE_NON_TOUCH start and stop. The movement is not over when the
  // finger leaves; it changes owner, and chrome must not settle in between.
  private var momentumSessionActive = false

  // The untyped platform callbacks have no consumed[] to report into; this stands in for it.
  private val throwawayConsumed = IntArray(2)

  // Temporary transaction ledger. For one frame the four quantities must add up to what was asked,
  // and none of them may be reconstructed from the frame before:
  //
  //     requested = chromePre + childConsumed + chromePost + remaining
  //
  // It also counts pre-scrolls that never got their post: android.widget.ScrollView and
  // NestedScrollView do not treat that phase the same way, and touch still goes through the former.
  private var ledgerRequestedY = 0
  private var ledgerChromePreY = 0
  private var ledgerPending = false
  private var ledgerFrames = 0L
  private var ledgerBrokenFrames = 0L
  private var ledgerOrphanPres = 0L

  init {
    clipChildren = false
    clipToPadding = false
  }

  override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
    if (NativeScrollTracing.enabled) {
      when (ev.actionMasked) {
        MotionEvent.ACTION_DOWN ->
          log("TOUCH_DOWN pointers=${ev.pointerCount} downTime=${ev.downTime}")
        MotionEvent.ACTION_UP -> log("TOUCH_UP eventTime=${ev.eventTime}")
        MotionEvent.ACTION_CANCEL -> log("TOUCH_CANCEL eventTime=${ev.eventTime}")
      }
    }
    return super.dispatchTouchEvent(ev)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    NativeNestedScrollRegistry.registerHost(this)
    post { refreshNestedChromeBinding() }
  }

  override fun onDetachedFromWindow() {
    NativeNestedScrollRegistry.unregisterHost(this)
    momentumSessionActive = false
    activeTopBar = null
    activeToolbar = null
    activeSource = null
    directTransactionActive = false
    super.onDetachedFromWindow()
  }

  fun addHostChild(child: View, index: Int) {
    addView(child, index)
    // FlashList 2.0.2 does not forward nestedScrollEnabled to the actual ReactScrollView in this
    // setup. Enable it on the real native source and prepare the scroll-away chrome binding before
    // the user can start the first gesture.
    post { refreshNestedChromeBinding() }
    postDelayed({ refreshNestedChromeBinding() }, 32L)
    postDelayed({ refreshNestedChromeBinding() }, 250L)
    postDelayed({ refreshNestedChromeBinding() }, 750L)
  }

  fun removeHostChild(child: View) {
    removeView(child)
  }

  fun removeHostChildAt(index: Int) {
    removeViewAt(index)
  }

  /** Called by the registry whenever TopAppBar behavior/geometry becomes ready. */
  fun refreshNestedChromeBinding() {
    if (!isAttachedToWindow) return
    val found = mutableListOf<View>()
    collectScrollableDescendants(this, found)
    if (found.isEmpty()) {
      log("SOURCE_TREE no-scrollable-descendant childCount=$childCount")
      return
    }

    found.forEach { view ->
      val before = ViewCompat.isNestedScrollingEnabled(view)
      if (view is android.widget.ScrollView && !before) {
        ViewCompat.setNestedScrollingEnabled(view, true)
      }
      val after = ViewCompat.isNestedScrollingEnabled(view)
      if (before != after) {
        log("SOURCE_ENABLE_NESTED ${targetLabel(view)} before=$before after=$after")
      }

      val react = view as? ReactScrollView
      val topBar = if (react != null) NativeNestedScrollRegistry.resolveTopBar(react) else null
      val toolbar = if (react != null) NativeNestedScrollRegistry.resolveToolbar(react) else null
      val prepared = if (react != null && topBar != null) topBar.prepareNestedSource(react) else false
      if (react != null && (topBar != null || toolbar != null)) {
        activeTopBar = topBar
        activeToolbar = toolbar
        activeSource = react
      }

      log(
        "SOURCE_TREE ${targetLabel(view)} " +
          "canUp=${view.canScrollVertically(-1)} canDown=${view.canScrollVertically(1)} " +
          "topBar=${topBar != null} toolbar=${toolbar != null} chromePrepared=$prepared",
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Platform / NestedScrollingParent legacy contract used by android.widget.ScrollView.
  // ---------------------------------------------------------------------------

  override fun onStartNestedScroll(child: View, target: View, axes: Int): Boolean {
    val accepted = axes and ViewCompat.SCROLL_AXIS_VERTICAL != 0
    if (accepted) beginNestedSession(target)
    log(
      "NESTED_START contract=platform axes=${axesLabel(axes)} accepted=$accepted " +
        "direct=$directTransactionActive ${targetLabel(target)}",
    )
    return accepted
  }

  override fun onNestedScrollAccepted(child: View, target: View, axes: Int) {
    nestedParentHelper.onNestedScrollAccepted(child, target, axes)
    log("NESTED_ACCEPT contract=platform axes=${axesLabel(axes)} ${targetLabel(target)}")
  }

  override fun onStopNestedScroll(target: View) {
    nestedParentHelper.onStopNestedScroll(target)
    log(
      "NESTED_STOP contract=platform preCount=$preCount postCount=$postCount " +
        "direct=$directTransactionActive ${targetLabel(target)}",
    )
    finishTouch(target)
  }

  override fun onNestedPreScroll(target: View, dx: Int, dy: Int, consumed: IntArray) =
    onNestedPreScroll(target, dx, dy, consumed, ViewCompat.TYPE_TOUCH)

  override fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
  ) {
    onNestedScroll(
      target,
      dxConsumed,
      dyConsumed,
      dxUnconsumed,
      dyUnconsumed,
      ViewCompat.TYPE_TOUCH,
      throwawayConsumed,
    )
  }

  /**
   * Never consumed. The fling belongs to the source, which reports it back as `TYPE_NON_TOUCH`
   * nested scroll — the same transaction, with the source's own physics behind it.
   */
  override fun onNestedPreFling(target: View, velocityX: Float, velocityY: Float): Boolean {
    log(
      "NESTED_PRE_FLING vx=$velocityX vy=$velocityY preCount=$preCount " +
        "sourceOwnsMomentum=${sourceOwnsMomentum(target)} direct=$directTransactionActive " +
        targetLabel(target),
    )
    return false
  }

  override fun onNestedFling(
    target: View,
    velocityX: Float,
    velocityY: Float,
    consumed: Boolean,
  ): Boolean {
    log(
      "NESTED_FLING vx=$velocityX vy=$velocityY childConsumed=$consumed " +
        "preCount=$preCount postCount=$postCount direct=$directTransactionActive ${targetLabel(target)}",
    )
    return false
  }

  override fun getNestedScrollAxes(): Int = nestedParentHelper.nestedScrollAxes

  // ---------------------------------------------------------------------------
  // NestedScrollingParent2 / Parent3 typed contract. Kept complete for sources that use AndroidX.
  // ---------------------------------------------------------------------------

  /**
   * Whether the source reports its own momentum instead of leaving the parent to infer it.
   *
   * Asked of the source rather than of a version or a flag: `NestedScrollingChild2` is precisely
   * the contract that carries TYPE_NON_TOUCH, so a `ReactScrollView` that dispatches its fling and
   * a `NestedScrollView`-backed one both answer yes, and a plain `android.widget.ScrollView`
   * answers no.
   */
  private fun sourceOwnsMomentum(target: View): Boolean = target is NestedScrollingChild2

  override fun onStartNestedScroll(child: View, target: View, axes: Int, type: Int): Boolean {
    val accepted = axes and ViewCompat.SCROLL_AXIS_VERTICAL != 0
    if (accepted && type == ViewCompat.TYPE_NON_TOUCH) momentumSessionActive = true
    if (accepted) beginNestedSession(target)
    log(
      "NESTED_START contract=androidx type=${typeLabel(type)} axes=${axesLabel(axes)} " +
        "accepted=$accepted direct=$directTransactionActive ${targetLabel(target)}",
    )
    return accepted
  }

  override fun onNestedScrollAccepted(child: View, target: View, axes: Int, type: Int) {
    nestedParentHelper.onNestedScrollAccepted(child, target, axes, type)
    log(
      "NESTED_ACCEPT contract=androidx type=${typeLabel(type)} axes=${axesLabel(axes)} " +
        targetLabel(target),
    )
  }

  override fun onStopNestedScroll(target: View, type: Int) {
    nestedParentHelper.onStopNestedScroll(target, type)
    log(
      "NESTED_STOP contract=androidx type=${typeLabel(type)} preCount=$preCount postCount=$postCount " +
        "direct=$directTransactionActive momentum=$momentumSessionActive ${targetLabel(target)}",
    )
    if (type == ViewCompat.TYPE_NON_TOUCH) {
      momentumSessionActive = false
      finishMovement(target, "momentum-stop")
    } else {
      finishTouch(target)
    }
  }

  override fun onNestedPreScroll(
    target: View,
    dx: Int,
    dy: Int,
    consumed: IntArray,
    type: Int,
  ) {
    preCount += 1
    val topBar = activeTopBar?.takeIf { directTransactionActive && it.isNestedDirectCapable }
    if (topBar == null || dy == 0) {
      log(
        "NESTED_PRE type=${typeLabel(type)} n=$preCount dy=$dy consumedY=${consumed[1]} " +
          targetLabel(target),
      )
      return
    }

    // The app bar is the only consumer that can take distance away from the list, so pre-scroll is
    // its phase alone. Claim exactly what its height moved — nothing is executed on the source, and
    // React Native scrolls the remainder itself with its own code.
    val pre = topBar.nestedPreScroll(dy, type.toInputType())
    consumed[1] += pre.reportedConsumedY

    if (ledgerPending) {
      ledgerOrphanPres += 1
      log(
        "TX_LEDGER orphanPre n=$ledgerOrphanPres requested=$ledgerRequestedY " +
          "chromePre=$ledgerChromePreY type=${typeLabel(type)}",
      )
    }
    ledgerRequestedY = dy
    ledgerChromePreY = pre.reportedConsumedY
    ledgerPending = true

    log(
      "TX_PRE type=${typeLabel(type)} n=$preCount dy=$dy chrome=${pre.reportedConsumedY} " +
        "collapse=${topBar.currentCollapseAmountPx()} sourceY=${(target as? ViewGroup)?.scrollY}",
    )
  }

  override fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
    type: Int,
  ) {
    onNestedScroll(
      target,
      dxConsumed,
      dyConsumed,
      dxUnconsumed,
      dyUnconsumed,
      type,
      throwawayConsumed,
    )
  }

  override fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
    type: Int,
    consumed: IntArray,
  ) {
    postCount += 1
    if (!directTransactionActive) return

    // Post-scroll: what the list really did, reported by the list itself. The app bar may still
    // take some of what nobody consumed — that is how it expands when the content reaches the top —
    // and the floating toolbar only watches.
    val inputType = type.toInputType()
    val post = activeTopBar
      ?.takeIf { it.isNestedDirectCapable }
      ?.nestedPostScroll(dyConsumed, dyUnconsumed, inputType)
    if (post != null) consumed[1] += post.availableConsumedY
    activeToolbar?.nestedPostScroll(dyConsumed, inputType)

    val chromePost = post?.availableConsumedY ?: 0
    if (ledgerPending) {
      ledgerFrames += 1
      val remaining = dyUnconsumed - chromePost
      val sum = ledgerChromePreY + dyConsumed + chromePost + remaining
      val balanced = sum == ledgerRequestedY
      if (!balanced) ledgerBrokenFrames += 1
      log(
        "TX_LEDGER type=${typeLabel(type)} n=$ledgerFrames requested=$ledgerRequestedY " +
          "chromePre=$ledgerChromePreY child=$dyConsumed chromePost=$chromePost " +
          "remaining=$remaining sum=$sum balanced=$balanced broken=$ledgerBrokenFrames " +
          "orphanPre=$ledgerOrphanPres",
      )
      ledgerPending = false
    }

    log(
      "TX_POST type=${typeLabel(type)} n=$postCount child=$dyConsumed unconsumed=$dyUnconsumed " +
        "chrome=$chromePost collapse=${activeTopBar?.currentCollapseAmountPx()} " +
        "sourceY=${(target as? ViewGroup)?.scrollY}",
    )
  }

  private fun Int.toInputType(): NativeNestedInputType =
    if (this == ViewCompat.TYPE_NON_TOUCH) NativeNestedInputType.NonTouch
    else NativeNestedInputType.Touch

  // ---------------------------------------------------------------------------
  // One transaction driver for both touch and momentum.
  // ---------------------------------------------------------------------------

  /**
   * Bind the transaction to the source and to whatever chrome is on this screen.
   *
   * Called for both the touch session and the momentum session the source opens after it, because
   * a fling is not a new gesture: rebinding is how the second half of the same movement finds the
   * same consumers.
   */
  private fun beginNestedSession(target: View) {
    preCount = 0
    postCount = 0
    transactionCount = 0

    val react = target as? ReactScrollView
    val topBar = NativeNestedScrollRegistry.resolveTopBar(target)
    val toolbar = NativeNestedScrollRegistry.resolveToolbar(target)
    activeSource = react
    activeTopBar = topBar
    activeToolbar = toolbar

    val topBarReady = react != null && topBar?.beginNestedTransaction(react) == true
    val toolbarReady = react != null && toolbar?.beginNestedTransaction(react) == true
    directTransactionActive = topBarReady || toolbarReady

    log(
      "TX_BIND source=${react?.id} topBar=$topBarReady toolbar=$toolbarReady " +
        "direct=$directTransactionActive " +
        "surfaceSource=${surfaceId(target)} surfaceHost=${surfaceId(this)}",
    )
  }

  private fun finishTouch(target: View) {
    // The source opens its momentum session inside `fling()`, which runs before the touch session
    // is closed. The movement is not over here, it changed owner: settling now would run Material's
    // terminal snap against a fling still to come.
    if (momentumSessionActive) {
      log("TX_TOUCH_STOP deferred=momentum ${targetLabel(target)}")
      return
    }
    finishMovement(target, "touch-stop")
  }

  /** Close the chrome transaction for a movement that has genuinely ended. */
  private fun finishMovement(target: View, reason: String) {
    if (!directTransactionActive) return
    val source = target as? ReactScrollView ?: activeSource
    if (source != null) activeTopBar?.endNestedTransaction(source, reason)
    activeToolbar?.endNestedTransaction()
    directTransactionActive = false
    log("TX_END reason=$reason sourceY=${source?.scrollY}")
  }

  // ---------------------------------------------------------------------------
  // Tree / diagnostics.
  // ---------------------------------------------------------------------------

  private fun collectScrollableDescendants(view: View, output: MutableList<View>) {
    if (view !== this) {
      val looksLikeVerticalSource =
        view is android.widget.ScrollView ||
          ViewCompat.isNestedScrollingEnabled(view) ||
          view.canScrollVertically(-1) ||
          view.canScrollVertically(1)
      if (looksLikeVerticalSource) output += view
    }
    if (view !is ViewGroup) return
    for (index in 0 until view.childCount) {
      collectScrollableDescendants(view.getChildAt(index), output)
    }
  }

  private fun targetLabel(target: View): String =
    "target=${target.javaClass.name}#${target.id} y=${target.scrollY} " +
      "nestedEnabled=${ViewCompat.isNestedScrollingEnabled(target)}"

  private fun typeLabel(type: Int): String = when (type) {
    ViewCompat.TYPE_TOUCH -> "TOUCH"
    ViewCompat.TYPE_NON_TOUCH -> "NON_TOUCH"
    else -> type.toString()
  }

  private fun axesLabel(axes: Int): String {
    val values = mutableListOf<String>()
    if (axes and ViewCompat.SCROLL_AXIS_HORIZONTAL != 0) values += "H"
    if (axes and ViewCompat.SCROLL_AXIS_VERTICAL != 0) values += "V"
    return if (values.isEmpty()) "NONE" else values.joinToString("+")
  }

  private fun surfaceId(view: View): Int =
    runCatching { com.facebook.react.uimanager.UIManagerHelper.getSurfaceId(view) }.getOrDefault(-1)

  private fun log(message: String) {
    if (!NativeScrollTracing.enabled) return
    eventSequence += 1
    Log.d(
      NATIVE_SCROLL_LOG_TAG,
      "SCROLL seq=$eventSequence t=${SystemClock.uptimeMillis()} $message",
    )
  }
}
