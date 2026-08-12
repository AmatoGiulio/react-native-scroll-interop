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
import kotlin.math.max
import kotlin.math.min
import kotlin.math.ceil

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
 * **One transaction per frame.** Material's pre-scroll phase decides how much of the delta the
 * chrome takes, and the child must scroll by the remainder. Both run synchronously inside
 * [onNestedPreScroll], so chrome never trails the content by a frame. Every consumer on the screen
 * joins that same transaction in its own phase: an app bar that withholds scroll in pre, a floating
 * toolbar that reacts to what the list actually did in post.
 *
 * **The source owns the physics.** Touch comes through `ScrollView.onTouchEvent`, momentum through
 * the source's own `TYPE_NON_TOUCH` dispatch (see `docs/upstream/`). This parent never runs a
 * scroller of its own: reproducing a fling next to the one already running is a second, slightly
 * different scroll view driving the same pixels.
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

  override fun onNestedPreScroll(target: View, dx: Int, dy: Int, consumed: IntArray) {
    preCount += 1
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
    val inputType = if (type == ViewCompat.TYPE_NON_TOUCH) {
      NativeNestedInputType.NonTouch
    } else {
      NativeNestedInputType.Touch
    }
    val tx = driveTransaction(target, dy, inputType)
    if (tx != null) {
      // Claim what the transaction actually used, never the whole delta. Distance nobody could
      // absorb has to stay unclaimed: on touch it is what lets the source run its own overscroll,
      // and during momentum it is the only signal that the fling has reached an edge — a source
      // told its delta was consumed keeps producing distance for the rest of its decay curve.
      consumed[1] += dy - tx.unconsumedY
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
    val topBar = activeTopBar?.takeIf { it.isNestedDirectCapable }
    val toolbar = activeToolbar
    if (topBar == null && toolbar == null) return null

    transactionCount += 1

    // Pre-scroll: the only phase that can take distance away from the list. A floating toolbar never
    // does, so this phase belongs to the app bar alone.
    //
    // Material3 exitUntilCollapsed reports the whole pre-scroll `available` when its state changes,
    // even if heightOffset clamps at the collapse limit. Android can batch hundreds of pixels into
    // one callback (and a janked fling frame can be >1000 px), so split exactly at the Material
    // boundary. This is two genuine nested-scroll segments, not a synthetic remainder: the first
    // reaches the chrome endpoint, the second is then eligible for child consumption.
    val preRequestY = when {
      topBar == null -> 0
      requestedY > 0 -> {
        val remainingCollapse = ceil(topBar.remainingCollapseAmountPx().toDouble()).toInt()
        if (remainingCollapse > 0) min(requestedY, remainingCollapse) else 0
      }
      else -> requestedY
    }
    val pre = topBar?.nestedPreScroll(preRequestY, inputType) ?: NativeNestedPreResult(0, 0)
    val beforePrePhysical = source.scrollY
    if (pre.chromeMovementY != 0) source.scrollBy(0, pre.chromeMovementY)
    val prePhysical = source.scrollY - beforePrePhysical

    val afterPreY = requestedY - pre.reportedConsumedY

    // The physical RN coordinate contains Material's collapse amount because the native scroll-away
    // content translation is fixed at expanded height. On downward motion only the *logical* child
    // range may be consumed before the remainder becomes TopAppBar post-scroll available.
    val childRequested = if (afterPreY < 0 && topBar != null) {
      max(afterPreY, -topBar.logicalChildY(source))
    } else {
      afterPreY
    }

    val beforeChildY = source.scrollY
    if (childRequested != 0) source.scrollBy(0, childRequested)
    val childConsumed = source.scrollY - beforeChildY
    val postAvailable = afterPreY - childConsumed

    // Post-scroll: what the list actually did. Both consumers see the same number, in the phase
    // Material's own behaviors expect it.
    val post = topBar?.nestedPostScroll(childConsumed, postAvailable, inputType)
      ?: NativeNestedPostResult(0, 0)
    val beforePostPhysical = source.scrollY
    if (post.chromeMovementY != 0) source.scrollBy(0, post.chromeMovementY)
    val postPhysical = source.scrollY - beforePostPhysical
    toolbar?.nestedPostScroll(childConsumed, inputType)

    val unconsumed = postAvailable - post.availableConsumedY
    val logicalAfter = topBar?.logicalChildY(source) ?: source.scrollY
    val collapseAfter = topBar?.currentCollapseAmountPx() ?: 0f

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
