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
 * Alpha.24 owns the RN-specific visual bridge required for a full-screen overlay TopAppBar:
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

  private var expandedChromeHeightPx = 0
  private var scrollAwaySource: ReactScrollView? = null
  private var appliedScrollAwayPaddingPx = 0
  private var originalClipToPadding: Boolean? = null
  private var originalPaddingLeft = 0
  private var originalPaddingTop = 0
  private var originalPaddingRight = 0
  private var originalPaddingBottom = 0

  override val isEnabled: Boolean
    get() = behavior != null && scope != null && mode != null

  override val requiresTopBoundaryGesture: Boolean
    get() = mode == TopAppBarInteropMode.ExitUntilCollapsed

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
    if (scrollAwaySource !== reactScrollView) {
      clearScrollAwaySource()
      scrollAwaySource = reactScrollView
      captureScrollViewVisualState(reactScrollView)
    }
    applyScrollAwayPadding()
  }

  override fun onScrollSourceUnavailable(source: ViewGroup) {
    if (scrollAwaySource === source) clearScrollAwaySource()
  }

  override fun onScrollSessionStart(source: ViewGroup) {
    cancelSettle()
    debugFrameCounter = 0
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
    settleJob = currentScope.launch {
      var completedNormally = false
      val syncJob = if (
        currentMode == TopAppBarInteropMode.ExitUntilCollapsed && source != null
      ) {
        launch {
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
      source.scrollTo(source.scrollX, targetScrollY)
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
      source.scrollTo(source.scrollX, targetScrollY)
    }
    behavior.state.contentOffset = -logicalChildY

    if (BuildConfig.DEBUG) {
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "topappbar settleSync view=${source.id} targetY=$targetScrollY logicalY=$logicalChildY heightOffset=$heightOffset",
      )
    }
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
    val target = if (isEnabled) expandedChromeHeightPx.coerceAtLeast(0) else 0
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
