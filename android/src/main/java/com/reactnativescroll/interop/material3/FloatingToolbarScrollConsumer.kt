@file:OptIn(androidx.compose.material3.ExperimentalMaterial3ExpressiveApi::class)

package com.reactnativescroll.interop.material3

import android.util.Log
import android.view.View
import android.view.ViewGroup
import androidx.compose.material3.FloatingToolbarExitDirection
import androidx.compose.material3.FloatingToolbarScrollBehavior
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.unit.Velocity
import androidx.core.graphics.Insets
import expo.modules.materialtoolbar.BuildConfig
import expo.modules.materialtoolbar.NATIVE_SCROLL_LOG_TAG
import java.util.WeakHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlin.math.abs

internal open class FloatingToolbarScrollConsumer(
  private val hostView: ViewGroup,
  private val composeView: ComposeView,
  private val visibleFrameInsets: () -> Insets = { Insets.NONE },
  private val placementInsets: () -> Insets? = { null },
) {
  private data class RetainedBehaviorState(
    val offsetLimit: Float,
    val offset: Float,
    val contentOffset: Float,
  )

  private var behavior: FloatingToolbarScrollBehavior? = null
  private var scope: CoroutineScope? = null
  private var settleJob: Job? = null
  private var settleGeneration = 0L
  private var offsetObserverJob: Job? = null
  private var debugFrameCounter = 0
  private var lastInputDeltaY = 0
  private var lastKnownBehaviorState: RetainedBehaviorState? = null
  private var restoreBehaviorStateOnNextBind = false
  private var geometryResyncPosted = false

  // The toolbar View intentionally persists across navigation screens, but scroll-derived Material
  // state must not. Keep that state scoped to the concrete RN source that produced the transaction.
  // Weak keys avoid extending the lifetime of screens/sources after navigation removes them.
  private val sourceStates = WeakHashMap<ViewGroup, RetainedBehaviorState>()
  private var preparedSource: ViewGroup? = null

  val isBound: Boolean get() = behavior != null && scope != null

  fun bind(newBehavior: FloatingToolbarScrollBehavior?, newScope: CoroutineScope?) {
    if (behavior === newBehavior && scope === newScope) return
    cancelSettle()
    offsetObserverJob?.cancel()
    behavior = newBehavior
    scope = newScope
    if (newBehavior == null || newScope == null) {
      offsetObserverJob = null
      resetTranslation()
      hostView.post {
        if (
          hostView.isAttachedToWindow &&
          composeView.isAttachedToWindow &&
          behavior == null &&
          !restoreBehaviorStateOnNextBind
        ) {
          lastKnownBehaviorState = null
          sourceStates.clear()
          preparedSource = null
        }
      }
      return
    }

    if (restoreBehaviorStateOnNextBind) {
      lastKnownBehaviorState?.let { retained ->
        restoreRetainedBehaviorState(newBehavior, retained)
        if (BuildConfig.DEBUG) Log.d(
          NATIVE_SCROLL_LOG_TAG,
          "FLOAT_STATE_RESTORE offset=${retained.offset} limit=${retained.offsetLimit} content=${retained.contentOffset}",
        )
      }
      restoreBehaviorStateOnNextBind = false
    } else {
      preparedSource?.let { source ->
        sourceStates[source]?.let { retained ->
          restoreRetainedBehaviorState(newBehavior, retained)
        }
      }
    }

    offsetObserverJob = newScope.launch {
      snapshotFlow {
        RetainedBehaviorState(
          offsetLimit = newBehavior.state.offsetLimit,
          offset = newBehavior.state.offset,
          contentOffset = newBehavior.state.contentOffset,
        )
      }.collect { retained ->
        lastKnownBehaviorState = retained
        preparedSource?.let { sourceStates[it] = retained }
        applyOffset(retained.offset)
      }
    }
    hostView.post {
      syncGeometry()
      rememberBehaviorState(newBehavior)
      applyOffset(newBehavior.state.offset)
    }
  }

  fun unbind(expectedBehavior: FloatingToolbarScrollBehavior?) {
    if (behavior === expectedBehavior) bind(null, null)
  }

  fun onHostDetached() {
    rememberBehaviorState(behavior)
    restoreBehaviorStateOnNextBind = lastKnownBehaviorState != null
    if (BuildConfig.DEBUG) {
      val retained = lastKnownBehaviorState
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "FLOAT_STATE_RETAIN armed=$restoreBehaviorStateOnNextBind offset=${retained?.offset} limit=${retained?.offsetLimit} content=${retained?.contentOffset}",
      )
    }
    cancelSettle()
  }

  private fun rememberBehaviorState(current: FloatingToolbarScrollBehavior?) {
    current?.state?.let { state ->
      val retained = RetainedBehaviorState(
        offsetLimit = state.offsetLimit,
        offset = state.offset,
        contentOffset = state.contentOffset,
      )
      lastKnownBehaviorState = retained
      preparedSource?.let { sourceStates[it] = retained }
    }
  }

  /**
   * Select the screen/source whose scroll-derived FloatingToolbar state should be visible.
   *
   * This is navigation/source lifecycle only. No source position is sampled and no source motion is
   * reconstructed. A source seen for the first time starts from the Material shown baseline; a
   * returning source restores the toolbar state that source previously produced.
   */
  fun prepareNestedSource(source: ViewGroup): Boolean {
    if (preparedSource === source) {
      if (isBound) {
        syncGeometry()
        applyCurrentOffset()
      }
      return isBound
    }

    val previous = preparedSource
    rememberBehaviorState(behavior)
    cancelSettle()
    preparedSource = source

    val current = behavior
    if (current == null || scope == null) {
      if (BuildConfig.DEBUG) Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "FLOAT_SOURCE_SWITCH previous=${sourceIdentity(previous)} next=${sourceIdentity(source)} bound=false",
      )
      return false
    }

    syncGeometryNow()
    val retained = sourceStates[source]
    if (retained != null) {
      restoreRetainedBehaviorState(current, retained)
    } else {
      // New navigation source: the persistent toolbar View is reused, but its scroll-derived state
      // must not leak from the previous screen.
      current.state.offset = 0f
      current.state.contentOffset = 0f
    }
    rememberBehaviorState(current)
    applyOffset(current.state.offset)
    scheduleGeometryResync()

    if (BuildConfig.DEBUG) Log.d(
      NATIVE_SCROLL_LOG_TAG,
      "FLOAT_SOURCE_SWITCH previous=${sourceIdentity(previous)} next=${sourceIdentity(source)} " +
        "restored=${retained != null} offset=${current.state.offset} limit=${current.state.offsetLimit} " +
        "content=${current.state.contentOffset}",
    )
    return true
  }

  private fun restoreRetainedBehaviorState(
    current: FloatingToolbarScrollBehavior,
    retained: RetainedBehaviorState,
  ) {
    val resolvedLimit = current.state.offsetLimit.takeIf { it.isFinite() && it < 0f }
      ?: retained.offsetLimit
    val wasFullyCollapsed =
      retained.offsetLimit.isFinite() &&
        retained.offsetLimit < 0f &&
        abs(retained.offset - retained.offsetLimit) <= 1f

    current.state.offsetLimit = resolvedLimit
    current.state.offset = if (resolvedLimit.isFinite() && resolvedLimit < 0f) {
      if (wasFullyCollapsed) resolvedLimit else retained.offset.coerceIn(resolvedLimit, 0f)
    } else {
      retained.offset
    }
    current.state.contentOffset = retained.contentOffset
  }

  fun beginNestedTransaction(source: ViewGroup): Boolean {
    if (!isBound || preparedSource !== source) {
      if (BuildConfig.DEBUG) Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "FLOAT_TX_BEGIN rejected=inactive-source source=${sourceIdentity(source)} " +
          "prepared=${sourceIdentity(preparedSource)} bound=$isBound",
      )
      return false
    }
    cancelSettle()
    debugFrameCounter = 0
    lastInputDeltaY = 0
    syncGeometry()
    val current = behavior?.state?.offset ?: 0f
    applyOffset(current)
    if (BuildConfig.DEBUG) Log.d(
      NATIVE_SCROLL_LOG_TAG,
      "FLOAT_TX_BEGIN view=${source.id} scrollY=${source.scrollY} compose=${composeView.measuredWidth}x${composeView.measuredHeight} offset=$current limit=${behavior?.state?.offsetLimit}",
    )
    return true
  }

  fun nestedPostScroll(childConsumedY: Int, inputType: NativeNestedInputType) {
    if (childConsumedY == 0) return
    val current = behavior ?: return
    lastInputDeltaY = childConsumedY
    current.onPostScroll(
      consumed = Offset(0f, -childConsumedY.toFloat()),
      available = Offset.Zero,
      source = if (inputType == NativeNestedInputType.Touch) {
        NestedScrollSource.UserInput
      } else {
        NestedScrollSource.SideEffect
      },
    )
    rememberBehaviorState(current)
    applyOffset(current.state.offset)
    if (BuildConfig.DEBUG && ++debugFrameCounter % 8 == 1) Log.d(
      NATIVE_SCROLL_LOG_TAG,
      "material dy=$childConsumedY type=$inputType offset=${current.state.offset} limit=${current.state.offsetLimit} tx=${composeView.translationX} ty=${composeView.translationY}",
    )
  }

  fun endNestedTransaction() {
    val current = behavior ?: return
    val currentScope = scope ?: return
    cancelSettle()
    val generation = settleGeneration
    if (BuildConfig.DEBUG) Log.d(
      NATIVE_SCROLL_LOG_TAG,
      "FLOAT_SETTLE_START gen=$generation lastDy=$lastInputDeltaY offset=${current.state.offset} limit=${current.state.offsetLimit}",
    )
    settleJob = currentScope.launch(start = CoroutineStart.UNDISPATCHED) {
      var completed = false
      try {
        current.onPostFling(Velocity.Zero, Velocity.Zero)
        completed = true
        rememberBehaviorState(current)
        applyOffset(current.state.offset)
      } finally {
        if (BuildConfig.DEBUG) Log.d(
          NATIVE_SCROLL_LOG_TAG,
          "FLOAT_SETTLE_END gen=$generation completed=$completed currentGen=$settleGeneration offset=${current.state.offset} limit=${current.state.offsetLimit}",
        )
        if (generation == settleGeneration) settleJob = null
      }
    }
  }

  fun syncGeometry() {
    syncGeometryNow()
    scheduleGeometryResync()
  }

  private fun scheduleGeometryResync() {
    if (geometryResyncPosted || !hostView.isAttachedToWindow) return
    geometryResyncPosted = true
    hostView.post {
      geometryResyncPosted = false
      if (!hostView.isAttachedToWindow || !composeView.isAttachedToWindow || behavior == null) return@post
      syncGeometryNow()
      applyCurrentOffset()
    }
  }

  private fun syncGeometryNow() {
    val current = behavior ?: return
    if (hostView.width <= 0 || hostView.height <= 0 || composeView.width <= 0 || composeView.height <= 0) return
    val insets = placementInsets() ?: visibleFrameInsets()
    val left = insets.left
    val top = insets.top
    val right = hostView.width - insets.right
    val bottom = hostView.height - insets.bottom
    val rtl = hostView.layoutDirection == View.LAYOUT_DIRECTION_RTL
    val distance = when (current.exitDirection) {
      FloatingToolbarExitDirection.Top -> composeView.bottom - top
      FloatingToolbarExitDirection.Bottom -> bottom - composeView.top
      FloatingToolbarExitDirection.Start -> if (rtl) right - composeView.left else composeView.right - left
      FloatingToolbarExitDirection.End -> if (rtl) composeView.right - left else right - composeView.left
      else -> composeView.height
    }.coerceAtLeast(1).toFloat()
    val previousLimit = current.state.offsetLimit
    val previousOffset = current.state.offset
    val wasFullyCollapsed =
      previousLimit < 0f && previousLimit.isFinite() && abs(previousOffset - previousLimit) <= 1f
    current.state.offsetLimit = -distance
    current.state.offset = if (wasFullyCollapsed) current.state.offsetLimit else previousOffset
    rememberBehaviorState(current)
    if (BuildConfig.DEBUG) Log.d(
      NATIVE_SCROLL_LOG_TAG,
      "geometry dir=${current.exitDirection} host=${hostView.width}x${hostView.height} visible=$left,$top-$right,$bottom compose=${composeView.width}x${composeView.height} pos=${composeView.left},${composeView.top}-${composeView.right},${composeView.bottom} limit=${current.state.offsetLimit}",
    )
  }

  fun applyCurrentOffset() = applyOffset(behavior?.state?.offset ?: 0f)

  private fun applyOffset(offset: Float) {
    val current = behavior ?: return resetTranslation()
    val rtl = hostView.layoutDirection == View.LAYOUT_DIRECTION_RTL
    when (current.exitDirection) {
      FloatingToolbarExitDirection.Top -> { composeView.translationX = 0f; composeView.translationY = offset }
      FloatingToolbarExitDirection.Bottom -> { composeView.translationX = 0f; composeView.translationY = -offset }
      FloatingToolbarExitDirection.Start -> { composeView.translationY = 0f; composeView.translationX = if (rtl) -offset else offset }
      FloatingToolbarExitDirection.End -> { composeView.translationY = 0f; composeView.translationX = if (rtl) offset else -offset }
      else -> { composeView.translationX = 0f; composeView.translationY = -offset }
    }
  }

  private fun cancelSettle() {
    settleGeneration += 1
    settleJob?.cancel()
    settleJob = null
  }

  private fun sourceIdentity(source: ViewGroup?): String =
    if (source == null) "none"
    else "${source.javaClass.name}#${source.id}@${Integer.toHexString(System.identityHashCode(source))}"

  private fun resetTranslation() { composeView.translationX = 0f; composeView.translationY = 0f }
}
