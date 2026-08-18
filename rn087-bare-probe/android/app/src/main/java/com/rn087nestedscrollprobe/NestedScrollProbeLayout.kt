package com.rn087nestedscrollprobe

import android.content.Context
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.FrameLayout
import androidx.core.view.NestedScrollingParent3
import androidx.core.view.NestedScrollingParentHelper
import androidx.core.view.ViewCompat
import com.reactnativescroll.interop.core.SourceScopedNestedScrollLifecycle
import com.reactnativescroll.interop.core.VerticalNestedScrollTransactionDispatcher

class NestedScrollProbeLayout(context: Context) : FrameLayout(context), NestedScrollingParent3 {
  private val parentHelper = NestedScrollingParentHelper(this)
  private val throwawayConsumed = IntArray(2)
  private val lifecycle = SourceScopedNestedScrollLifecycle()

  private val chromeController =
    if (BuildConfig.RN_CHROME_PROBE) {
      ChromeProbeController(
        host = this,
        log = ::log,
        onGeometryChanged = { post { refreshChromeSource() } },
      )
    } else {
      null
    }

  private val chromePreConsumer =
    VerticalNestedScrollTransactionDispatcher.PreConsumer { availableY, inputType ->
      chromeController?.nestedPreScroll(availableY, inputType) ?: 0
    }
  private val chromePostConsumer =
    VerticalNestedScrollTransactionDispatcher.PostConsumer { childConsumedY, availableY, inputType ->
      chromeController?.nestedPostScroll(childConsumedY, availableY, inputType) ?: 0
    }
  private val chromePreConsumers = listOf(chromePreConsumer)
  private val chromePostConsumers = listOf(chromePostConsumer)
  private val dispatcher = VerticalNestedScrollTransactionDispatcher()

  private var waitingForSourceLayout = false

  private val sourceLayoutListener = ViewTreeObserver.OnGlobalLayoutListener {
    if (!isAttachedToWindow) {
      stopWaitingForSourceLayout()
      return@OnGlobalLayoutListener
    }
    if (refreshChromeSource()) stopWaitingForSourceLayout()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (chromeController != null) {
      post {
        if (refreshChromeSource()) stopWaitingForSourceLayout()
        else startWaitingForSourceLayout()
      }
    }
  }

  override fun onDetachedFromWindow() {
    stopWaitingForSourceLayout()
    flushPendingLedger("detach")
    dispatcher.clearParticipants()
    lifecycle.clear()
    chromeController?.onDetached()
    super.onDetachedFromWindow()
  }

  private fun typeName(type: Int): String =
    if (type == ViewCompat.TYPE_NON_TOUCH) "NON_TOUCH" else "TOUCH"

  private fun targetName(target: View): String =
    "${target.javaClass.name}#${Integer.toHexString(System.identityHashCode(target))}"

  private fun sourceName(source: ViewGroup?): String =
    source?.let(::targetName) ?: "none"

  private fun log(message: String) {
    Log.i("Rn087NestedScroll", message)
  }

  override fun onStartNestedScroll(child: View, target: View, axes: Int, type: Int): Boolean {
    val source = asReactVerticalSource(target)
    val accepted = axes and ViewCompat.SCROLL_AXIS_VERTICAL != 0 && source != null
    if (accepted && source != null) {
      val replacement = lifecycle.begin(source, type)
      if (replacement != null) {
        flushPendingLedger("source-replaced")
        log(
          "LIFECYCLE_SOURCE_REPLACED old=${sourceName(replacement.previous)} " +
            "new=${targetName(replacement.replacement)} " +
            "oldMomentum=${sourceName(replacement.previousMomentumOwner)}",
        )
      } else {
        flushPendingLedger("session-rebind")
      }

      val chromeReady = chromeController?.beginNestedTransaction(source) == true
      dispatcher.bind(
        preConsumers = if (chromeReady) chromePreConsumers else emptyList(),
        postConsumers = if (chromeReady) chromePostConsumers else emptyList(),
        postObservers = emptyList(),
      )
    }
    log(
      "NESTED_START contract=androidx type=${typeName(type)} axes=$axes accepted=$accepted " +
        "chrome=${chromeController != null} activeSource=${sourceName(lifecycle.activeSource)} " +
        "momentumOwner=${sourceName(lifecycle.momentumSource)} target=${targetName(target)}",
    )
    return accepted
  }

  override fun onNestedScrollAccepted(child: View, target: View, axes: Int, type: Int) {
    if (!lifecycle.isActive(target as? ViewGroup)) {
      log(
        "LIFECYCLE_STALE_ACCEPT type=${typeName(type)} ignored=true " +
          "activeSource=${sourceName(lifecycle.activeSource)} target=${targetName(target)}",
      )
      return
    }
    parentHelper.onNestedScrollAccepted(child, target, axes, type)
  }

  override fun onStopNestedScroll(target: View, type: Int) {
    val source = target as? ViewGroup
    val activeTarget = lifecycle.isActive(source)
    val momentumOwner = lifecycle.isMomentumOwner(source)
    val snapshot = dispatcher.snapshot()
    log(
      "NESTED_STOP contract=androidx type=${typeName(type)} activeTarget=$activeTarget " +
        "momentumOwner=$momentumOwner ledgerFrames=${snapshot.frames} " +
        "broken=${snapshot.brokenFrames} orphan=${snapshot.orphanPres} target=${targetName(target)}",
    )

    if (!activeTarget || source == null) {
      log(
        "LIFECYCLE_STALE_STOP type=${typeName(type)} ignored=true " +
          "activeSource=${sourceName(lifecycle.activeSource)} target=${targetName(target)}",
      )
      return
    }

    val decision = lifecycle.stop(source, type)
    if (decision == SourceScopedNestedScrollLifecycle.StopDecision.Stale) {
      log(
        "LIFECYCLE_STALE_STOP type=${typeName(type)} ignored=true " +
          "activeSource=${sourceName(lifecycle.activeSource)} target=${targetName(target)}",
      )
      return
    }

    parentHelper.onStopNestedScroll(target, type)

    when (decision) {
      SourceScopedNestedScrollLifecycle.StopDecision.EndMomentum -> {
        flushPendingLedger("momentum-stop")
        chromeController?.endNestedTransaction("momentum-stop")
        dispatcher.clearParticipants()
      }
      SourceScopedNestedScrollLifecycle.StopDecision.DeferTouchForMomentum ->
        log("CHROME_TOUCH_STOP deferred=momentum target=${targetName(target)}")
      SourceScopedNestedScrollLifecycle.StopDecision.EndTouch -> {
        flushPendingLedger("touch-stop")
        chromeController?.endNestedTransaction("touch-stop")
        dispatcher.clearParticipants()
      }
      SourceScopedNestedScrollLifecycle.StopDecision.Stale -> Unit
    }
  }

  override fun onNestedPreScroll(target: View, dx: Int, dy: Int, consumed: IntArray, type: Int) {
    if (!lifecycle.isActive(target as? ViewGroup)) {
      log(
        "LIFECYCLE_STALE_PRE type=${typeName(type)} dy=$dy ignored=true " +
          "activeSource=${sourceName(lifecycle.activeSource)} target=${targetName(target)}",
      )
      return
    }

    val dispatch = dispatcher.dispatchPre(
      requestedY = dy,
      inputType = type,
      trackConservation = chromeController != null,
    )
    consumed[1] += dispatch.consumedY
    recordLedgerPre(dispatch, type)
    log(
      "NESTED_PRE type=${typeName(type)} dx=$dx dy=$dy consumedX=${consumed[0]} " +
        "consumedY=${consumed[1]} chrome=${dispatch.consumedY} target=${targetName(target)}",
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
    if (!lifecycle.isActive(target as? ViewGroup)) {
      log(
        "LIFECYCLE_STALE_POST type=${typeName(type)} child=$dyConsumed unconsumed=$dyUnconsumed " +
          "ignored=true activeSource=${sourceName(lifecycle.activeSource)} target=${targetName(target)}",
      )
      return
    }

    val dispatch = dispatcher.dispatchPost(
      childConsumedY = dyConsumed,
      availableY = dyUnconsumed,
      inputType = type,
      trackConservation = chromeController != null,
    )
    consumed[1] += dispatch.consumedY
    recordLedgerPost(dispatch, type)
    log(
      "NESTED_POST type=${typeName(type)} childConsumedY=$dyConsumed remainingY=$dyUnconsumed " +
        "parentConsumedY=${consumed[1]} chrome=${dispatch.consumedY} target=${targetName(target)}",
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
    onNestedScroll(target, dxConsumed, dyConsumed, dxUnconsumed, dyUnconsumed, type, throwawayConsumed)
  }

  override fun onStartNestedScroll(child: View, target: View, axes: Int): Boolean =
    onStartNestedScroll(child, target, axes, ViewCompat.TYPE_TOUCH)

  override fun onNestedScrollAccepted(child: View, target: View, axes: Int) {
    if (!lifecycle.isActive(target as? ViewGroup)) {
      log(
        "LIFECYCLE_STALE_ACCEPT type=TOUCH ignored=true activeSource=${sourceName(lifecycle.activeSource)} " +
          "target=${targetName(target)}",
      )
      return
    }
    parentHelper.onNestedScrollAccepted(child, target, axes)
  }

  override fun onStopNestedScroll(target: View) {
    onStopNestedScroll(target, ViewCompat.TYPE_TOUCH)
  }

  override fun onNestedPreScroll(target: View, dx: Int, dy: Int, consumed: IntArray) {
    onNestedPreScroll(target, dx, dy, consumed, ViewCompat.TYPE_TOUCH)
  }

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
    log("NESTED_PRE_FLING vx=$velocityX vy=$velocityY target=${targetName(target)}")
    return false
  }

  override fun onNestedFling(
    target: View,
    velocityX: Float,
    velocityY: Float,
    consumed: Boolean,
  ): Boolean {
    log(
      "NESTED_FLING vx=$velocityX vy=$velocityY childConsumed=$consumed target=${targetName(target)}",
    )

    if (BuildConfig.RN_NESTED_SCROLL_FLING_SHIM && lifecycle.isActive(target as? ViewGroup)) {
      val started = ViewCompat.startNestedScroll(
        target,
        ViewCompat.SCROLL_AXIS_VERTICAL,
        ViewCompat.TYPE_NON_TOUCH,
      )
      log("PROBE_FLING_SESSION_SHIM started=$started target=${targetName(target)}")
    }

    return false
  }

  override fun getNestedScrollAxes(): Int = parentHelper.nestedScrollAxes

  private fun refreshChromeSource(): Boolean {
    val controller = chromeController ?: return true
    if (!isAttachedToWindow) return false

    val sources = mutableListOf<ViewGroup>()
    collectReactVerticalSources(this, sources)
    if (sources.isEmpty()) {
      log("CHROME_SOURCE_TREE none childCount=$childCount")
      return false
    }

    sources.forEach { source ->
      if (!ViewCompat.isNestedScrollingEnabled(source)) {
        ViewCompat.setNestedScrollingEnabled(source, true)
      }
    }

    if (sources.size != 1) {
      log("CHROME_SOURCE_TREE ambiguous count=${sources.size} failClosed=true")
      return true
    }

    val source = sources.single()
    lifecycle.invalidateForDiscoveredReplacement(source)?.let { replacement ->
      flushPendingLedger("source-invalidated")
      dispatcher.clearParticipants()
      log(
        "LIFECYCLE_SOURCE_INVALIDATED old=${sourceName(replacement.previous)} " +
          "discovered=${targetName(replacement.replacement)} " +
          "oldMomentum=${sourceName(replacement.previousMomentumOwner)}",
      )
    }

    val prepared = controller.prepareSource(source)
    log(
      "CHROME_SOURCE_TREE source=${targetName(source)} nested=${ViewCompat.isNestedScrollingEnabled(source)} " +
        "prepared=$prepared canUp=${source.canScrollVertically(-1)} canDown=${source.canScrollVertically(1)}",
    )
    return prepared
  }

  private fun collectReactVerticalSources(view: View, output: MutableList<ViewGroup>) {
    if (view !== this) asReactVerticalSource(view)?.let(output::add)
    if (view !is ViewGroup) return
    for (index in 0 until view.childCount) collectReactVerticalSources(view.getChildAt(index), output)
  }

  private fun asReactVerticalSource(view: View): ViewGroup? {
    val group = view as? ViewGroup ?: return null
    var type: Class<*>? = group.javaClass
    while (type != null) {
      if (
        type.name == "com.facebook.react.views.scroll.ReactScrollView" ||
          type.name == "com.facebook.react.views.scroll.ReactNestedScrollView"
      ) {
        return group
      }
      type = type.superclass
    }
    return null
  }

  private fun startWaitingForSourceLayout() {
    if (waitingForSourceLayout) return
    val observer = viewTreeObserver
    if (!observer.isAlive) return
    observer.addOnGlobalLayoutListener(sourceLayoutListener)
    waitingForSourceLayout = true
    log("CHROME_SOURCE_WAIT armed=true")
  }

  private fun stopWaitingForSourceLayout() {
    if (!waitingForSourceLayout) return
    val observer = viewTreeObserver
    if (observer.isAlive) observer.removeOnGlobalLayoutListener(sourceLayoutListener)
    waitingForSourceLayout = false
    log("CHROME_SOURCE_WAIT armed=false")
  }

  private fun recordLedgerPre(
    dispatch: VerticalNestedScrollTransactionDispatcher.PreDispatch,
    type: Int,
  ) {
    val result = dispatch.ledgerResult ?: return
    result.orphanBeforePre?.let { orphan ->
      log(
        "CHROME_LEDGER_ORPHAN n=${orphan.index} reason=next-pre requested=${orphan.requestedY} " +
          "chromePre=${orphan.chromePreY}",
      )
    }
    log(
      "CHROME_LEDGER_PRE type=${typeName(type)} requested=${result.pre.requestedY} " +
        "chromePre=${result.pre.chromePreY}",
    )
  }

  private fun recordLedgerPost(
    dispatch: VerticalNestedScrollTransactionDispatcher.PostDispatch,
    type: Int,
  ) {
    val frame = dispatch.ledgerFrame ?: return
    log(
      "CHROME_LEDGER type=${typeName(type)} n=${frame.index} requested=${frame.requestedY} " +
        "chromePre=${frame.chromePreY} child=${frame.childConsumedY} chromePost=${frame.chromePostY} " +
        "remaining=${frame.remainingY} sum=${frame.sumY} balanced=${frame.balanced} " +
        "broken=${frame.brokenFrames} orphan=${frame.orphanPres}",
    )
  }

  private fun flushPendingLedger(reason: String) {
    val orphan = dispatcher.flushPending() ?: return
    log(
      "CHROME_LEDGER_ORPHAN n=${orphan.index} reason=$reason requested=${orphan.requestedY} " +
        "chromePre=${orphan.chromePreY}",
    )
  }
}
