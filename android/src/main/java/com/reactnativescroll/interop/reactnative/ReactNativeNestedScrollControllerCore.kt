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

/** Consumer-agnostic transaction engine behind [ReactNativeNestedScrollParentController]. */
internal class ReactNativeNestedScrollControllerCore(
  private val owner: ViewGroup,
  private val facade: ReactNativeNestedScrollParentController,
) {
  private val parentHelper = NestedScrollingParentHelper(owner)
  private val lifecycle = SourceScopedNestedScrollLifecycle()
  private val dispatcher = VerticalNestedScrollTransactionDispatcher()

  private var preparedSource: ViewGroup? = null
  private var activeSession: ReactNativeNestedScrollParticipantSession? = null
  private var activeCapabilities: ReactVerticalScrollSourceCapabilities? = null
  private var transactionActive = false
  private var eventSequence = 0L
  private var preCount = 0L
  private var postCount = 0L
  private val throwawayConsumed = IntArray(2)

  fun traceTouchEvent(event: MotionEvent) {
    if (!NativeScrollTracing.enabled) return
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> log("TOUCH_DOWN pointers=${event.pointerCount}")
      MotionEvent.ACTION_UP -> log("TOUCH_UP")
      MotionEvent.ACTION_CANCEL -> log("TOUCH_CANCEL")
    }
  }

  fun traceNoReactVerticalSource(childCount: Int) =
    log("SOURCE_TREE no-react-vertical-source childCount=$childCount")

  fun traceAmbiguousReactSources(count: Int) =
    log("SOURCE_TREE ambiguousReactSources count=$count failClosed=true")

  fun ensureNestedScrollingEnabled(source: ViewGroup) {
    if (!ViewCompat.isNestedScrollingEnabled(source)) {
      ViewCompat.setNestedScrollingEnabled(source, true)
    }
  }

  fun prepareNestedSource(source: ViewGroup): Boolean {
    preparedSource = source
    ensureNestedScrollingEnabled(source)
    val participants = ReactNativeNestedScrollParticipants.prepare(source)
    log("SOURCE_TREE ${label(source)} participants=$participants")
    return true
  }

  fun onOwnerAttached() {
    ReactNativeNestedScrollParticipants.onOwnerAttached(facade)
    requestNestedParticipantBindingRefresh()
  }

  fun onOwnerDetached() {
    ReactNativeNestedScrollParticipants.onOwnerDetached(facade)
    preparedSource = null
    flushPendingLedger("detach")
    clearActiveSession()
  }

  fun requestNestedParticipantBindingRefresh() {
    if (!owner.isAttachedToWindow) return
    val source = preparedSource ?: return
    if (source.isAttachedToWindow) prepareNestedSource(source)
  }

  fun onStartNestedScroll(child: View, target: View, axes: Int): Boolean {
    val accepted = axes and ViewCompat.SCROLL_AXIS_VERTICAL != 0
    if (accepted) beginSession(target, ViewCompat.TYPE_TOUCH)
    return accepted
  }

  fun onNestedScrollAccepted(child: View, target: View, axes: Int) {
    parentHelper.onNestedScrollAccepted(child, target, axes)
  }

  fun onStopNestedScroll(target: View) {
    val source = target as? ViewGroup ?: return
    val decision = lifecycle.stop(source, ViewCompat.TYPE_TOUCH)
    if (decision == StopDecision.Stale) {
      log("TX_STALE_STOP contract=platform ${label(target)}")
      return
    }
    parentHelper.onStopNestedScroll(target)
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

  fun onNestedPreFling(target: View, velocityX: Float, velocityY: Float): Boolean = false

  fun onNestedFling(
    target: View,
    velocityX: Float,
    velocityY: Float,
    consumed: Boolean,
  ): Boolean = false

  fun nestedScrollAxes(): Int = parentHelper.nestedScrollAxes

  fun onStartNestedScroll(child: View, target: View, axes: Int, type: Int): Boolean {
    val accepted = axes and ViewCompat.SCROLL_AXIS_VERTICAL != 0
    if (accepted) beginSession(target, type)
    return accepted
  }

  fun onNestedScrollAccepted(child: View, target: View, axes: Int, type: Int) {
    parentHelper.onNestedScrollAccepted(child, target, axes, type)
  }

  fun onStopNestedScroll(target: View, type: Int) {
    val source = target as? ViewGroup ?: return
    val decision = lifecycle.stop(source, type)
    if (decision == StopDecision.Stale) {
      log("TX_STALE_STOP type=${typeLabel(type)} ${label(target)}")
      return
    }
    parentHelper.onStopNestedScroll(target, type)
    completeStop(target, decision)
  }

  fun onNestedPreScroll(
    target: View,
    dx: Int,
    dy: Int,
    consumed: IntArray,
    type: Int,
  ) {
    if (!lifecycle.isActive(target as? ViewGroup)) {
      log("TX_STALE_PRE type=${typeLabel(type)} dy=$dy ${label(target)}")
      return
    }

    preCount += 1
    val result = dispatcher.dispatchPre(
      requestedY = dy,
      inputType = type,
      trackConservation = NativeScrollTracing.enabled,
    )
    consumed[1] += result.consumedY
    result.ledgerResult?.orphanBeforePre?.let {
      log("TX_LEDGER orphanPre n=${it.index} reason=next-pre")
    }
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
    if (!lifecycle.isActive(target as? ViewGroup)) {
      log("TX_STALE_POST type=${typeLabel(type)} child=$dyConsumed ${label(target)}")
      return
    }
    postCount += 1
    if (!transactionActive) return

    val result = dispatcher.dispatchPost(
      childConsumedY = dyConsumed,
      availableY = dyUnconsumed,
      inputType = type,
      trackConservation = NativeScrollTracing.enabled,
    )
    consumed[1] += result.consumedY
    result.ledgerFrame?.takeIf { !it.balanced }?.let {
      log("TX_LEDGER_BROKEN n=${it.index} requested=${it.requestedY} sum=${it.sumY}")
    }
  }

  private fun beginSession(target: View, type: Int) {
    val capabilities = ReactVerticalScrollSourceInterop.resolve(target) ?: return
    val source = capabilities.view
    val replacement = lifecycle.begin(source, type)
    if (replacement != null) {
      flushPendingLedger("source-replaced")
      log("TX_ABORT reason=source-replaced previous=${label(replacement.previous)}")
      dispatcher.clearParticipants()
      activeSession = null
      transactionActive = false
    }

    flushPendingLedger("session-rebind")
    preCount = 0
    postCount = 0
    activeCapabilities = capabilities
    activeSession = ReactNativeNestedScrollParticipants.bind(source)
    val session = activeSession ?: return
    dispatcher.bindParticipants(
      preConsumers = session.preConsumers,
      postConsumers = session.postConsumers,
      postObservers = session.postObservers,
    )
    transactionActive = dispatcher.hasParticipants
    log("TX_BIND ${label(source)} participants=${session.debugLabel} active=$transactionActive")
  }

  private fun completeStop(target: View, decision: StopDecision) {
    when (decision) {
      StopDecision.Stale -> Unit
      StopDecision.DeferTouchForMomentum -> log("TX_TOUCH_STOP deferred=momentum")
      StopDecision.EndTouch -> finishMovement(target, "touch-stop")
      StopDecision.EndMomentum -> finishMovement(target, "momentum-stop")
    }
  }

  private fun finishMovement(target: View, reason: String) {
    if (!lifecycle.isActive(target as? ViewGroup)) return
    flushPendingLedger(reason)
    val source = lifecycle.activeSource ?: return
    if (transactionActive) activeSession?.end(source, reason)
    val snapshot = dispatcher.snapshot()
    log(
      "TX_END reason=$reason frames=${snapshot.frames} broken=${snapshot.brokenFrames} " +
        "orphanPre=${snapshot.orphanPres}",
    )
    clearActiveSession()
  }

  private fun clearActiveSession() {
    dispatcher.clearParticipants()
    lifecycle.clear()
    activeSession = null
    activeCapabilities = null
    transactionActive = false
  }

  private fun flushPendingLedger(reason: String) {
    if (!NativeScrollTracing.enabled) {
      dispatcher.discardPending()
      return
    }
    dispatcher.flushPending()?.let {
      log("TX_LEDGER orphanPre n=${it.index} reason=$reason requested=${it.requestedY}")
    }
  }

  private fun label(view: View): String =
    "${view.javaClass.name}#${view.id}@${Integer.toHexString(System.identityHashCode(view))}"

  private fun typeLabel(type: Int): String = when (type) {
    ViewCompat.TYPE_TOUCH -> "TOUCH"
    ViewCompat.TYPE_NON_TOUCH -> "NON_TOUCH"
    else -> type.toString()
  }

  private fun log(message: String) {
    if (!NativeScrollTracing.enabled) return
    eventSequence += 1
    Log.d(
      NATIVE_SCROLL_LOG_TAG,
      "SCROLL seq=$eventSequence t=${SystemClock.uptimeMillis()} $message",
    )
  }
}
