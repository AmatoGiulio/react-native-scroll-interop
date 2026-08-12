package expo.modules.materialtoolbar

/**
 * Decides whether the parent takes ownership of a fling instead of letting the scroll source run
 * its own.
 *
 * This is deliberately free of Android types. Taking a fling over is the most invasive thing this
 * transport does — it replaces the source's physics and it once span a start/cancel loop that froze
 * the UI for over a second — so the rules that gate it are stated in one place, in terms of plain
 * values, and covered by tests that need no device.
 */
internal object NestedFlingPolicy {
  /**
   * Scroll frames a session must have seen before its reported velocity means anything.
   *
   * A velocity needs two samples to exist. Below that, whatever the tracker reports is noise, and
   * the noise has two very different sources that this one rule covers together:
   *
   *  - a re-entrant fling, where the source re-opens a session as a consequence of our own
   *    interception and immediately flings it;
   *  - synthetic input — a mouse wheel or a trackpad on Android — where every notch arrives as a
   *    complete one-frame DOWN/UP gesture carrying a saturated velocity.
   *
   * Driving either one restarts the proxy every frame without a fling ever completing.
   */
  const val MIN_SCROLL_SAMPLES = 2L

  /**
   * Whether the parent may take flings over at all.
   *
   * This is a fallback for sources that cannot report their own momentum, not a design. Reproducing
   * a scroll view's physics in its parent is guessing at something the source knows exactly; the
   * only reason to do it is that `android.widget.ScrollView` moves its fling from `computeScroll`,
   * which dispatches nothing, leaving the parent with no transaction to observe.
   *
   * A source that dispatches its own momentum makes this redundant — see [sourceOwnsMomentum] —
   * and the switch stays so the difference can be measured rather than asserted.
   */
  var parentOwnedMomentumEnabled = true

  /**
   * @param scrollFrameCount pre-scroll frames this nested session has delivered so far.
   * @param hasDirectTransaction whether the parent is currently driving chrome for this source.
   * @param hasChrome whether a chrome consumer resolved for this source.
   * @param chromeCanDrive whether that chrome has travel left in this direction.
   * @param handoffPending set after a proxy was cancelled before running a single frame; until real
   *   scroll input clears it, the fling belongs to the source.
   * @param sourceOwnsMomentum whether the source dispatches its own momentum as TYPE_NON_TOUCH
   *   nested scroll. When it does, the parent has the real transaction to work with and taking the
   *   fling over could only make it less faithful.
   */
  fun shouldDriveFling(
    scrollFrameCount: Long,
    hasDirectTransaction: Boolean,
    hasChrome: Boolean,
    chromeCanDrive: Boolean,
    handoffPending: Boolean,
    sourceOwnsMomentum: Boolean,
  ): Boolean =
    parentOwnedMomentumEnabled &&
      !sourceOwnsMomentum &&
      hasChrome &&
      hasDirectTransaction &&
      !handoffPending &&
      scrollFrameCount >= MIN_SCROLL_SAMPLES &&
      chromeCanDrive

  /** Direction of travel in Android's sign convention: 1 down, -1 up, 0 for no movement. */
  fun directionOf(velocityY: Float): Int = when {
    velocityY > 0f -> 1
    velocityY < 0f -> -1
    else -> 0
  }

  /**
   * A proxy torn down before its first frame means something took the source away from it — which,
   * left alone, is the loop. Arming the handoff yields the next fling to the source instead.
   */
  fun shouldArmHandoff(hadProxy: Boolean, framesRun: Long, externalInterruption: Boolean): Boolean =
    hadProxy && externalInterruption && framesRun == 0L
}
