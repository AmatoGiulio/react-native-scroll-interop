package expo.modules.materialtoolbar

import android.graphics.Rect
import android.os.Build
import android.os.SystemClock
import android.util.Log
import android.view.Choreographer
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.views.scroll.ReactScrollView
import com.facebook.react.views.scroll.ReactScrollViewHelper
import com.facebook.react.views.scroll.ScrollEventType
import kotlin.math.abs

internal const val NATIVE_SCROLL_LOG_TAG = "ExpoMaterialToolbar"

// A drag release with no fling should settle quickly, but a real Android fling can start a few
// display frames after END_DRAG. Keep those cases separate instead of using one frame-count timeout
// whose meaning changes between 60/90/120 Hz displays.
private const val NON_FLING_SETTLE_GRACE_MS = 40L
private const val FLING_START_GRACE_MS = 180L
private const val POST_FLING_IDLE_TIMEOUT_MS = 96L

/**
 * One display-frame sample from the active native RN vertical scroll source.
 *
 * [deltaY] is based on a transport-normalized content coordinate. The transport deliberately does
 * not derive the upper scroll bound from the ReactScrollView content child's current measured
 * height: virtualized lists can update that height behind a fast native fling, which would clamp a
 * legitimate scroll delta to zero and make native chrome appear frozen until the list slows down.
 * Top-edge Android bounce is clamped to zero, while bottom-edge bounce is frozen at a session-local
 * anchor until the view becomes scrollable upward again.
 *
 * [postAvailableY] is deliberately separate: while a user drag is active, the RN adapter observes
 * the non-consuming finger distance that remains after the vertical child has reached y=0. This maps
 * to nested-scroll post-scroll `available.y`; it is not inferred from Android's visual overscroll.
 */
internal data class NativeScrollFrame(
  val deltaY: Int,
  val scrollY: Int,
  val rawScrollY: Int,
  val postAvailableY: Float,
)

internal interface NativeScrollConsumer {
  val isEnabled: Boolean

  /**
   * Whether this consumer is currently running an animation that still moves the scroll source.
   * A settle that aligns scroll-away padding keeps scrolling the view for a few hundred ms after
   * the gesture ended; the session must outlive it, or those frames reach no one.
   */
  val isSettlingChrome: Boolean
    get() = false
  val requiresTopBoundaryGesture: Boolean
    get() = false
  fun onScrollSourceAvailable(source: ViewGroup) = Unit
  fun onScrollSourceUnavailable(source: ViewGroup) = Unit
  fun onScrollSessionStart(source: ViewGroup)
  fun onScrollFrame(frame: NativeScrollFrame)
  fun onScrollSessionEnd()
}

/**
 * Per-host registration facade over one process-wide RN native-scroll transport.
 *
 * Multiple native chrome hosts on the same visible Fabric surface (for example a TopAppBar and a
 * FloatingToolbar) are fanned out from the same active ReactScrollView sample. Consumers never
 * depend on ReactScrollViewHelper directly, so the transport underneath can be replaced — by a
 * screen/navigation layer that owns the scroll source, for instance — without touching Material
 * consumers.
 */
internal class ReactNativeScrollCoordinator(
  ownerView: View,
  consumers: List<NativeScrollConsumer>,
) {
  constructor(ownerView: View, consumer: NativeScrollConsumer) : this(ownerView, listOf(consumer))

  private val client = Client(ownerView, consumers)

  fun attach() = Hub.register(client)

  fun detach() = Hub.unregister(client)

  fun discoverSources() = Hub.discoverFor(client)

  private class Client(
    val ownerView: View,
    val consumers: List<NativeScrollConsumer>,
  ) {
    fun hasEnabledConsumer(): Boolean = consumers.any { it.isEnabled }

    // Not filtered by isEnabled, for the same reason chromeDrivenScrollOffsetPx was not: a TopAppBar
    // driven by the nested transport reports isEnabled = false here, and it is exactly the one whose
    // settle keeps scrolling the source.
    fun isSettlingChrome(): Boolean = consumers.any { it.isSettlingChrome }

    fun requiresTopBoundaryGesture(): Boolean =
      consumers.any { it.isEnabled && it.requiresTopBoundaryGesture }

    fun sourceAvailable(source: ViewGroup) {
      consumers.forEach { consumer ->
        if (consumer.isEnabled) consumer.onScrollSourceAvailable(source)
      }
    }

    fun sourceUnavailable(source: ViewGroup) {
      consumers.forEach { consumer ->
        consumer.onScrollSourceUnavailable(source)
      }
    }

    fun start(source: ViewGroup) {
      sourceAvailable(source)
      consumers.forEach { consumer ->
        if (consumer.isEnabled) consumer.onScrollSessionStart(source)
      }
    }

    fun frame(frame: NativeScrollFrame) {
      consumers.forEach { consumer ->
        if (consumer.isEnabled) consumer.onScrollFrame(frame)
      }
    }

    fun end() {
      consumers.forEach { it.onScrollSessionEnd() }
    }
  }

  internal companion object Hub : ReactScrollViewHelper.ScrollListener {
    /**
     * Signal from a transport that owns the end of the movement, currently the probe's proxy fling.
     * Sampling alone can only infer the end from an inactivity timeout
     * ([POST_FLING_IDLE_TIMEOUT_MS]), and that gap is visible: chrome stops wherever the last frame
     * left it, holds for ~80ms, then snaps the remaining pixels.
     *
     * This does NOT end the session, because the movement is not necessarily over: a TopAppBar
     * settle keeps scrolling the source afterwards to align its scroll-away padding, and consumers
     * that integrate deltas need every one of those frames or their offset drifts from the source.
     * It only drops the idle grace to a single still frame, so the session ends as soon as the
     * source has genuinely stopped.
     *
     * Ignored unless it refers to the session actually running, and never while a finger is down:
     * the drag owns the chrome and its own release will settle it.
     */
    fun transportSettled(source: ViewGroup, reason: String) {
      if (activeScrollView !== source || userDragActive) return
      transportSettledReason = reason
    }

    private val clients = LinkedHashSet<Client>()
    private var activeClients: List<Client> = emptyList()
    private var activeScrollView: ViewGroup? = null
    private var lastSampledScrollY = 0

    private var userDragActive = false
    private var momentumActive = false
    private var momentumEndObserved = false
    private var flingExpectedAfterRelease = false
    private var postReleaseMovementObserved = false
    private var releaseUptimeMs = 0L
    private var lastMovementUptimeMs = 0L
    private var transportSettledReason: String? = null

    // Android edge-effect normalization is stateful. At the top, negative scrollY is always bounce
    // and clamps to zero. At the bottom we freeze at the first non-scrollable-down coordinate until
    // canScrollVertically(1) becomes true again, so the edge-effect spring does not look like a real
    // reverse scroll to Material3.
    private var bottomEdgeAnchorY: Int? = null

    private var trackedTouchSource: ViewGroup? = null
    private var lastTouchY: Float? = null
    private var pendingPostAvailableY = 0f
    private var listenerRegistered = false
    private var frameCallbackPosted = false
    private var debugFrameCounter = 0
    private var orphanScrollLogUptimeMs = 0L
    private var virtualRangeLagLogUptimeMs = 0L

    /**
     * ReactScrollView does not expose the user's unconsumed drag distance through scrollY once the
     * content reaches the top edge. Observe MotionEvents without consuming them so the adapter can
     * recover only that missing post-scroll distance. The listener is installed only for an active
     * drag whose consumers explicitly need boundary semantics, and always returns false so RN keeps
     * ownership of the gesture.
     */
    private val boundaryTouchListener = View.OnTouchListener { view, event ->
      val source = activeScrollView
      if (source == null || view !== source || !userDragActive) {
        return@OnTouchListener false
      }

      when (event.actionMasked) {
        MotionEvent.ACTION_MOVE -> {
          val currentTouchY = event.y
          val previousTouchY = lastTouchY
          lastTouchY = currentTouchY

          if (previousTouchY != null) {
            val fingerDeltaY = currentTouchY - previousTouchY
            // OnTouchListener runs before ScrollView.onTouchEvent for the current MotionEvent, so
            // the raw scrollY here describes the child state after the previous MotionEvent. Once
            // that state is at the top edge, positive finger movement is true post-scroll available
            // distance: the child can no longer consume it.
            if (fingerDeltaY > 0f && source.scrollY <= 0 && !source.canScrollVertically(-1)) {
              pendingPostAvailableY += fingerDeltaY
              requestFrame()
              if (BuildConfig.DEBUG) {
                Log.d(
                  NATIVE_SCROLL_LOG_TAG,
                  "boundary pull view=${source.id} dy=$fingerDeltaY pending=$pendingPostAvailableY rawY=${source.scrollY}",
                )
              }
            }
          }
        }

        MotionEvent.ACTION_UP,
        MotionEvent.ACTION_CANCEL -> lastTouchY = null
      }

      false
    }

    private val frameCallback = Choreographer.FrameCallback {
      frameCallbackPosted = false
      val source = activeScrollView ?: return@FrameCallback
      activeClients = activeClients.filter { client ->
        client in clients && client.hasEnabledConsumer() && isClientEligibleForSource(client, source)
      }
      if (activeClients.isEmpty()) {
        finishSession("no-clients")
        return@FrameCallback
      }
      if (!source.isAttachedToWindow || source.windowVisibility != View.VISIBLE) {
        finishSession("source-hidden")
        return@FrameCallback
      }

      val rawY = source.scrollY
      val currentY = normalizedScrollY(source)
      val deltaY = currentY - lastSampledScrollY
      val postAvailableY = pendingPostAvailableY

      lastSampledScrollY = currentY
      pendingPostAvailableY = 0f

      val movedThisFrame = deltaY != 0 || postAvailableY != 0f
      val now = SystemClock.uptimeMillis()

      if (BuildConfig.DEBUG && rawY > 0 && source.canScrollVertically(1)) {
        val content = source.getChildAt(0)
        if (content != null) {
          val legacyViewportHeight =
            (source.height - source.paddingTop - source.paddingBottom).coerceAtLeast(0)
          val legacyMaxY = (content.height - legacyViewportHeight).coerceAtLeast(0)
          if (rawY > legacyMaxY && now - virtualRangeLagLogUptimeMs >= 100L) {
            virtualRangeLagLogUptimeMs = now
            Log.d(
              NATIVE_SCROLL_LOG_TAG,
              "VIRTUAL_RANGE_LAG view=${source.id} rawY=$rawY childMaxY=$legacyMaxY contentH=${content.height} viewportH=$legacyViewportHeight",
            )
          }
        }
      }

      if (movedThisFrame) {
        lastMovementUptimeMs = now
        if (!userDragActive) postReleaseMovementObserved = true

        val frame = NativeScrollFrame(
          deltaY = deltaY,
          scrollY = currentY,
          rawScrollY = rawY,
          postAvailableY = postAvailableY,
        )
        activeClients.forEach { it.frame(frame) }
        if (BuildConfig.DEBUG) {
          debugFrameCounter += 1
          if (debugFrameCounter % 8 == 1) {
            Log.d(
              NATIVE_SCROLL_LOG_TAG,
              "source frame view=${source.id} clients=${activeClients.size} dy=$deltaY scrollY=$currentY rawY=$rawY postAvailableY=$postAvailableY drag=$userDragActive momentum=$momentumActive flingExpected=$flingExpectedAfterRelease",
            )
          }
        }
      }

      val keepSampling = when {
        userDragActive -> true
        movedThisFrame -> true
        // Chrome is still animating the source. Its remaining frames have to be delivered:
        // consumers that integrate deltas have no absolute reference, so a frame lost here is a
        // permanent error in their offset rather than a moment of lag.
        anyEligibleChromeSettling(source) -> true
        // The transport told us its movement ended, and no chrome is still moving the source, so a
        // single still frame ends the session instead of waiting out the idle timeout.
        transportSettledReason != null -> false
        momentumActive -> true
        // If RN emitted a real MOMENTUM_END, the transport owns an explicit terminal signal.
        momentumEndObserved -> false
        // A real fling can begin a few frames after END_DRAG. Do not snap Material chrome in that
        // start gap just because scrollY has not advanced yet.
        flingExpectedAfterRelease && !postReleaseMovementObserved ->
          now - releaseUptimeMs < FLING_START_GRACE_MS
        // Once post-release movement was actually observed, settle only after a genuine idle gap.
        postReleaseMovementObserved ->
          now - lastMovementUptimeMs < POST_FLING_IDLE_TIMEOUT_MS
        else -> now - releaseUptimeMs < NON_FLING_SETTLE_GRACE_MS
      }

      if (keepSampling) {
        requestFrame()
      } else {
        finishSession(transportSettledReason?.let { "transport-$it" } ?: "stable")
      }
    }

    private fun register(client: Client) {
      if (!clients.add(client)) return
      if (!listenerRegistered) {
        ReactScrollViewHelper.addScrollListener(this)
        listenerRegistered = true
      }
      discoverFor(client)
    }

    private fun discoverFor(client: Client) {
      client.ownerView.post {
        if (client !in clients || !client.hasEnabledConsumer()) return@post
        findBestEligibleReactScrollView(client)?.let(client::sourceAvailable)
      }
    }

    private fun unregister(client: Client) {
      if (!clients.remove(client)) return
      activeScrollView?.let(client::sourceUnavailable)
      activeClients = activeClients.filterNot { it === client }
      if (activeClients.isEmpty() && activeScrollView != null) {
        clearSessionWithoutCallbacks()
      }
      if (clients.isEmpty()) {
        stopFrame()
        if (listenerRegistered && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          ReactScrollViewHelper.removeScrollListener(this)
        }
        listenerRegistered = false
      }
    }

    override fun onLayout(scrollView: ViewGroup?) {
      val source = scrollView ?: return
      if (!isEligibleVerticalSource(source)) return
      clients.forEach { client ->
        if (client.hasEnabledConsumer() && isClientEligibleForSource(client, source)) {
          discoverFor(client)
        }
      }
    }

    override fun onScroll(
      scrollView: ViewGroup?,
      scrollEventType: ScrollEventType?,
      xVelocity: Float,
      yVelocity: Float,
    ) {
      val source = scrollView ?: return

      when (scrollEventType) {
        ScrollEventType.BEGIN_DRAG -> {
          if (!isEligibleVerticalSource(source)) return
          val eligibleClients = eligibleClientsFor(source)
          if (eligibleClients.isEmpty()) return

          // A new finger gesture supersedes the old transaction. Do NOT call onPostFling on the old
          // one first: both Material consumers start their settle undispatched, so an unnecessary
          // terminal callback here can move chrome toward an endpoint before the new drag cancels it.
          if (activeScrollView != null) {
            if (BuildConfig.DEBUG) {
              Log.d(
                NATIVE_SCROLL_LOG_TAG,
                "session interrupt oldView=${activeScrollView?.id} newView=${source.id}",
              )
            }
            clearSessionWithoutCallbacks()
          }

          stopFrame()
          activeClients = eligibleClients
          activeScrollView = source
          bottomEdgeAnchorY = null
          val currentY = normalizedScrollY(source)
          lastSampledScrollY = currentY
          pendingPostAvailableY = 0f
          lastTouchY = null
          debugFrameCounter = 0

          userDragActive = true
          momentumActive = false
          momentumEndObserved = false
          flingExpectedAfterRelease = false
          postReleaseMovementObserved = false
          releaseUptimeMs = 0L
          lastMovementUptimeMs = SystemClock.uptimeMillis()

          if (activeClients.any { it.requiresTopBoundaryGesture() }) {
            installBoundaryTouchTracking(source)
          }
          activeClients.forEach { it.start(source) }
          requestFrame()
        }

        ScrollEventType.SCROLL -> {
          if (source === activeScrollView) {
            requestFrame()
          } else if (activeScrollView == null && BuildConfig.DEBUG) {
            // Do not auto-adopt this yet. A Material settle can itself move ReactScrollView, so a
            // naive "SCROLL starts a session" rule can feed our own correction back into the hub.
            // This diagnostic tells us whether a future source adapter needs an explicit recovery
            // channel for user/programmatic scroll that occurs outside a drag transaction.
            val now = SystemClock.uptimeMillis()
            if (now - orphanScrollLogUptimeMs >= 100L && eligibleClientsFor(source).isNotEmpty()) {
              orphanScrollLogUptimeMs = now
              Log.d(
                NATIVE_SCROLL_LOG_TAG,
                "ORPHAN_SCROLL view=${source.id} rawY=${source.scrollY} vx=$xVelocity vy=$yVelocity",
              )
            }
          }
        }

        ScrollEventType.END_DRAG -> {
          if (source !== activeScrollView) return
          userDragActive = false
          momentumActive = false
          momentumEndObserved = false
          postReleaseMovementObserved = false
          releaseUptimeMs = SystemClock.uptimeMillis()
          lastMovementUptimeMs = releaseUptimeMs

          // VelocityHelper reports pixels/millisecond; Android's minimum fling threshold is
          // pixels/second. This tells the fallback lifecycle whether it must allow for a delayed
          // OverScroller start without inventing a fixed delay for ordinary low-velocity releases.
          val minimumFlingVelocityPxPerMs =
            ViewConfiguration.get(source.context).scaledMinimumFlingVelocity / 1000f
          flingExpectedAfterRelease = abs(yVelocity) >= minimumFlingVelocityPxPerMs

          uninstallBoundaryTouchTracking()
          if (BuildConfig.DEBUG) {
            Log.d(
              NATIVE_SCROLL_LOG_TAG,
              "END_DRAG view=${source.id} vy=$yVelocity minFling=$minimumFlingVelocityPxPerMs flingExpected=$flingExpectedAfterRelease",
            )
          }
          requestFrame()
        }

        ScrollEventType.MOMENTUM_BEGIN -> {
          if (source !== activeScrollView) return
          userDragActive = false
          momentumActive = true
          momentumEndObserved = false
          flingExpectedAfterRelease = true
          postReleaseMovementObserved = true
          lastMovementUptimeMs = SystemClock.uptimeMillis()
          uninstallBoundaryTouchTracking()
          requestFrame()
        }

        ScrollEventType.MOMENTUM_END -> {
          if (source !== activeScrollView) return
          userDragActive = false
          momentumActive = false
          momentumEndObserved = true
          requestFrame()
        }

        null -> Unit
      }
    }

    private fun anyEligibleChromeSettling(source: ViewGroup): Boolean =
      clients.any { isClientEligibleForSource(it, source) && it.isSettlingChrome() }

    private fun finishSession(reason: String) {
      val source = activeScrollView
      if (BuildConfig.DEBUG && source != null) {
        Log.d(
          NATIVE_SCROLL_LOG_TAG,
          "session end view=${source.id} reason=$reason scrollY=$lastSampledScrollY drag=$userDragActive momentum=$momentumActive postReleaseMoved=$postReleaseMovementObserved",
        )
      }
      stopFrame()
      val clientsToEnd = activeClients
      clearSessionState()
      clientsToEnd.forEach { client ->
        if (client in clients) client.end()
      }
    }

    private fun clearSessionWithoutCallbacks() {
      stopFrame()
      clearSessionState()
    }

    private fun clearSessionState() {
      userDragActive = false
      momentumActive = false
      momentumEndObserved = false
      flingExpectedAfterRelease = false
      postReleaseMovementObserved = false
      releaseUptimeMs = 0L
      lastMovementUptimeMs = 0L
      transportSettledReason = null
      bottomEdgeAnchorY = null
      uninstallBoundaryTouchTracking()
      activeScrollView = null
      activeClients = emptyList()
      pendingPostAvailableY = 0f
      lastTouchY = null
    }

    private fun requestFrame() {
      if (frameCallbackPosted || activeScrollView == null || activeClients.none { it.hasEnabledConsumer() }) return
      frameCallbackPosted = true
      Choreographer.getInstance().postFrameCallback(frameCallback)
    }

    private fun stopFrame() {
      if (!frameCallbackPosted) return
      Choreographer.getInstance().removeFrameCallback(frameCallback)
      frameCallbackPosted = false
    }

    private fun installBoundaryTouchTracking(source: ViewGroup) {
      if (trackedTouchSource === source) return
      uninstallBoundaryTouchTracking()
      trackedTouchSource = source
      lastTouchY = null
      source.setOnTouchListener(boundaryTouchListener)
    }

    private fun uninstallBoundaryTouchTracking() {
      val source = trackedTouchSource ?: return
      source.setOnTouchListener(null)
      trackedTouchSource = null
      lastTouchY = null
    }

    /**
     * Normalize only actual Android edge-effect motion.
     *
     * Do not calculate maxY from child.height. FlashList / other virtualized sources may update the
     * content child's measured extent independently from the native ScrollView's current fling. On a
     * fast fling that makes a child-height-derived max temporarily stale and suppresses legitimate
     * deltas for every consumer. The ScrollView's own scrollY is the transport coordinate.
     */
    private fun normalizedScrollY(scrollView: ViewGroup): Int {
      val rawY = scrollView.scrollY
      if (rawY <= 0) {
        bottomEdgeAnchorY = null
        return 0
      }

      if (!scrollView.canScrollVertically(1)) {
        val existingAnchor = bottomEdgeAnchorY
        if (existingAnchor != null) return existingAnchor

        bottomEdgeAnchorY = rawY
        if (BuildConfig.DEBUG) {
          Log.d(NATIVE_SCROLL_LOG_TAG, "bottom edge anchor view=${scrollView.id} y=$rawY")
        }
        return rawY
      }

      if (bottomEdgeAnchorY != null && BuildConfig.DEBUG) {
        Log.d(
          NATIVE_SCROLL_LOG_TAG,
          "bottom edge release view=${scrollView.id} anchor=$bottomEdgeAnchorY rawY=$rawY",
        )
      }
      bottomEdgeAnchorY = null
      return rawY
    }

    private fun eligibleClientsFor(source: ViewGroup): List<Client> =
      clients.filter { client ->
        client.hasEnabledConsumer() && isClientEligibleForSource(client, source)
      }

    private fun findBestEligibleReactScrollView(client: Client): ReactScrollView? {
      val candidates = mutableListOf<ReactScrollView>()
      collectReactScrollViews(client.ownerView.rootView, candidates)
      return candidates
        .asSequence()
        .filter { isEligibleVerticalSource(it) && isClientEligibleForSource(client, it) }
        .mapNotNull { source ->
          val rect = Rect()
          if (!source.getGlobalVisibleRect(rect)) null else source to rect.width() * rect.height()
        }
        .maxByOrNull { it.second }
        ?.first
    }

    private fun collectReactScrollViews(view: View, output: MutableList<ReactScrollView>) {
      if (view is ReactScrollView) output += view
      if (view !is ViewGroup) return
      for (index in 0 until view.childCount) {
        collectReactScrollViews(view.getChildAt(index), output)
      }
    }

    private fun isEligibleVerticalSource(scrollView: ViewGroup): Boolean {
      if (!scrollView.isAttachedToWindow || !scrollView.isShown) return false
      if (scrollView.windowVisibility != View.VISIBLE) return false
      return scrollView.canScrollVertically(-1) || scrollView.canScrollVertically(1)
    }

    private fun isClientEligibleForSource(client: Client, scrollView: ViewGroup): Boolean {
      val ownerView = client.ownerView
      if (!ownerView.isAttachedToWindow || !ownerView.isShown) return false
      if (ownerView.windowVisibility != View.VISIBLE) return false
      val ownerSurfaceId = runCatching { UIManagerHelper.getSurfaceId(ownerView) }.getOrDefault(-1)
      val sourceSurfaceId = runCatching { UIManagerHelper.getSurfaceId(scrollView) }.getOrDefault(-1)
      return ownerSurfaceId == -1 || sourceSurfaceId == -1 || ownerSurfaceId == sourceSurfaceId
    }
  }
}
