@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package expo.modules.materialtoolbar

import android.util.Log
import android.view.ViewGroup
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
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

    val state = currentBehavior.state
    val oldHeightOffset = state.heightOffset
    val composeSource = inputType.toComposeNestedSource()
    val returned = currentBehavior.nestedScrollConnection.onPreScroll(
      available = Offset(0f, -deltaY.toFloat()),
      source = composeSource,
    )
    val newHeightOffset = state.heightOffset

    // Material3 may report the whole available delta as pre-consumed even when the heightOffset
    // setter clamps at its limit. Only what the app bar's height actually moved may be withheld
    // from the list: anything else would be distance deleted from the gesture.
    val chromeMovementY = clampSignedMovement(deltaY, oldHeightOffset - newHeightOffset)
    val reportedConsumedY =
      clampSignedConsumption(deltaY, -returned.y).let { reported ->
        if (kotlin.math.abs(chromeMovementY) < kotlin.math.abs(reported)) chromeMovementY else reported
      }
    applyChromeTranslation()
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

    val chromeMovementY = (oldHeightOffset - newHeightOffset).roundToInt()
    val availableConsumedY = clampSignedConsumption(availableY, -returned.y)
    applyChromeTranslation()
    return NativeNestedPostResult(availableConsumedY, chromeMovementY)
  }

  fun currentCollapseAmountPx(): Float =
    behavior?.state?.heightOffset?.let { (-it).coerceAtLeast(0f) } ?: 0f

  /**
   * Finish the transaction with Material3's own snap engine.
   *
   * Nothing here touches the list's scroll position. The snap moves the app bar's height, and the
   * content follows it through [applyChromeTranslation] — a view transform, not a scroll. That is
   * what keeps `scrollY` meaning only "where React Native scrolled to".
   */
  fun endNestedTransaction(source: ReactScrollView, reason: String) {
    val currentBehavior = behavior ?: return
    val currentScope = scope ?: return
    if (!isNestedDirectCapable || !source.isAttachedToWindow) return
    cancelSettle()

    val generation = ++settleGeneration
    if (BuildConfig.DEBUG) {
      val state = currentBehavior.state
      val fraction = if (state.heightOffsetLimit != 0f) state.heightOffset / state.heightOffsetLimit else 0f
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "TX_TOP_SETTLE_START gen=$generation reason=$reason sourceY=${source.scrollY} " +
          "heightOffset=${state.heightOffset} limit=${state.heightOffsetLimit} fraction=$fraction",
      )
    }

    settleJob = currentScope.launch(start = CoroutineStart.UNDISPATCHED) {
      var completedNormally = false
      val syncJob = launch(start = CoroutineStart.UNDISPATCHED) {
        snapshotFlow { currentBehavior.state.heightOffset }.collect {
          if (generation == settleGeneration) applyChromeTranslation()
        }
      }

      try {
        // Zero velocity, deliberately: every frame of the fling already reached Material as a
        // scroll delta, so handing it the velocity too would decay a second time over movement
        // already applied. This asks only for the terminal snap.
        currentBehavior.nestedScrollConnection.onPostFling(
          consumed = Velocity.Zero,
          available = Velocity.Zero,
        )
        completedNormally = true
      } finally {
        syncJob.cancel()
        if (generation == settleGeneration) applyChromeTranslation()
        if (BuildConfig.DEBUG) {
          val state = currentBehavior.state
          val fraction = if (state.heightOffsetLimit != 0f) state.heightOffset / state.heightOffsetLimit else 0f
          Log.d(
            NATIVE_SCROLL_LOG_TAG,
            "TX_TOP_SETTLE_END gen=$generation completed=$completedNormally currentGen=$settleGeneration " +
              "sourceY=${source.scrollY} heightOffset=${state.heightOffset} " +
              "limit=${state.heightOffsetLimit} fraction=$fraction",
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

  /**
   * Make the content follow the app bar's height, without scrolling it.
   *
   * React Native's scroll-away padding translates the content down by the *expanded* bar height and
   * gives the list an equal bottom padding, once. Collapsing then means translating that same
   * content back up by however much Material shrank the bar: a transform on a view, costing no
   * layout, no Fabric state update, and above all no change to `scrollY` — which stays exactly
   * where React Native put it.
   */
  private fun applyChromeTranslation() {
    val source = scrollAwaySource ?: return
    val content = source.getChildAt(0) ?: return
    val resting = appliedScrollAwayPaddingPx.toFloat()
    val target = resting - currentCollapseAmountPx()
    if (content.translationY != target) content.translationY = target
  }

  private fun ensureScrollAwaySource(source: ReactScrollView) {
    if (scrollAwaySource !== source) {
      clearScrollAwaySource()
      scrollAwaySource = source
      captureScrollViewVisualState(source)
    }
    applyScrollAwayPadding()
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
    // Invalidate first so a canceled coroutine cannot perform stale final geometry work after a
    // newer drag/settle generation has already taken ownership.
    settleGeneration += 1
    settleJob?.cancel()
    settleJob = null
  }
}
