package expo.modules.materialtoolbar

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChromeSettlePolicyTest {

  @Test
  fun `restores chrome that drifted while the list sits at the top`() {
    // The reported symptom: app bar expanded, floating toolbar hidden. Without this the settle
    // would read fraction 1.0 and snap it further away.
    assertTrue(ChromeSettlePolicy.shouldRestoreAtTop(sourceScrollY = 0, offset = -252f))
  }

  @Test
  fun `restores even a small drift, since errors accumulate`() {
    // Observed fractions sit at 0.46-0.47, so a few tens of pixels decide the endpoint.
    assertTrue(ChromeSettlePolicy.shouldRestoreAtTop(sourceScrollY = 0, offset = -29f))
  }

  @Test
  fun `does nothing when chrome is already where it belongs`() {
    assertFalse(ChromeSettlePolicy.shouldRestoreAtTop(sourceScrollY = 0, offset = 0f))
  }

  @Test
  fun `never interferes away from the top`() {
    // Hidden chrome mid-list is the correct state, not drift. Restoring there would fight the user.
    assertFalse(ChromeSettlePolicy.shouldRestoreAtTop(sourceScrollY = 1, offset = -252f))
    assertFalse(ChromeSettlePolicy.shouldRestoreAtTop(sourceScrollY = 8752, offset = -252f))
  }
}
