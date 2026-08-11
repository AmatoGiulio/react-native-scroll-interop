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
  EnterAlways,
  ExitUntilCollapsed,
}

/**
 * Material3 TopAppBar consumer. It receives normalized RN scroll frames from the same transport
 * contract used by FloatingToolbarScrollConsumer and forwards them into the real Material3
 * TopAppBarScrollBehavior nested-scroll connection.
 *
 * Owns the RN-specific visual bridge required for a full-screen overlay TopAppBar:
 * the active ReactScrollView receives React Native's native scroll-away top padding using the
 * measured expanded Compose host height. This keeps the first list item aligned with the real
 * Material app-bar geometry and makes the physical RN content move in lockstep with collapse /
 * expansion instead of relying on a duplicated JS padding constant.
 */
internal class TopAppBarScrollConsumer : NativeScrollConsumer {
  private var behavior: TopAppBarScrollBehavior? = null
  private var scope: CoroutineScope? = null
  private var mode: TopAppBarInteropMode? = null
  private var settleJob: Job? = null
  private var settleGeneration = 0L
  private var debugFrameCounter = 0
  private var lastInputDeltaY = 0

  // When a nested-scroll host is mounted on the same native scope, the transactional adapter owns
  // input. The sampled coordinator stays attached as
  // a fallback transport, but this consumer becomes invisible to it so the same gesture can never
  // reach Material twice.
  private var nestedTransportAvailable = false

  private var expandedChromeHeightPx = 0
  private var scrollAwaySource: ReactScrollView? = null
  private var appliedScrollAwayPaddingPx = 0
  private var originalClipToPadding: Boolean? = null
  private var originalPaddingLeft = 0
  private var originalPaddingTop = 0
  private var originalPaddingRight = 0
  private var originalPaddingBottom = 0

  private val isBound: Boolean
    get() = behavior != null && scope != null && mode != null

  /** True while the settle coroutine is still aligning the source's scroll-away padding. */
  override val isSettlingChrome: Boolean
    get() = settleJob?.isActive == true

  override val isEnabled: Boolean
    get() = isBound && !nestedTransportAvailable

  override val requiresTopBoundaryGesture: Boolean
    get() = isEnabled && mode == TopAppBarInteropMode.ExitUntilCollapsed

  /**
   * The direct transport is enabled only for exitUntilCollapsed. The other modes collapse without
   * needing the child's scroll withheld, so routing them through the transaction driver would add
   * its risks for no gain.
   */
  val isNestedDirectCapable: Boolean
    get() = nestedTransportAvailable && isBound && mode == TopAppBarInteropMode.ExitUntilCollapsed

  fun setNestedTransportAvailable(available: Boolean) {
    if (nestedTransportAvailable == available) return
    nestedTransportAvailable = available
    cancelSettle()
    if (!available) {
      // The explicit marker no longer owns the source. Drop marker-owned visual state so the
      // sampled fallback can acquire a fresh source on its next native scroll session.
      clearScrollAwaySource()
    }
    if (BuildConfig.DEBUG) {
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "TX_TOPBAR transportAvailable=$available bound=$isBound mode=$mode",
      )
    }
  }

  /** Prepare the RN scroll-away visual coordinate before the first gesture. */
  fun prepareNestedSource(source: ViewGroup): Boolean {
    if (!isNestedDirectCapable) return false
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

  fun canDriveFling(source: ReactScrollView, direction: Int): Boolean {
    if (!isNestedDirectCapable || direction == 0) return false
    val state = behavior?.state ?: return false
    return if (direction > 0) {
      state.heightOffset > state.heightOffsetLimit + ENDPOINT_EPSILON_PX ||
        source.canScrollVertically(1)
    } else {
      logicalChildY(source) > 0 || state.heightOffset < -ENDPOINT_EPSILON_PX
    }
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

    if (newBehavior == null || newScope == null || newMode == null) {
      clearScrollAwaySource()
    } else {
      applyScrollAwayPadding()
    }
  }

  fun unbind(expectedBehavior: TopAppBarScrollBehavior?) {
    if (behavior !== expectedBehavior) return
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

  fun onHostDetached() {
    cancelSettle()
    clearScrollAwaySource()
  }

  override fun onScrollSourceAvailable(source: ViewGroup) {
    if (!isEnabled) return
    val reactScrollView = source as? ReactScrollView ?: return
    ensureScrollAwaySource(reactScrollView)
  }

  override fun onScrollSourceUnavailable(source: ViewGroup) {
    if (nestedTransportAvailable) return
    if (scrollAwaySource === source) clearScrollAwaySource()
  }

  override fun onScrollSessionStart(source: ViewGroup) {
    cancelSettle()
    debugFrameCounter = 0
    lastInputDeltaY = 0
    onScrollSourceAvailable(source)
    if (BuildConfig.DEBUG) {
      val state = behavior?.state
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "TOPAPPBAR_BEGIN view=${source.id} scrollY=${source.scrollY} mode=$mode heightOffset=${state?.heightOffset} limit=${state?.heightOffsetLimit} scrollAway=$appliedScrollAwayPaddingPx",
      )
    }
  }

  override fun onScrollFrame(frame: NativeScrollFrame) {
    val currentBehavior = behavior ?: return
    if (frame.deltaY != 0) lastInputDeltaY = frame.deltaY
    val currentMode = mode ?: return
    val connection = currentBehavior.nestedScrollConnection

    if (frame.deltaY != 0) {
      val scroll = Offset(0f, -frame.deltaY.toFloat())
      when (currentMode) {
        TopAppBarInteropMode.EnterAlways -> {
          // enterAlways is a pre-scroll behavior: let Material3 mutate/consume its own height first,
          // then report only the logical remainder as child-consumed scroll.
          val preConsumed = connection.onPreScroll(
            available = scroll,
            source = NestedScrollSource.UserInput,
          )
          val childConsumed = Offset(
            x = scroll.x - preConsumed.x,
            y = scroll.y - preConsumed.y,
          )
          connection.onPostScroll(
            consumed = childConsumed,
            available = Offset.Zero,
            source = NestedScrollSource.UserInput,
          )
        }

        TopAppBarInteropMode.ExitUntilCollapsed -> {
          // RN has already advanced scrollY when this display frame is sampled. The scroll-away
          // content translation installed above makes those physical RN pixels represent the same
          // visual movement that a Compose Scaffold would produce while Material pre-scroll
          // collapses the app bar. The state replay still preserves Material3's pre/post phases.
          if (frame.deltaY > 0) {
            val preConsumed = connection.onPreScroll(
              available = scroll,
              source = NestedScrollSource.UserInput,
            )
            val childConsumed = Offset(
              x = scroll.x - preConsumed.x,
              y = scroll.y - preConsumed.y,
            )
            connection.onPostScroll(
              consumed = childConsumed,
              available = Offset.Zero,
              source = NestedScrollSource.UserInput,
            )
          } else {
            val downwardDistance = -frame.deltaY.toFloat()
            val collapseRange = (-currentBehavior.state.heightOffsetLimit).coerceAtLeast(0f)
            val previousScrollY = (frame.scrollY - frame.deltaY).toFloat()
            val currentScrollY = frame.scrollY.toFloat()
            val previousLogicalChildY = (previousScrollY - collapseRange).coerceAtLeast(0f)
            val currentLogicalChildY = (currentScrollY - collapseRange).coerceAtLeast(0f)
            val childConsumedDistance =
              (previousLogicalChildY - currentLogicalChildY).coerceIn(0f, downwardDistance)
            val postAvailableDistance =
              (downwardDistance - childConsumedDistance).coerceAtLeast(0f)

            connection.onPostScroll(
              consumed = Offset(0f, childConsumedDistance),
              available = Offset(0f, postAvailableDistance),
              source = NestedScrollSource.UserInput,
            )
          }

          // Material's contentOffset describes the logical child scroll after the app-bar collapse
          // range has been consumed. RN scrollY includes that scroll-away range by design.
          val collapseRange = (-currentBehavior.state.heightOffsetLimit).coerceAtLeast(0f)
          val logicalChildY = (frame.scrollY.toFloat() - collapseRange).coerceAtLeast(0f)
          currentBehavior.state.contentOffset = -logicalChildY

          // RN is sampled after it has physically scrolled, while Material clamps its own state
          // synchronously. Near an exact endpoint, the last sampled RN pixels can therefore lag
          // the Material endpoint by one display frame. Reassert the shared physical invariant at
          // the endpoint so that sub-frame skew never becomes a visible list/header gap.
          reconcileScrollViewAtMaterialEndpoint(
            source = scrollAwaySource,
            sampledScrollY = frame.scrollY,
            behavior = currentBehavior,
          )
        }
      }
    }

    if (currentMode == TopAppBarInteropMode.ExitUntilCollapsed && frame.postAvailableY > 0f) {
      // Genuine drag distance beyond physical y=0 remains a fallback post-scroll available channel.
      connection.onPostScroll(
        consumed = Offset.Zero,
        available = Offset(0f, frame.postAvailableY),
        source = NestedScrollSource.UserInput,
      )
    }

    if (BuildConfig.DEBUG) {
      debugFrameCounter += 1
      if (debugFrameCounter % 8 == 1) {
        val state = currentBehavior.state
        Log.d(
          NATIVE_SCROLL_LOG_TAG,
          "topappbar mode=$currentMode dy=${frame.deltaY} scrollY=${frame.scrollY} rawY=${frame.rawScrollY} postAvailableY=${frame.postAvailableY} heightOffset=${state.heightOffset} limit=${state.heightOffsetLimit} contentOffset=${state.contentOffset} scrollAway=$appliedScrollAwayPaddingPx",
        )
      }
    }
  }

  override fun onScrollSessionEnd() {
    if (nestedTransportAvailable) return
    val currentBehavior = behavior ?: return
    val currentScope = scope ?: return
    val currentMode = mode ?: return
    val source = scrollAwaySource
    cancelSettle()

    // Use the full collapse range as the stable coordinate split, exactly like onScrollFrame.
    // Deriving logical child scroll from the instantaneous animated heightOffset can turn a
    // one-frame sampling skew into permanent drift (for example expanded app bar + scrollY=3).
    val settleLogicalChildY = if (
      currentMode == TopAppBarInteropMode.ExitUntilCollapsed && source != null
    ) {
      val collapseRange = (-currentBehavior.state.heightOffsetLimit).coerceAtLeast(0f)
      (source.scrollY.toFloat() - collapseRange).coerceAtLeast(0f)
    } else {
      0f
    }

    val generation = ++settleGeneration
    if (BuildConfig.DEBUG) {
      val state = currentBehavior.state
      val fraction = if (state.heightOffsetLimit != 0f) state.heightOffset / state.heightOffsetLimit else 0f
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "TOP_SETTLE_START gen=$generation mode=$currentMode lastDy=$lastInputDeltaY heightOffset=${state.heightOffset} limit=${state.heightOffsetLimit} fraction=$fraction contentOffset=${state.contentOffset} sourceY=${source?.scrollY}",
      )
    }
    settleJob = currentScope.launch(start = CoroutineStart.UNDISPATCHED) {
      var completedNormally = false
      val syncJob = if (
        currentMode == TopAppBarInteropMode.ExitUntilCollapsed && source != null
      ) {
        launch(start = CoroutineStart.UNDISPATCHED) {
          snapshotFlow { currentBehavior.state.heightOffset }.collect { heightOffset ->
            if (generation == settleGeneration) {
              syncScrollViewToMaterialSettle(
                source = source,
                logicalChildY = settleLogicalChildY,
                heightOffset = heightOffset,
                behavior = currentBehavior,
              )
            }
          }
        }
      } else {
        null
      }

      try {
        currentBehavior.nestedScrollConnection.onPostFling(
          consumed = Velocity.Zero,
          available = Velocity.Zero,
        )
        completedNormally = true
      } finally {
        syncJob?.cancel()

        // A new drag cancels the previous Material settle. The canceled settle must not run a stale
        // final scrollTo after the new gesture has taken ownership of the same ScrollView.
        if (
          completedNormally &&
            generation == settleGeneration &&
            currentMode == TopAppBarInteropMode.ExitUntilCollapsed &&
            source != null
        ) {
          syncScrollViewToMaterialSettle(
            source = source,
            logicalChildY = settleLogicalChildY,
            heightOffset = currentBehavior.state.heightOffset,
            behavior = currentBehavior,
          )
          reconcileScrollViewAtMaterialEndpoint(
            source = source,
            sampledScrollY = source.scrollY,
            behavior = currentBehavior,
          )
        }

        if (BuildConfig.DEBUG) {
          val state = currentBehavior.state
          val fraction = if (state.heightOffsetLimit != 0f) state.heightOffset / state.heightOffsetLimit else 0f
          Log.d(
            NATIVE_SCROLL_LOG_TAG,
            "TOP_SETTLE_END gen=$generation completed=$completedNormally currentGen=$settleGeneration heightOffset=${state.heightOffset} limit=${state.heightOffsetLimit} fraction=$fraction contentOffset=${state.contentOffset} sourceY=${source?.scrollY}",
          )
        }
        if (generation == settleGeneration) {
          settleJob = null
        }
      }
    }
  }

  private fun reconcileScrollViewAtMaterialEndpoint(
    source: ReactScrollView?,
    sampledScrollY: Int,
    behavior: TopAppBarScrollBehavior,
  ) {
    source ?: return
    if (!source.isAttachedToWindow) return

    val state = behavior.state
    val collapseRange = (-state.heightOffsetLimit).coerceAtLeast(0f)
    if (collapseRange <= 0f) return

    val endpointCollapseAmount = when {
      kotlin.math.abs(state.heightOffset) <= ENDPOINT_EPSILON_PX -> 0f
      kotlin.math.abs(state.heightOffset - state.heightOffsetLimit) <= ENDPOINT_EPSILON_PX ->
        collapseRange
      else -> return
    }
    val logicalChildY = (sampledScrollY.toFloat() - collapseRange).coerceAtLeast(0f)
    val targetScrollY = (logicalChildY + endpointCollapseAmount).roundToInt().coerceAtLeast(0)

    if (source.scrollY != targetScrollY) {
      source.scrollToPreservingMomentum(source.scrollX, targetScrollY)
      if (BuildConfig.DEBUG) {
        Log.d(
          NATIVE_SCROLL_LOG_TAG,
          "topappbar endpointSync view=${source.id} fromY=$sampledScrollY targetY=$targetScrollY logicalY=$logicalChildY heightOffset=${state.heightOffset} limit=${state.heightOffsetLimit}",
        )
      }
    }
    state.contentOffset = -logicalChildY
  }

  private fun syncScrollViewToMaterialSettle(
    source: ReactScrollView,
    logicalChildY: Float,
    heightOffset: Float,
    behavior: TopAppBarScrollBehavior,
  ) {
    if (!source.isAttachedToWindow) return
    val collapseAmount = (-heightOffset).coerceAtLeast(0f)
    val targetScrollY = (logicalChildY + collapseAmount).roundToInt().coerceAtLeast(0)
    if (source.scrollY != targetScrollY) {
      source.scrollToPreservingMomentum(source.scrollX, targetScrollY)
    }
    behavior.state.contentOffset = -logicalChildY

    if (BuildConfig.DEBUG) {
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "topappbar settleSync view=${source.id} targetY=$targetScrollY logicalY=$logicalChildY heightOffset=$heightOffset",
      )
    }
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
    val target = if (isBound) expandedChromeHeightPx.coerceAtLeast(0) else 0
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
