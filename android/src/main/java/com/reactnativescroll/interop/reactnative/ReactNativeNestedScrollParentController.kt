package com.reactnativescroll.interop.reactnative

import android.os.SystemClock
import android.util.Log
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import androidx.core.view.NestedScrollingParentHelper
import androidx.core.view.ViewCompat
import com.reactnativescroll.interop.core.SourceScopedNestedScrollLifecycle
import com.reactnativescroll.interop.core.SourceScopedNestedScrollLifecycle.StopDecision
import com.reactnativescroll.interop.core.VerticalNestedScrollTransactionDispatcher
import com.reactnativescroll.interop.material3.FloatingToolbarScrollConsumer
import com.reactnativescroll.interop.material3.Material3FloatingToolbarNestedScrollAdapter
import com.reactnativescroll.interop.material3.Material3TopAppBarNestedScrollAdapter
import com.reactnativescroll.interop.material3.TopAppBarScrollConsumer
import expo.modules.materialtoolbar.NATIVE_SCROLL_LOG_TAG
import expo.modules.materialtoolbar.NativeNestedScrollRegistry
import expo.modules.materialtoolbar.NativeScrollTracing

/**
 * Reusable Android nested-scroll parent controller for a React Native vertical scroll source.
 *
 * The owning ViewGroup remains the real Android ancestor. This controller owns only transaction
 * lifecycle, participant binding and PRE/POST dispatch. It never owns source motion, starts a
 * scroller, samples scrollY as transport, or calls scrollBy/scrollTo on the source.
 *
 * A standalone [expo.modules.materialtoolbar.ReactNativeNestedScrollHostView] can discover its
 * descendant source and delegate here. A navigation screen that already knows its content
 * ScrollView can instead pass that source directly through [prepareNestedSource] and forward the
 * same NestedScrollingParent callbacks.
 */
class ReactNativeNestedScrollParentController(
  private val owner: ViewGroup,
) {
  private val nestedParentHelper = NestedScrollingParentHelper(owner)
  private val sourceLifecycle = SourceScopedNestedScrollLifecycle()
  private val transactionDispatcher = VerticalNestedScrollTransactionDispatcher()

  private var eventSequence = 0L
  private var preCount = 0L
  private var postCount = 0L

  private var activeTopBar: TopAppBarScrollConsumer? = null
  private var activeToolbar: FloatingToolbarScrollConsumer? = null
  private var activeSourceCapabilities: ReactVerticalScrollSourceCapabilities? = null
  private var nestedTransactionActive = false

  private val activeSource: ViewGroup?
    get() = sourceLifecycle.activeSource

  private val throwawayConsumed = IntArray(2)

  fun traceTouchEvent(ev: MotionEvent) {
    if (!NativeScrollTracing.enabled) return
    when (ev.actionMasked) {
      MotionEvent.ACTION_DOWN ->
        log("TOUCH_DOWN pointers=${ev.pointerCount} downTime=${ev.downTime}")
      MotionEvent.ACTION_UP -> log("TOUCH_UP eventTime=${ev.eventTime}")
      MotionEvent.ACTION_CANCEL -> log("TOUCH_CANCEL eventTime=${ev.eventTime}")
    }
  }

  fun traceNoReactVerticalSource(childCount: Int) {
    log("SOURCE_TREE no-react-vertical-source childCount=$childCount")
  }

  fun traceAmbiguousReactSources(count: Int) {
    log("SOURCE_TREE ambiguousReactSources count=$count failClosed=true")
  }

  fun ensureNestedScrollingEnabled(source: ViewGroup) {
    val before = ViewCompat.isNestedScrollingEnabled(source)
    if (!before) ViewCompat.setNestedScrollingEnabled(source, true)
    val after = ViewCompat.isNestedScrollingEnabled(source)
    if (before != after) {
      log("SOURCE_ENABLE_NESTED ${targetLabel(source)} before=$before after=$after")
    }
  }

  /**
   * Prepare geometry for a source already identified by the owning screen/host.
   *
   * This does not grant transaction authority. Android's real nested-scroll `target` is still
   * resolved again when [onStartNestedScroll] begins the actual synchronous transaction.
   */
  fun prepareNestedSource(source: ViewGroup): Boolean {
    ensureNestedScrollingEnabled(source)
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

  fun onOwnerDetached() {
    flushPendingLedger("detach")
    clearActiveSession()
  }

  // ---------------------------------------------------------------------------
  // Platform nested contract used by the legacy android.widget.ScrollView source.
  // ---------------------------------------------------------------------------

  fun onStartNestedScroll(child: View, target: View, axes: Int): Boolean {
    val accepted = axes and ViewCompat.SCROLL_AXIS_VERTICAL != 0
    if (accepted) beginNestedSession(target, ViewCompat.TYPE_TOUCH)
    log(
      "NESTED_START contract=platform axes=${axesLabel(axes)} accepted=$accepted " +
        "active=$nestedTransactionActive ${targetLabel(target)}",
    )
    return accepted
  }

  fun onNestedScrollAccepted(child: View, target: View, axes: Int) {
    nestedParentHelper.onNestedScrollAccepted(child, target, axes)
    log("NESTED_ACCEPT contract=platform axes=${axesLabel(axes)} ${targetLabel(target)}")
  }

  fun onStopNestedScroll(target: View) {
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

  fun onNestedPreScroll(target: View, dx: Int, dy: Int, consumed: IntArray) =
    onNestedPreScroll(target, dx, dy, consumed, ViewCompat.TYPE_TOUCH)

  fun onNestedScroll(
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

  fun onNestedPreFling(target: View, velocityX: Float, velocityY: Float): Boolean {
    log(
      "NESTED_PRE_FLING vx=$velocityX vy=$velocityY preCount=$preCount " +
        "sourceOwnsMomentum=${sourceOwnsMomentum(target)} active=$nestedTransactionActive " +
        targetLabel(target),
    )
    return false
  }

  fun onNestedFling(
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

  fun getNestedScrollAxes(): Int = nestedParentHelper.nestedScrollAxes

  // ---------------------------------------------------------------------------
  // Parent2 / Parent3 typed contract used by AndroidX.
  // ---------------------------------------------------------------------------

  private fun sourceOwnsMomentum(target: View): Boolean =
    activeSourceCapabilities
      ?.takeIf { it.view === target }
      ?.supportsTypedNestedScrolling
      ?: ReactVerticalScrollSourceInterop.supportsTypedNestedScrolling(target)

  fun onStartNestedScroll(child: View, target: View, axes: Int, type: Int): Boolean {
    val accepted = axes and ViewCompat.SCROLL_AXIS_VERTICAL != 0
    if (accepted) beginNestedSession(target, type)
    log(
      "NESTED_START contract=androidx type=${typeLabel(type)} axes=${axesLabel(axes)} " +
        "accepted=$accepted active=$nestedTransactionActive ${targetLabel(target)}",
    )
    return accepted
  }

  fun onNestedScrollAccepted(child: View, target: View, axes: Int, type: Int) {
    nestedParentHelper.onNestedScrollAccepted(child, target, axes, type)
    log(
      "NESTED_ACCEPT contract=androidx type=${typeLabel(type)} axes=${axesLabel(axes)} " +
        targetLabel(target),
    )
  }

  fun onStopNestedScroll(target: View, type: Int) {
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

  fun onNestedPreScroll(
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

  fun onNestedScroll(
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

  fun onNestedScroll(
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
    val topBarAdapter =
      if (topBarReady && topBar != null) Material3TopAppBarNestedScrollAdapter(topBar) else null
    val toolbarAdapter =
      if (toolbarReady && toolbar != null) Material3FloatingToolbarNestedScrollAdapter(toolbar) else null
    transactionDispatcher.bindParticipants(
      preConsumers = if (topBarAdapter != null) listOf(topBarAdapter) else emptyList(),
      postConsumers = if (topBarAdapter != null) listOf(topBarAdapter) else emptyList(),
      postObservers = if (toolbarAdapter != null) listOf(toolbarAdapter) else emptyList(),
    )
    nestedTransactionActive = transactionDispatcher.hasParticipants

    log(
      "TX_BIND source=${source.id} sourceIdentity=${sourceIdentity(source)} " +
        "sourceClass=${source.javaClass.name} kind=${capabilities.kind} " +
        "typed=${capabilities.supportsTypedNestedScrolling} topBar=$topBarReady " +
        "toolbar=$toolbarReady active=$nestedTransactionActive " +
        "surfaceSource=${surfaceId(target)} surfaceHost=${surfaceId(owner)}",
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
  // Diagnostics.
  // ---------------------------------------------------------------------------

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
