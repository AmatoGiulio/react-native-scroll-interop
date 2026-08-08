@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package expo.modules.materialtoolbar

import android.content.Context
import android.os.Build
import android.view.View
import android.view.ViewGroup
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.facebook.react.uimanager.PointerEvents
import com.facebook.react.uimanager.ReactPointerEventsView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import kotlinx.coroutines.CoroutineScope

private data class TopAppBarHostState(
  val title: String = "",
  val visible: Boolean = true,
  val variant: String = "medium",
  val scrollBehavior: String = "none",
  val themeMode: String = "system",
  val dynamicColor: Boolean = false,
)

private data class TopAppBarRootInsets(
  val left: Int = 0,
  val top: Int = 0,
  val right: Int = 0,
)

/**
 * Minimal second Material3 consumer used to prove that native RN scroll interop is not specific to
 * FloatingToolbar. The outer Expo view is a full-screen BOX_NONE overlay; only the wrap-content,
 * full-width Compose app bar participates in Android hit testing.
 */
class ExpoMaterialTopAppBarView(
  context: Context,
  appContext: AppContext,
) : ExpoView(context, appContext), ReactPointerEventsView {

  override val pointerEvents: PointerEvents
    get() = PointerEvents.BOX_NONE

  private val state = mutableStateOf(TopAppBarHostState())
  private val rootInsets = mutableStateOf(TopAppBarRootInsets())

  private val composeView = ComposeView(context).apply {
    setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
    layoutParams = ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT,
    )
    setContent {
      MaterialTopAppBarContent(state.value, rootInsets.value)
    }
  }

  private val topAppBarScrollConsumer = TopAppBarScrollConsumer()
  private val nativeScrollCoordinator = ReactNativeScrollCoordinator(this, topAppBarScrollConsumer)

  init {
    isClickable = false
    isFocusable = false
    addView(composeView)

    // React Native / Expo can consume window insets before they reach the embedded ComposeView.
    // Observe the Android root window instead, then pass those physical insets explicitly to the
    // Material3 app bar. Returning the incoming object unchanged keeps this observer non-consuming.
    ViewCompat.setOnApplyWindowInsetsListener(this) { _, insets ->
      refreshRootInsets(insets)
      insets
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    nativeScrollCoordinator.attach()
    ViewCompat.requestApplyInsets(this)
    post { refreshRootInsets() }
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

  private fun refreshRootInsets(fallback: WindowInsetsCompat? = null) {
    if (!isAttachedToWindow && fallback == null) return

    val insets = ViewCompat.getRootWindowInsets(rootView) ?: fallback ?: return
    val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
    val displayCutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
    val next = TopAppBarRootInsets(
      left = maxOf(systemBars.left, displayCutout.left),
      top = maxOf(systemBars.top, displayCutout.top),
      right = maxOf(systemBars.right, displayCutout.right),
    )
    if (rootInsets.value == next) return

    rootInsets.value = next
    // The expanded host height includes these explicit insets. Reset the cached maximum so a
    // rotation, cutout change, or edge-to-edge transition can grow or shrink the scroll-away range.
    topAppBarScrollConsumer.resetExpandedChromeHeight()
    requestLayout()
    composeView.requestLayout()

    if (BuildConfig.DEBUG) {
      android.util.Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "topappbar rootInsets left=${next.left} top=${next.top} right=${next.right}",
      )
    }
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val width = View.MeasureSpec.getSize(widthMeasureSpec)
    val height = View.MeasureSpec.getSize(heightMeasureSpec)
    setMeasuredDimension(width, height)

    composeView.measure(
      View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
      View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.AT_MOST),
    )
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    refreshRootInsets()
    val parentWidth = right - left
    val parentHeight = bottom - top
    val childHeight = composeView.measuredHeight.coerceAtMost(parentHeight)
    composeView.layout(0, 0, parentWidth, childHeight)
    if (topAppBarScrollConsumer.updateExpandedChromeHeight(childHeight)) {
      nativeScrollCoordinator.discoverSources()
    }
  }

  fun setTitle(title: String) = updateState { it.copy(title = title) }

  fun setVisibleState(visible: Boolean) = updateState { it.copy(visible = visible) }

  fun setVariant(variant: String) {
    val normalized = when (variant) {
      "small", "large" -> variant
      else -> "medium"
    }
    if (state.value.variant != normalized) {
      topAppBarScrollConsumer.resetExpandedChromeHeight()
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
  private fun MaterialTopAppBarContent(
    uiState: TopAppBarHostState,
    visualInsets: TopAppBarRootInsets,
  ) {
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
      // Material3 defaults to systemBars.union(displayCutout), but an embedded ComposeView under a
      // React Native root may observe those insets as already consumed. Recreate the same physical
      // visual-component inset contract from the Android root window in pixels.
      val appBarWindowInsets = WindowInsets(
        left = visualInsets.left,
        top = visualInsets.top,
        right = visualInsets.right,
        bottom = 0,
      )

      val materialScrollBehavior = if (uiState.visible) {
        when (uiState.scrollBehavior) {
          "enterAlways" -> TopAppBarDefaults.enterAlwaysScrollBehavior()
          "exitUntilCollapsed" -> TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
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
            windowInsets = appBarWindowInsets,
            scrollBehavior = materialScrollBehavior,
          )
          "large" -> LargeTopAppBar(
            title = { Text(uiState.title) },
            windowInsets = appBarWindowInsets,
            scrollBehavior = materialScrollBehavior,
          )
          else -> MediumTopAppBar(
            title = { Text(uiState.title) },
            windowInsets = appBarWindowInsets,
            scrollBehavior = materialScrollBehavior,
          )
        }
      }
    }
  }
}
