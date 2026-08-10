@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package expo.modules.materialtoolbar

import android.content.Context
import android.os.Build
import android.view.View
import android.view.ViewGroup
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MediumTopAppBar
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.material3.rememberTopAppBarState
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import expo.modules.kotlin.AppContext
import kotlinx.coroutines.CoroutineScope

private data class TopAppBarHostState(
  val title: String = "",
  val visible: Boolean = true,
  val variant: String = "medium",
  val scrollBehavior: String = "none",
  val themeMode: String = "system",
  val dynamicColor: Boolean = false,
)

/**
 * Minimal second Material3 consumer used to prove that native RN scroll interop is not specific to
 * FloatingToolbar. The outer Expo view is a full-screen BOX_NONE overlay; only the wrap-content,
 * full-width Compose app bar participates in Android hit testing.
 */
class ExpoMaterialTopAppBarView(
  context: Context,
  appContext: AppContext,
) : ComposeChromeHostView(context, appContext) {

  private val state = mutableStateOf(TopAppBarHostState())
  private var lastTopInsetPx = -1

  private val topAppBarScrollConsumer = TopAppBarScrollConsumer()
  private val nativeScrollCoordinator = ReactNativeScrollCoordinator(this, topAppBarScrollConsumer)

  init {
    composeView.layoutParams = ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT,
    )
    composeView.setContent {
      MaterialTopAppBarContent(state.value)
    }
  }

  /**
   * Non-consuming inset observer.
   *
   * The window insets are not lost on the way to this view: they arrive unconsumed, with the real
   * status-bar/cutout top, and Material resolves `TopAppBarDefaults.windowInsets` from them exactly
   * as it would in a plain Compose app. The host only has to notice that the expanded geometry the
   * scroll-away coordinator caches is now stale; [ComposeChromeHostView] takes care of measuring the
   * app bar again at its new height.
   */
  override fun onApplyWindowInsets(insets: android.view.WindowInsets): android.view.WindowInsets {
    val topInset = WindowInsetsCompat.toWindowInsetsCompat(insets, this)
      .getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      .top
    if (topInset != lastTopInsetPx) {
      lastTopInsetPx = topInset
      // The expanded app-bar height includes this inset, and both the child's bounds and scroll-away
      // spacing are derived from it. Drop the cached maximum so a rotation, cutout change or
      // edge-to-edge transition can shrink it again — the cache only ever grows.
      resetExpandedChromeGeometry()
      scheduleHostMeasureAndLayout()
      if (BuildConfig.DEBUG) {
        android.util.Log.d(NATIVE_SCROLL_LOG_TAG, "topappbar topInset=$topInset")
      }
    }
    return super.onApplyWindowInsets(insets)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    nativeScrollCoordinator.attach()

    // An overlay mounted after the window already settled its insets would otherwise never see a
    // dispatch. The host schedules its own deferred measure/layout.
    ViewCompat.requestApplyInsets(this)
  }

  override fun onDetachedFromWindow() {
    nativeScrollCoordinator.detach()
    topAppBarScrollConsumer.onHostDetached()
    super.onDetachedFromWindow()
  }

  private fun bindComposeScrollBehavior(
    behavior: TopAppBarScrollBehavior?,
    scope: CoroutineScope?,
    mode: TopAppBarInteropMode?,
  ) {
    topAppBarScrollConsumer.bind(behavior, scope, mode)
    if (behavior != null && scope != null && mode != null) {
      nativeScrollCoordinator.discoverSources()
    }
  }

  private fun unbindComposeScrollBehavior(behavior: TopAppBarScrollBehavior?) {
    topAppBarScrollConsumer.unbind(behavior)
  }

  private fun updateState(transform: (TopAppBarHostState) -> TopAppBarHostState) {
    state.value = transform(state.value)
    requestLayout()
    composeView.requestLayout()
  }

  // A Material app bar spans the full width and takes the height its variant and window insets ask
  // for, so the child is measured exactly wide and at most as tall as the host.
  override fun onMeasureComposeChild(hostWidthPx: Int, hostHeightPx: Int) {
    composeView.measure(
      View.MeasureSpec.makeMeasureSpec(hostWidthPx, View.MeasureSpec.EXACTLY),
      View.MeasureSpec.makeMeasureSpec(hostHeightPx, View.MeasureSpec.AT_MOST),
    )
  }

  /**
   * The Compose child is laid out at the *expanded* app-bar height and left there.
   *
   * Material collapses the app bar by shrinking what it draws, and it does so on the UI frame clock.
   * The host cannot follow that with layout passes: React Native terminates the layout-request chain,
   * so every correction has to be posted, and a violent fling delays the post by several frames. Any
   * frame where the child's bounds disagree with the height Material is drawing is visible — the bar
   * gets clipped, or a band of empty overlay opens between the bar and the list.
   *
   * Pinning the bounds removes the race instead of chasing it. The drawn height and the list's
   * position both derive from the same `heightOffset` (the list through React Native's scroll-away
   * translation), so they stay glued at every point of the animation with no layout pass at all. The
   * region the collapsed bar leaves empty is transparent and holds no Compose pointer-input node, so
   * touches there fall through to the React Native content underneath.
   */
  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val parentWidth = right - left
    val parentHeight = bottom - top
    // A collapsing app bar measures smaller; the expanded geometry is the maximum ever observed.
    expandedChromeHeightPx = maxOf(expandedChromeHeightPx, composeView.measuredHeight)
    val childHeight = expandedChromeHeightPx.coerceAtMost(parentHeight)
    composeView.layout(0, 0, parentWidth, childHeight)
    if (topAppBarScrollConsumer.updateExpandedChromeHeight(childHeight)) {
      nativeScrollCoordinator.discoverSources()
    }
  }

  private var expandedChromeHeightPx = 0

  /** Called when the expanded app bar can legitimately become a different height. */
  private fun resetExpandedChromeGeometry() {
    expandedChromeHeightPx = 0
    topAppBarScrollConsumer.resetExpandedChromeHeight()
  }

  fun setTitle(title: String) = updateState { it.copy(title = title) }

  fun setVisibleState(visible: Boolean) = updateState { it.copy(visible = visible) }

  fun setVariant(variant: String) {
    val normalized = when (variant) {
      "small", "large" -> variant
      else -> "medium"
    }
    if (state.value.variant != normalized) {
      resetExpandedChromeGeometry()
    }
    updateState { it.copy(variant = normalized) }
  }

  fun setScrollBehavior(behavior: String) = updateState {
    it.copy(
      scrollBehavior = when (behavior) {
        "enterAlways", "exitUntilCollapsed" -> behavior
        else -> "none"
      },
    )
  }

  fun setThemeMode(mode: String) = updateState {
    it.copy(
      themeMode = when (mode) {
        "light", "dark" -> mode
        else -> "system"
      },
    )
  }

  fun setDynamicColor(dynamic: Boolean) = updateState { it.copy(dynamicColor = dynamic) }

  @Composable
  private fun MaterialTopAppBarContent(uiState: TopAppBarHostState) {
    val context = LocalContext.current
    val systemDark = isSystemInDarkTheme()
    val useDarkTheme = when (uiState.themeMode) {
      "light" -> false
      "dark" -> true
      else -> systemDark
    }
    val colorScheme = if (uiState.dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      if (useDarkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
    } else {
      if (useDarkTheme) darkColorScheme() else lightColorScheme()
    }

    MaterialTheme(colorScheme = colorScheme) {
      // The state and the canScroll lambda must be stable. Material remembers the behavior keyed on
      // exactly these, and the default `canScroll` is a fresh `{ true }` on every call — so leaving
      // it to the default produces a brand new behavior object on every recomposition. The
      // DisposableEffect below is keyed on that identity, so the consumer would unbind and rebind
      // continuously and end up mutating a behavior the app bar is no longer drawing from: the bar
      // collapses once and then never reacts again.
      val topAppBarState = rememberTopAppBarState()
      val canScroll = remember { { true } }

      val materialScrollBehavior = if (uiState.visible) {
        when (uiState.scrollBehavior) {
          "enterAlways" -> TopAppBarDefaults.enterAlwaysScrollBehavior(
            state = topAppBarState,
            canScroll = canScroll,
          )
          "exitUntilCollapsed" -> TopAppBarDefaults.exitUntilCollapsedScrollBehavior(
            state = topAppBarState,
            canScroll = canScroll,
          )
          else -> null
        }
      } else {
        null
      }
      val interopMode = when (uiState.scrollBehavior) {
        "enterAlways" -> TopAppBarInteropMode.EnterAlways
        "exitUntilCollapsed" -> TopAppBarInteropMode.ExitUntilCollapsed
        else -> null
      }
      val materialScrollScope = rememberCoroutineScope()

      DisposableEffect(materialScrollBehavior, materialScrollScope, interopMode) {
        bindComposeScrollBehavior(materialScrollBehavior, materialScrollScope, interopMode)
        onDispose { unbindComposeScrollBehavior(materialScrollBehavior) }
      }

      if (uiState.visible) {
        when (uiState.variant) {
          "small" -> TopAppBar(
            title = { Text(uiState.title) },
            scrollBehavior = materialScrollBehavior,
          )
          "large" -> LargeTopAppBar(
            title = { Text(uiState.title) },
            scrollBehavior = materialScrollBehavior,
          )
          else -> MediumTopAppBar(
            title = { Text(uiState.title) },
            scrollBehavior = materialScrollBehavior,
          )
        }
      }
    }
  }
}
