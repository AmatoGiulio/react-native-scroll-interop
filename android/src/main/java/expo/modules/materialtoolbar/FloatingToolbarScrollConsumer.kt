@file:OptIn(androidx.compose.material3.ExperimentalMaterial3ExpressiveApi::class)

package expo.modules.materialtoolbar

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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

/** Material-specific consumer. It knows nothing about ReactScrollViewHelper or FlashList. */
internal class FloatingToolbarScrollConsumer(
  private val hostView: ViewGroup,
  private val composeView: ComposeView,
) : NativeScrollConsumer {
  private var behavior: FloatingToolbarScrollBehavior? = null
  private var scope: CoroutineScope? = null
  private var settleJob: Job? = null
  private var settleGeneration = 0L
  private var offsetObserverJob: Job? = null
  private var debugFrameCounter = 0
  private var lastInputDeltaY = 0

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

  override fun onScrollSessionStart(source: ViewGroup) {
    cancelSettle()
    debugFrameCounter = 0
    lastInputDeltaY = 0
    syncGeometry()
    val current = behavior?.state?.offset ?: 0f
    applyOffset(current)
    if (BuildConfig.DEBUG) {
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "BEGIN_DRAG view=${source.id} scrollY=${source.scrollY} compose=${composeView.measuredWidth}x${composeView.measuredHeight} offset=$current limit=${behavior?.state?.offsetLimit}",
      )
    }
  }

  override fun onScrollFrame(frame: NativeScrollFrame) {
    if (frame.deltaY == 0) return
    val currentBehavior = behavior ?: return
    lastInputDeltaY = frame.deltaY
    currentBehavior.onPostScroll(
      consumed = Offset(0f, -frame.deltaY.toFloat()),
      available = Offset.Zero,
      source = NestedScrollSource.UserInput,
    )
    applyOffset(currentBehavior.state.offset)
    if (BuildConfig.DEBUG) {
      debugFrameCounter += 1
      if (debugFrameCounter % 8 == 1) {
        Log.d(
          NATIVE_SCROLL_LOG_TAG,
          "material dy=${frame.deltaY} scrollY=${frame.scrollY} rawY=${frame.rawScrollY} offset=${currentBehavior.state.offset} limit=${currentBehavior.state.offsetLimit} tx=${composeView.translationX} ty=${composeView.translationY}",
        )
      }
    }
  }

  override fun onScrollSessionEnd() {
    val currentBehavior = behavior ?: return
    val currentScope = scope ?: return
    cancelSettle()
    val generation = settleGeneration

    if (BuildConfig.DEBUG) {
      val limit = currentBehavior.state.offsetLimit
      val fraction = if (limit != 0f) currentBehavior.state.offset / limit else 0f
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "FLOAT_SETTLE_START gen=$generation lastDy=$lastInputDeltaY offset=${currentBehavior.state.offset} limit=$limit fraction=$fraction",
      )
    }

    settleJob = currentScope.launch(start = CoroutineStart.UNDISPATCHED) {
      var completedNormally = false
      try {
        currentBehavior.onPostFling(consumed = Velocity.Zero, available = Velocity.Zero)
        completedNormally = true
        applyOffset(currentBehavior.state.offset)
      } finally {
        if (BuildConfig.DEBUG) {
          val limit = currentBehavior.state.offsetLimit
          val fraction = if (limit != 0f) currentBehavior.state.offset / limit else 0f
          Log.d(
            NATIVE_SCROLL_LOG_TAG,
            "FLOAT_SETTLE_END gen=$generation completed=$completedNormally currentGen=$settleGeneration offset=${currentBehavior.state.offset} limit=$limit fraction=$fraction",
          )
        }
        // A canceled/older settle must never clear the Job reference of a newer transaction.
        if (generation == settleGeneration) {
          settleJob = null
        }
      }
    }
  }

  fun syncGeometry() {
    val currentBehavior = behavior ?: return
    if (hostView.width <= 0 || hostView.height <= 0 || composeView.width <= 0 || composeView.height <= 0) return

    val isRtl = hostView.layoutDirection == View.LAYOUT_DIRECTION_RTL
    val distance = when (currentBehavior.exitDirection) {
      FloatingToolbarExitDirection.Top -> composeView.bottom.toFloat()
      FloatingToolbarExitDirection.Bottom -> (hostView.height - composeView.top).toFloat()
      FloatingToolbarExitDirection.Start -> if (isRtl) {
        (hostView.width - composeView.left).toFloat()
      } else {
        composeView.right.toFloat()
      }
      FloatingToolbarExitDirection.End -> if (isRtl) {
        composeView.right.toFloat()
      } else {
        (hostView.width - composeView.left).toFloat()
      }
      else -> composeView.height.toFloat()
    }.coerceAtLeast(1f)

    val currentOffset = currentBehavior.state.offset
    currentBehavior.state.offsetLimit = -distance
    currentBehavior.state.offset = currentOffset

    if (BuildConfig.DEBUG) {
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "geometry dir=${currentBehavior.exitDirection} host=${hostView.width}x${hostView.height} compose=${composeView.width}x${composeView.height} pos=${composeView.left},${composeView.top}-${composeView.right},${composeView.bottom} limit=${currentBehavior.state.offsetLimit}",
      )
    }
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
      FloatingToolbarExitDirection.Bottom -> {
        composeView.translationX = 0f
        composeView.translationY = -offset
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
    settleGeneration += 1
    settleJob?.cancel()
    settleJob = null
  }

  private fun resetTranslation() {
    composeView.translationX = 0f
    composeView.translationY = 0f
  }
}
