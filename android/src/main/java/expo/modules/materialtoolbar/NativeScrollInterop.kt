package expo.modules.materialtoolbar

import android.graphics.Rect
import android.os.Build
import android.util.Log
import android.view.Choreographer
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.views.scroll.ReactScrollView
import com.facebook.react.views.scroll.ReactScrollViewHelper
import com.facebook.react.views.scroll.ScrollEventType

internal const val NATIVE_SCROLL_LOG_TAG = "ExpoMaterialToolbar"
private const val STABLE_FRAME_COUNT = 4

/**
 * One display-frame sample from the active native RN vertical scroll source.
 *
 * [deltaY] is based on normalized content scroll coordinates and is therefore safe for consumers
 * that should ignore Android edge bounce. [postAvailableY] is deliberately separate: while a user
 * drag is active, the RN adapter observes the non-consuming finger distance that remains after the
 * vertical child has reached y=0. This maps to nested-scroll post-scroll `available.y`; it is not
 * inferred from Android's visual overscroll distance.
 */
internal data class NativeScrollFrame(
  val deltaY: Int,
  val scrollY: Int,
  val rawScrollY: Int,
  val postAvailableY: Float,
)

internal interface NativeScrollConsumer {
  val isEnabled: Boolean
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
 * depend on ReactScrollViewHelper directly, so this transport can later be replaced by
 * react-native-screens ScrollViewMarker/ScrollViewSeeking without touching Material consumers.
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

  private companion object Hub : ReactScrollViewHelper.ScrollListener {
    private val clients = LinkedHashSet<Client>()
    private var activeClients: List<Client> = emptyList()
    private var activeScrollView: ViewGroup? = null
    private var lastSampledScrollY = 0
    private var userDragActive = false
    private var trackedTouchSource: ViewGroup? = null
    private var lastTouchY: Float? = null
    private var pendingPostAvailableY = 0f
    private var listenerRegistered = false
    private var frameCallbackPosted = false
    private var stableFrameCount = 0
    private var debugFrameCounter = 0

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
            // the scrollY value here describes the child state after the previous MotionEvent. Once
            // that state is at the top edge, positive finger movement is true post-scroll available
            // distance: the child can no longer consume it.
            if (fingerDeltaY > 0f && normalizedScrollY(source) == 0 && !source.canScrollVertically(-1)) {
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
        finishSession()
        return@FrameCallback
      }
      if (!source.isAttachedToWindow || source.windowVisibility != View.VISIBLE) {
        finishSession()
        return@FrameCallback
      }

      val rawY = source.scrollY
      val currentY = normalizedScrollY(source)
      val deltaY = currentY - lastSampledScrollY
      val postAvailableY = pendingPostAvailableY

      lastSampledScrollY = currentY
      pendingPostAvailableY = 0f

      if (deltaY != 0 || postAvailableY != 0f) {
        stableFrameCount = 0
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
              "source frame view=${source.id} clients=${activeClients.size} dy=$deltaY scrollY=$currentY rawY=$rawY postAvailableY=$postAvailableY",
            )
          }
        }
      } else if (!userDragActive) {
        stableFrameCount += 1
      }

      if (userDragActive || stableFrameCount < STABLE_FRAME_COUNT) requestFrame() else finishSession()
    }

    fun register(client: Client) {
      if (!clients.add(client)) return
      if (!listenerRegistered) {
        ReactScrollViewHelper.addScrollListener(this)
        listenerRegistered = true
      }
      discoverFor(client)
    }

    fun discoverFor(client: Client) {
      client.ownerView.post {
        if (client !in clients || !client.hasEnabledConsumer()) return@post
        findBestEligibleReactScrollView(client)?.let(client::sourceAvailable)
      }
    }

    fun unregister(client: Client) {
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
          val eligibleClients = clients.filter { client ->
            client.hasEnabledConsumer() && isClientEligibleForSource(client, source)
          }
          if (eligibleClients.isEmpty()) return

          if (activeScrollView != null) finishSession()
          stopFrame()
          activeClients = eligibleClients
          activeScrollView = source
          val currentY = normalizedScrollY(source)
          lastSampledScrollY = currentY
          pendingPostAvailableY = 0f
          lastTouchY = null
          stableFrameCount = 0
          debugFrameCounter = 0
          userDragActive = true
          if (activeClients.any { it.requiresTopBoundaryGesture() }) {
            installBoundaryTouchTracking(source)
          }
          activeClients.forEach { it.start(source) }
          requestFrame()
        }
        ScrollEventType.SCROLL -> if (source === activeScrollView) requestFrame()
        ScrollEventType.END_DRAG -> {
          if (source !== activeScrollView) return
          userDragActive = false
          uninstallBoundaryTouchTracking()
          stableFrameCount = 0
          requestFrame()
        }
        ScrollEventType.MOMENTUM_BEGIN -> {
          if (source !== activeScrollView) return
          userDragActive = false
          uninstallBoundaryTouchTracking()
          stableFrameCount = 0
          requestFrame()
        }
        ScrollEventType.MOMENTUM_END -> {
          if (source !== activeScrollView) return
          userDragActive = false
          requestFrame()
        }
        null -> Unit
      }
    }

    private fun finishSession() {
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
      stableFrameCount = 0
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

    private fun normalizedScrollY(scrollView: ViewGroup): Int {
      val rawY = scrollView.scrollY
      val content = scrollView.getChildAt(0) ?: return rawY.coerceAtLeast(0)
      // ReactScrollView's native scroll-away padding increases the effective viewport scroll range
      // through bottom padding. Include View padding here so normalization does not clamp away the
      // extra range introduced by TopAppBar content coordination.
      val viewportHeight =
        (scrollView.height - scrollView.paddingTop - scrollView.paddingBottom).coerceAtLeast(0)
      val maxY = (content.height - viewportHeight).coerceAtLeast(0)
      return rawY.coerceIn(0, maxY)
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
