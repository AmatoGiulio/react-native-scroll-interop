package expo.modules.materialtoolbar

import android.content.Context
import android.os.SystemClock
import android.util.Log
import android.view.View
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
 * Alpha.33 transactional nested-scroll probe.
 *
 * Alpha.31 proved platform PRE/POST during touch. Alpha.32 proved that RN's private OverScroller can
 * be replaced by a parent-owned OverScroller so momentum also has an explicit per-frame transport.
 * Alpha.33 joins those paths and lets the real Material3 TopAppBarScrollBehavior participate in the
 * transaction before the RN child is advanced.
 *
 * This wrapper is still diagnostic and intentionally temporary. It is a physical Android ancestor
 * only so we can prove the primitive that should eventually live in the screen/navigation layer.
 */
class ExpoMaterialScrollProbeView(
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

  init {
    clipChildren = false
    clipToPadding = false
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    NativeNestedScrollRegistry.registerProbe(this)
    post { refreshNestedChromeBinding() }
  }

  override fun onDetachedFromWindow() {
    stopProxyFling("host-detached")
    NativeNestedScrollRegistry.unregisterProbe(this)
    activeTopBar = null
    activeSource = null
    directTransactionActive = false
    super.onDetachedFromWindow()
  }

  fun addProbeChild(child: View, index: Int) {
    addView(child, index)
    // FlashList 2.0.2 does not forward nestedScrollEnabled to the actual ReactScrollView in this
    // setup. Enable it on the real native source and prepare the scroll-away chrome binding before
    // the user can start the first gesture.
    post { refreshNestedChromeBinding() }
    postDelayed({ refreshNestedChromeBinding() }, 32L)
    postDelayed({ refreshNestedChromeBinding() }, 250L)
    postDelayed({ refreshNestedChromeBinding() }, 750L)
  }

  fun removeProbeChild(child: View) {
    removeView(child)
  }

  fun removeProbeChildAt(index: Int) {
    removeViewAt(index)
  }

  /** Called by the registry whenever TopAppBar behavior/geometry becomes ready. */
  fun refreshNestedChromeBinding() {
    if (!isAttachedToWindow) return
    val found = mutableListOf<View>()
    collectScrollableDescendants(this, found)
    if (found.isEmpty()) {
      log("PROBE_TREE no-scrollable-descendant childCount=$childCount")
      return
    }

    found.forEach { view ->
      val before = ViewCompat.isNestedScrollingEnabled(view)
      if (view is android.widget.ScrollView && !before) {
        ViewCompat.setNestedScrollingEnabled(view, true)
      }
      val after = ViewCompat.isNestedScrollingEnabled(view)
      if (before != after) {
        log("PROBE_ENABLE_NESTED ${targetLabel(view)} before=$before after=$after")
      }

      val react = view as? ReactScrollView
      val topBar = if (react != null) NativeNestedScrollRegistry.resolveTopBar(react) else null
      val prepared = if (react != null && topBar != null) topBar.prepareNestedSource(react) else false
      if (react != null && topBar != null) {
        activeTopBar = topBar
        activeSource = react
      }

      log(
        "PROBE_TREE ${targetLabel(view)} nestedEnabled=$after " +
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
    val tx = driveTransaction(target, dy, NativeNestedInputType.Touch)
    if (tx != null) {
      // The adapter already performed both Material and child phases synchronously. Claim the full
      // platform delta so ScrollView cannot execute the child phase a second time. Edge remainder
      // is intentionally swallowed in alpha.33; edge-effect handoff is a later transport feature.
      consumed[1] += dy
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
    val direction = when {
      velocityY > 0f -> 1
      velocityY < 0f -> -1
      else -> 0
    }
    val canDrive =
      react != null &&
        topBar != null &&
        directTransactionActive &&
        topBar.canDriveFling(react, direction)

    log(
      "NESTED_PRE_FLING vx=$velocityX vy=$velocityY preCount=$preCount postCount=$postCount " +
        "proxyIntercept=$canDrive direct=$directTransactionActive ${targetLabel(target)}",
    )

    if (!canDrive || react == null) return false
    startProxyFling(react, velocityY)
    // Consume pre-fling so RN never starts the private OverScroller that alpha.31 proved does not
    // emit per-frame nested PRE/POST callbacks.
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
    stopProxyFling("new-touch")
    preCount = 0
    postCount = 0
    transactionCount = 0

    val react = target as? ReactScrollView
    val topBar = NativeNestedScrollRegistry.resolveTopBar(target)
    activeSource = react
    activeTopBar = topBar
    directTransactionActive = react != null && topBar?.beginNestedTransaction(react) == true

    log(
      "TX_BIND source=${react?.id} topBar=${topBar != null} direct=$directTransactionActive " +
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
    stopProxyFling("replace")

    val scrollState = (target as? HasScrollState)?.reactScrollViewScrollState
    val decelerationRate = scrollState?.decelerationRate ?: 0.985f
    val scroller = OverScroller(target.context).also {
      it.setFriction(1.0f - decelerationRate)
    }

    val startY = target.scrollY.coerceAtLeast(0)
    val roundedVelocityY = velocityY.roundToInt()
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
    stopProxyFling(null)
    if (target != null) {
      activeTopBar?.endNestedTransaction(target, "proxy-$reason")
    }
    directTransactionActive = false
  }

  private fun stopProxyFling(reason: String?) {
    val target = proxyTarget
    val runnable = proxyRunnable
    if (target != null && runnable != null) target.removeCallbacks(runnable)
    val hadProxy = proxyScroller != null || proxyTarget != null
    proxyScroller?.abortAnimation()
    proxyGeneration += 1
    proxyScroller = null
    proxyTarget = null
    proxyRunnable = null
    proxyFrameCount = 0
    if (hadProxy && reason != null) log("PROXY_FLING_CANCEL reason=$reason")
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
    if (!BuildConfig.DEBUG) return
    eventSequence += 1
    Log.d(
      NATIVE_SCROLL_LOG_TAG,
      "PROBE seq=$eventSequence t=${SystemClock.uptimeMillis()} $message",
    )
  }
}
