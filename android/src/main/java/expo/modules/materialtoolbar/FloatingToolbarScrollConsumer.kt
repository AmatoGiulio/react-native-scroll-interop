@file:OptIn(androidx.compose.material3.ExperimentalMaterial3ExpressiveApi::class)

package expo.modules.materialtoolbar

import android.util.Log
import android.view.View
import android.view.ViewGroup
import androidx.compose.animation.core.animate
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

/**
 * Material-specific consumer, driven by the nested-scroll transaction the source itself reports.
 *
 * A floating toolbar takes nothing away from the list: it slides out of the way of movement that
 * already happened. So it joins the transaction in its post-scroll phase, which is also the phase
 * Material's own `FloatingToolbarScrollBehavior` expects, and never withholds a pixel from the
 * child.
 */
internal class FloatingToolbarScrollConsumer(
  private val hostView: ViewGroup,
  private val composeView: ComposeView,
) {
  private var behavior: FloatingToolbarScrollBehavior? = null
  private var scope: CoroutineScope? = null
  private var settleJob: Job? = null
  private var settleGeneration = 0L
  private var offsetObserverJob: Job? = null
  private var debugFrameCounter = 0
  private var lastInputDeltaY = 0
  private var activeSource: ViewGroup? = null

  /** Whether this toolbar can take part in a transaction at all. */
  val isBound: Boolean
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
    activeSource = null
  }

  fun beginNestedTransaction(source: ViewGroup): Boolean {
    if (!isBound) return false
    cancelSettle()
    activeSource = source
    debugFrameCounter = 0
    lastInputDeltaY = 0
    syncGeometry()
    val current = behavior?.state?.offset ?: 0f
    applyOffset(current)
    if (BuildConfig.DEBUG) {
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "FLOAT_TX_BEGIN view=${source.id} scrollY=${source.scrollY} compose=${composeView.measuredWidth}x${composeView.measuredHeight} offset=$current limit=${behavior?.state?.offsetLimit}",
      )
    }
    return true
  }

  /**
   * The post-scroll phase of one nested transaction.
   *
   * [childConsumedY] is what the list actually moved, in Android's sign convention, and
   * [inputType] carries whether it came from a finger or from the source's own momentum — the same
   * distinction Compose draws between `UserInput` and `SideEffect`, which Material's behaviors read.
   */
  fun nestedPostScroll(childConsumedY: Int, inputType: NativeNestedInputType) {
    if (childConsumedY == 0) return
    val currentBehavior = behavior ?: return
    lastInputDeltaY = childConsumedY
    currentBehavior.onPostScroll(
      consumed = Offset(0f, -childConsumedY.toFloat()),
      available = Offset.Zero,
      source = when (inputType) {
        NativeNestedInputType.Touch -> NestedScrollSource.UserInput
        NativeNestedInputType.NonTouch -> NestedScrollSource.SideEffect
      },
    )
    applyOffset(currentBehavior.state.offset)
    if (BuildConfig.DEBUG) {
      debugFrameCounter += 1
      if (debugFrameCounter % 8 == 1) {
        Log.d(
          NATIVE_SCROLL_LOG_TAG,
          "material dy=$childConsumedY type=$inputType offset=${currentBehavior.state.offset} limit=${currentBehavior.state.offsetLimit} tx=${composeView.translationX} ty=${composeView.translationY}",
        )
      }
    }
  }

  fun endNestedTransaction() {
    val currentBehavior = behavior ?: return
    val currentScope = scope ?: return
    cancelSettle()
    val generation = settleGeneration

    // This offset is an integral: it is built by accumulating per-frame deltas and never derives
    // from an absolute position, unlike the TopAppBar, which resynchronises against the source when
    // it settles. Any frame the transport fails to deliver is therefore a permanent error, and it
    // has one real source — chrome keeps scrolling the source after the session closed, so those
    // pixels reach nobody.
    //
    // Accumulate enough of them and the settle decides its endpoint from a wrong number: Material
    // snaps on `collapsedFraction < 0.5f`, and observed fractions sit at 0.46-0.47, a hair from the
    // boundary. That is how the toolbar ends up hidden while the app bar sits expanded.
    //
    // A list at the top is the one position where the correct state is known without integrating
    // anything: reaching it requires scrolling up by at least the toolbar's height, and exitAlways
    // shows the toolbar for that. Restoring the invariant here bounds the error instead of letting
    // it compound.
    val restoreForTop = ChromeSettlePolicy.shouldRestoreAtTop(
      sourceScrollY = activeSource?.scrollY ?: -1,
      offset = currentBehavior.state.offset,
    )

    if (BuildConfig.DEBUG) {
      val limit = currentBehavior.state.offsetLimit
      val fraction = if (limit != 0f) currentBehavior.state.offset / limit else 0f
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "FLOAT_SETTLE_START gen=$generation lastDy=$lastInputDeltaY offset=${currentBehavior.state.offset} limit=$limit fraction=$fraction restoreForTop=$restoreForTop",
      )
    }

    settleJob = currentScope.launch(start = CoroutineStart.UNDISPATCHED) {
      var completedNormally = false
      try {
        if (restoreForTop) {
          // Animated rather than assigned: a large accumulated error leaves the toolbar fully
          // hidden, and snapping it back into place in one frame would be more visible than the
          // drift it corrects.
          animate(
            initialValue = currentBehavior.state.offset,
            targetValue = 0f,
            animationSpec = currentBehavior.snapAnimationSpec,
          ) { value, _ ->
            currentBehavior.state.offset = value
            applyOffset(value)
          }
        } else {
          // Zero, deliberately, and for the same reason the TopAppBar passes zero: every frame of
          // the fling already reached this consumer as a scroll delta, so the movement is in the
          // offset. Handing Material the velocity on top of that decays a second time over motion
          // already applied — the toolbar overshoots what the content did.
          //
          // Compose passes the velocity the child could NOT consume; ours is the velocity the child
          // did consume, which is not the same number and not interchangeable with it.
          currentBehavior.onPostFling(consumed = Velocity.Zero, available = Velocity.Zero)
        }
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
