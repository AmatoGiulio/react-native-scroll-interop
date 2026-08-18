@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package expo.modules.materialtoolbar

import android.content.Context
import android.os.Build
import android.view.View
import android.view.ViewGroup
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MediumTopAppBar
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.rememberTopAppBarState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlin.math.roundToInt

private data class TopAppBarHostState(
  val title: String = "",
  val visible: Boolean = true,
  val variant: String = "medium",
  val scrollBehavior: String = "none",
  val navigationIcon: String = "none",
  val navigationAccessibilityLabel: String = "Back",
  val themeMode: String = "system",
  val dynamicColor: Boolean = false,
)

class ExpoMaterialTopAppBarView(
  context: Context,
  appContext: AppContext,
) : ComposeChromeHostView(context, appContext) {

  internal val onNavigationPress by EventDispatcher()

  private val state = mutableStateOf(TopAppBarHostState())
  private var lastTopInsetPx = -1
  private var expandedChromeHeightPx = 0
  private var intrinsicHostMeasurePending = false
  private var intrinsicHostResolveAttempts = 0

  private val topAppBarScrollConsumer = TopAppBarScrollConsumer()

  init {
    composeView.layoutParams = ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT,
    )
    composeView.setContent {
      MaterialTopAppBarContent(state.value)
    }
  }

  override fun onApplyWindowInsets(insets: android.view.WindowInsets): android.view.WindowInsets {
    updateTopInset(WindowInsetsCompat.toWindowInsetsCompat(insets, this))
    return super.onApplyWindowInsets(insets)
  }

  private fun updateTopInset(insets: WindowInsetsCompat?) {
    insets ?: return
    val topInset = insets.getInsets(
      WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
    ).top
    if (topInset == lastTopInsetPx) return

    lastTopInsetPx = topInset
    resetExpandedChromeGeometry()
    seedExpandedChromeGeometry()
    scheduleHostMeasureAndLayout()
    scheduleIntrinsicHostSizeResolution()
    composeView.requestLayout()

    if (BuildConfig.DEBUG) {
      android.util.Log.d(NATIVE_SCROLL_LOG_TAG, "topappbar topInset=$topInset")
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    updateTopInset(ViewCompat.getRootWindowInsets(this))
    ViewCompat.requestApplyInsets(this)
    NativeNestedScrollRegistry.registerTopBar(this, topAppBarScrollConsumer)
    seedExpandedChromeGeometry()
    scheduleIntrinsicHostSizeResolution()
  }

  override fun onDetachedFromWindow() {
    NativeNestedScrollRegistry.unregisterTopBar(this)
    topAppBarScrollConsumer.onHostDetached()
    super.onDetachedFromWindow()
  }

  private fun bindComposeScrollBehavior(
    behavior: TopAppBarScrollBehavior?,
    scope: CoroutineScope?,
    mode: TopAppBarInteropMode?,
  ) {
    topAppBarScrollConsumer.bind(behavior, scope, mode)
    NativeNestedScrollRegistry.topBarStateChanged(this)
  }

  private fun unbindComposeScrollBehavior(
    behavior: TopAppBarScrollBehavior?,
    mode: TopAppBarInteropMode?,
  ) {
    topAppBarScrollConsumer.unbind(behavior, mode)
    NativeNestedScrollRegistry.topBarStateChanged(this)
  }

  private fun updateState(transform: (TopAppBarHostState) -> TopAppBarHostState) {
    state.value = transform(state.value)
    requestLayout()
    scheduleIntrinsicHostSizeResolution()
    composeView.requestLayout()
  }

  private fun seedExpandedChromeGeometry() {
    if (lastTopInsetPx < 0) return

    val appBarHeightDp = when (state.value.variant) {
      "small" -> 64f
      "large" -> 152f
      else -> 112f
    }
    val density = resources.displayMetrics.density
    if (density <= 0f) return

    val targetHeightPx = lastTopInsetPx + (appBarHeightDp * density).roundToInt()
    if (targetHeightPx <= 0) return

    expandedChromeHeightPx = targetHeightPx
    if (topAppBarScrollConsumer.updateExpandedChromeHeight(targetHeightPx)) {
      NativeNestedScrollRegistry.topBarStateChanged(this)
    }

    if (BuildConfig.DEBUG) {
      android.util.Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "topappbar seedExpanded variant=${state.value.variant} topInset=$lastTopInsetPx " +
          "height=$targetHeightPx density=$density",
      )
    }
  }

  private fun scheduleIntrinsicHostSizeResolution() {
    if (intrinsicHostMeasurePending || !isAttachedToWindow || height > 0) return
    intrinsicHostMeasurePending = true
    post {
      intrinsicHostMeasurePending = false
      if (!isAttachedToWindow || width <= 0 || height > 0) return@post

      val availableHeight = rootView.height
      if (availableHeight <= 0) {
        scheduleIntrinsicHostSizeRetry()
        return@post
      }

      onMeasureComposeChild(width, availableHeight)
      val targetHeightPx = expandedChromeHeightPx
      if (targetHeightPx <= 0) {
        scheduleIntrinsicHostSizeRetry()
        return@post
      }

      val density = resources.displayMetrics.density
      if (density > 0f) {
        shadowNodeProxy.setViewSize(
          Double.NaN,
          targetHeightPx.toDouble() / density.toDouble(),
        )
        if (BuildConfig.DEBUG) {
          android.util.Log.d(
            NATIVE_SCROLL_LOG_TAG,
            "topappbar publishFabricHeight px=$targetHeightPx " +
              "dp=${targetHeightPx.toDouble() / density.toDouble()} " +
              "host=${width}x$height root=${rootView.width}x${rootView.height} " +
              "attempt=$intrinsicHostResolveAttempts",
          )
        }
      }

      if (height <= 0) {
        scheduleIntrinsicHostSizeRetry()
      }
    }
  }

  private fun scheduleIntrinsicHostSizeRetry() {
    if (intrinsicHostResolveAttempts >= 8 || !isAttachedToWindow || height > 0) return
    intrinsicHostResolveAttempts += 1
    ViewCompat.postOnAnimation(this) {
      scheduleIntrinsicHostSizeResolution()
    }
  }

  override fun onMeasureComposeChild(hostWidthPx: Int, hostHeightPx: Int) {
    composeView.measure(
      View.MeasureSpec.makeMeasureSpec(hostWidthPx, View.MeasureSpec.EXACTLY),
      View.MeasureSpec.makeMeasureSpec(hostHeightPx, View.MeasureSpec.AT_MOST),
    )

    if (composeView.measuredHeight > 0) {
      expandedChromeHeightPx = maxOf(expandedChromeHeightPx, composeView.measuredHeight)
    }

    if (BuildConfig.DEBUG) {
      android.util.Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "topappbar measure host=${hostWidthPx}x$hostHeightPx actualHost=${width}x$height " +
          "compose=${composeView.measuredWidth}x${composeView.measuredHeight} " +
          "expanded=$expandedChromeHeightPx",
      )
    }
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val parentWidth = right - left
    val parentHeight = bottom - top

    expandedChromeHeightPx = maxOf(expandedChromeHeightPx, composeView.measuredHeight)
    val childHeight = expandedChromeHeightPx.coerceAtMost(parentHeight)
    composeView.layout(0, 0, parentWidth, childHeight)

    if (BuildConfig.DEBUG) {
      android.util.Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "topappbar layout host=${parentWidth}x$parentHeight child=${parentWidth}x$childHeight " +
          "measured=${composeView.measuredHeight} expanded=$expandedChromeHeightPx",
      )
    }

    if (topAppBarScrollConsumer.updateExpandedChromeHeight(childHeight)) {
      NativeNestedScrollRegistry.topBarStateChanged(this)
    }
  }

  private fun resetExpandedChromeGeometry() {
    expandedChromeHeightPx = 0
    intrinsicHostResolveAttempts = 0
    topAppBarScrollConsumer.resetExpandedChromeHeight()
    NativeNestedScrollRegistry.topBarStateChanged(this)
  }

  fun setTitle(title: String) = updateState { it.copy(title = title) }

  fun setVisibleState(visible: Boolean) = updateState { it.copy(visible = visible) }

  fun setVariant(variant: String) {
    val normalized = when (variant) {
      "small", "large" -> variant
      else -> "medium"
    }
    val changed = state.value.variant != normalized
    if (changed) {
      resetExpandedChromeGeometry()
    }
    updateState { it.copy(variant = normalized) }
    if (changed) {
      seedExpandedChromeGeometry()
    }
  }

  fun setScrollBehavior(behavior: String) = updateState {
    it.copy(
      scrollBehavior = when (behavior) {
        "enterAlways", "exitUntilCollapsed" -> behavior
        else -> "none"
      },
    )
  }

  fun setNavigationIcon(icon: String) = updateState {
    it.copy(navigationIcon = if (icon == "back") "back" else "none")
  }

  fun setNavigationAccessibilityLabel(label: String) = updateState {
    it.copy(navigationAccessibilityLabel = label.ifBlank { "Back" })
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

      val interopMode = if (!uiState.visible) {
        null
      } else {
        when (uiState.scrollBehavior) {
          "enterAlways" -> TopAppBarInteropMode.EnterAlways
          "exitUntilCollapsed" -> TopAppBarInteropMode.ExitUntilCollapsed
          else -> TopAppBarInteropMode.Pinned
        }
      }
      val materialScrollScope = rememberCoroutineScope()

      DisposableEffect(materialScrollBehavior, materialScrollScope, interopMode) {
        bindComposeScrollBehavior(materialScrollBehavior, materialScrollScope, interopMode)
        onDispose { unbindComposeScrollBehavior(materialScrollBehavior, interopMode) }
      }

      if (uiState.visible) {
        val navigationIcon: @Composable () -> Unit = {
          if (uiState.navigationIcon == "back") {
            IconButton(
              onClick = {
                if (BuildConfig.DEBUG) {
                  android.util.Log.d(NATIVE_SCROLL_LOG_TAG, "TOPAPPBAR_NAV_PRESS")
                }
                onNavigationPress(emptyMap<String, Any>())
              },
            ) {
              Icon(
                painter = painterResource(R.drawable.react_native_scroll_interop_arrow_back),
                contentDescription = uiState.navigationAccessibilityLabel,
              )
            }
          }
        }

        when (uiState.variant) {
          "small" -> TopAppBar(
            title = { Text(uiState.title) },
            navigationIcon = navigationIcon,
            scrollBehavior = materialScrollBehavior,
          )
          "large" -> LargeTopAppBar(
            title = { Text(uiState.title) },
            navigationIcon = navigationIcon,
            scrollBehavior = materialScrollBehavior,
          )
          else -> MediumTopAppBar(
            title = { Text(uiState.title) },
            navigationIcon = navigationIcon,
            scrollBehavior = materialScrollBehavior,
          )
        }
      }
    }
  }
}
