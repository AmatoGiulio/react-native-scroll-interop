package com.materialtoolbar.interop

import android.view.View

/**
 * Transport-neutral contract between a native vertical scroll source and native navigation chrome.
 *
 * Nothing in this file may depend on React Native, Expo, FlashList, a router, or Jetpack Compose.
 * That restriction is the whole point: the React Native transport in [ReactScrollViewTransport] is
 * one implementation, and a future react-native-screens transport built on its own screen/scroll
 * registration layer must be able to replace it without touching a single consumer.
 *
 * There is an architecture test asserting this file's package has no such imports; see
 * `android/src/test/java/com/materialtoolbar/interop/InteropBoundaryTest.kt`.
 */

/**
 * What is currently moving the source.
 *
 * Consumers need this because platform nested-scroll protocols distinguish a finger-driven scroll
 * from an inertial one. Reporting a fling as user input makes a consumer apply drag-time policy to
 * momentum pixels, which is how "the toolbar feels almost right but not quite" bugs happen.
 */
enum class ScrollPhase {
  /** A finger is down and driving the scroll. */
  Drag,

  /** Inertial scrolling after the finger lifted. */
  Fling,

  /**
   * Neither: an accessibility scroll action, a programmatic scroll, a mouse wheel, a key event,
   * or a scroll produced by the chrome itself. A transport must still report these, otherwise
   * assistive technologies silently desynchronise the chrome from the content.
   */
  Programmatic,
}

/**
 * One display-frame sample of the active source.
 *
 * [deltaY] uses normalized content coordinates, so it never contains Android edge-bounce pixels.
 * A consumer that wants bounce must not get it from here.
 */
data class NativeScrollFrame(
  val deltaY: Int,
  val scrollY: Int,
  val rawScrollY: Int,
  val phase: ScrollPhase,
  /** Instantaneous vertical velocity in px/s as reported by the transport, 0f when unknown. */
  val velocityY: Float,
)

/**
 * The write side of the contract.
 *
 * Collapsing chrome is not a read-only observer: `exitUntilCollapsed` needs the collapse range to
 * exist inside the source's own scroll range, and needs to reposition the source when the Material
 * settle animation lands on an endpoint. Before this interface existed, the TopAppBar consumer did
 * that by importing `ReactScrollView` and calling RN-internal methods on it directly, which made
 * the "consumer knows nothing about the transport" claim false.
 *
 * Implementations must make [scrollToY] non-reentrant: a self-driven scroll must not be re-sampled
 * and fed back to the consumer that requested it, or the consumer and the source can chase each
 * other for several frames.
 */
interface ScrollSourceController {
  /** Current normalized vertical scroll position, clamped to the real content range. */
  val scrollY: Int

  /** False once the underlying source is detached or otherwise unusable. */
  val isUsable: Boolean

  /**
   * Ask the source to reserve [topInsetPx] of space for chrome drawn above it, extending the
   * scroll range by the same amount so the reserved band is scrollable rather than dead space.
   *
   * The transport owns how this is achieved. The React Native transport uses RN 0.83's native
   * scroll-away top padding; a screens-based transport would use its own geometry ownership.
   */
  fun reserveChromeSpace(topInsetPx: Int)

  /** Undo [reserveChromeSpace] and restore whatever geometry the source had before. */
  fun releaseChromeSpace()

  /** Move the source. Must not re-enter the frame pipeline as a user-visible delta. */
  fun scrollToY(y: Int)
}

/**
 * A concrete source produced by a transport.
 *
 * [isEligibleFor] answers "may this owner's chrome be driven by this source", which is where
 * ownership policy lives (same surface, attached, shown). It is transport-specific on purpose:
 * React Native reasons in Fabric surfaces, screens reasons in screens.
 */
interface NativeScrollSource : ScrollSourceController {
  fun isEligibleFor(ownerView: View): Boolean

  /** Stable identifier for logs only. */
  val debugId: Int
}

/**
 * Discovers sources, observes them, and emits per-frame samples.
 *
 * A transport is responsible for the entire lifecycle of a scroll session, including deciding when
 * a session has come to rest. It must report sessions for every kind of scroll, not just
 * finger-driven ones.
 */
interface NativeScrollTransport {
  fun start(sink: Sink)

  fun stop()

  /** Look for a source that could drive [ownerView]'s chrome right now. */
  fun discoverFor(ownerView: View)

  interface Sink {
    fun onSourceAvailable(source: NativeScrollSource)

    fun onSourceUnavailable(source: NativeScrollSource)

    fun onSessionStart(source: NativeScrollSource)

    fun onFrame(source: NativeScrollSource, frame: NativeScrollFrame)

    /** [velocityY] is the velocity at which the source came to rest, in px/s. */
    fun onSessionEnd(source: NativeScrollSource, velocityY: Float)

    /**
     * Whether any registered chrome still wants samples from [source]. The transport uses this to
     * stop sampling instead of running a Choreographer callback nobody listens to.
     */
    fun isSourceRelevant(source: NativeScrollSource): Boolean
  }
}

/**
 * Native chrome that reacts to a scroll source.
 *
 * A consumer receives a controller and frames. It never receives a `View`, a scroll listener, or
 * anything else that would tie it to how the samples were obtained.
 */
interface NativeScrollConsumer {
  val isEnabled: Boolean

  fun onScrollSourceAvailable(controller: ScrollSourceController) = Unit

  fun onScrollSourceUnavailable(controller: ScrollSourceController) = Unit

  fun onScrollSessionStart(controller: ScrollSourceController)

  fun onScrollFrame(frame: NativeScrollFrame)

  fun onScrollSessionEnd(velocityY: Float)
}
