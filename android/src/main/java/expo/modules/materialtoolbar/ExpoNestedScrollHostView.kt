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
class ExpoNestedScrollHostView(
  context: Context,
  appContext: AppContext,
) : ExpoView(context, appContext), NestedScrollingParent3 {

  private val nestedParentHelper = NestedScrollingParentHelper(this)

  private var eventSequence = 0L
  private var preCount = 0L
  private var postCount = 0L

  private var activeTopBar: TopAppBarScrollConsumer? = null
  private var activeToolbar: FloatingToolbarScrollConsumer? = null
  private var activeSource: ViewGroup? = null
  private var activeSourceCapabilities: ReactVerticalScrollSourceCapabilities? = null
  private var nestedTransactionActive = false

  // Momentum belongs to a concrete source instance, not to the host. Fabric can destroy a source
  // while its TYPE_NON_TOUCH transaction is active without delivering a matching stop callback.
  // Keeping the owner here prevents that stale state from leaking into a replacement source.
  private var momentumSource: ViewGroup? = null

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

  // Per-frame conservation ledger:
  // requested = chromePre + childConsumed + chromePost + remaining
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
    val activeTarget = activeSource === target
    log(
      "NESTED_STOP contract=platform preCount=$preCount postCount=$postCount " +
        "active=$nestedTransactionActive activeTarget=$activeTarget ${targetLabel(target)}",
    )
    if (!activeTarget) {
      log(
        "TX_STALE_STOP contract=platform ignored=true " +
          "activeSource=${sourceIdentity(activeSource)} ${targetLabel(target)}",
      )
      return
    }
    nestedParentHelper.onStopNestedScroll(target)
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
    if (accepted) {
      beginNestedSession(target)
      if (type == ViewCompat.TYPE_NON_TOUCH && activeSource === target) {
        momentumSource = activeSource
      }
    }
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
    val activeTarget = activeSource === target
    log(
      "NESTED_STOP contract=androidx type=${typeLabel(type)} preCount=$preCount postCount=$postCount " +
        "active=$nestedTransactionActive activeTarget=$activeTarget " +
        "momentumOwner=${momentumSource === target} ${targetLabel(target)}",
    )
    if (!activeTarget) {
      log(
        "TX_STALE_STOP type=${typeLabel(type)} ignored=true " +
          "activeSource=${sourceIdentity(activeSource)} ${targetLabel(target)}",
      )
      return
    }
    nestedParentHelper.onStopNestedScroll(target, type)
    if (type == ViewCompat.TYPE_NON_TOUCH) {
      if (momentumSource === target) momentumSource = null
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
    if (activeSource !== target) {
      log(
        "TX_STALE_PRE type=${typeLabel(type)} dy=$dy ignored=true " +
          "activeSource=${sourceIdentity(activeSource)} ${targetLabel(target)}",
      )
      return
    }

    preCount += 1
    val topBar = activeTopBar?.takeIf { nestedTransactionActive && it.isNestedDirectCapable }
    if (topBar == null || dy == 0) {
      log(
        "NESTED_PRE type=${typeLabel(type)} n=$preCount dy=$dy consumedY=${consumed[1]} " +
          targetLabel(target),
      )
      return
    }

    val pre = topBar.nestedPreScroll(dy, type.toInputType())
    consumed[1] += pre.reportedConsumedY
    recordLedgerPre(dy, pre.reportedConsumedY, type)

    log(
      "TX_PRE type=${typeLabel(type)} n=$preCount dy=$dy chrome=${pre.reportedConsumedY} " +
        "collapse=${topBar.currentCollapseAmountPx()} sourceY=${target.scrollY}",
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
    if (activeSource !== target) {
      log(
        "TX_STALE_POST type=${typeLabel(type)} child=$dyConsumed unconsumed=$dyUnconsumed " +
          "ignored=true activeSource=${sourceIdentity(activeSource)} ${targetLabel(target)}",
      )
      return
    }

    postCount += 1
    if (!nestedTransactionActive) return

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
        "sourceY=${target.scrollY}",
    )
  }

  private fun Int.toInputType(): NativeNestedInputType =
    if (this == ViewCompat.TYPE_NON_TOUCH) NativeNestedInputType.NonTouch
    else NativeNestedInputType.Touch

  // ---------------------------------------------------------------------------
  // Session binding / lifecycle.
  // ---------------------------------------------------------------------------

  private fun beginNestedSession(target: View) {
    val capabilities = ReactVerticalScrollSourceInterop.resolve(target)
    val source = capabilities?.view
    if (source == null) {
      log("TX_BIND rejected=unsupported ${targetLabel(target)}")
      return
    }

    val previous = activeSource
    if (previous != null && previous !== source) {
      abandonActiveSession(previous, source)
    }

    flushPendingLedger("session-rebind")
    preCount = 0
    postCount = 0

    val topBar = NativeNestedScrollRegistry.resolveTopBar(target)
    val toolbar = NativeNestedScrollRegistry.resolveToolbar(target)
    activeSource = source
    activeSourceCapabilities = capabilities
    activeTopBar = topBar
    activeToolbar = toolbar

    val topBarReady = topBar?.beginNestedTransaction(source) == true
    val toolbarReady = toolbar?.beginNestedTransaction(source) == true
    nestedTransactionActive = topBarReady || toolbarReady

    log(
      "TX_BIND source=${source.id} sourceIdentity=${sourceIdentity(source)} " +
        "sourceClass=${source.javaClass.name} kind=${capabilities.kind} " +
        "typed=${capabilities.supportsTypedNestedScrolling} topBar=$topBarReady " +
        "toolbar=$toolbarReady active=$nestedTransactionActive " +
        "surfaceSource=${surfaceId(target)} surfaceHost=${surfaceId(this)}",
    )
  }

  private fun abandonActiveSession(previous: ViewGroup, replacement: ViewGroup) {
    flushPendingLedger("source-replaced")
    log(
      "TX_ABORT reason=source-replaced previous=${sourceIdentity(previous)} " +
        "replacement=${sourceIdentity(replacement)} momentum=${momentumSource === previous} " +
        "active=$nestedTransactionActive",
    )
    clearActiveSession()
  }

  private fun finishTouch(target: View) {
    if (activeSource !== target) {
      log(
        "TX_STALE_TOUCH_STOP ignored=true activeSource=${sourceIdentity(activeSource)} " +
          targetLabel(target),
      )
      return
    }
    if (momentumSource === target) {
      log("TX_TOUCH_STOP deferred=momentum ${targetLabel(target)}")
      return
    }
    finishMovement(target, "touch-stop")
  }

  private fun finishMovement(target: View, reason: String) {
    if (activeSource !== target) {
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
    log(
      "TX_END reason=$reason sourceY=${source.scrollY} ledgerFrames=$ledgerFrames " +
        "broken=$ledgerBrokenFrames orphanPre=$ledgerOrphanPres",
    )
    clearActiveSession()
  }

  private fun clearActiveSession() {
    momentumSource = null
    activeTopBar = null
    activeToolbar = null
    activeSource = null
    activeSourceCapabilities = null
    nestedTransactionActive = false
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
    log("TX_LEDGER_PRE type=${typeLabel(type)} requested=$requestedY chromePre=$chromePreY")
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