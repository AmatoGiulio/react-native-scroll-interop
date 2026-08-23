@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.reactnativescroll.interop.material3

import android.util.Log
import android.view.ViewGroup
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.unit.Velocity
import com.reactnativescroll.interop.BuildConfig
import com.reactnativescroll.interop.NATIVE_SCROLL_LOG_TAG
import com.reactnativescroll.interop.reactnative.ReactVerticalScrollSourceInterop
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

internal enum class TopAppBarInteropMode {
  /**
   * A visible app bar with no Material scroll state. It still owns scroll-away geometry because the
   * overlay occupies the top of the screen, but it does not observe content overlap.
   */
  Fixed,

  /** A stationary Material app bar whose state tracks content overlap. */
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
internal class TopAppBarScrollConsumer(
  private val onChromeGeometryInvalidated: () -> Unit = {},
) {
  private data class RetainedBehaviorState(
    val heightOffsetLimit: Float,
    val heightOffset: Float,
    val contentOffset: Float,
  )

  private var behavior: TopAppBarScrollBehavior? = null
  private var scope: CoroutineScope? = null
  private var mode: TopAppBarInteropMode? = null
  private var settleJob: Job? = null
  private var settleGeneration = 0L
  private var transactionActive = false
  private var lastKnownBehaviorState: RetainedBehaviorState? = null
  private var restoreBehaviorStateOnNextBind = false

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
    rememberBehaviorState(currentBehavior)
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
    rememberBehaviorState(currentBehavior)
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
        currentBehavior.nestedScrollConnection.onPostFling(
          consumed = Velocity.Zero,
          available = Velocity.Zero,
        )
        completedNormally = true
      } finally {
        syncJob.cancel()
        rememberBehaviorState(currentBehavior)
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
    if (behavior === newBehavior && scope === newScope && mode == newMode) {
      if (newMode == null && scrollAwaySource != null) clearScrollAwaySource()
      return
    }
    transactionActive = false
    cancelSettle()
    behavior = newBehavior
    scope = newScope
    mode = newMode

    if (newBehavior != null && restoreBehaviorStateOnNextBind) {
      lastKnownBehaviorState?.let { retained ->
        restoreRetainedBehaviorState(newBehavior, retained)
        if (BuildConfig.DEBUG) {
          Log.d(
            NATIVE_SCROLL_LOG_TAG,
            "TOP_STATE_RESTORE offset=${retained.heightOffset} " +
              "limit=${retained.heightOffsetLimit} content=${retained.contentOffset}",
          )
        }
      }
      restoreBehaviorStateOnNextBind = false
    }

    if (newMode == null) clearScrollAwaySource() else {
      applyScrollAwayPadding()
      applyChromeTranslation()
    }
  }

  fun unbind(expectedBehavior: TopAppBarScrollBehavior?, expectedMode: TopAppBarInteropMode?) {
    if (behavior !== expectedBehavior || mode != expectedMode) return
    transactionActive = false
    cancelSettle()
    behavior = null
    scope = null
    mode = null
  }

  fun updateExpandedChromeHeight(heightPx: Int): Boolean {
    if (heightPx <= 0 || heightPx <= expandedChromeHeightPx) return false
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
    rememberBehaviorState(behavior)
    restoreBehaviorStateOnNextBind = lastKnownBehaviorState != null
    if (BuildConfig.DEBUG) {
      val retained = lastKnownBehaviorState
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "TOP_STATE_RETAIN armed=$restoreBehaviorStateOnNextBind " +
          "offset=${retained?.heightOffset} limit=${retained?.heightOffsetLimit} " +
          "content=${retained?.contentOffset}",
      )
    }
    cancelSettle()
    // react-native-screens detaches the outgoing chrome while its screen layer is still visible.
    // Keep the source's scroll-away geometry intact so the transition cannot expose an unshifted
    // content frame. The screen and its consumer retain this state together when kept for back.
  }

  private fun rememberBehaviorState(current: TopAppBarScrollBehavior?) {
    current?.state?.let { state ->
      lastKnownBehaviorState = RetainedBehaviorState(
        heightOffsetLimit = state.heightOffsetLimit,
        heightOffset = state.heightOffset,
        contentOffset = state.contentOffset,
      )
    }
  }

  private fun restoreRetainedBehaviorState(
    current: TopAppBarScrollBehavior,
    retained: RetainedBehaviorState,
  ) {
    val resolvedLimit = current.state.heightOffsetLimit
      .takeIf { it.isFinite() && it > -Float.MAX_VALUE }
      ?: retained.heightOffsetLimit
    val wasFullyCollapsed =
      retained.heightOffsetLimit.isFinite() && retained.heightOffsetLimit < 0f &&
        abs(retained.heightOffset - retained.heightOffsetLimit) <= 1f

    current.state.heightOffsetLimit = resolvedLimit
    current.state.heightOffset = if (resolvedLimit.isFinite() && resolvedLimit < 0f) {
      if (wasFullyCollapsed) resolvedLimit else retained.heightOffset.coerceIn(resolvedLimit, 0f)
    } else {
      retained.heightOffset
    }
    current.state.contentOffset = retained.contentOffset
    rememberBehaviorState(current)
  }

  private fun applyChromeTranslation() {
    val source = scrollAwaySource ?: return
    val content = source.getChildAt(0) ?: return
    val resting = appliedScrollAwayPaddingPx.toFloat()
    val target = resting - currentCollapseAmountPx()
    if (content.translationY == target) return

    content.translationY = target
    // Compose owns the Material state, but the ComposeView is hosted inside a fixed-size RN view.
    // That host is outside a normal Android measure traversal, so a state-driven height change must
    // explicitly enqueue its host geometry from the native scroll transaction. The UI layer
    // supplies a frame-coalesced scheduler; this consumer remains independent of any concrete View.
    onChromeGeometryInvalidated()
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
    return if (availableY > 0) rounded.coerceIn(0, availableY) else rounded.coerceIn(availableY, 0)
  }

  private fun clampSignedMovement(availableY: Int, movementAndroidY: Float): Int {
    if (availableY == 0) return 0
    val rounded = movementAndroidY.roundToInt()
    return if (availableY > 0) rounded.coerceIn(0, availableY) else rounded.coerceIn(availableY, 0)
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
    resetScrollAwaySourceState()
  }

  private fun resetScrollAwaySourceState() {
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
