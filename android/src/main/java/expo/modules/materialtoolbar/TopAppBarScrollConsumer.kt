@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package expo.modules.materialtoolbar

import android.util.Log
import android.view.ViewGroup
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.unit.Velocity
import com.reactnativescroll.interop.reactnative.ReactVerticalScrollSourceInterop
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
   * scrolling modes install.
   */
  Pinned,
  EnterAlways,
  ExitUntilCollapsed,
}

/**
 * Material3 TopAppBar consumer driven by the source's real nested-scroll transaction.
 *
 * Source typing is deliberately RN-version-neutral. RN 0.83 uses ReactScrollView while RN 0.87 can
 * use the Kotlin-internal ReactNestedScrollView; both are handled as ViewGroup sources. Reflection
 * is confined to the unstable RN scroll-away geometry primitive and is never used for scroll
 * physics or per-frame dispatch.
 */
internal class TopAppBarScrollConsumer {
  private var behavior: TopAppBarScrollBehavior? = null
  private var scope: CoroutineScope? = null
  private var mode: TopAppBarInteropMode? = null
  private var settleJob: Job? = null
  private var settleGeneration = 0L
  private var transactionActive = false

  private var expandedChromeHeightPx = 0
  private var scrollAwaySource: ViewGroup? = null
  private var appliedScrollAwayPaddingPx = 0
  private var originalClipToPadding: Boolean? = null
  private var originalPaddingLeft = 0
  private var originalPaddingTop = 0
  private var originalPaddingRight = 0
  private var originalPaddingBottom = 0

  val hasChrome: Boolean
    get() = mode != null

  private val isBound: Boolean
    get() = behavior != null && scope != null && mode != null

  /**
   * Material initializes TopAppBarState.heightOffsetLimit to -Float.MAX_VALUE and replaces it only
   * after the app bar has participated in a real layout. Feeding nested-scroll deltas to that
   * sentinel state makes the bar consume effectively unbounded distance. Fail closed until Compose
   * has resolved a finite Material range.
   */
  private val hasResolvedHeightOffsetLimit: Boolean
    get() {
      val limit = behavior?.state?.heightOffsetLimit ?: return false
      return limit.isFinite() && limit > -Float.MAX_VALUE
    }

  val isNestedDirectCapable: Boolean
    get() = isBound && hasResolvedHeightOffsetLimit

  fun prepareNestedSource(source: ViewGroup): Boolean {
    if (!hasChrome) return false
    val supported = ReactVerticalScrollSourceInterop.asSupported(source) ?: return false
    ensureScrollAwaySource(supported)
    return appliedScrollAwayPaddingPx > 0
  }

  fun beginNestedTransaction(source: ViewGroup): Boolean {
    transactionActive = false
    if (!isNestedDirectCapable) {
      if (BuildConfig.DEBUG && isBound) {
        val state = behavior?.state
        Log.d(
          NATIVE_SCROLL_LOG_TAG,
          "TX_TOP_BEGIN rejected=geometry-unresolved view=${source.id} " +
            "heightOffset=${state?.heightOffset} limit=${state?.heightOffsetLimit} " +
            "expanded=$expandedChromeHeightPx scrollAway=$appliedScrollAwayPaddingPx",
        )
      }
      return false
    }
    val supported = ReactVerticalScrollSourceInterop.asSupported(source) ?: return false
    cancelSettle()
    ensureScrollAwaySource(supported)
    transactionActive = true
    if (BuildConfig.DEBUG) {
      val state = behavior?.state
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "TX_TOP_BEGIN view=${supported.id} class=${supported.javaClass.name} y=${supported.scrollY} " +
          "heightOffset=${state?.heightOffset} limit=${state?.heightOffsetLimit} " +
          "collapse=${currentCollapseAmountPx()} scrollAway=$appliedScrollAwayPaddingPx",
      )
    }
    return true
  }

  fun nestedPreScroll(deltaY: Int, inputType: NativeNestedInputType): NativeNestedPreResult {
    val currentBehavior = behavior ?: return NativeNestedPreResult(0, 0)
    if (!transactionActive || !isNestedDirectCapable || deltaY == 0) return NativeNestedPreResult(0, 0)

    val state = currentBehavior.state
    val oldHeightOffset = state.heightOffset
    val returned = currentBehavior.nestedScrollConnection.onPreScroll(
      available = Offset(0f, -deltaY.toFloat()),
      source = inputType.toComposeNestedSource(),
    )
    val newHeightOffset = state.heightOffset

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
    if (!transactionActive || !isNestedDirectCapable) return NativeNestedPostResult(0, 0)

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

  fun endNestedTransaction(source: ViewGroup, reason: String) {
    if (!transactionActive) return
    transactionActive = false
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
        // Every fling frame already arrived as nested-scroll distance. Velocity here would decay a
        // second time; zero asks Material only for its terminal snap from the observed offset.
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
    transactionActive = false
    cancelSettle()
    behavior = newBehavior
    scope = newScope
    mode = newMode

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
    if (behavior !== expectedBehavior || mode != expectedMode) return
    bind(null, null, null)
  }

  fun updateExpandedChromeHeight(heightPx: Int): Boolean {
    if (heightPx <= 0) return false
    if (heightPx <= expandedChromeHeightPx) return false
    expandedChromeHeightPx = heightPx
    applyScrollAwayPadding()
    return true
  }

  fun resetExpandedChromeHeight() {
    expandedChromeHeightPx = 0
    applyScrollAwayPadding()
  }

  fun onHostDetached() {
    transactionActive = false
    cancelSettle()
    clearScrollAwaySource()
  }

  private fun applyChromeTranslation() {
    val source = scrollAwaySource ?: return
    val content = source.getChildAt(0) ?: return
    val resting = appliedScrollAwayPaddingPx.toFloat()
    val target = resting - currentCollapseAmountPx()
    if (content.translationY != target) content.translationY = target
  }

  private fun ensureScrollAwaySource(source: ViewGroup) {
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

  private fun captureScrollViewVisualState(source: ViewGroup) {
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

    // RN 0.87 exposes setScrollAwayPaddingEnabledUnstable(top, bottom); older ReactScrollView uses
    // setScrollAwayTopPaddingEnabledUnstable(top). The interop helper selects the available geometry
    // primitive without importing the internal RN 0.87 class.
    val applied = ReactVerticalScrollSourceInterop.setScrollAwayPadding(source, target, 0)
    if (!applied) {
      if (BuildConfig.DEBUG) {
        Log.d(
          NATIVE_SCROLL_LOG_TAG,
          "scrollAway unsupported class=${source.javaClass.name} view=${source.id} target=$target",
        )
      }
      return
    }

    // Keep RN's extra scroll range while preserving the screen's original padding values.
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
        "scrollAway view=${source.id} class=${source.javaClass.name} padding=$target " +
          "hostExpanded=$expandedChromeHeightPx mode=$mode clipToPadding=${source.clipToPadding}",
      )
    }
  }

  private fun restoreScrollViewVisualState(source: ViewGroup) {
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
        ReactVerticalScrollSourceInterop.setScrollAwayPadding(source, 0, 0)
      }
      restoreScrollViewVisualState(source)
      if (BuildConfig.DEBUG && appliedScrollAwayPaddingPx != 0) {
        Log.d(
          NATIVE_SCROLL_LOG_TAG,
          "scrollAway view=${source.id} class=${source.javaClass.name} padding=0 detach",
        )
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
    settleGeneration += 1
    settleJob?.cancel()
    settleJob = null
  }
}
