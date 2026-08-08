@file:OptIn(androidx.compose.material3.ExperimentalMaterial3ExpressiveApi::class)

package com.materialtoolbar.consumers

import android.view.View
import android.view.ViewGroup
import androidx.compose.material3.FloatingToolbarExitDirection
import androidx.compose.material3.FloatingToolbarScrollBehavior
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.unit.Velocity
import com.materialtoolbar.interop.NativeScrollConsumer
import com.materialtoolbar.interop.NativeScrollFrame
import com.materialtoolbar.interop.ScrollSourceController
import com.materialtoolbar.interop.scrollLog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * Material 3 floating toolbar consumer.
 *
 * `exitAlways` only reacts to consumed content distance, so this consumer needs nothing beyond the
 * normalized delta. It never reserves chrome space and never moves the source: the toolbar floats
 * above content rather than displacing it.
 */
class FloatingToolbarScrollConsumer(
  private val hostView: ViewGroup,
  private val composeView: ComposeView,
) : NativeScrollConsumer {
  private var behavior: FloatingToolbarScrollBehavior? = null
  private var scope: CoroutineScope? = null
  private var settleJob: Job? = null
  private var offsetObserverJob: Job? = null
  private var debugFrameCounter = 0

  override val isEnabled: Boolean
    get() = behavior != null && scope != null

  fun bind(newBehavior: FloatingToolbarScrollBehavior?, newScope: CoroutineScope?) {
    if (behavior === newBehavior && scope === newScope) return
    cancelSettle()
    offsetObserverJob?.cancel()
    offsetObserverJob = null
    behavior = newBehavior
    scope = newScope

    if (newBehavior == null || newScope == null) {
      resetTranslation()
      return
    }

    offsetObserverJob = newScope.launch {
      snapshotFlow { newBehavior.state.offset }.collect(::applyOffset)
    }
    hostView.post {
      syncGeometry()
      applyOffset(newBehavior.state.offset)
    }
  }

  fun unbind(expectedBehavior: FloatingToolbarScrollBehavior?) {
    if (behavior !== expectedBehavior) return
    bind(null, null)
  }

  fun onHostDetached() {
    cancelSettle()
  }

  override fun onScrollSessionStart(controller: ScrollSourceController) {
    cancelSettle()
    debugFrameCounter = 0
    syncGeometry()
    applyOffset(behavior?.state?.offset ?: 0f)
  }

  override fun onScrollFrame(frame: NativeScrollFrame) {
    if (frame.deltaY == 0) return
    val currentBehavior = behavior ?: return
    currentBehavior.onPostScroll(
      consumed = Offset(0f, -frame.deltaY.toFloat()),
      available = Offset.Zero,
      source = frame.nestedScrollSource,
    )
    applyOffset(currentBehavior.state.offset)

    debugFrameCounter += 1
    if (debugFrameCounter % 8 == 1) {
      scrollLog {
        "toolbar dy=${frame.deltaY} y=${frame.scrollY} phase=${frame.phase} " +
          "offset=${currentBehavior.state.offset} limit=${currentBehavior.state.offsetLimit}"
      }
    }
  }

  override fun onScrollSessionEnd(velocityY: Float) {
    val currentBehavior = behavior ?: return
    val currentScope = scope ?: return
    cancelSettle()
    settleJob = currentScope.launch {
      // Real velocity, not Velocity.Zero: Material decides snap direction from how fast the
      // content was still moving when it came to rest.
      currentBehavior.onPostFling(
        consumed = Velocity.Zero,
        available = nestedScrollVelocity(velocityY),
      )
      applyOffset(currentBehavior.state.offset)
      settleJob = null
    }
  }

  fun syncGeometry() {
    val currentBehavior = behavior ?: return
    if (hostView.width <= 0 || hostView.height <= 0) return
    if (composeView.width <= 0 || composeView.height <= 0) return

    val isRtl = hostView.layoutDirection == View.LAYOUT_DIRECTION_RTL
    val distance = when (currentBehavior.exitDirection) {
      FloatingToolbarExitDirection.Top -> composeView.bottom.toFloat()
      FloatingToolbarExitDirection.Bottom -> (hostView.height - composeView.top).toFloat()
      FloatingToolbarExitDirection.Start ->
        if (isRtl) (hostView.width - composeView.left).toFloat() else composeView.right.toFloat()
      FloatingToolbarExitDirection.End ->
        if (isRtl) composeView.right.toFloat() else (hostView.width - composeView.left).toFloat()
      else -> composeView.height.toFloat()
    }.coerceAtLeast(1f)

    val currentOffset = currentBehavior.state.offset
    currentBehavior.state.offsetLimit = -distance
    currentBehavior.state.offset = currentOffset
  }

  fun applyCurrentOffset() = applyOffset(behavior?.state?.offset ?: 0f)

  private fun applyOffset(offset: Float) {
    val currentBehavior = behavior ?: run {
      resetTranslation()
      return
    }
    val isRtl = hostView.layoutDirection == View.LAYOUT_DIRECTION_RTL
    when (currentBehavior.exitDirection) {
      FloatingToolbarExitDirection.Top -> {
        composeView.translationX = 0f
        composeView.translationY = offset
      }
      FloatingToolbarExitDirection.Start -> {
        composeView.translationY = 0f
        composeView.translationX = if (isRtl) -offset else offset
      }
      FloatingToolbarExitDirection.End -> {
        composeView.translationY = 0f
        composeView.translationX = if (isRtl) offset else -offset
      }
      else -> {
        composeView.translationX = 0f
        composeView.translationY = -offset
      }
    }
  }

  private fun cancelSettle() {
    settleJob?.cancel()
    settleJob = null
  }

  private fun resetTranslation() {
    composeView.translationX = 0f
    composeView.translationY = 0f
  }
}
