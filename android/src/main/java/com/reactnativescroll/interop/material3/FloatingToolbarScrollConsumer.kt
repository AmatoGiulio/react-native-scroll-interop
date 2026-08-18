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
        }
      }
      return
    }

    if (restoreBehaviorStateOnNextBind) {
      lastKnownBehaviorState?.let { retained ->
        newBehavior.state.offsetLimit = retained.offsetLimit
        newBehavior.state.offset = retained.offset
        newBehavior.state.contentOffset = retained.contentOffset
        if (BuildConfig.DEBUG) Log.d(
          NATIVE_SCROLL_LOG_TAG,
          "FLOAT_STATE_RESTORE offset=${retained.offset} limit=${retained.offsetLimit} content=${retained.contentOffset}",
        )
      }
      restoreBehaviorStateOnNextBind = false
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
      lastKnownBehaviorState = RetainedBehaviorState(
        offsetLimit = state.offsetLimit,
        offset = state.offset,
        contentOffset = state.contentOffset,
      )
    }
  }

  fun beginNestedTransaction(source: ViewGroup): Boolean {
    if (!isBound) return false
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

  private fun resetTranslation() { composeView.translationX = 0f; composeView.translationY = 0f }
}