@file:OptIn(androidx.compose.material3.ExperimentalMaterial3ExpressiveApi::class)

package expo.modules.materialtoolbar

import android.util.Log
import android.view.View
import android.view.ViewGroup
import androidx.compose.material3.FloatingToolbarDefaults
import androidx.compose.material3.FloatingToolbarExitDirection
import androidx.compose.material3.FloatingToolbarScrollBehavior
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.unit.Velocity
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import com.reactnativescroll.interop.material3.NativeNestedInputType
import java.util.WeakHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.roundToInt

internal class FloatingToolbarScrollConsumer(
  private val hostView: ViewGroup,
  private val composeView: ComposeView,
  private val visibleFrameInsets: () -> Insets = { Insets.NONE },
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
    val current = behavior ?: return
    if (hostView.width <= 0 || hostView.height <= 0 || composeView.width <= 0 || composeView.height <= 0) return
    val insets = NativeFloatingToolbarPlacement.apply(hostView, composeView) ?: visibleFrameInsets()
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
    val offset = current.state.offset
    current.state.offsetLimit = -distance
    current.state.offset = offset
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

internal object NativeFloatingToolbarPlacement {
  private data class State(
    var alignment: String = "bottomCenter",
    var insets: String = "safe",
    var edgeDp: Float? = null,
    var ime: String = "none",
    var system: Insets = Insets.NONE,
    var keyboard: Insets = Insets.NONE,
    var callback: Boolean = false,
  )
  private val states = WeakHashMap<ExpoMaterialToolbarView, State>()

  fun alignment(v: ExpoMaterialToolbarView, x: String) { state(v).alignment = x; apply(v) }
  fun insets(v: ExpoMaterialToolbarView, x: String) { state(v).insets = if (x == "none") "none" else "safe"; apply(v) }
  fun edge(v: ExpoMaterialToolbarView, x: Float?) { state(v).edgeDp = x?.coerceAtLeast(0f); apply(v) }
  fun ime(v: ExpoMaterialToolbarView, x: String) { state(v).ime = if (x == "hide") "hide" else "none"; apply(v) }

  fun windowInsets(host: ViewGroup, x: WindowInsetsCompat) {
    val v = host as? ExpoMaterialToolbarView ?: return
    update(v, state(v), x)
  }

  fun afterLayout(host: ViewGroup, child: ComposeView) {
    if (host is ExpoMaterialToolbarView) apply(host, child)
  }

  fun apply(host: ViewGroup, childOverride: ComposeView? = null): Insets? {
    val v = host as? ExpoMaterialToolbarView ?: return null
    val s = state(v)
    val i = resolved(s)
    val child = childOverride ?: (v.getChildAt(0) as? ComposeView) ?: return i
    if (v.width <= 0 || v.height <= 0 || child.measuredWidth <= 0 || child.measuredHeight <= 0) return i
    val w = v.width
    val h = v.height
    val cw = child.measuredWidth.coerceAtMost(w)
    val ch = child.measuredHeight.coerceAtMost(h)
    val edge = (((s.edgeDp ?: FloatingToolbarDefaults.ScreenOffset.value) * v.resources.displayMetrics.density).roundToInt()).coerceAtLeast(0)
    val rtl = v.layoutDirection == View.LAYOUT_DIRECTION_RTL
    val x = when {
      s.alignment.endsWith("Start") -> if (rtl) w - i.right - edge - cw else i.left + edge
      s.alignment.endsWith("End") -> if (rtl) i.left + edge else w - i.right - edge - cw
      else -> (w - cw) / 2
    }.coerceIn(0, (w - cw).coerceAtLeast(0))
    val y = when {
      s.alignment.startsWith("top") -> i.top + edge
      s.alignment.startsWith("bottom") -> h - i.bottom - edge - ch
      else -> (h - ch) / 2
    }.coerceIn(0, (h - ch).coerceAtLeast(0))
    child.layout(x, y, x + cw, y + ch)
    if (NativeScrollTracing.enabled) Log.d(NATIVE_SCROLL_LOG_TAG, "TOOLBAR_LAYOUT alignment=${s.alignment} host=${w}x$h visible=${i.left},${i.top},${i.right},${i.bottom} edge=$edge compose=${cw}x$ch pos=$x,$y-${x + cw},${y + ch}")
    return i
  }

  private fun state(v: ExpoMaterialToolbarView): State {
    val s = states.getOrPut(v) { State() }
    if (!s.callback) {
      s.callback = true
      ViewCompat.setWindowInsetsAnimationCallback(v, object : WindowInsetsAnimationCompat.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
        override fun onProgress(x: WindowInsetsCompat, a: MutableList<WindowInsetsAnimationCompat>): WindowInsetsCompat { update(v, s, x); return x }
      })
      ViewCompat.getRootWindowInsets(v)?.let { update(v, s, it) }
    }
    return s
  }

  private fun update(v: ExpoMaterialToolbarView, s: State, x: WindowInsetsCompat) {
    val system = x.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
    val keyboard = x.getInsets(WindowInsetsCompat.Type.ime())
    if (system == s.system && keyboard == s.keyboard) return
    s.system = system
    s.keyboard = keyboard
    apply(v)
    if (NativeScrollTracing.enabled) Log.d(NATIVE_SCROLL_LOG_TAG, "TOOLBAR_INSETS system=${system.left},${system.top},${system.right},${system.bottom} ime=${keyboard.left},${keyboard.top},${keyboard.right},${keyboard.bottom}")
  }

  private fun resolved(s: State): Insets {
    if (s.insets != "safe") return Insets.NONE
    if (s.ime == "hide") return s.system
    return Insets.of(max(s.system.left, s.keyboard.left), max(s.system.top, s.keyboard.top), max(s.system.right, s.keyboard.right), max(s.system.bottom, s.keyboard.bottom))
  }
}
