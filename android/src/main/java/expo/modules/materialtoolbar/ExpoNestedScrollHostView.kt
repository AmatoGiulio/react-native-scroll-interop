package expo.modules.materialtoolbar

import android.content.Context
import android.os.SystemClock
import android.util.Log
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
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
 * from React Native at all. Being that ancestor is the entire parent-side trick: no JS involvement,
 * no ref handed anywhere, and no second scroll driver. React Native 0.83 still needs the source-side
 * momentum patch under `docs/upstream/` so its own fling is reported as `TYPE_NON_TOUCH`.
 *
 * There is exactly one transaction and exactly one physics.
 *
 * **The source owns the movement.** Touch comes through `ScrollView.onTouchEvent`, momentum through
 * the source's own `TYPE_NON_TOUCH` dispatch. This parent runs no scroller and never moves the list:
 * it takes its share in pre-scroll, React Native scrolls the remainder with its own code, and
 * post-scroll reports what actually happened. `scrollY` therefore only ever means "where React
 * Native scrolled to".
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

  // These belong only to the nested-scroll session that Android actually opened. Pre-gesture source
  // discovery never writes them: the transaction target is the authoritative source.
  private var activeTopBar: TopAppBarScrollConsumer? = null
  private var activeToolbar: FloatingToolbarScrollConsumer? = null
  private var activeSource: ReactScrollView? = null
  private var nestedTransactionActive = false

  // True between the source's own TYPE_NON_TOUCH start and stop. The movement is not over when the
  // finger leaves; it changes owner, and chrome must not settle in between.
  private var momentumSessionActive = false

  // The untyped/Parent2 callbacks have no consumed[] result to report into. Always clear this before
  // delegating so a previous callback can never leak its post-consumption into diagnostics.
  private val throwawayConsumed = IntArray(2)

  // Mount ordering under Fabric/FlashList is asynchronous, but it is still observable through the
  // native layout tree. Wait for a real layout change instead of guessing that 32/250/750 ms will be
  // enough for the ReactScrollView to exist.
  private var waitingForSourceLayout = false
  private val sourceLayoutListener = ViewTreeObserver.OnGlobalLayoutListener {
    if (!isAttachedToWindow) {
      stopWaitingForSourceLayout()
      return@OnGlobalLayoutListener
    }
    if (refreshNestedChromeBinding()) stopWaitingForSourceLayout()
  }

  // Debug transaction ledger. For one frame the four quantities must add up to what was asked, and
  // none of them may be reconstructed from the frame before:
  //
  //     requested = chromePre + childConsumed + chromePost + remaining
  //
  // It also counts pre-scrolls that never got their post. Those are expected on the legacy
  // android.widget.ScrollView touch contract when pre-scroll consumed everything.
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
  }

  override fun onDetachedFromWindow() {
    NativeNestedScrollRegistry.unregisterHost(this)
    stopWaitingForSourceLayout()
    flushPendingLedger("detach")
    momentumSessionActive = false
    activeTopBar = null
    activeToolbar = null
    activeSource = null
    nestedTransactionActive = false
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

  /**
   * Ask for source preparation without depending on a mount delay.
   *
   * If the native ReactScrollView is already present, preparation happens in the posted turn. If
   * Fabric/FlashList has not mounted it yet, the host listens to global layout only until the source
   * appears, then removes the listener. Registry changes call this same path.
   */
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
   * Prepare the unique ReactScrollView before the first gesture.
   *
   * Discovery has no transaction authority: it only enables native nested scrolling and installs
   * TopAppBar visual geometry. The real source/consumer binding is resolved again from Android's
   * nested-scroll `target` in [beginNestedSession]. Multiple ReactScrollViews fail closed for
   * pre-gesture geometry instead of guessing which one the screen meant.
   *
   * @return true once discovery reached a terminal state for the current native tree (one source or
   * an ambiguous set); false while no ReactScrollView exists yet and another layout may reveal it.
   */
  fun refreshNestedChromeBinding(): Boolean {
    if (!isAttachedToWindow) return false

    val scrollViews = mutableListOf<android.widget.ScrollView>()
    collectScrollViewDescendants(this, scrollViews)
    if (scrollViews.isEmpty()) {
      log("SOURCE_TREE no-scrollview-descendant childCount=$childCount")
      return false
    }

    scrollViews.forEach { view ->
      val before = ViewCompat.isNestedScrollingEnabled(view)
      if (!before) ViewCompat.setNestedScrollingEnabled(view, true)
      val after = ViewCompat.isNestedScrollingEnabled(view)
      if (before != after) {
        log("SOURCE_ENABLE_NESTED ${targetLabel(view)} before=$before after=$after")
      }
    }

    val reactSources = scrollViews.filterIsInstance<ReactScrollView>()
    if (reactSources.isEmpty()) {
      log("SOURCE_TREE scrollviews=${scrollViews.size} reactSources=0")
      return false
    }

    if (reactSources.size != 1) {
      log("SOURCE_TREE ambiguousReactSources count=${reactSources.size} failClosed=true")
      return true
    }

    val react = reactSources.single()
    val topBar = NativeNestedScrollRegistry.resolveTopBar(react)
    val toolbar = NativeNestedScrollRegistry.resolveToolbar(react)
    val prepared = topBar?.prepareNestedSource(react) == true

    log(
      "SOURCE_TREE ${targetLabel(react)} " +
        "canUp=${react.canScrollVertically(-1)} canDown=${react.canScrollVertically(1)} " +
        "topBar=${topBar != null} toolbar=${toolbar != null} chromePrepared=$prepared",
    )
    return true
  }

  private fun startWaitingForSourceLayout() {
    if (waitingForSourceLayout) return
    val observer = viewTreeObserver
    if (!observer.isAlive) return
    observer.addOnGlobalLayoutListener(sourceLayoutListener)
    waitingForSourceLayout = true
    log("SOURCE_WAIT layout-listener=armed")
  }

  private fun stopWaitingForSourceLayout() {
    if (!waitingForSourceLayout) return
    val observer = viewTreeObserver
    if (observer.isAlive) observer.removeOnGlobalLayoutListener(sourceLayoutListener)
    waitingForSourceLayout = false
    log("SOURCE_WAIT layout-listener=removed")
  }

  // ---------------------------------------------------------------------------
  // Platform / NestedScrollingParent legacy contract used by android.widget.ScrollView.
  // ---------------------------------------------------------------------------

  override fun onStartNestedScroll(child: View, target: View, axes: Int): Boolean {
    val accepted = axes and ViewCompat.SCROLL_AXIS_VERTICAL != 0
    if (accepted) beginNestedSession(target)
    log(
      "NESTED_START contract=platform axes=${axesLabel(axes)} accepted=$accepted " +
        "active=$nestedTransactionActive ${targetLabel(target)}",
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
        "active=$nestedTransactionActive ${targetLabel(target)}",
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
    throwawayConsumed.fill(0)
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
        "sourceOwnsMomentum=${sourceOwnsMomentum(target)} active=$nestedTransactionActive " +
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
        "preCount=$preCount postCount=$postCount active=$nestedTransactionActive ${targetLabel(target)}",
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
        "accepted=$accepted active=$nestedTransactionActive ${targetLabel(target)}",
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
        "active=$nestedTransactionActive momentum=$momentumSessionActive ${targetLabel(target)}",
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
    val topBar = activeTopBar?.takeIf { nestedTransactionActive && it.isNestedDirectCapable }
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
    recordLedgerPre(dy, pre.reportedConsumedY, type)

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
    throwawayConsumed.fill(0)
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
    if (!nestedTransactionActive) return

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
    recordLedgerPost(dyConsumed, dyUnconsumed, chromePost, type)

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
  // Session binding / lifecycle. The source remains the only movement driver.
  // ---------------------------------------------------------------------------

  /**
   * Bind the transaction to the source and to whatever chrome is on this screen.
   *
   * Called for both the touch session and the momentum session the source opens after it, because
   * a fling is not a new gesture: rebinding is how the second half of the same movement finds the
   * same consumers.
   */
  private fun beginNestedSession(target: View) {
    flushPendingLedger("session-rebind")
    preCount = 0
    postCount = 0

    val react = target as? ReactScrollView
    val topBar = NativeNestedScrollRegistry.resolveTopBar(target)
    val toolbar = NativeNestedScrollRegistry.resolveToolbar(target)
    activeSource = react
    activeTopBar = topBar
    activeToolbar = toolbar

    val topBarReady = react != null && topBar?.beginNestedTransaction(react) == true
    val toolbarReady = react != null && toolbar?.beginNestedTransaction(react) == true
    nestedTransactionActive = topBarReady || toolbarReady

    log(
      "TX_BIND source=${react?.id} topBar=$topBarReady toolbar=$toolbarReady " +
        "active=$nestedTransactionActive " +
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
    flushPendingLedger(reason)
    if (!nestedTransactionActive) return
    val source = target as? ReactScrollView ?: activeSource
    if (source != null) activeTopBar?.endNestedTransaction(source, reason)
    activeToolbar?.endNestedTransaction()
    nestedTransactionActive = false
    log(
      "TX_END reason=$reason sourceY=${source?.scrollY} ledgerFrames=$ledgerFrames " +
        "broken=$ledgerBrokenFrames orphanPre=$ledgerOrphanPres",
    )
  }

  // ---------------------------------------------------------------------------
  // Transaction diagnostics.
  // ---------------------------------------------------------------------------

  private fun recordLedgerPre(requestedY: Int, chromePreY: Int, type: Int) {
    if (!NativeScrollTracing.enabled) {
      ledgerPending = false
      return
    }
    flushPendingLedger("next-pre")
    ledgerRequestedY = requestedY
    ledgerChromePreY = chromePreY
    ledgerPending = true
    log(
      "TX_LEDGER_PRE type=${typeLabel(type)} requested=$requestedY chromePre=$chromePreY",
    )
  }

  private fun recordLedgerPost(
    childConsumedY: Int,
    dyUnconsumed: Int,
    chromePostY: Int,
    type: Int,
  ) {
    if (!NativeScrollTracing.enabled || !ledgerPending) return

    ledgerFrames += 1
    val remaining = dyUnconsumed - chromePostY
    val sum = ledgerChromePreY + childConsumedY + chromePostY + remaining
    val balanced = sum == ledgerRequestedY
    if (!balanced) ledgerBrokenFrames += 1

    log(
      "TX_LEDGER type=${typeLabel(type)} n=$ledgerFrames requested=$ledgerRequestedY " +
        "chromePre=$ledgerChromePreY child=$childConsumedY chromePost=$chromePostY " +
        "remaining=$remaining sum=$sum balanced=$balanced broken=$ledgerBrokenFrames " +
        "orphanPre=$ledgerOrphanPres",
    )
    ledgerPending = false
  }

  private fun flushPendingLedger(reason: String) {
    if (!ledgerPending) return
    if (!NativeScrollTracing.enabled) {
      ledgerPending = false
      return
    }

    ledgerOrphanPres += 1
    log(
      "TX_LEDGER orphanPre n=$ledgerOrphanPres reason=$reason requested=$ledgerRequestedY " +
        "chromePre=$ledgerChromePreY",
    )
    ledgerPending = false
  }

  // ---------------------------------------------------------------------------
  // Tree / diagnostics.
  // ---------------------------------------------------------------------------

  private fun collectScrollViewDescendants(
    view: View,
    output: MutableList<android.widget.ScrollView>,
  ) {
    if (view !== this && view is android.widget.ScrollView) output += view
    if (view !is ViewGroup) return
    for (index in 0 until view.childCount) {
      collectScrollViewDescendants(view.getChildAt(index), output)
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
