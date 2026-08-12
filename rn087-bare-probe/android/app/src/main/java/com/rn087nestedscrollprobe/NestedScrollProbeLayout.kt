package com.rn087nestedscrollprobe

import android.content.Context
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.FrameLayout
import androidx.core.view.NestedScrollingChild2
import androidx.core.view.NestedScrollingParent3
import androidx.core.view.NestedScrollingParentHelper
import androidx.core.view.ViewCompat

class NestedScrollProbeLayout(context: Context) : FrameLayout(context), NestedScrollingParent3 {
  private val parentHelper = NestedScrollingParentHelper(this)
  private val throwawayConsumed = IntArray(2)

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

  private var momentumSessionActive = false
  private var momentumExpected = false
  private var waitingForSourceLayout = false

  private var ledgerRequestedY = 0
  private var ledgerChromePreY = 0
  private var ledgerPending = false
  private var ledgerFrames = 0L
  private var ledgerBroken = 0L
  private var ledgerOrphans = 0L

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
    momentumSessionActive = false
    momentumExpected = false
    chromeController?.onDetached()
    super.onDetachedFromWindow()
  }

  private fun typeName(type: Int): String =
    if (type == ViewCompat.TYPE_NON_TOUCH) "NON_TOUCH" else "TOUCH"

  private fun targetName(target: View): String =
    "${target.javaClass.name}#${Integer.toHexString(System.identityHashCode(target))}"

  private fun log(message: String) {
    Log.i("Rn087NestedScroll", message)
  }

  private fun sourceOwnsMomentum(target: View): Boolean = target is NestedScrollingChild2

  override fun onStartNestedScroll(child: View, target: View, axes: Int, type: Int): Boolean {
    val source = asReactVerticalSource(target)
    val accepted = axes and ViewCompat.SCROLL_AXIS_VERTICAL != 0 && source != null
    if (accepted) {
      if (type == ViewCompat.TYPE_NON_TOUCH) {
        momentumSessionActive = true
        momentumExpected = false
      } else {
        // A new finger gesture supersedes any expectation that did not become NON_TOUCH.
        momentumExpected = false
      }
    }
    if (accepted && source != null) {
      flushPendingLedger("session-rebind")
      chromeController?.beginNestedTransaction(source)
    }
    log(
      "NESTED_START contract=androidx type=${typeName(type)} axes=$axes accepted=$accepted " +
        "chrome=${chromeController != null} momentum=$momentumSessionActive " +
        "expected=$momentumExpected target=${targetName(target)}",
    )
    return accepted
  }

  override fun onNestedScrollAccepted(child: View, target: View, axes: Int, type: Int) {
    parentHelper.onNestedScrollAccepted(child, target, axes, type)
  }

  override fun onStopNestedScroll(target: View, type: Int) {
    log(
      "NESTED_STOP contract=androidx type=${typeName(type)} momentum=$momentumSessionActive " +
        "expected=$momentumExpected sourceY=${target.scrollY} ledgerFrames=$ledgerFrames " +
        "broken=$ledgerBroken orphan=$ledgerOrphans target=${targetName(target)}",
    )
    parentHelper.onStopNestedScroll(target, type)

    if (type == ViewCompat.TYPE_NON_TOUCH) {
      momentumSessionActive = false
      momentumExpected = false
      flushPendingLedger("momentum-stop")
      chromeController?.endNestedTransaction("momentum-stop")
    } else if (momentumSessionActive || momentumExpected) {
      log(
        "CHROME_TOUCH_STOP deferred=momentum momentum=$momentumSessionActive " +
          "expected=$momentumExpected target=${targetName(target)}",
      )
    } else {
      flushPendingLedger("touch-stop")
      chromeController?.endNestedTransaction("touch-stop")
    }
  }

  override fun onNestedPreScroll(target: View, dx: Int, dy: Int, consumed: IntArray, type: Int) {
    val chromeConsumed = chromeController?.nestedPreScroll(dy, type) ?: 0
    consumed[1] += chromeConsumed
    recordLedgerPre(dy, chromeConsumed, type)
    log(
      "NESTED_PRE type=${typeName(type)} dx=$dx dy=$dy consumedX=${consumed[0]} " +
        "consumedY=${consumed[1]} chrome=$chromeConsumed target=${targetName(target)}",
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
    val chromeConsumed =
      chromeController?.nestedPostScroll(dyConsumed, dyUnconsumed, type) ?: 0
    consumed[1] += chromeConsumed
    recordLedgerPost(dyConsumed, dyUnconsumed, chromeConsumed, type)
    log(
      "NESTED_POST type=${typeName(type)} childConsumedY=$dyConsumed remainingY=$dyUnconsumed " +
        "parentConsumedY=${consumed[1]} chrome=$chromeConsumed target=${targetName(target)}",
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

  override fun onStartNestedScroll(child: View, target: View, axes: Int): Boolean {
    val accepted = onStartNestedScroll(child, target, axes, ViewCompat.TYPE_TOUCH)
    if (accepted) momentumExpected = false
    return accepted
  }

  override fun onNestedScrollAccepted(child: View, target: View, axes: Int) {
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
    val expectsMomentum = consumed && sourceOwnsMomentum(target) && asReactVerticalSource(target) != null
    if (expectsMomentum) momentumExpected = true
    log(
      "NESTED_FLING vx=$velocityX vy=$velocityY childConsumed=$consumed " +
        "sourceOwnsMomentum=${sourceOwnsMomentum(target)} expected=$momentumExpected " +
        "target=${targetName(target)}",
    )

    if (BuildConfig.RN_NESTED_SCROLL_FLING_SHIM) {
      val started =
        ViewCompat.startNestedScroll(
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
    val prepared = controller.prepareSource(source)
    log(
      "CHROME_SOURCE_TREE source=${targetName(source)} nested=${ViewCompat.isNestedScrollingEnabled(source)} " +
        "prepared=$prepared canUp=${source.canScrollVertically(-1)} canDown=${source.canScrollVertically(1)}",
    )
    return prepared
  }

  private fun collectReactVerticalSources(view: View, output: MutableList<ViewGroup>) {
    if (view !== this) {
      asReactVerticalSource(view)?.let(output::add)
    }
    if (view !is ViewGroup) return
    for (index in 0 until view.childCount) {
      collectReactVerticalSources(view.getChildAt(index), output)
    }
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

  private fun recordLedgerPre(requestedY: Int, chromePreY: Int, type: Int) {
    if (chromeController == null || requestedY == 0) return
    flushPendingLedger("next-pre")
    ledgerRequestedY = requestedY
    ledgerChromePreY = chromePreY
    ledgerPending = true
    log(
      "CHROME_LEDGER_PRE type=${typeName(type)} requested=$requestedY chromePre=$chromePreY",
    )
  }

  private fun recordLedgerPost(
    childConsumedY: Int,
    dyUnconsumed: Int,
    chromePostY: Int,
    type: Int,
  ) {
    if (!ledgerPending && chromeController != null) {
      val requestedY = childConsumedY + dyUnconsumed
      if (requestedY != 0) {
        ledgerRequestedY = requestedY
        ledgerChromePreY = 0
        ledgerPending = true
        log(
          "CHROME_LEDGER_PRE type=${typeName(type)} requested=$requestedY chromePre=0 synthetic=post-only",
        )
      }
    }
    if (!ledgerPending) return

    ledgerFrames += 1
    val remaining = dyUnconsumed - chromePostY
    val sum = ledgerChromePreY + childConsumedY + chromePostY + remaining
    val balanced = sum == ledgerRequestedY
    if (!balanced) ledgerBroken += 1
    log(
      "CHROME_LEDGER type=${typeName(type)} n=$ledgerFrames requested=$ledgerRequestedY " +
        "chromePre=$ledgerChromePreY child=$childConsumedY chromePost=$chromePostY " +
        "remaining=$remaining sum=$sum balanced=$balanced broken=$ledgerBroken orphan=$ledgerOrphans",
    )
    ledgerPending = false
  }

  private fun flushPendingLedger(reason: String) {
    if (!ledgerPending) return
    ledgerOrphans += 1
    log(
      "CHROME_LEDGER_ORPHAN n=$ledgerOrphans reason=$reason requested=$ledgerRequestedY " +
        "chromePre=$ledgerChromePreY",
    )
    ledgerPending = false
  }
}
