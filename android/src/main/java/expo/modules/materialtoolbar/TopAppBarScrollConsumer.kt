@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package expo.modules.materialtoolbar

import android.util.Log
import android.view.ViewGroup
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.unit.Velocity
import com.facebook.react.views.scroll.ReactScrollView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

internal enum class TopAppBarInteropMode {
  /**
   * A visible app bar with no scroll behavior. Material never moves it, but the overlay still
   * occupies the top of the screen, so the RN content below it needs the same scroll-away inset the
   * scrolling modes install. Without this mode the consumer stayed unbound and the list rendered
   * underneath the app bar.
   */
  Pinned,
  EnterAlways,
  ExitUntilCollapsed,
}

/**
 * Material3 TopAppBar consumer. It takes the pre-scroll phase of the nested-scroll transaction the
 * source reports — the only phase that can withhold distance from the list — and forwards it into
 * the real Material3 TopAppBarScrollBehavior nested-scroll connection.
 *
 * Owns the RN-specific visual bridge required for a full-screen overlay TopAppBar:
 * the active ReactScrollView receives React Native's native scroll-away top padding using the
 * measured expanded Compose host height. This keeps the first list item aligned with the real
 * Material app-bar geometry and makes the physical RN content move in lockstep with collapse /
 * expansion instead of relying on a duplicated JS padding constant.
 */
internal class TopAppBarScrollConsumer {
  private var behavior: TopAppBarScrollBehavior? = null
  private var scope: CoroutineScope? = null
  private var mode: TopAppBarInteropMode? = null
  private var settleJob: Job? = null
  private var settleGeneration = 0L
  private var lastInputDeltaY = 0

  private var expandedChromeHeightPx = 0
  private var scrollAwaySource: ReactScrollView? = null
  private var appliedScrollAwayPaddingPx = 0
  private var originalClipToPadding: Boolean? = null
  private var originalPaddingLeft = 0
  private var originalPaddingTop = 0
  private var originalPaddingRight = 0
  private var originalPaddingBottom = 0

  /** A visible app bar owns the top of the screen, whether or not Material animates it. */
  val hasChrome: Boolean
    get() = mode != null

  /** Material can actually be driven: there is a behavior and a scope to settle it on. */
  private val isBound: Boolean
    get() = behavior != null && scope != null && mode != null

  /** True while the settle coroutine is still aligning the source's scroll-away padding. */
  val isSettlingChrome: Boolean
    get() = settleJob?.isActive == true

  /**
   * Whether a transaction can drive this app bar.
   *
   * [TopAppBarInteropMode.Pinned] answers no on purpose: a pinned bar has no Material behavior to
   * drive and only owns the content inset. Every other visible mode goes through the same
   * transaction, because it is the only path there is.
   */
  val isNestedDirectCapable: Boolean
    get() = isBound

  /** Prepare the RN scroll-away visual coordinate before the first gesture. */
  fun prepareNestedSource(source: ViewGroup): Boolean {
    // Keyed on chrome rather than on drivability: a pinned bar never moves and still has to inset
    // the list it covers.
    if (!hasChrome) return false
    val reactScrollView = source as? ReactScrollView ?: return false
    ensureScrollAwaySource(reactScrollView)
    return appliedScrollAwayPaddingPx > 0
  }

  fun beginNestedTransaction(source: ViewGroup): Boolean {
    if (!isNestedDirectCapable) return false
    val reactScrollView = source as? ReactScrollView ?: return false
    cancelSettle()
    lastInputDeltaY = 0
    ensureScrollAwaySource(reactScrollView)
    if (BuildConfig.DEBUG) {
      val state = behavior?.state
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "TX_TOP_BEGIN view=${reactScrollView.id} y=${reactScrollView.scrollY} " +
          "heightOffset=${state?.heightOffset} limit=${state?.heightOffsetLimit} " +
          "collapse=${currentCollapseAmountPx()} scrollAway=$appliedScrollAwayPaddingPx",
      )
    }
    return true
  }

  fun nestedPreScroll(deltaY: Int, inputType: NativeNestedInputType): NativeNestedPreResult {
    val currentBehavior = behavior ?: return NativeNestedPreResult(0, 0)
    if (!isNestedDirectCapable || deltaY == 0) return NativeNestedPreResult(0, 0)
    lastInputDeltaY = deltaY

    val state = currentBehavior.state
    val oldHeightOffset = state.heightOffset
    val composeSource = inputType.toComposeNestedSource()
    val returned = currentBehavior.nestedScrollConnection.onPreScroll(
      available = Offset(0f, -deltaY.toFloat()),
      source = composeSource,
    )
    val newHeightOffset = state.heightOffset

    // Material3 may report the whole available delta as pre-consumed even when the heightOffset
    // setter clamps at its limit. Keep those two concepts separate: reportedConsumed controls what
    // the child receives, while chromeMovement controls only the physical scroll-away coordinate.
    val reportedConsumedY = clampSignedConsumption(deltaY, -returned.y)
    val chromeMovementY = clampSignedMovement(deltaY, oldHeightOffset - newHeightOffset)
    return NativeNestedPreResult(reportedConsumedY, chromeMovementY)
  }

  fun nestedPostScroll(
    childConsumedY: Int,
    availableY: Int,
    inputType: NativeNestedInputType,
  ): NativeNestedPostResult {
    val currentBehavior = behavior ?: return NativeNestedPostResult(0, 0)
    if (!isNestedDirectCapable) return NativeNestedPostResult(0, 0)

    val state = currentBehavior.state
    val oldHeightOffset = state.heightOffset
    val returned = currentBehavior.nestedScrollConnection.onPostScroll(
      consumed = Offset(0f, -childConsumedY.toFloat()),
      available = Offset(0f, -availableY.toFloat()),
      source = inputType.toComposeNestedSource(),
    )
    val newHeightOffset = state.heightOffset

    val availableConsumedY = clampSignedConsumption(availableY, -returned.y)
    // Post-scroll height changes can be caused by either child-consumed upward motion or available
    // downward motion. The actual state delta is authoritative for scroll-away geometry.
    val chromeMovementY = (oldHeightOffset - newHeightOffset).roundToInt()
    return NativeNestedPostResult(availableConsumedY, chromeMovementY)
  }

  /** Physical RN y = logical child y + the actual Material collapse amount. */
  fun logicalChildY(source: ReactScrollView): Int {
    val collapse = currentCollapseAmountPx()
    return (source.scrollY.toFloat() - collapse).coerceAtLeast(0f).roundToInt()
  }

  fun currentCollapseAmountPx(): Float =
    behavior?.state?.heightOffset?.let { (-it).coerceAtLeast(0f) } ?: 0f

  fun remainingCollapseAmountPx(): Float {
    val state = behavior?.state ?: return 0f
    val range = (-state.heightOffsetLimit).coerceAtLeast(0f)
    return (range - currentCollapseAmountPx()).coerceAtLeast(0f)
  }
  /**
   * Finish a direct nested transaction using Material3's own snap engine. During the chrome-only
   * snap there is no child scroll delta, so keep the RN scroll-away physical coordinate equal to
   * logicalChildY + Material collapse amount. This is geometry synchronization, not replayed input.
   */
  fun endNestedTransaction(source: ReactScrollView, reason: String) {
    val currentBehavior = behavior ?: return
    val currentScope = scope ?: return
    if (!isNestedDirectCapable || !source.isAttachedToWindow) return
    cancelSettle()

    val logicalY = logicalChildY(source).toFloat()
    val generation = ++settleGeneration
    if (BuildConfig.DEBUG) {
      val state = currentBehavior.state
      val fraction = if (state.heightOffsetLimit != 0f) state.heightOffset / state.heightOffsetLimit else 0f
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "TX_TOP_SETTLE_START gen=$generation reason=$reason logicalY=$logicalY " +
          "sourceY=${source.scrollY} heightOffset=${state.heightOffset} limit=${state.heightOffsetLimit} fraction=$fraction",
      )
    }

    settleJob = currentScope.launch(start = CoroutineStart.UNDISPATCHED) {
      var completedNormally = false
      val syncJob = launch(start = CoroutineStart.UNDISPATCHED) {
        snapshotFlow { currentBehavior.state.heightOffset }.collect { heightOffset ->
          if (generation == settleGeneration) {
            syncDirectScrollAwaySettle(source, logicalY, heightOffset, currentBehavior)
          }
        }
      }

      try {
        // The proxy already integrates the user fling as NON_TOUCH scroll deltas. Passing that
        // velocity again here would double-apply momentum. Zero velocity asks Material only for its
        // terminal snap, using the real state reached by the transaction stream.
        currentBehavior.nestedScrollConnection.onPostFling(
          consumed = Velocity.Zero,
          available = Velocity.Zero,
        )
        completedNormally = true
      } finally {
        syncJob.cancel()
        if (
          completedNormally &&
            generation == settleGeneration &&
            source.isAttachedToWindow
        ) {
          syncDirectScrollAwaySettle(
            source,
            logicalY,
            currentBehavior.state.heightOffset,
            currentBehavior,
          )
        }
        if (BuildConfig.DEBUG) {
          val state = currentBehavior.state
          val fraction = if (state.heightOffsetLimit != 0f) state.heightOffset / state.heightOffsetLimit else 0f
          Log.d(
            NATIVE_SCROLL_LOG_TAG,
            "TX_TOP_SETTLE_END gen=$generation completed=$completedNormally currentGen=$settleGeneration " +
              "sourceY=${source.scrollY} logicalY=${logicalChildY(source)} " +
              "heightOffset=${state.heightOffset} limit=${state.heightOffsetLimit} fraction=$fraction",
          )
        }
        if (generation == settleGeneration) settleJob = null
      }
    }
  }

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

    // Keyed on chrome presence, not on a bound behavior: a pinned app bar insets its content too.
    if (newMode == null) {
      clearScrollAwaySource()
    } else {
      applyScrollAwayPadding()
    }
  }

  fun unbind(
    expectedBehavior: TopAppBarScrollBehavior?,
    expectedMode: TopAppBarInteropMode?,
  ) {
    // Pinned mode has no behavior to identify it by, so the mode is part of the identity check.
    if (behavior !== expectedBehavior || mode != expectedMode) return
    bind(null, null, null)
  }

  /**
   * Called from the Android host after Compose measurement. The maximum observed height is the
   * expanded app-bar host height (including Material3's top window inset). A collapsing TopAppBar
   * remeasures smaller, so never replace the expanded geometry with that transient height.
   */
  fun updateExpandedChromeHeight(heightPx: Int): Boolean {
    if (heightPx <= 0) return false
    if (heightPx <= expandedChromeHeightPx) return false
    expandedChromeHeightPx = heightPx
    applyScrollAwayPadding()
    return true
  }

  /** Reset only when the TopAppBar variant itself changes and a new expanded measure is required. */
  fun resetExpandedChromeHeight() {
    expandedChromeHeightPx = 0
    applyScrollAwayPadding()
  }

  /** Give the list its padding back: this app bar is leaving the screen. */
  fun onHostDetached() {
    cancelSettle()
    clearScrollAwaySource()
  }

  private fun ensureScrollAwaySource(source: ReactScrollView) {
    if (scrollAwaySource !== source) {
      clearScrollAwaySource()
      scrollAwaySource = source
      captureScrollViewVisualState(source)
    }
    applyScrollAwayPadding()
  }

  private fun syncDirectScrollAwaySettle(
    source: ReactScrollView,
    logicalChildY: Float,
    heightOffset: Float,
    behavior: TopAppBarScrollBehavior,
  ) {
    if (!source.isAttachedToWindow) return
    val collapseAmount = (-heightOffset).coerceAtLeast(0f)
    val targetY = (logicalChildY + collapseAmount).roundToInt().coerceAtLeast(0)
    if (source.scrollY != targetY) {
      // The RN private OverScroller was intercepted by the explicit transport. A raw scrollTo is
      // intentional here: this is chrome-settle geometry, not momentum that should be preserved.
      source.scrollTo(source.scrollX, targetY)
    }
    if (BuildConfig.DEBUG) {
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "TX_TOP_SETTLE_SYNC targetY=$targetY logicalY=$logicalChildY collapse=$collapseAmount " +
          "heightOffset=$heightOffset limit=${behavior.state.heightOffsetLimit}",
      )
    }
  }

  private fun NativeNestedInputType.toComposeNestedSource(): NestedScrollSource = when (this) {
    NativeNestedInputType.Touch -> NestedScrollSource.UserInput
    NativeNestedInputType.NonTouch -> NestedScrollSource.SideEffect
  }

  private fun clampSignedConsumption(availableY: Int, consumedAndroidY: Float): Int {
    if (availableY == 0) return 0
    val rounded = consumedAndroidY.roundToInt()
    return if (availableY > 0) rounded.coerceIn(0, availableY)
    else rounded.coerceIn(availableY, 0)
  }

  private fun clampSignedMovement(availableY: Int, movementAndroidY: Float): Int {
    if (availableY == 0) return 0
    val rounded = movementAndroidY.roundToInt()
    return if (availableY > 0) rounded.coerceIn(0, availableY)
    else rounded.coerceIn(availableY, 0)
  }

  private fun captureScrollViewVisualState(source: ReactScrollView) {
    originalClipToPadding = source.clipToPadding
    originalPaddingLeft = source.paddingLeft
    originalPaddingTop = source.paddingTop
    originalPaddingRight = source.paddingRight
    originalPaddingBottom = source.paddingBottom
  }

  private fun applyScrollAwayPadding() {
    val source = scrollAwaySource ?: return
    val target = if (hasChrome) expandedChromeHeightPx.coerceAtLeast(0) else 0
    if (target == appliedScrollAwayPaddingPx) return

    // RN's unstable scroll-away primitive translates the content child by `target` and also adds
    // an equal bottom padding to the ScrollView so the translated content keeps a reachable scroll
    // range. With clipToPadding=true that bookkeeping padding becomes a permanently visible blank
    // strip at the bottom of an overlay-style screen. Keep the extra range, but let content draw
    // through the padding region so the bottom remains visually continuous.
    source.setScrollAwayTopPaddingEnabledUnstable(target)
    source.setPadding(
      originalPaddingLeft,
      originalPaddingTop,
      originalPaddingRight,
      originalPaddingBottom + target,
    )
    source.clipToPadding = false
    appliedScrollAwayPaddingPx = target

    if (BuildConfig.DEBUG) {
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "scrollAway view=${source.id} padding=$target hostExpanded=$expandedChromeHeightPx mode=$mode clipToPadding=${source.clipToPadding}",
      )
    }
  }

  private fun restoreScrollViewVisualState(source: ReactScrollView) {
    source.setPadding(
      originalPaddingLeft,
      originalPaddingTop,
      originalPaddingRight,
      originalPaddingBottom,
    )
    originalClipToPadding?.let { source.clipToPadding = it }
  }

  private fun clearScrollAwaySource() {
    val source = scrollAwaySource
    if (source != null) {
      if (appliedScrollAwayPaddingPx != 0) {
        source.setScrollAwayTopPaddingEnabledUnstable(0)
      }
      restoreScrollViewVisualState(source)
      if (BuildConfig.DEBUG && appliedScrollAwayPaddingPx != 0) {
        Log.d(NATIVE_SCROLL_LOG_TAG, "scrollAway view=${source.id} padding=0 detach")
      }
    }
    scrollAwaySource = null
    appliedScrollAwayPaddingPx = 0
    originalClipToPadding = null
    originalPaddingLeft = 0
    originalPaddingTop = 0
    originalPaddingRight = 0
    originalPaddingBottom = 0
  }

  private fun cancelSettle() {
    // Invalidate first so a canceled coroutine cannot perform a stale final reconciliation after
    // a newer drag/settle generation has already taken ownership.
    settleGeneration += 1
    settleJob?.cancel()
    settleJob = null
  }

  private companion object {
    const val ENDPOINT_EPSILON_PX = 0.75f
  }
}
