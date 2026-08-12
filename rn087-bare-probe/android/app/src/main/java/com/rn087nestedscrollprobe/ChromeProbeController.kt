@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.rn087nestedscrollprobe

import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.material3.rememberTopAppBarState
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
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Minimal Material3 chrome consumer for the bare RN 0.87 probe.
 *
 * It deliberately mirrors the production transport contract without depending on Expo: the RN
 * source owns all movement; Material3 consumes only Android nested-scroll callbacks; reflection is
 * restricted to RN's unstable scroll-away geometry primitive and never participates per frame in
 * scroll physics.
 *
 * When RN_FLOATING_TOOLBAR_PROBE is enabled, a second independent Material3 consumer observes only
 * child-consumed post-scroll pixels. It never changes the amount returned to the nested parent, so
 * the TopAppBar transaction ledger must remain identical in meaning with one or two consumers.
 */
internal class ChromeProbeController(
  private val host: FrameLayout,
  private val log: (String) -> Unit,
  private val onGeometryChanged: () -> Unit,
) {
  private val composeView = ComposeView(host.context)
  private val floatingToolbar =
    if (BuildConfig.RN_FLOATING_TOOLBAR_PROBE) FloatingToolbarProbeConsumer(host, log) else null

  private var behavior: TopAppBarScrollBehavior? = null
  private var scope: CoroutineScope? = null
  private var source: ViewGroup? = null
  private var expandedHeightPx = 0
  private var appliedScrollAwayPaddingPx = 0
  private var originalClipToPadding: Boolean? = null
  private var settleJob: Job? = null
  private var settleGeneration = 0L

  init {
    composeView.setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
    composeView.elevation = 10_000f
    composeView.setContent {
      MaterialTheme {
        val state = rememberTopAppBarState()
        val currentBehavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior(state)
        val currentScope = rememberCoroutineScope()

        DisposableEffect(currentBehavior, currentScope) {
          bindBehavior(currentBehavior, currentScope)
          onDispose { unbindBehavior(currentBehavior) }
        }

        LargeTopAppBar(
          title = { Text("RN 0.87 Material3 probe") },
          scrollBehavior = currentBehavior,
        )
      }
    }

    composeView.addOnLayoutChangeListener { _, _, _, _, bottom, _, _, _, oldBottom ->
      val height = bottom
      val oldHeight = oldBottom
      if (height > 0 && height > expandedHeightPx) {
        expandedHeightPx = height
        log("CHROME_GEOMETRY expandedHeight=$expandedHeightPx oldHeight=$oldHeight")
        applyScrollAwayPadding()
        onGeometryChanged()
      }
    }

    host.addView(
      composeView,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
        Gravity.TOP,
      ),
    )
  }

  fun prepareSource(newSource: ViewGroup): Boolean {
    if (source !== newSource) {
      clearSource()
      source = newSource
      originalClipToPadding = newSource.clipToPadding
      log("CHROME_SOURCE bind=${sourceLabel(newSource)}")
    }
    return applyScrollAwayPadding()
  }

  fun beginNestedTransaction(newSource: ViewGroup): Boolean {
    val currentBehavior = behavior ?: return false
    cancelSettle()
    prepareSource(newSource)
    applyChromeTranslation()
    val floatingReady = floatingToolbar?.beginNestedTransaction(newSource) ?: false
    log(
      "CHROME_BEGIN source=${sourceLabel(newSource)} heightOffset=${currentBehavior.state.heightOffset} " +
        "limit=${currentBehavior.state.heightOffsetLimit} collapse=${currentCollapseAmountPx()} " +
        "scrollAway=$appliedScrollAwayPaddingPx floating=$floatingReady",
    )
    return true
  }

  fun nestedPreScroll(deltaY: Int, type: Int): Int {
    val currentBehavior = behavior ?: return 0
    if (deltaY == 0) return 0

    val state = currentBehavior.state
    val oldHeightOffset = state.heightOffset
    val returned = currentBehavior.nestedScrollConnection.onPreScroll(
      available = Offset(0f, -deltaY.toFloat()),
      source = type.toComposeSource(),
    )
    val newHeightOffset = state.heightOffset

    val chromeMovementY = clampSignedMovement(deltaY, oldHeightOffset - newHeightOffset)
    val reportedConsumedY =
      clampSignedConsumption(deltaY, -returned.y).let { reported ->
        if (abs(chromeMovementY) < abs(reported)) chromeMovementY else reported
      }

    applyChromeTranslation()
    log(
      "CHROME_PRE type=${typeName(type)} dy=$deltaY consumed=$reportedConsumedY " +
        "movement=$chromeMovementY collapse=${currentCollapseAmountPx()}",
    )
    return reportedConsumedY
  }

  fun nestedPostScroll(childConsumedY: Int, availableY: Int, type: Int): Int {
    val currentBehavior = behavior ?: return 0

    val state = currentBehavior.state
    val oldHeightOffset = state.heightOffset
    val returned = currentBehavior.nestedScrollConnection.onPostScroll(
      consumed = Offset(0f, -childConsumedY.toFloat()),
      available = Offset(0f, -availableY.toFloat()),
      source = type.toComposeSource(),
    )
    val newHeightOffset = state.heightOffset

    val movementY = (oldHeightOffset - newHeightOffset).roundToInt()
    val availableConsumedY = clampSignedConsumption(availableY, -returned.y)
    applyChromeTranslation()

    // The FloatingToolbar is a pure observer. It receives only pixels the RN child actually moved
    // and cannot alter the Parent3 consumed array or the TopAppBar ledger.
    floatingToolbar?.nestedPostScroll(childConsumedY, type)

    log(
      "CHROME_POST type=${typeName(type)} child=$childConsumedY available=$availableY " +
        "consumed=$availableConsumedY movement=$movementY collapse=${currentCollapseAmountPx()}",
    )
    return availableConsumedY
  }

  fun endNestedTransaction(reason: String) {
    // Each Material consumer settles its own state from the movement it already observed. Neither is
    // given the RN fling velocity a second time.
    floatingToolbar?.endNestedTransaction(reason)

    val currentBehavior = behavior ?: return
    val currentScope = scope ?: return
    cancelSettle()
    val generation = ++settleGeneration
    log(
      "CHROME_SETTLE_START gen=$generation reason=$reason offset=${currentBehavior.state.heightOffset} " +
        "limit=${currentBehavior.state.heightOffsetLimit}",
    )

    settleJob = currentScope.launch(start = CoroutineStart.UNDISPATCHED) {
      val syncJob = launch(start = CoroutineStart.UNDISPATCHED) {
        snapshotFlow { currentBehavior.state.heightOffset }.collect {
          if (generation == settleGeneration) applyChromeTranslation()
        }
      }

      var completedNormally = false
      try {
        currentBehavior.nestedScrollConnection.onPostFling(
          consumed = Velocity.Zero,
          available = Velocity.Zero,
        )
        completedNormally = true
      } finally {
        syncJob.cancel()
        if (generation == settleGeneration) applyChromeTranslation()
        log(
          "CHROME_SETTLE_END gen=$generation completed=$completedNormally currentGen=$settleGeneration " +
            "offset=${currentBehavior.state.heightOffset} limit=${currentBehavior.state.heightOffsetLimit}",
        )
        if (generation == settleGeneration) settleJob = null
      }
    }
  }

  fun onDetached() {
    floatingToolbar?.onDetached()
    cancelSettle()
    clearSource()
  }

  private fun bindBehavior(
    newBehavior: TopAppBarScrollBehavior,
    newScope: CoroutineScope,
  ) {
    if (behavior === newBehavior && scope === newScope) return
    cancelSettle()
    behavior = newBehavior
    scope = newScope
    log(
      "CHROME_BEHAVIOR bound=true offset=${newBehavior.state.heightOffset} " +
        "limit=${newBehavior.state.heightOffsetLimit}",
    )
    onGeometryChanged()
  }

  private fun unbindBehavior(expected: TopAppBarScrollBehavior) {
    if (behavior !== expected) return
    cancelSettle()
    behavior = null
    scope = null
    log("CHROME_BEHAVIOR bound=false")
  }

  private fun applyScrollAwayPadding(): Boolean {
    val currentSource = source ?: return false
    if (expandedHeightPx <= 0) return false
    val target = expandedHeightPx
    if (target == appliedScrollAwayPaddingPx) {
      applyChromeTranslation()
      return true
    }

    val intType = Int::class.javaPrimitiveType ?: return false
    val method = runCatching {
      currentSource.javaClass.getMethod(
        "setScrollAwayPaddingEnabledUnstable",
        intType,
        intType,
      )
    }.getOrNull()

    val applied = method != null && runCatching {
      method.invoke(currentSource, target, 0)
    }.isSuccess

    log(
      "CHROME_SCROLL_AWAY source=${sourceLabel(currentSource)} method=modern target=$target success=$applied",
    )
    if (!applied) return false

    currentSource.clipToPadding = false
    appliedScrollAwayPaddingPx = target
    applyChromeTranslation()
    return true
  }

  private fun clearSource() {
    val currentSource = source
    if (currentSource != null && appliedScrollAwayPaddingPx != 0) {
      val intType = Int::class.javaPrimitiveType
      if (intType != null) {
        runCatching {
          currentSource.javaClass
            .getMethod("setScrollAwayPaddingEnabledUnstable", intType, intType)
            .invoke(currentSource, 0, 0)
        }
      }
      originalClipToPadding?.let { currentSource.clipToPadding = it }
      log("CHROME_SCROLL_AWAY source=${sourceLabel(currentSource)} method=modern target=0 success=true")
    }

    source = null
    appliedScrollAwayPaddingPx = 0
    originalClipToPadding = null
  }

  private fun applyChromeTranslation() {
    val currentSource = source ?: return
    val content = currentSource.getChildAt(0) ?: return
    val target = appliedScrollAwayPaddingPx.toFloat() - currentCollapseAmountPx()
    if (content.translationY != target) content.translationY = target
  }

  private fun currentCollapseAmountPx(): Float =
    behavior?.state?.heightOffset?.let { (-it).coerceAtLeast(0f) } ?: 0f

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

  private fun Int.toComposeSource(): NestedScrollSource =
    if (this == androidx.core.view.ViewCompat.TYPE_NON_TOUCH) NestedScrollSource.SideEffect
    else NestedScrollSource.UserInput

  private fun typeName(type: Int): String =
    if (type == androidx.core.view.ViewCompat.TYPE_NON_TOUCH) "NON_TOUCH" else "TOUCH"

  private fun sourceLabel(view: ViewGroup): String =
    "${view.javaClass.name}#${Integer.toHexString(System.identityHashCode(view))}"

  private fun cancelSettle() {
    settleGeneration += 1
    settleJob?.cancel()
    settleJob = null
  }
}
