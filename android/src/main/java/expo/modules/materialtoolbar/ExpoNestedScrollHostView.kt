package expo.modules.materialtoolbar

import android.content.Context
import android.os.SystemClock
import android.util.Log
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.widget.OverScroller
import androidx.core.view.NestedScrollingParent3
import androidx.core.view.NestedScrollingParentHelper
import androidx.core.view.ViewCompat
import com.facebook.react.views.scroll.ReactScrollView
import com.facebook.react.views.scroll.ReactScrollViewHelper.HasScrollState
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import kotlin.math.max
import kotlin.math.min
import kotlin.math.ceil
import kotlin.math.roundToInt

/**
 * A nested-scrolling ancestor for a React Native scroll source, so native chrome can follow it.
 *
 * Android chrome that reacts to scrolling is driven through nested scrolling. A [ReactScrollView]
 * emits those callbacks to its native ancestors, and nothing in the RN view tree listens — which is
 * why Compose Material3 behaviors, which are themselves NestedScrollConnections, cannot be reached
 * from React Native at all. Being that ancestor is the entire trick; no patch to React Native, no
 * JS involvement, no ref handed anywhere.
 *
 * Two things make it usable rather than merely possible:
 *
 *  - **One transaction per frame.** Material's pre-scroll phase decides how much of the delta the
 *    chrome takes, and the child must scroll by the remainder. Both run synchronously inside
 *    [onNestedPreScroll], so chrome never trails the content by a frame.
 *  - **Parent-owned momentum.** RN's own fling emits no per-frame nested-scroll callbacks, so a
 *    fling would move the list while chrome stood still. [onNestedPreFling] takes the fling over
 *    and drives it through the same transaction driver. This is the invasive part, and the rules
 *    gating it live in [NestedFlingPolicy] with the regressions they prevent written down.
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
  private var activeSource: ReactScrollView? = null
  private var directTransactionActive = false

  // Parent-owned momentum. RN's private fling is intercepted in onNestedPreFling; each OverScroller
  // frame is then fed through the exact same transaction driver used by touch.
  private var proxyScroller: OverScroller? = null
  private var proxyTarget: ReactScrollView? = null
  private var proxyGeneration = 0L
  private var proxyFrameCount = 0L
  private var proxyLastScrollerY = 0
  private var proxyLastVelocityY = 0
  private var proxyRunnable: Runnable? = null

  // Armed by a real ACTION_DOWN reaching this ancestor, consumed by the nested session it opens.
  // A session that starts without one is the source re-entering after we intercepted its fling, not
  // a new gesture, and must not be allowed to take the source away from a running proxy.
  private var touchDownPending = false

  // Set when a proxy fling is cancelled before executing a single frame. That only happens when the
  // source re-opens a nested session as a consequence of the interception itself, which spins a
  // start/cancel loop at frame rate. While pending we hand the fling back to the source; real scroll
  // input clears it.
  private var flingHandoffPending = false

  init {
    clipChildren = false
    clipToPadding = false
  }

  override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
    // Observed before the scrolling child sees it, so the flag is always set by the time that child
    // opens its nested session. This is the only evidence of a genuinely new gesture we can get.
    when (ev.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        touchDownPending = true
        log("TOUCH_DOWN pointers=${ev.pointerCount} downTime=${ev.downTime} eventTime=${ev.eventTime}")
      }
      MotionEvent.ACTION_UP -> log("TOUCH_UP eventTime=${ev.eventTime}")
      MotionEvent.ACTION_CANCEL -> log("TOUCH_CANCEL eventTime=${ev.eventTime}")
    }
    return super.dispatchTouchEvent(ev)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    NativeNestedScrollRegistry.registerHost(this)
    post { refreshNestedChromeBinding() }
  }

  override fun onDetachedFromWindow() {
    stopProxyFling("host-detached", allowHandoff = false)
    NativeNestedScrollRegistry.unregisterHost(this)
    flingHandoffPending = false
    touchDownPending = false
    activeTopBar = null
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
      val prepared = if (react != null && topBar != null) topBar.prepareNestedSource(react) else false
      if (react != null && topBar != null) {
        activeTopBar = topBar
        activeSource = react
      }

      log(
        "SOURCE_TREE ${targetLabel(view)} " +
          "canUp=${view.canScrollVertically(-1)} canDown=${view.canScrollVertically(1)} " +
          "topBar=${topBar != null} chromePrepared=$prepared",
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
        "proxy=${proxyScroller != null} direct=$directTransactionActive ${targetLabel(target)}",
    )
    finishTouchIfNoProxy(target)
  }

  override fun onNestedPreScroll(target: View, dx: Int, dy: Int, consumed: IntArray) {
    preCount += 1
    // Real scroll input is the only thing that clears the handoff: it proves the source is being
    // driven by a finger again rather than re-entering from our own interception.
    if (dy != 0) flingHandoffPending = false
    val tx = driveTransaction(target, dy, NativeNestedInputType.Touch)
    if (tx != null) {
      // Both the Material and the child phase already ran synchronously inside the transaction, so
      // claim what they used and nothing more. The remainder is distance nobody could absorb — the
      // content is at an edge and chrome has no travel left — and leaving it unclaimed is what lets
      // ScrollView run its own overscroll: the stretch on Android 12+, the glow before it. Claiming
      // it too, as this did while the edge handoff was unimplemented, silently deleted that motion
      // and made the list feel dead against its boundaries.
      consumed[1] += dy - tx.unconsumedY
      logTransaction("TOUCH", tx)
    } else {
      log(
        "NESTED_PRE contract=platform n=$preCount dx=$dx dy=$dy consumedY=${consumed[1]} " +
          targetLabel(target),
      )
    }
  }

  override fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
  ) {
    postCount += 1
    // With the direct driver, platform child/post work should be zero because onNestedPreScroll
    // claimed the complete delta after executing it itself. Never feed this callback into Material
    // again; doing so would double-dispatch the same gesture.
    log(
      "NESTED_POST contract=platform n=$postCount childConsumedY=$dyConsumed " +
        "unconsumedY=$dyUnconsumed direct=$directTransactionActive ${targetLabel(target)}",
    )
  }

  override fun onNestedPreFling(target: View, velocityX: Float, velocityY: Float): Boolean {
    val react = target as? ReactScrollView
    val topBar = activeTopBar ?: NativeNestedScrollRegistry.resolveTopBar(target)
    val direction = NestedFlingPolicy.directionOf(velocityY)
    val canDrive = NestedFlingPolicy.shouldDriveFling(
      scrollFrameCount = preCount,
      hasDirectTransaction = directTransactionActive,
      hasChrome = react != null && topBar != null,
      chromeCanDrive = react != null && topBar != null && topBar.canDriveFling(react, direction),
      handoffPending = flingHandoffPending,
    )

    log(
      "NESTED_PRE_FLING vx=$velocityX vy=$velocityY preCount=$preCount postCount=$postCount " +
        "proxyIntercept=$canDrive direct=$directTransactionActive " +
        "handoffPending=$flingHandoffPending ${targetLabel(target)}",
    )

    if (!canDrive) return false
    startProxyFling(react!!, velocityY)
    // Consume the pre-fling so RN never starts its private OverScroller, which emits no per-frame
    // nested callbacks and would move the list while chrome stood still.
    return true
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

  override fun onStartNestedScroll(child: View, target: View, axes: Int, type: Int): Boolean {
    val accepted = axes and ViewCompat.SCROLL_AXIS_VERTICAL != 0
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
        "proxy=${proxyScroller != null} direct=$directTransactionActive ${targetLabel(target)}",
    )
    finishTouchIfNoProxy(target)
  }

  override fun onNestedPreScroll(
    target: View,
    dx: Int,
    dy: Int,
    consumed: IntArray,
    type: Int,
  ) {
    preCount += 1
    val inputType = if (type == ViewCompat.TYPE_NON_TOUCH) {
      NativeNestedInputType.NonTouch
    } else {
      NativeNestedInputType.Touch
    }
    val tx = driveTransaction(target, dy, inputType)
    if (tx != null) {
      consumed[1] += dy
      logTransaction("ANDROIDX_${typeLabel(type)}", tx)
    } else {
      log(
        "NESTED_PRE contract=androidx type=${typeLabel(type)} n=$preCount dx=$dx dy=$dy " +
          "consumedY=${consumed[1]} ${targetLabel(target)}",
      )
    }
  }

  override fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
    type: Int,
  ) {
    postCount += 1
    log(
      "NESTED_POST contract=androidx type=${typeLabel(type)} n=$postCount " +
        "childConsumedY=$dyConsumed unconsumedY=$dyUnconsumed direct=$directTransactionActive " +
        targetLabel(target),
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
    log(
      "NESTED_POST3 contract=androidx type=${typeLabel(type)} n=$postCount " +
        "childConsumedY=$dyConsumed unconsumedY=$dyUnconsumed parentConsumedY=${consumed[1]} " +
        "direct=$directTransactionActive ${targetLabel(target)}",
    )
  }

  // ---------------------------------------------------------------------------
  // One transaction driver for both touch and momentum.
  // ---------------------------------------------------------------------------

  private data class DrivenTransaction(
    val n: Long,
    val requestedY: Int,
    val preRequestY: Int,
    val preReportedY: Int,
    val preChromeY: Int,
    val prePhysicalY: Int,
    val childRequestedY: Int,
    val childConsumedY: Int,
    val postAvailableY: Int,
    val postAvailableConsumedY: Int,
    val postChromeY: Int,
    val postPhysicalY: Int,
    val unconsumedY: Int,
    val sourceY: Int,
    val logicalY: Int,
    val collapseY: Float,
  )

  private fun driveTransaction(
    target: View,
    requestedY: Int,
    inputType: NativeNestedInputType,
  ): DrivenTransaction? {
    if (!directTransactionActive || requestedY == 0) return null
    val source = target as? ReactScrollView ?: return null
    val topBar = activeTopBar ?: return null

    transactionCount += 1

    // Material3 exitUntilCollapsed reports the whole pre-scroll `available` when its state changes,
    // even if heightOffset clamps at the collapse limit. Android can batch hundreds of pixels into
    // one callback (and a janked fling frame can be >1000 px), so split exactly at the Material
    // boundary. This is two genuine nested-scroll segments, not a synthetic remainder: the first
    // reaches the chrome endpoint, the second is then eligible for child consumption.
    val preRequestY = if (requestedY > 0) {
      val remainingCollapse = ceil(topBar.remainingCollapseAmountPx().toDouble()).toInt()
      if (remainingCollapse > 0) min(requestedY, remainingCollapse) else 0
    } else {
      requestedY
    }
    val pre = topBar.nestedPreScroll(preRequestY, inputType)
    val beforePrePhysical = source.scrollY
    if (pre.chromeMovementY != 0) source.scrollBy(0, pre.chromeMovementY)
    val prePhysical = source.scrollY - beforePrePhysical

    val afterPreY = requestedY - pre.reportedConsumedY

    // The physical RN coordinate contains Material's collapse amount because the native scroll-away
    // content translation is fixed at expanded height. On downward motion only the *logical* child
    // range may be consumed before the remainder becomes TopAppBar post-scroll available.
    val childRequested = if (afterPreY < 0) {
      val logicalBefore = topBar.logicalChildY(source)
      max(afterPreY, -logicalBefore)
    } else {
      afterPreY
    }

    val beforeChildY = source.scrollY
    if (childRequested != 0) source.scrollBy(0, childRequested)
    val childConsumed = source.scrollY - beforeChildY
    val postAvailable = afterPreY - childConsumed

    val post = topBar.nestedPostScroll(childConsumed, postAvailable, inputType)
    val beforePostPhysical = source.scrollY
    if (post.chromeMovementY != 0) source.scrollBy(0, post.chromeMovementY)
    val postPhysical = source.scrollY - beforePostPhysical

    val unconsumed = postAvailable - post.availableConsumedY
    val logicalAfter = topBar.logicalChildY(source)
    val collapseAfter = topBar.currentCollapseAmountPx()

    if (BuildConfig.DEBUG) {
      if (prePhysical != pre.chromeMovementY || postPhysical != post.chromeMovementY) {
        log(
          "TX_INVARIANT physicalClamp requested=$requestedY preExpected=${pre.chromeMovementY} " +
            "preActual=$prePhysical postExpected=${post.chromeMovementY} postActual=$postPhysical " +
            "sourceY=${source.scrollY} logicalY=$logicalAfter collapse=$collapseAfter",
        )
      }
      val invariantY = logicalAfter + collapseAfter
      if (kotlin.math.abs(source.scrollY.toFloat() - invariantY) > 1.25f) {
        log(
          "TX_INVARIANT coordinateMismatch sourceY=${source.scrollY} logicalY=$logicalAfter " +
            "collapse=$collapseAfter expected=$invariantY requested=$requestedY",
        )
      }
    }

    return DrivenTransaction(
      n = transactionCount,
      requestedY = requestedY,
      preRequestY = preRequestY,
      preReportedY = pre.reportedConsumedY,
      preChromeY = pre.chromeMovementY,
      prePhysicalY = prePhysical,
      childRequestedY = childRequested,
      childConsumedY = childConsumed,
      postAvailableY = postAvailable,
      postAvailableConsumedY = post.availableConsumedY,
      postChromeY = post.chromeMovementY,
      postPhysicalY = postPhysical,
      unconsumedY = unconsumed,
      sourceY = source.scrollY,
      logicalY = logicalAfter,
      collapseY = collapseAfter,
    )
  }

  private fun logTransaction(kind: String, tx: DrivenTransaction) {
    log(
      "TX_FRAME kind=$kind n=${tx.n} dy=${tx.requestedY} " +
        "preReq=${tx.preRequestY} preReported=${tx.preReportedY} " +
        "preChrome=${tx.preChromeY}/${tx.prePhysicalY} " +
        "childReq=${tx.childRequestedY} child=${tx.childConsumedY} " +
        "postAvail=${tx.postAvailableY} postConsumed=${tx.postAvailableConsumedY} " +
        "postChrome=${tx.postChromeY}/${tx.postPhysicalY} remaining=${tx.unconsumedY} " +
        "sourceY=${tx.sourceY} logicalY=${tx.logicalY} collapse=${tx.collapseY}",
    )
  }

  private fun beginNestedSession(target: View) {
    // A fresh touch owns the source immediately and must interrupt parent-owned momentum/snap.
    // Without one, this is the source re-opening a session as a consequence of our own fling
    // interception: leave the running proxy alone, or it gets torn down before its first frame and
    // the source retries, spinning a start/cancel loop at frame rate.
    val freshTouch = touchDownPending
    touchDownPending = false
    if (freshTouch) {
      stopProxyFling("new-touch")
    } else if (proxyScroller != null) {
      log("TX_REENTRY proxyKept frames=$proxyFrameCount ${targetLabel(target)}")
      return
    }

    preCount = 0
    postCount = 0
    transactionCount = 0

    val react = target as? ReactScrollView
    val topBar = NativeNestedScrollRegistry.resolveTopBar(target)
    activeSource = react
    activeTopBar = topBar
    directTransactionActive = react != null && topBar?.beginNestedTransaction(react) == true

    log(
      "TX_BIND source=${react?.id} topBar=${topBar != null} freshTouch=$freshTouch " +
        "direct=$directTransactionActive " +
        "surfaceSource=${surfaceId(target)} surfaceHost=${surfaceId(this)}",
    )
  }

  private fun finishTouchIfNoProxy(target: View) {
    if (!directTransactionActive || proxyScroller != null) return
    val source = target as? ReactScrollView ?: activeSource ?: return
    activeTopBar?.endNestedTransaction(source, "touch-stop")
    directTransactionActive = false
  }

  // ---------------------------------------------------------------------------
  // Parent-owned fling: same transaction driver, NON_TOUCH source.
  // ---------------------------------------------------------------------------

  private fun startProxyFling(target: ReactScrollView, velocityY: Float) {
    stopProxyFling("replace", allowHandoff = false)

    val scrollState = (target as? HasScrollState)?.reactScrollViewScrollState
    val decelerationRate = scrollState?.decelerationRate ?: 0.985f
    val scroller = OverScroller(target.context).also {
      it.setFriction(1.0f - decelerationRate)
    }

    val startY = target.scrollY.coerceAtLeast(0)
    // RN's velocity tracker can report well past the platform ceiling on a violent swipe. The
    // source's own fling would have been clamped, so clamp too or the proxy runs a physics the
    // source would never have produced.
    val maxFlingVelocity = ViewConfiguration.get(context).scaledMaximumFlingVelocity.toFloat()
    val clampedVelocityY = velocityY.coerceIn(-maxFlingVelocity, maxFlingVelocity)
    val roundedVelocityY = clampedVelocityY.roundToInt()
    val viewportHeight = max(0, target.height - target.paddingTop - target.paddingBottom)

    scroller.fling(
      0,
      startY,
      0,
      roundedVelocityY,
      0,
      0,
      0,
      Int.MAX_VALUE,
      0,
      viewportHeight / 2,
    )

    val generation = ++proxyGeneration
    proxyScroller = scroller
    proxyTarget = target
    proxyFrameCount = 0
    proxyLastScrollerY = startY
    proxyLastVelocityY = roundedVelocityY

    log(
      "PROXY_FLING_START gen=$generation startY=$startY vy=$roundedVelocityY " +
        "requestedVy=$velocityY maxVy=$maxFlingVelocity " +
        "decelerationRate=$decelerationRate friction=${1.0f - decelerationRate} " +
        "viewport=$viewportHeight finalY=${scroller.finalY} ${targetLabel(target)}",
    )

    val runnable = object : Runnable {
      override fun run() {
        if (generation != proxyGeneration) return
        val currentScroller = proxyScroller ?: return
        val currentTarget = proxyTarget ?: return

        val active = currentScroller.computeScrollOffset()
        val scrollerY = currentScroller.currY
        val requestedDy = scrollerY - proxyLastScrollerY
        proxyLastScrollerY = scrollerY

        if (requestedDy != 0) {
          proxyFrameCount += 1
          val tx = driveTransaction(currentTarget, requestedDy, NativeNestedInputType.NonTouch)
          if (tx == null) {
            finishProxyFling(generation, "transaction-lost")
            return
          }
          logTransaction("NON_TOUCH", tx)

          if (tx.unconsumedY != 0) {
            finishProxyFling(generation, "edge-unconsumed")
            return
          }
        }

        if (active && !currentScroller.isFinished) {
          currentTarget.postOnAnimation(this)
        } else {
          finishProxyFling(generation, "finished")
        }
      }
    }

    proxyRunnable = runnable
    target.postOnAnimation(runnable)
  }

  private fun finishProxyFling(generation: Long, reason: String) {
    if (generation != proxyGeneration) return
    val target = proxyTarget
    val scroller = proxyScroller
    val currVelocity = scroller?.currVelocity ?: 0f
    log(
      "PROXY_FLING_END gen=$generation reason=$reason frames=$proxyFrameCount " +
        "requestedVy=$proxyLastVelocityY currVelocity=$currVelocity finalSourceY=${target?.scrollY}",
    )

    // Remove the proxy before launching Material snap so a new touch can cancel only the snap and
    // never see a stale momentum owner.
    stopProxyFling(null, allowHandoff = false)
    if (target != null) {
      activeTopBar?.endNestedTransaction(target, "proxy-$reason")
      // The sampling coordinator drives the floating toolbar and cannot see that momentum ended
      // here; left to its inactivity timeout it settles ~80ms late, which reads as a step in the
      // toolbar's travel. We own the last frame of this fling, so hand it the exact moment — and
      // the velocity still on it, which is what a decay-based Material settle needs to continue
      // the travel instead of restarting it. At an edge that residual is large: the source stops
      // dead against the boundary while the chrome still has ground to cover.
      val residualVelocityY = currVelocity * if (proxyLastVelocityY < 0) -1f else 1f
      ReactNativeScrollCoordinator.transportSettled(target, reason, residualVelocityY)
    }
    directTransactionActive = false
  }

  /**
   * [allowHandoff] is false for internal teardown (replacing one proxy with another, or finishing a
   * fling that ran its course). Only an external interruption that killed a proxy before its first
   * frame should arm the handoff.
   */
  private fun stopProxyFling(reason: String?, allowHandoff: Boolean = true) {
    val target = proxyTarget
    val runnable = proxyRunnable
    if (target != null && runnable != null) target.removeCallbacks(runnable)
    val hadProxy = proxyScroller != null || proxyTarget != null
    val framesRun = proxyFrameCount
    proxyScroller?.abortAnimation()
    proxyGeneration += 1
    proxyScroller = null
    proxyTarget = null
    proxyRunnable = null
    proxyFrameCount = 0
    if (NestedFlingPolicy.shouldArmHandoff(hadProxy, framesRun, externalInterruption = allowHandoff)) {
      flingHandoffPending = true
    }
    if (hadProxy && reason != null) {
      log("PROXY_FLING_CANCEL reason=$reason framesRun=$framesRun handoffPending=$flingHandoffPending")
    }
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
