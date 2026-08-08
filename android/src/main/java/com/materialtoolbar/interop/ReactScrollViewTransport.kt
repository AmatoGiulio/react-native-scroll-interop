package com.materialtoolbar.interop

import android.graphics.Rect
import android.util.Log
import android.view.Choreographer
import android.view.View
import android.view.ViewGroup
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.views.scroll.ReactScrollView
import com.facebook.react.views.scroll.ReactScrollViewHelper
import com.facebook.react.views.scroll.ScrollEventType

internal const val NATIVE_SCROLL_LOG_TAG = "MaterialToolbar"

/** `adb shell setprop log.tag.MaterialToolbar DEBUG` turns the interop trace on in any build. */
internal inline fun scrollLog(message: () -> String) {
  if (Log.isLoggable(NATIVE_SCROLL_LOG_TAG, Log.DEBUG)) {
    Log.d(NATIVE_SCROLL_LOG_TAG, message())
  }
}

/** Frames with no movement before a resting session is considered finished. */
private const val STABLE_FRAME_COUNT = 4

/**
 * React Native 0.83 transport.
 *
 * This is the only file in the interop package that knows React Native exists. It observes RN's
 * own scroll dispatch, samples the active `ReactScrollView` once per display frame, and implements
 * the write side of [ScrollSourceController] using RN's native scroll-away top padding.
 *
 * It is deliberately replaceable. A react-native-screens transport would implement the same
 * interfaces on top of its screen/scroll registration layer, and no consumer would change.
 */
class ReactScrollViewTransport : NativeScrollTransport, ReactScrollViewHelper.ScrollListener {

  private var sink: NativeScrollTransport.Sink? = null
  private var listenerRegistered = false

  /** Live sources keyed by the RN view, so repeated discovery returns the same controller. */
  private val sources = LinkedHashMap<ReactScrollView, RnScrollSource>()
  private val sessions = LinkedHashMap<RnScrollSource, SessionState>()
  private var frameCallbackPosted = false

  private class SessionState {
    var lastSampledScrollY = 0
    var phase = ScrollPhase.Programmatic
    var velocityY = 0f
    var stableFrames = 0
    var debugFrames = 0
  }

  override fun start(sink: NativeScrollTransport.Sink) {
    this.sink = sink
    if (!listenerRegistered) {
      ReactScrollViewHelper.addScrollListener(this)
      listenerRegistered = true
    }
  }

  override fun stop() {
    if (listenerRegistered) {
      ReactScrollViewHelper.removeScrollListener(this)
      listenerRegistered = false
    }
    stopFrameCallback()
    sessions.clear()
    sources.values.forEach { it.releaseChromeSpace() }
    sources.clear()
    sink = null
  }

  override fun discoverFor(ownerView: View) {
    // Discovery runs on the next UI-thread pass so callers can invoke it from measure/layout.
    ownerView.post {
      val currentSink = sink ?: return@post
      if (!ownerView.isAttachedToWindow) return@post
      val candidate = findBestSource(ownerView) ?: return@post
      currentSink.onSourceAvailable(candidate)
    }
  }

  // region RN scroll dispatch

  override fun onLayout(scrollView: ViewGroup?) {
    val view = scrollView as? ReactScrollView ?: return
    val source = sources[view] ?: return
    // A relayout can change the content range under a reserved chrome band; re-assert it.
    source.reapplyChromeSpace()
  }

  override fun onScroll(
    scrollView: ViewGroup?,
    scrollEventType: ScrollEventType?,
    xVelocity: Float,
    yVelocity: Float,
  ) {
    val view = scrollView as? ReactScrollView ?: return
    if (!isUsableSource(view)) return

    when (scrollEventType) {
      ScrollEventType.BEGIN_DRAG -> beginOrUpdateSession(view, ScrollPhase.Drag, 0f)

      // A plain SCROLL with no session is an accessibility action, a programmatic scroll, a mouse
      // wheel, or a key event. Those must drive the chrome too, otherwise TalkBack users watch the
      // content move under a header that never collapses.
      ScrollEventType.SCROLL -> {
        val existing = sessionFor(view)
        if (existing == null) {
          beginOrUpdateSession(view, ScrollPhase.Programmatic, 0f)
        } else {
          existing.second.stableFrames = 0
          requestFrameCallback()
        }
      }

      // The finger left the screen. Keep the phase at Drag: if momentum follows, MOMENTUM_BEGIN
      // reclassifies it, and if it does not, the session rests and settles from here.
      ScrollEventType.END_DRAG -> updatePhase(view, ScrollPhase.Drag, yVelocity)

      ScrollEventType.MOMENTUM_BEGIN -> updatePhase(view, ScrollPhase.Fling, yVelocity)

      ScrollEventType.MOMENTUM_END -> updatePhase(view, ScrollPhase.Programmatic, 0f)

      null -> Unit
    }
  }

  // endregion

  private fun sessionFor(view: ReactScrollView): Pair<RnScrollSource, SessionState>? {
    val source = sources[view] ?: return null
    val state = sessions[source] ?: return null
    return source to state
  }

  private fun beginOrUpdateSession(view: ReactScrollView, phase: ScrollPhase, velocityY: Float) {
    val currentSink = sink ?: return
    val source = sourceFor(view)

    val existing = sessions[source]
    if (existing != null) {
      existing.phase = phase
      existing.velocityY = velocityY
      existing.stableFrames = 0
      requestFrameCallback()
      return
    }

    if (!currentSink.isSourceRelevant(source)) return

    val state = SessionState()
    state.lastSampledScrollY = source.scrollY
    state.phase = phase
    state.velocityY = velocityY
    sessions[source] = state

    currentSink.onSessionStart(source)
    scrollLog { "session start view=${source.debugId} phase=$phase scrollY=${source.scrollY}" }
    requestFrameCallback()
  }

  private fun updatePhase(view: ReactScrollView, phase: ScrollPhase, velocityY: Float) {
    val (_, state) = sessionFor(view) ?: return
    state.phase = phase
    if (velocityY != 0f) state.velocityY = velocityY
    state.stableFrames = 0
    requestFrameCallback()
  }

  private fun sourceFor(view: ReactScrollView): RnScrollSource =
    sources.getOrPut(view) {
      RnScrollSource(view) { rebaselinedY ->
        // A consumer moved the source itself. Re-baseline so the induced RN scroll event is not
        // re-sampled as a user delta and fed back to the consumer that produced it.
        sessions[sources[view]]?.lastSampledScrollY = rebaselinedY
      }
    }

  // region sampling

  private val frameCallback = Choreographer.FrameCallback {
    frameCallbackPosted = false
    val currentSink = sink ?: return@FrameCallback
    if (sessions.isEmpty()) return@FrameCallback

    var anyActive = false
    val finished = ArrayList<RnScrollSource>(0)

    for ((source, state) in sessions) {
      if (!source.isUsable || !currentSink.isSourceRelevant(source)) {
        finished += source
        continue
      }

      val rawY = source.view.scrollY
      val currentY = source.scrollY
      val deltaY = currentY - state.lastSampledScrollY
      state.lastSampledScrollY = currentY

      if (deltaY != 0) {
        state.stableFrames = 0
        currentSink.onFrame(
          source,
          NativeScrollFrame(
            deltaY = deltaY,
            scrollY = currentY,
            rawScrollY = rawY,
            phase = state.phase,
            velocityY = state.velocityY,
          ),
        )
        state.debugFrames += 1
        if (state.debugFrames % 8 == 1) {
          scrollLog {
            "frame view=${source.debugId} dy=$deltaY y=$currentY raw=$rawY " +
              "phase=${state.phase} v=${state.velocityY}"
          }
        }
      } else if (state.phase != ScrollPhase.Drag) {
        state.stableFrames += 1
      }

      if (state.phase == ScrollPhase.Drag || state.stableFrames < STABLE_FRAME_COUNT) {
        anyActive = true
      } else {
        finished += source
      }
    }

    finished.forEach { source ->
      val velocity = sessions.remove(source)?.velocityY ?: 0f
      scrollLog { "session end view=${source.debugId} v=$velocity" }
      currentSink.onSessionEnd(source, velocity)
    }

    if (anyActive || sessions.isNotEmpty()) requestFrameCallback()
  }

  private fun requestFrameCallback() {
    if (frameCallbackPosted || sessions.isEmpty()) return
    frameCallbackPosted = true
    Choreographer.getInstance().postFrameCallback(frameCallback)
  }

  private fun stopFrameCallback() {
    if (!frameCallbackPosted) return
    Choreographer.getInstance().removeFrameCallback(frameCallback)
    frameCallbackPosted = false
  }

  // endregion

  private fun findBestSource(ownerView: View): RnScrollSource? {
    val candidates = ArrayList<ReactScrollView>()
    collectReactScrollViews(ownerView.rootView, candidates)
    return candidates
      .asSequence()
      .filter { isUsableSource(it) }
      .mapNotNull { view ->
        val source = sourceFor(view)
        if (!source.isEligibleFor(ownerView)) return@mapNotNull null
        val rect = Rect()
        if (!view.getGlobalVisibleRect(rect)) null else source to rect.width() * rect.height()
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

  private fun isUsableSource(view: ReactScrollView): Boolean {
    if (!view.isAttachedToWindow || !view.isShown) return false
    if (view.windowVisibility != View.VISIBLE) return false
    return view.canScrollVertically(-1) || view.canScrollVertically(1)
  }
}

/**
 * [ScrollSourceController] backed by one `ReactScrollView`.
 *
 * All RN-specific geometry ownership lives here, which is what lets the Material consumers stay
 * free of React Native imports.
 */
internal class RnScrollSource(
  val view: ReactScrollView,
  private val onSelfDrivenScroll: (Int) -> Unit,
) : NativeScrollSource {

  private var reservedPx = 0
  private var originalClipToPadding: Boolean? = null

  override val debugId: Int get() = view.id

  override val isUsable: Boolean get() = view.isAttachedToWindow

  override val scrollY: Int
    get() {
      val rawY = view.scrollY
      val content = view.getChildAt(0) ?: return rawY.coerceAtLeast(0)
      // Reserving chrome space adds bottom padding to keep the translated content reachable, so
      // the padding has to be part of the viewport calculation or normalization would clamp the
      // reserved band away.
      val viewportHeight = (view.height - view.paddingTop - view.paddingBottom).coerceAtLeast(0)
      val maxY = (content.height - viewportHeight).coerceAtLeast(0)
      return rawY.coerceIn(0, maxY)
    }

  override fun isEligibleFor(ownerView: View): Boolean {
    val ownerSurface = runCatching { UIManagerHelper.getSurfaceId(ownerView) }.getOrDefault(-1)
    val sourceSurface = runCatching { UIManagerHelper.getSurfaceId(view) }.getOrDefault(-1)
    return ownerSurface == -1 || sourceSurface == -1 || ownerSurface == sourceSurface
  }

  override fun reserveChromeSpace(topInsetPx: Int) {
    val target = topInsetPx.coerceAtLeast(0)
    if (target == reservedPx) return
    if (!view.isAttachedToWindow) return

    if (reservedPx == 0 && target > 0) {
      originalClipToPadding = view.clipToPadding
    }

    // Everything is expressed relative to the padding the view has *right now*, minus whatever we
    // previously added. Capturing an "original" padding once and restoring it later would clobber
    // any padding React Native writes to the view while the chrome is attached.
    val baseBottom = view.paddingBottom - reservedPx

    view.setScrollAwayTopPaddingEnabledUnstable(target)
    view.setPadding(view.paddingLeft, view.paddingTop, view.paddingRight, baseBottom + target)
    // RN's scroll-away primitive adds bottom padding to keep the translated content reachable.
    // With clipToPadding=true that bookkeeping band is a visible blank strip on an overlay screen.
    view.clipToPadding = if (target > 0) false else (originalClipToPadding ?: view.clipToPadding)
    reservedPx = target

    if (target == 0) originalClipToPadding = null

    scrollLog { "reserve view=$debugId top=$target bottom=${view.paddingBottom}" }
  }

  internal fun reapplyChromeSpace() {
    if (reservedPx == 0) return
    view.setScrollAwayTopPaddingEnabledUnstable(reservedPx)
  }

  override fun releaseChromeSpace() = reserveChromeSpace(0)

  override fun scrollToY(y: Int) {
    if (!view.isAttachedToWindow) return
    val target = y.coerceAtLeast(0)
    if (view.scrollY == target) return
    view.scrollTo(view.scrollX, target)
    onSelfDrivenScroll(scrollY)
  }
}
