package expo.modules.materialtoolbar

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * These cases are the regressions this transport actually shipped, written down. Each name states
 * the failure it prevents rather than the method it calls, because the value here is the behavior,
 * not the coverage.
 */
class NestedFlingPolicyTest {

  private fun drive(
    scrollFrameCount: Long = 10,
    hasDirectTransaction: Boolean = true,
    hasChrome: Boolean = true,
    chromeCanDrive: Boolean = true,
    handoffPending: Boolean = false,
    sourceOwnsMomentum: Boolean = false,
  ) = NestedFlingPolicy.shouldDriveFling(
    scrollFrameCount = scrollFrameCount,
    hasDirectTransaction = hasDirectTransaction,
    hasChrome = hasChrome,
    chromeCanDrive = chromeCanDrive,
    handoffPending = handoffPending,
    sourceOwnsMomentum = sourceOwnsMomentum,
  )

  @Test
  fun `drives a fling that follows real scrolling`() {
    assertTrue(drive(scrollFrameCount = 37))
  }

  @Test
  fun `refuses a fling on a session that never scrolled`() {
    // The re-entrant fling: the source re-opens a session as a consequence of our own interception
    // and flings it immediately. Driving it restarts the proxy every frame — the loop that froze
    // the UI for over a second, 305 proxies created against 7 completed.
    assertFalse(drive(scrollFrameCount = 0))
  }

  @Test
  fun `refuses a fling carrying a single scroll frame`() {
    // A mouse wheel or trackpad notch on Android arrives as a complete one-frame DOWN/UP gesture
    // with a saturated velocity. One sample cannot express a velocity, so the value is noise.
    assertFalse(drive(scrollFrameCount = 1))
  }

  @Test
  fun `two scroll frames are enough`() {
    // The threshold is a floor, not a comfort margin: a genuine flick can be this short.
    assertEquals(2L, NestedFlingPolicy.MIN_SCROLL_SAMPLES)
    assertTrue(drive(scrollFrameCount = 2))
  }

  @Test
  fun `yields the fling while a handoff is pending`() {
    assertFalse(drive(handoffPending = true))
  }

  @Test
  fun `refuses when chrome has no travel left in that direction`() {
    // Already collapsed and still flinging that way: the momentum belongs to the list, and taking
    // it over would replace native physics for no gain.
    assertFalse(drive(chromeCanDrive = false))
  }

  @Test
  fun `refuses without chrome or without an open transaction`() {
    assertFalse(drive(hasChrome = false))
    assertFalse(drive(hasDirectTransaction = false))
  }

  @Test
  fun `yields the fling to a source that reports its own momentum`() {
    // The point of the whole exercise: when the scroll view dispatches its fling as TYPE_NON_TOUCH,
    // the parent already has the real transaction. Reproducing the physics next to it would be a
    // second, slightly different scroll view driving the same pixels.
    assertFalse(drive(scrollFrameCount = 37, sourceOwnsMomentum = true))
  }

  @Test
  fun `drives nothing when parent-owned momentum is switched off`() {
    // The switch exists so the fallback can be measured against the real thing rather than trusted.
    NestedFlingPolicy.parentOwnedMomentumEnabled = false
    try {
      assertFalse(drive(scrollFrameCount = 37))
    } finally {
      NestedFlingPolicy.parentOwnedMomentumEnabled = true
    }
  }

  @Test
  fun `maps velocity sign to direction of travel`() {
    assertEquals(1, NestedFlingPolicy.directionOf(4085f))
    assertEquals(-1, NestedFlingPolicy.directionOf(-320f))
    assertEquals(0, NestedFlingPolicy.directionOf(0f))
  }

  @Test
  fun `arms the handoff when a proxy dies before its first frame`() {
    assertTrue(
      NestedFlingPolicy.shouldArmHandoff(
        hadProxy = true,
        framesRun = 0,
        externalInterruption = true,
      ),
    )
  }

  @Test
  fun `leaves the handoff alone when the proxy actually ran`() {
    // A finger interrupting momentum that was moving is an ordinary gesture, not the loop.
    assertFalse(
      NestedFlingPolicy.shouldArmHandoff(
        hadProxy = true,
        framesRun = 12,
        externalInterruption = true,
      ),
    )
  }

  @Test
  fun `internal teardown never arms the handoff`() {
    // Replacing one proxy with another, or finishing a fling that ran its course, is not an
    // interruption. Arming here would make the next real fling be yielded for no reason.
    assertFalse(
      NestedFlingPolicy.shouldArmHandoff(
        hadProxy = true,
        framesRun = 0,
        externalInterruption = false,
      ),
    )
  }

  @Test
  fun `no proxy means nothing to arm`() {
    assertFalse(
      NestedFlingPolicy.shouldArmHandoff(
        hadProxy = false,
        framesRun = 0,
        externalInterruption = true,
      ),
    )
  }
}
