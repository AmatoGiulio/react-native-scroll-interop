@file:OptIn(androidx.compose.material3.ExperimentalMaterial3ExpressiveApi::class)

package com.rn087nestedscrollprobe

import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.compose.material3.FloatingToolbarDefaults
import androidx.compose.material3.FloatingToolbarExitDirection
import androidx.compose.material3.FloatingToolbarScrollBehavior
import androidx.compose.material3.HorizontalFloatingToolbar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.ui.unit.Velocity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * Second Material3 scroll consumer for the RN 0.87 bare probe.
 *
 * Unlike the TopAppBar, this consumer never withholds distance from the ScrollView. It observes only
 * the pixels the child actually consumed in the parent's post-scroll callback and feeds those pixels
 * into Material3's FloatingToolbarScrollBehavior. That is the same ownership model used by the
 * production FloatingToolbarScrollConsumer.
 */
internal class FloatingToolbarProbeConsumer(
  private val host: FrameLayout,
  private val log: (String) -> Unit,
) {
  private val composeView = ComposeView(host.context)

  private var behavior: FloatingToolbarScrollBehavior? = null
  private var scope: CoroutineScope? = null
  private var settleJob: Job? = null
  private var settleGeneration = 0L
  private var offsetObserverJob: Job? = null
  private var lastInputDeltaY = 0
  private var lastLoggedLimit: Float? = null

  val isBound: Boolean
    get() = behavior != null && scope != null

  init {
    composeView.setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
    composeView.elevation = 9_000f
    composeView.setContent {
      MaterialTheme {
        val currentBehavior = FloatingToolbarDefaults.exitAlwaysScrollBehavior(
          exitDirection = FloatingToolbarExitDirection.Bottom,
        )
        val currentScope = rememberCoroutineScope()

        DisposableEffect(currentBehavior, currentScope) {
          bind(currentBehavior, currentScope)
          onDispose { unbind(currentBehavior) }
        }

        HorizontalFloatingToolbar(
          expanded = true,
          scrollBehavior = null,
        ) {
          Text("RN 0.87 floating consumer")
        }
      }
    }

    composeView.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
      syncGeometry()
      applyCurrentOffset()
    }

    val edgeMargin = (24f * host.resources.displayMetrics.density).roundToInt()
    host.addView(
      composeView,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
        Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL,
      ).apply {
        bottomMargin = edgeMargin
      },
    )
  }

  fun beginNestedTransaction(source: ViewGroup): Boolean {
    if (!isBound) return false
    cancelSettle()
    lastInputDeltaY = 0
    syncGeometry()
    applyCurrentOffset()
    log(
      "FLOAT_BEGIN source=${sourceLabel(source)} scrollY=${source.scrollY} " +
        "offset=${behavior?.state?.offset} limit=${behavior?.state?.offsetLimit}",
    )
    return true
  }

  fun nestedPostScroll(childConsumedY: Int, type: Int) {
    if (childConsumedY == 0) return
    val currentBehavior = behavior ?: return
    lastInputDeltaY = childConsumedY

    val oldOffset = currentBehavior.state.offset
    val oldTranslationY = composeView.translationY
    currentBehavior.onPostScroll(
      consumed = Offset(0f, -childConsumedY.toFloat()),
      available = Offset.Zero,
      source = type.toComposeSource(),
    )
    applyCurrentOffset()

    val movement = (composeView.translationY - oldTranslationY).roundToInt()
    log(
      "FLOAT_POST type=${typeName(type)} child=$childConsumedY oldOffset=$oldOffset " +
        "offset=${currentBehavior.state.offset} movement=$movement ty=${composeView.translationY}",
    )
  }

  fun endNestedTransaction(reason: String) {
    val currentBehavior = behavior ?: return
    val currentScope = scope ?: return
    cancelSettle()
    val generation = settleGeneration
    val limit = currentBehavior.state.offsetLimit
    val fraction = if (limit != 0f) currentBehavior.state.offset / limit else 0f
    log(
      "FLOAT_SETTLE_START gen=$generation reason=$reason lastDy=$lastInputDeltaY " +
        "offset=${currentBehavior.state.offset} limit=$limit fraction=$fraction",
    )

    settleJob = currentScope.launch(start = CoroutineStart.UNDISPATCHED) {
      var completedNormally = false
      try {
        currentBehavior.onPostFling(
          consumed = Velocity.Zero,
          available = Velocity.Zero,
        )
        completedNormally = true
        applyCurrentOffset()
      } finally {
        val endLimit = currentBehavior.state.offsetLimit
        val endFraction = if (endLimit != 0f) currentBehavior.state.offset / endLimit else 0f
        log(
          "FLOAT_SETTLE_END gen=$generation completed=$completedNormally currentGen=$settleGeneration " +
            "offset=${currentBehavior.state.offset} limit=$endLimit fraction=$endFraction",
        )
        if (generation == settleGeneration) settleJob = null
      }
    }
  }

  fun onDetached() {
    cancelSettle()
    offsetObserverJob?.cancel()
    offsetObserverJob = null
  }

  private fun bind(
    newBehavior: FloatingToolbarScrollBehavior,
    newScope: CoroutineScope,
  ) {
    if (behavior === newBehavior && scope === newScope) return
    cancelSettle()
    offsetObserverJob?.cancel()
    behavior = newBehavior
    scope = newScope
    offsetObserverJob = newScope.launch {
      snapshotFlow { newBehavior.state.offset }.collect(::applyOffset)
    }
    host.post {
      syncGeometry()
      applyOffset(newBehavior.state.offset)
    }
    log(
      "FLOAT_BEHAVIOR bound=true offset=${newBehavior.state.offset} " +
        "limit=${newBehavior.state.offsetLimit}",
    )
  }

  private fun unbind(expected: FloatingToolbarScrollBehavior) {
    if (behavior !== expected) return
    cancelSettle()
    offsetObserverJob?.cancel()
    offsetObserverJob = null
    behavior = null
    scope = null
    resetTranslation()
    log("FLOAT_BEHAVIOR bound=false")
  }

  private fun syncGeometry() {
    val currentBehavior = behavior ?: return
    if (host.width <= 0 || host.height <= 0 || composeView.width <= 0 || composeView.height <= 0) {
      return
    }

    val distance = (host.height - composeView.top).toFloat().coerceAtLeast(1f)
    val currentOffset = currentBehavior.state.offset
    currentBehavior.state.offsetLimit = -distance
    currentBehavior.state.offset = currentOffset

    if (lastLoggedLimit != currentBehavior.state.offsetLimit) {
      lastLoggedLimit = currentBehavior.state.offsetLimit
      log(
        "FLOAT_GEOMETRY host=${host.width}x${host.height} compose=${composeView.width}x${composeView.height} " +
          "top=${composeView.top} bottom=${composeView.bottom} limit=${currentBehavior.state.offsetLimit}",
      )
    }
  }

  private fun applyCurrentOffset() {
    applyOffset(behavior?.state?.offset ?: 0f)
  }

  private fun applyOffset(offset: Float) {
    composeView.translationX = 0f
    composeView.translationY = -offset
  }

  private fun resetTranslation() {
    composeView.translationX = 0f
    composeView.translationY = 0f
  }

  private fun cancelSettle() {
    settleGeneration += 1
    settleJob?.cancel()
    settleJob = null
  }

  private fun Int.toComposeSource(): NestedScrollSource =
    if (this == androidx.core.view.ViewCompat.TYPE_NON_TOUCH) NestedScrollSource.SideEffect
    else NestedScrollSource.UserInput

  private fun typeName(type: Int): String =
    if (type == androidx.core.view.ViewCompat.TYPE_NON_TOUCH) "NON_TOUCH" else "TOUCH"

  private fun sourceLabel(view: ViewGroup): String =
    "${view.javaClass.name}#${Integer.toHexString(System.identityHashCode(view))}"
}
