@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package expo.modules.materialtoolbar

import android.content.Context
import android.os.Build
import android.view.View
import android.view.ViewGroup
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.core.graphics.Insets
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
  private val chromeInsetsPx = mutableStateOf(Insets.NONE)

  // Android/Compose interop invariant: once the expanded Material geometry has been measured, the
  // Compose surface itself stays that size. The TopAppBar is free to collapse *inside* this fixed
  // surface. This prevents a child-size animation from repeatedly resizing the Android ComposeView
  // through the React Native/Fabric hierarchy.
  private val pinnedSurfaceHeightPx = mutableIntStateOf(0)
  private val geometryGeneration = mutableIntStateOf(0)

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

  /**
   * Capture the real root-window system/cutout insets without consuming them.
   *
   * The Expo/RN host is not a normal all-Compose hierarchy, so depending on the ComposeView to
   * reconstruct the same insets from inherited dispatch is fragile. Keep Android's root window as
   * the source of truth and pass fixed Compose WindowInsets explicitly to every Material app bar.
   * This replaces (rather than adds to) TopAppBarDefaults.windowInsets, so double application is
   * impossible. React code never needs safe-area padding or Material height constants.
   */
  override fun onApplyWindowInsets(insets: android.view.WindowInsets): android.view.WindowInsets {
    updateChromeInsets(WindowInsetsCompat.toWindowInsetsCompat(insets, this))
    return super.onApplyWindowInsets(insets)
  }

  private fun updateChromeInsets(insets: WindowInsetsCompat?) {
    insets ?: return
    val system = insets.getInsets(
      WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
    )
    val resolved = Insets.of(system.left, system.top, system.right, 0)
    if (resolved == chromeInsetsPx.value) return

    chromeInsetsPx.value = resolved
    resetExpandedChromeGeometry()
    scheduleHostMeasureAndLayout()
    composeView.requestLayout()

    if (BuildConfig.DEBUG) {
      android.util.Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "topappbar hostInsets left=${resolved.left} top=${resolved.top} right=${resolved.right}",
      )
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()

    // If this overlay mounts after the Activity already completed its first inset pass, read the
    // settled root insets immediately so the first visible small-app-bar frame is not measured at 0.
    updateChromeInsets(ViewCompat.getRootWindowInsets(this))
    ViewCompat.requestApplyInsets(this)

    // The registry is how a nested-scroll host on this surface finds this app bar. There is no
    // other transport: no host, no chrome movement.
    NativeNestedScrollRegistry.registerTopBar(this, topAppBarScrollConsumer)
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
    composeView.requestLayout()
  }

  // First pass: let Material report its real expanded height (variant + explicit window inset).
  // Once observed, measure the Android ComposeView at that exact height forever for this geometry
  // generation. The TopAppBar then collapses only inside the fixed Compose surface.
  override fun onMeasureComposeChild(hostWidthPx: Int, hostHeightPx: Int) {
    val pinnedHeight = pinnedSurfaceHeightPx.intValue.coerceAtMost(hostHeightPx)
    val heightSpec = if (pinnedHeight > 0) {
      View.MeasureSpec.makeMeasureSpec(pinnedHeight, View.MeasureSpec.EXACTLY)
    } else {
      View.MeasureSpec.makeMeasureSpec(hostHeightPx, View.MeasureSpec.AT_MOST)
    }
    composeView.measure(
      View.MeasureSpec.makeMeasureSpec(hostWidthPx, View.MeasureSpec.EXACTLY),
      heightSpec,
    )
  }

  /**
   * Pin the Android Compose surface to the first expanded Material measure for this geometry.
   *
   * Material3 intentionally changes the TopAppBar layout height from `heightOffset`; if that
   * changing root height is allowed to resize the Android ComposeView, Compose must request Android
   * layout every frame. That request crosses a React Native/Fabric parent that owns layout from Yoga
   * and can arrive several frames late during a fast fling, producing the observed frozen header or
   * temporary blank band.
   *
   * The fixed Compose root below makes the collapsing app bar an *inner* layout change. Compose can
   * then remeasure it during its own draw pass while this Android child's bounds stay immutable.
   */
  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val parentWidth = right - left
    val parentHeight = bottom - top

    if (pinnedSurfaceHeightPx.intValue <= 0 && composeView.measuredHeight > 0) {
      pinnedSurfaceHeightPx.intValue = composeView.measuredHeight.coerceAtMost(parentHeight)
      if (BuildConfig.DEBUG) {
        android.util.Log.d(
          NATIVE_SCROLL_LOG_TAG,
          "topappbar pinSurface height=${pinnedSurfaceHeightPx.intValue} generation=${geometryGeneration.intValue}",
        )
      }
    }

    val childHeight = (pinnedSurfaceHeightPx.intValue.takeIf { it > 0 }
      ?: composeView.measuredHeight).coerceAtMost(parentHeight)
    composeView.layout(0, 0, parentWidth, childHeight)

    if (topAppBarScrollConsumer.updateExpandedChromeHeight(childHeight)) {
      NativeNestedScrollRegistry.topBarStateChanged(this)
    }
  }

  /** Called only when the expanded app-bar geometry can legitimately change. */
  private fun resetExpandedChromeGeometry() {
    pinnedSurfaceHeightPx.intValue = 0
    geometryGeneration.intValue += 1
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

    val geometryKey = geometryGeneration.intValue
    key(geometryKey) {
      MaterialTheme(colorScheme = colorScheme) {
        val hostInsets = chromeInsetsPx.value
        val appBarWindowInsets = remember(hostInsets) {
          WindowInsets(
            left = hostInsets.left,
            top = hostInsets.top,
            right = hostInsets.right,
            bottom = 0,
          )
        }

        // The state and the canScroll lambda must be stable. Material remembers the behavior keyed
        // on these identities. The geometry key deliberately recreates them only when variant or
        // real window insets changed, guaranteeing that the first measure of a new geometry is the
        // fully-expanded state we can safely pin.
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
        // A hidden app bar owns nothing, so it must not inset the content either.
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
          val appBar: @Composable () -> Unit = {
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

          val pinnedHeight = pinnedSurfaceHeightPx.intValue
          if (pinnedHeight > 0) {
            val density = LocalDensity.current
            Box(
              modifier = Modifier
                .fillMaxWidth()
                .height(with(density) { pinnedHeight.toDp() }),
            ) {
              appBar()
            }
          } else {
            appBar()
          }
        }
      }
    }
  }
}
