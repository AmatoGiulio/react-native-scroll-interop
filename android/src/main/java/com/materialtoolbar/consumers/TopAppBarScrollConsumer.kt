@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.materialtoolbar.consumers

import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.Velocity
import com.materialtoolbar.interop.NativeScrollConsumer
import com.materialtoolbar.interop.NativeScrollFrame
import com.materialtoolbar.interop.ScrollSourceController
import com.materialtoolbar.interop.scrollLog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

enum class TopAppBarInteropMode {
  EnterAlways,
  ExitUntilCollapsed,
}

/**
 * Material 3 top app bar consumer.
 *
 * Unlike the floating toolbar, a collapsing app bar displaces content: the collapse range has to
 * exist inside the source's own scroll range, and the source has to be repositioned when Material's
 * settle animation lands on an endpoint. Both of those go through [ScrollSourceController]; this
 * class contains no React Native, FlashList, or navigation code, and must keep it that way so the
 * same consumer can run on a different transport.
 */
class TopAppBarScrollConsumer : NativeScrollConsumer {
  private var behavior: TopAppBarScrollBehavior? = null
  private var scope: CoroutineScope? = null
  private var mode: TopAppBarInteropMode? = null
  private var settleJob: Job? = null
  private var settleGeneration = 0L
  private var debugFrameCounter = 0

  private var controller: ScrollSourceController? = null
  private var reservedPx = 0

  /**
   * Largest host height observed so far, i.e. the fully expanded app bar including its window
   * inset. The host must lay the Compose view out at this height rather than at its instantaneous
   * measured height, or the expanded title is drawn outside the laid-out bounds and clipped.
   */
  var expandedChromeHeightPx = 0
    private set

  override val isEnabled: Boolean
    get() = behavior != null && scope != null && mode != null

  fun bind(
    newBehavior: TopAppBarScrollBehavior?,
    newScope: CoroutineScope?,
    newMode: TopAppBarInteropMode?,
  ) {
    if (behavior === newBehavior && scope === newScope && mode == newMode) return
    cancelSettle()
    behavior = newBehavior
    scope = newScope
    mode = newMode

    if (newBehavior == null || newScope == null || newMode == null) {
      releaseSource()
    } else {
      applyChromeSpace()
    }
  }

  fun unbind(expectedBehavior: TopAppBarScrollBehavior?) {
    if (behavior !== expectedBehavior) return
    bind(null, null, null)
  }

  /**
   * Called by the host after Compose measurement. The largest height observed is the expanded
   * app-bar height including its window inset; a collapsing bar remeasures smaller, so a transient
   * smaller height must never replace the expanded geometry.
   */
  fun updateExpandedChromeHeight(heightPx: Int): Boolean {
    if (heightPx <= 0 || heightPx <= expandedChromeHeightPx) return false
    expandedChromeHeightPx = heightPx
    applyChromeSpace()
    return true
  }

  /** Reset when the variant or window insets change and a fresh expanded measure is required. */
  fun resetExpandedChromeHeight() {
    expandedChromeHeightPx = 0
    applyChromeSpace()
  }

  fun onHostDetached() {
    cancelSettle()
    releaseSource()
  }

  override fun onScrollSourceAvailable(controller: ScrollSourceController) {
    if (!isEnabled) return
    if (this.controller !== controller) {
      releaseSource()
      this.controller = controller
    }
    applyChromeSpace()
  }

  override fun onScrollSourceUnavailable(controller: ScrollSourceController) {
    if (this.controller === controller) releaseSource()
  }

  override fun onScrollSessionStart(controller: ScrollSourceController) {
    cancelSettle()
    debugFrameCounter = 0
    onScrollSourceAvailable(controller)
    scrollLog {
      val state = behavior?.state
      "topappbar begin mode=$mode y=${controller.scrollY} " +
        "heightOffset=${state?.heightOffset} limit=${state?.heightOffsetLimit} reserved=$reservedPx"
    }
  }

  override fun onScrollFrame(frame: NativeScrollFrame) {
    if (frame.deltaY == 0) return
    val currentBehavior = behavior ?: return
    val currentMode = mode ?: return
    val connection = currentBehavior.nestedScrollConnection
    val nestedSource = frame.nestedScrollSource
    val scroll = Offset(0f, -frame.deltaY.toFloat())

    when (currentMode) {
      TopAppBarInteropMode.EnterAlways -> {
        // enterAlways is a pre-scroll behaviour: Material consumes its own height first, and only
        // the remainder is reported as child-consumed scroll.
        val preConsumed = connection.onPreScroll(available = scroll, source = nestedSource)
        connection.onPostScroll(
          consumed = Offset(scroll.x - preConsumed.x, scroll.y - preConsumed.y),
          available = Offset.Zero,
          source = nestedSource,
        )
      }

      TopAppBarInteropMode.ExitUntilCollapsed -> {
        if (frame.deltaY > 0) {
          val preConsumed = connection.onPreScroll(available = scroll, source = nestedSource)
          connection.onPostScroll(
            consumed = Offset(scroll.x - preConsumed.x, scroll.y - preConsumed.y),
            available = Offset.Zero,
            source = nestedSource,
          )
        } else {
          // Downward movement. Material expands from post-scroll *available* distance only once
          // the logical child is at its top, so split the frame into the part the child really
          // consumed and the part that is left over for the app bar.
          val downwardDistance = -frame.deltaY.toFloat()
          val collapseRange = collapseRange(currentBehavior)
          val previousLogicalY = logicalChildY(frame.scrollY - frame.deltaY, collapseRange)
          val currentLogicalY = logicalChildY(frame.scrollY, collapseRange)
          val childConsumed = (previousLogicalY - currentLogicalY).coerceIn(0f, downwardDistance)

          connection.onPostScroll(
            consumed = Offset(0f, childConsumed),
            available = Offset(0f, (downwardDistance - childConsumed).coerceAtLeast(0f)),
            source = nestedSource,
          )
        }

        // Material's contentOffset describes the logical child position after the collapse range
        // has been consumed; the source's scrollY includes that reserved range by design.
        val collapseRange = collapseRange(currentBehavior)
        currentBehavior.state.contentOffset = -logicalChildY(frame.scrollY, collapseRange)
        reconcileAtMaterialEndpoint(frame.scrollY, currentBehavior)
      }
    }

    debugFrameCounter += 1
    if (debugFrameCounter % 8 == 1) {
      val state = currentBehavior.state
      scrollLog {
        "topappbar mode=$currentMode dy=${frame.deltaY} y=${frame.scrollY} phase=${frame.phase} " +
          "heightOffset=${state.heightOffset} limit=${state.heightOffsetLimit} " +
          "contentOffset=${state.contentOffset}"
      }
    }
  }

  override fun onScrollSessionEnd(velocityY: Float) {
    val currentBehavior = behavior ?: return
    val currentScope = scope ?: return
    val currentMode = mode ?: return
    val source = controller
    cancelSettle()

    // Derive the logical child position from the full collapse range, not from the instantaneous
    // animated heightOffset: doing the latter turns a one-frame sampling skew into permanent drift.
    val settleLogicalChildY =
      if (currentMode == TopAppBarInteropMode.ExitUntilCollapsed && source != null) {
        logicalChildY(source.scrollY, collapseRange(currentBehavior))
      } else {
        0f
      }

    val generation = ++settleGeneration
    settleJob = currentScope.launch {
      var completedNormally = false
      val syncJob =
        if (currentMode == TopAppBarInteropMode.ExitUntilCollapsed && source != null) {
          launch {
            snapshotFlow { currentBehavior.state.heightOffset }.collect { heightOffset ->
              if (generation == settleGeneration) {
                syncSourceToSettle(source, settleLogicalChildY, heightOffset)
              }
            }
          }
        } else {
          null
        }

      try {
        currentBehavior.nestedScrollConnection.onPostFling(
          consumed = Velocity.Zero,
          available = nestedScrollVelocity(velocityY),
        )
        completedNormally = true
      } finally {
        syncJob?.cancel()

        // A new drag invalidates this settle. A cancelled settle must not run a stale final
        // reposition after the new gesture has taken ownership of the same source.
        if (
          completedNormally &&
          generation == settleGeneration &&
          currentMode == TopAppBarInteropMode.ExitUntilCollapsed &&
          source != null
        ) {
          syncSourceToSettle(source, settleLogicalChildY, currentBehavior.state.heightOffset)
          reconcileAtMaterialEndpoint(source.scrollY, currentBehavior)
        }

        if (generation == settleGeneration) settleJob = null
      }
    }
  }

  private fun collapseRange(behavior: TopAppBarScrollBehavior): Float =
    (-behavior.state.heightOffsetLimit).coerceAtLeast(0f)

  private fun logicalChildY(scrollY: Int, collapseRange: Float): Float =
    (scrollY.toFloat() - collapseRange).coerceAtLeast(0f)

  /**
   * The source is sampled after it has physically scrolled while Material clamps its own state
   * synchronously, so near an exact endpoint the last sampled pixels can lag Material by one
   * display frame. Re-assert the shared invariant at the endpoint so sub-frame skew never becomes
   * a visible gap between the list and the header.
   */
  private fun reconcileAtMaterialEndpoint(sampledScrollY: Int, behavior: TopAppBarScrollBehavior) {
    val source = controller ?: return
    if (!source.isUsable) return

    val state = behavior.state
    val collapseRange = collapseRange(behavior)
    if (collapseRange <= 0f) return

    val endpointCollapseAmount = when {
      abs(state.heightOffset) <= ENDPOINT_EPSILON_PX -> 0f
      abs(state.heightOffset - state.heightOffsetLimit) <= ENDPOINT_EPSILON_PX -> collapseRange
      else -> return
    }

    val logicalY = logicalChildY(sampledScrollY, collapseRange)
    source.scrollToY((logicalY + endpointCollapseAmount).roundToInt())
    state.contentOffset = -logicalY
  }

  private fun syncSourceToSettle(
    source: ScrollSourceController,
    logicalChildY: Float,
    heightOffset: Float,
  ) {
    if (!source.isUsable) return
    source.scrollToY((logicalChildY + (-heightOffset).coerceAtLeast(0f)).roundToInt())
    behavior?.state?.contentOffset = -logicalChildY
  }

  private fun applyChromeSpace() {
    val source = controller ?: return
    val target = if (isEnabled) expandedChromeHeightPx.coerceAtLeast(0) else 0
    if (target == reservedPx) return
    source.reserveChromeSpace(target)
    reservedPx = target
  }

  private fun releaseSource() {
    controller?.releaseChromeSpace()
    controller = null
    reservedPx = 0
  }

  private fun cancelSettle() {
    // Invalidate first, so a cancelled coroutine cannot perform a stale final reconciliation after
    // a newer generation has taken ownership.
    settleGeneration += 1
    settleJob?.cancel()
    settleJob = null
  }

  private companion object {
    const val ENDPOINT_EPSILON_PX = 0.75f
  }
}
