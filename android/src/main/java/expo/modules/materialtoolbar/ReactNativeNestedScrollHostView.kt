package expo.modules.materialtoolbar

import android.content.Context
import android.os.SystemClock
import android.util.Log
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.core.view.NestedScrollingParent3
import androidx.core.view.NestedScrollingParentHelper
import androidx.core.view.ViewCompat
import com.reactnativescroll.interop.core.SourceScopedNestedScrollLifecycle
import com.reactnativescroll.interop.core.SourceScopedNestedScrollLifecycle.StopDecision
import com.reactnativescroll.interop.core.VerticalNestedScrollTransactionDispatcher
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * Native nested-scrolling ancestor for React Native vertical scroll sources.
 *
 * The source always owns gesture/fling physics. This host only consumes or observes the real
 * synchronous nested-scroll transaction Android delivers. It never runs a scroller, never calls
 * scrollBy/scrollTo on the child, and never reconstructs motion from sampled scrollY.
 *
 * RN 0.83 uses ReactScrollView. RN 0.87 can use the Kotlin-internal ReactNestedScrollView. The host
 * treats both as ViewGroup transaction sources through [ReactVerticalScrollSourceInterop]; the
 * nested-scroll callback target remains authoritative.
 */
class ReactNativeNestedScrollHostView(
  context: Context,
  appContext: AppContext,
) : ExpoView(context, appContext), NestedScrollingParent3 {

  private val nestedParentHelper = NestedScrollingParentHelper(this)
  private val sourceLifecycle = SourceScopedNestedScrollLifecycle()
  private val transactionDispatcher = VerticalNestedScrollTransactionDispatcher()

  private var eventSequence = 0L
  private var preCount = 0L
  private var postCount = 0L

  private var activeTopBar: TopAppBarScrollConsumer? = null
  private var activeToolbar: FloatingToolbarScrollConsumer? = null
  private var activeSourceCapabilities: ReactVerticalScrollSourceCapabilities? = null
  private var nestedTransactionActive = false

  private val topBarPreConsumer =
    VerticalNestedScrollTransactionDispatcher.PreConsumer { availableY, inputType ->
      activeTopBar
        ?.takeIf { nestedTransactionActive && it.isNestedDirectCapable }
        ?.nestedPreScroll(availableY, inputType.toInputType())
        ?.reportedConsumedY
        ?: 0
    }

  private val topBarPostConsumer =
    VerticalNestedScrollTransactionDispatcher.PostConsumer { childConsumedY, availableY, inputType ->
      activeTopBar
        ?.takeIf { nestedTransactionActive && it.isNestedDirectCapable }
        ?.nestedPostScroll(childConsumedY, availableY, inputType.toInputType())
        ?.availableConsumedY
        ?: 0
    }

  private val floatingToolbarPostObserver =
    VerticalNestedScrollTransactionDispatcher.PostObserver { childConsumedY, inputType ->
      activeToolbar
        ?.takeIf { nestedTransactionActive }
        ?.nestedPostScroll(childConsumedY, inputType.toInputType())
    }

  private val topBarPreConsumers = listOf(topBarPreConsumer)
  private val topBarPostConsumers = listOf(topBarPostConsumer)
  private val floatingToolbarPostObservers = listOf(floatingToolbarPostObserver)

  private val activeSource: ViewGroup?
    get() = sourceLifecycle.activeSource

  private val momentumSource: ViewGroup?
    get() = sourceLifecycle.momentumSource

  private val throwawayConsumed = IntArray(2)

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
    clearActiveSession()
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
   * Discovery only enables nested scrolling and installs TopAppBar visual geometry. The source and
   * consumers are rebound from Android's actual nested-scroll target in [beginNestedSession].
   */
  fun refreshNestedChromeBinding(): Boolean {
    if (!isAttachedToWindow) return false

    val reactSources = mutableListOf<ViewGroup>()
    collectReactVerticalScrollSources(this, reactSources)
    if (reactSources.isEmpty()) {
      log("SOURCE_TREE no-react-vertical-source childCount=$childCount")
      return false
    }

    reactSources.forEach { source ->
      val before = ViewCompat.isNestedScrollingEnabled(source)
      if (!before) ViewCompat.setNestedScrollingEnabled(source, true)
      val after = ViewCompat.isNestedScrollingEnabled(source)
      if (before != after) {
        log("SOURCE_ENABLE_NESTED ${targetLabel(source)} before=$before after=$after")
      }
    }

    if (reactSources.size != 1) {
      log("SOURCE_TREE ambiguousReactSources count=${reactSources.size} failClosed=true")
      return true
    }

    val source = reactSources.single()
    val topBar = NativeNestedScrollRegistry.resolveTopBar(source)
    val toolbar = NativeNestedScrollRegistry.resolveToolbar(source)
    val prepared = topBar?.prepareNestedSource(source) == true

    log(
      "SOURCE_TREE ${targetLabel(source)} " +
        "canUp=${source.canScrollVertically(-1)} canDown=${source.canScrollVertically(1)} " +
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
  // Platform nested contract used by the legacy android.widget.ScrollView source.
  // ---------------------------------------------------------------------------

  override fun onStartNestedScroll(child: View, target: View, axes: Int): Boolean {
    val accepted = axes and ViewCompat.SCROLL_AXIS_VERTICAL != 0
    if (accepted) beginNestedSession(target, ViewCompat.TYPE_TOUCH)
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
    val targetSource = target as? ViewGroup
    val activeTarget = sourceLifecycle.isActive(targetSource)
    val decision = targetSource?.let { sourceLifecycle.stop(it, ViewCompat.TYPE_TOUCH) } ?: StopDecision.Stale
    log(
      "NESTED_STOP contract=platform preCount=$preCount postCount=$postCount " +
        "active=$nestedTransactionActive activeTarget=$activeTarget ${targetLabel(target)}",
    )
    if (decision == StopDecision.Stale) {
      log(
        "TX_STALE_STOP contract=platform ignored=true " +
          "activeSource=${sourceIdentity(activeSource)} ${targetLabel(target)}",
      )
      return
    }
    nestedParentHelper.onStopNestedScroll(target)
    completeStop(target, decision)
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
  // Parent2 / Parent3 typed contract used by AndroidX and the 0.83 momentum proof.
  // ---------------------------------------------------------------------------

  private fun sourceOwnsMomentum(target: View): Boolean =
    activeSourceCapabilities
      ?.takeIf { it.view === target }
      ?.supportsTypedNestedScrolling
      ?: ReactVerticalScrollSourceInterop.supportsTypedNestedScrolling(target)

  override fun onStartNestedScroll(child: View, target: View, axes: Int, type: Int): Boolean {
    val accepted = axes and ViewCompat.SCROLL_AXIS_VERTICAL != 0
    if (accepted) beginNestedSession(target, type)
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
    val targetSource = target as? ViewGroup
    val activeTarget = sourceLifecycle.isActive(targetSource)
    val momentumOwner = sourceLifecycle.isMomentumOwner(targetSource)
    val decision = targetSource?.let { sourceLifecycle.stop(it, type) } ?: StopDecision.Stale
    log(
      "NESTED_STOP contract=androidx type=${typeLabel(type)} preCount=$preCount postCount=$postCount " +
        "active=$nestedTransactionActive activeTarget=$activeTarget " +
        "momentumOwner=$momentumOwner ${targetLabel(target)}",
    )
    if (decision == StopDecision.Stale) {
      log(
        "TX_STALE_STOP type=${typeLabel(type)} ignored=true " +
          "activeSource=${sourceIdentity(activeSource)} ${targetLabel(target)}",
      )
      return
    }
    nestedParentHelper.onStopNestedScroll(target, type)
    completeStop(target, decision)
  }

  override fun onNestedPreScroll(
    target: View,
    dx: Int,
    dy: Int,
    consumed: IntArray,
    type: Int,
  ) {
    if (!sourceLifecycle.isActive(target as? ViewGroup)) {
      log(
        "TX_STALE_PRE type=${typeLabel(type)} dy=$dy ignored=true " +
          "activeSource=${sourceIdentity(activeSource)} ${targetLabel(target)}",
      )
      return
    }

    preCount += 1
    val dispatch = transactionDispatcher.dispatchPre(
      requestedY = dy,
      inputType = type,
      trackConservation = NativeScrollTracing.enabled,
    )
    consumed[1] += dispatch.consumedY
    recordLedgerPre(dispatch, type)

    if (!dispatch.dispatched) {
      log(
        "NESTED_PRE type=${typeLabel(type)} n=$preCount dy=$dy consumedY=${consumed[1]} " +
          targetLabel(target),
      )
      return
    }

    log(
      "TX_PRE type=${typeLabel(type)} n=$preCount dy=$dy chrome=${dispatch.consumedY} " +
        "collapse=${activeTopBar?.currentCollapseAmountPx()} sourceY=${target.scrollY}",
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
    if (!sourceLifecycle.isActive(target as? ViewGroup)) {
      log(
        "TX_STALE_POST type=${typeLabel(type)} child=$dyConsumed unconsumed=$dyUnconsumed " +
          "ignored=true activeSource=${sourceIdentity(activeSource)} ${targetLabel(target)}",
      )
      return
    }

    postCount += 1
    if (!nestedTransactionActive) return

    val dispatch = transactionDispatcher.dispatchPost(
      childConsumedY = dyConsumed,
      availableY = dyUnconsumed,
      inputType = type,
      trackConservation = NativeScrollTracing.enabled,
    )
    consumed[1] += dispatch.consumedY
    recordLedgerPost(dispatch, type)

    log(
      "TX_POST type=${typeLabel(type)} n=$postCount child=$dyConsumed unconsumed=$dyUnconsumed " +
        "chrome=${dispatch.consumedY} collapse=${activeTopBar?.currentCollapseAmountPx()} " +
        "sourceY=${target.scrollY}",
    )
  }

  private fun Int.toInputType(): NativeNestedInputType =
    if (this == ViewCompat.TYPE_NON_TOUCH) NativeNestedInputType.NonTouch
    else NativeNestedInputType.Touch

  // ---------------------------------------------------------------------------
  // Session binding / lifecycle.
  // ---------------------------------------------------------------------------

  private fun beginNestedSession(target: View, type: Int) {
    val capabilities = ReactVerticalScrollSourceInterop.resolve(target)
    val source = capabilities?.view
    if (source == null) {
      log("TX_BIND rejected=unsupported ${targetLabel(target)}")
      return
    }

    val replacement = sourceLifecycle.begin(source, type)
    if (replacement != null) abandonActiveSession(replacement)

    flushPendingLedger("session-rebind")
    preCount = 0
    postCount = 0

    val topBar = NativeNestedScrollRegistry.resolveTopBar(target)
    val toolbar = NativeNestedScrollRegistry.resolveToolbar(target)
    activeSourceCapabilities = capabilities
    activeTopBar = topBar
    activeToolbar = toolbar

    val topBarReady = topBar?.beginNestedTransaction(source) == true
    val toolbarReady = toolbar?.beginNestedTransaction(source) == true
    transactionDispatcher.bind(
      preConsumers = if (topBarReady) topBarPreConsumers else emptyList(),
      postConsumers = if (topBarReady) topBarPostConsumers else emptyList(),
      postObservers = if (toolbarReady) floatingToolbarPostObservers else emptyList(),
    )
    nestedTransactionActive = transactionDispatcher.hasParticipants

    log(
      "TX_BIND source=${source.id} sourceIdentity=${sourceIdentity(source)} " +
        "sourceClass=${source.javaClass.name} kind=${capabilities.kind} " +
        "typed=${capabilities.supportsTypedNestedScrolling} topBar=$topBarReady " +
        "toolbar=$toolbarReady active=$nestedTransactionActive " +
        "surfaceSource=${surfaceId(target)} surfaceHost=${surfaceId(this)}",
    )
  }

  private fun abandonActiveSession(replacement: SourceScopedNestedScrollLifecycle.Replacement) {
    flushPendingLedger("source-replaced")
    log(
      "TX_ABORT reason=source-replaced previous=${sourceIdentity(replacement.previous)} " +
        "replacement=${sourceIdentity(replacement.replacement)} " +
        "momentum=${replacement.previousMomentumOwner === replacement.previous} " +
        "active=$nestedTransactionActive",
    )
    transactionDispatcher.clearParticipants()
    activeTopBar = null
    activeToolbar = null
    activeSourceCapabilities = null
    nestedTransactionActive = false
  }

  private fun completeStop(target: View, decision: StopDecision) {
    when (decision) {
      StopDecision.Stale -> Unit
      StopDecision.DeferTouchForMomentum ->
        log("TX_TOUCH_STOP deferred=momentum ${targetLabel(target)}")
      StopDecision.EndTouch -> finishMovement(target, "touch-stop")
      StopDecision.EndMomentum -> finishMovement(target, "momentum-stop")
    }
  }

  private fun finishMovement(target: View, reason: String) {
    if (!sourceLifecycle.isActive(target as? ViewGroup)) {
      log(
        "TX_STALE_END reason=$reason ignored=true activeSource=${sourceIdentity(activeSource)} " +
          targetLabel(target),
      )
      return
    }

    flushPendingLedger(reason)
    val source = activeSource ?: return
    if (nestedTransactionActive) {
      activeTopBar?.endNestedTransaction(source, reason)
      activeToolbar?.endNestedTransaction()
    }
    val ledger = transactionDispatcher.snapshot()
    log(
      "TX_END reason=$reason sourceY=${source.scrollY} ledgerFrames=${ledger.frames} " +
        "broken=${ledger.brokenFrames} orphanPre=${ledger.orphanPres}",
    )
    clearActiveSession()
  }

  private fun clearActiveSession() {
    transactionDispatcher.clearParticipants()
    sourceLifecycle.clear()
    activeTopBar = null
    activeToolbar = null
    activeSourceCapabilities = null
    nestedTransactionActive = false
  }

  // ---------------------------------------------------------------------------
  // Transaction diagnostics.
  // ---------------------------------------------------------------------------

  private fun recordLedgerPre(
    dispatch: VerticalNestedScrollTransactionDispatcher.PreDispatch,
    type: Int,
  ) {
    if (!NativeScrollTracing.enabled) return
    val begin = dispatch.ledgerResult ?: return
    begin.orphanBeforePre?.let { orphan ->
      log(
        "TX_LEDGER orphanPre n=${orphan.index} reason=next-pre requested=${orphan.requestedY} " +
          "chromePre=${orphan.chromePreY}",
      )
    }
    log(
      "TX_LEDGER_PRE type=${typeLabel(type)} requested=${begin.pre.requestedY} " +
        "chromePre=${begin.pre.chromePreY}",
    )
  }

  private fun recordLedgerPost(
    dispatch: VerticalNestedScrollTransactionDispatcher.PostDispatch,
    type: Int,
  ) {
    if (!NativeScrollTracing.enabled) return
    val frame = dispatch.ledgerFrame ?: return

    log(
      "TX_LEDGER type=${typeLabel(type)} n=${frame.index} requested=${frame.requestedY} " +
        "chromePre=${frame.chromePreY} child=${frame.childConsumedY} chromePost=${frame.chromePostY} " +
        "remaining=${frame.remainingY} sum=${frame.sumY} balanced=${frame.balanced} " +
        "broken=${frame.brokenFrames} orphanPre=${frame.orphanPres}",
    )
  }

  private fun flushPendingLedger(reason: String) {
    if (!NativeScrollTracing.enabled) {
      transactionDispatcher.discardPending()
      return
    }

    val orphan = transactionDispatcher.flushPending() ?: return
    log(
      "TX_LEDGER orphanPre n=${orphan.index} reason=$reason requested=${orphan.requestedY} " +
        "chromePre=${orphan.chromePreY}",
    )
  }

  // ---------------------------------------------------------------------------
  // Tree / diagnostics.
  // ---------------------------------------------------------------------------

  private fun collectReactVerticalScrollSources(view: View, output: MutableList<ViewGroup>) {
    if (view !== this) ReactVerticalScrollSourceInterop.asSupported(view)?.let(output::add)
    if (view !is ViewGroup) return
    for (index in 0 until view.childCount) {
      collectReactVerticalScrollSources(view.getChildAt(index), output)
    }
  }

  private fun sourceIdentity(source: View?): String =
    if (source == null) "none"
    else "${source.javaClass.name}#${source.id}@${Integer.toHexString(System.identityHashCode(source))}"

  private fun targetLabel(target: View): String =
    "target=${sourceIdentity(target)} y=${target.scrollY} " +
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
