@file:OptIn(
  androidx.compose.foundation.layout.ExperimentalLayoutApi::class,
  androidx.compose.material3.ExperimentalMaterial3ExpressiveApi::class,
)

package com.reactnativescroll.interop.material3.ui

import android.content.Context
import android.os.Build
import android.util.Log
import android.view.View
import android.view.ViewGroup
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.FloatingToolbarDefaults
import androidx.compose.material3.FloatingToolbarExitDirection
import androidx.compose.material3.FloatingToolbarHorizontalFabPosition
import androidx.compose.material3.FloatingToolbarScrollBehavior
import androidx.compose.material3.FloatingToolbarVerticalFabPosition
import androidx.compose.material3.HorizontalFloatingToolbar
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.VerticalFloatingToolbar
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color as ComposeColor
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.facebook.react.bridge.Arguments
import com.reactnativescroll.interop.NATIVE_SCROLL_LOG_TAG
import com.reactnativescroll.interop.NativeScrollTracing
import com.reactnativescroll.interop.reactnative.emitDirectEvent
import kotlinx.coroutines.CoroutineScope

private data class ToolbarAction(
  val id: String,
  val presentation: String,
  val label: String,
  val enabled: Boolean,
  val accessibilityLabel: String?,
  val iconPresent: Boolean,
  val iconUri: String?,
  val iconTintable: Boolean,
  val iconSize: Float,
  val iconFallback: String,
  val selected: Boolean,
)

private data class ToolbarState(
  val content: List<ToolbarAction> = emptyList(),
  val leadingContent: List<ToolbarAction> = emptyList(),
  val trailingContent: List<ToolbarAction> = emptyList(),
  val visible: Boolean = true,
  val expanded: Boolean = true,
  val scrollBehavior: String = "none",
  val scrollExitDirection: String = "auto",
  val orientation: String = "horizontal",
  val variant: String = "standard",
  val fabPresent: Boolean = false,
  val fabPosition: String = "end",
  val fabIconUri: String? = null,
  val fabIconTintable: Boolean = true,
  val fabIconSize: Float = 24f,
  val fabIconFallback: String = "none",
  val fabAccessibilityLabel: String? = null,
  val fabShape: String = "default",
  val themeMode: String = "system",
  val dynamicColor: Boolean = false,
  val imeBehavior: String = "none",
  val alignment: String = "bottomCenter",
  val insets: String = "safe",
  val edgeOffsetDp: Float? = null,
  val contentPaddingStartDp: Float? = null,
  val contentPaddingTopDp: Float? = null,
  val contentPaddingEndDp: Float? = null,
  val contentPaddingBottomDp: Float? = null,
  val expandedShadowElevationDp: Float? = null,
  val collapsedShadowElevationDp: Float? = null,
  val toolbarContainerArgb: Int? = null,
  val toolbarContentArgb: Int? = null,
  val fabContainerArgb: Int? = null,
  val fabContentArgb: Int? = null,
  val selectedContainerArgb: Int? = null,
  val selectedContentArgb: Int? = null,
  val unselectedContentArgb: Int? = null,
)

class MaterialToolbarView(
  context: Context,
) : ComposeChromeHostView(context) {

  private val state = mutableStateOf(ToolbarState())
  private var nativeImeVisible = false

  private val floatingToolbarScrollConsumer = MaterialFloatingToolbarScrollConsumer(this, composeView)

  init {
    composeView.layoutParams = ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.WRAP_CONTENT,
      ViewGroup.LayoutParams.WRAP_CONTENT,
    )
    composeView.setContent {
      MaterialToolbarContent(state.value)
    }
  }

  override fun onNativeImeVisibilityChanged(visible: Boolean) {
    if (nativeImeVisible == visible) return
    nativeImeVisible = visible
    syncNativeVisibility("ime")
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    NativeNestedScrollRegistry.registerToolbar(this, floatingToolbarScrollConsumer)
    syncNativeVisibility("attach")
  }

  override fun onDetachedFromWindow() {
    NativeNestedScrollRegistry.unregisterToolbar(this)
    floatingToolbarScrollConsumer.onHostDetached()
    super.onDetachedFromWindow()
  }

  private fun bindComposeScrollBehavior(
    behavior: FloatingToolbarScrollBehavior?,
    scope: CoroutineScope?,
  ) {
    floatingToolbarScrollConsumer.bind(behavior, scope)
    NativeNestedScrollRegistry.toolbarStateChanged(this)
  }

  private fun unbindComposeScrollBehavior(behavior: FloatingToolbarScrollBehavior?) {
    floatingToolbarScrollConsumer.unbind(behavior)
    NativeNestedScrollRegistry.toolbarStateChanged(this)
  }

  private fun updateState(transform: (ToolbarState) -> ToolbarState) {
    state.value = transform(state.value)
    requestLayout()
    composeView.requestLayout()
  }

  private fun emitToolbarActionPress(id: String) {
    val payload = Arguments.createMap().apply { putString("id", id) }
    emitDirectEvent("toolbarActionPress", payload)
  }

  private fun syncNativeVisibility(reason: String) {
    val uiState = state.value
    val hiddenForIme = uiState.imeBehavior == "hide" && nativeImeVisible
    val shouldBeVisible = uiState.visible && !hiddenForIme
    val targetVisibility = if (shouldBeVisible) View.VISIBLE else View.INVISIBLE
    val changed = composeView.visibility != targetVisibility

    if (changed) composeView.visibility = targetVisibility

    composeView.requestLayout()
    requestLayout()

    if (NativeScrollTracing.enabled) {
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "TOOLBAR_VIS reason=$reason ime=$nativeImeVisible imeBehavior=${uiState.imeBehavior} " +
          "propVisible=${uiState.visible} target=${if (shouldBeVisible) "VISIBLE" else "INVISIBLE"} " +
          "changed=$changed measured=${composeView.measuredWidth}x${composeView.measuredHeight} " +
          "bounds=${composeView.left},${composeView.top},${composeView.right},${composeView.bottom}",
      )
    }
  }

  override fun onMeasureComposeChild(hostWidthPx: Int, hostHeightPx: Int) {
    composeView.measure(
      View.MeasureSpec.makeMeasureSpec(hostWidthPx, View.MeasureSpec.AT_MOST),
      View.MeasureSpec.makeMeasureSpec(hostHeightPx, View.MeasureSpec.AT_MOST),
    )
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val parentWidth = right - left
    val parentHeight = bottom - top
    val childWidth = composeView.measuredWidth.coerceAtMost(parentWidth)
    val childHeight = composeView.measuredHeight.coerceAtMost(parentHeight)
    val alignment = state.value.alignment

    val childLeft = when {
      alignment.endsWith("Start") -> 0
      alignment.endsWith("End") -> parentWidth - childWidth
      else -> (parentWidth - childWidth) / 2
    }.coerceAtLeast(0)

    val childTop = when {
      alignment.startsWith("top") -> 0
      alignment.startsWith("bottom") -> parentHeight - childHeight
      else -> (parentHeight - childHeight) / 2
    }.coerceAtLeast(0)

    composeView.layout(childLeft, childTop, childLeft + childWidth, childTop + childHeight)
    floatingToolbarScrollConsumer.syncGeometry()
    floatingToolbarScrollConsumer.applyCurrentOffset()
  }

  private fun recordsToActions(records: List<ToolbarActionRecord>): List<ToolbarAction> =
    records.mapNotNull { record ->
      if (record.id.isBlank()) {
        null
      } else {
        ToolbarAction(
          id = record.id,
          presentation = if (record.presentation == "text") "text" else "icon",
          label = record.label,
          enabled = record.enabled,
          accessibilityLabel = record.accessibilityLabel,
          iconPresent = record.iconPresent,
          iconUri = record.iconUri,
          iconTintable = record.iconTintable,
          iconSize = record.iconSize.toFloat().coerceIn(12f, 48f),
          iconFallback = if (record.iconFallback == "initial") "initial" else "none",
          selected = record.selected,
        )
      }
    }

  fun setContent(records: List<ToolbarActionRecord>) =
    updateState { it.copy(content = recordsToActions(records)) }

  fun setLeadingContent(records: List<ToolbarActionRecord>) =
    updateState { it.copy(leadingContent = recordsToActions(records)) }

  fun setTrailingContent(records: List<ToolbarActionRecord>) =
    updateState { it.copy(trailingContent = recordsToActions(records)) }

  fun setVisibleState(visible: Boolean) {
    updateState { it.copy(visible = visible) }
    syncNativeVisibility("prop-visible")
  }

  fun setExpanded(expanded: Boolean) = updateState { it.copy(expanded = expanded) }
  fun setScrollBehavior(behavior: String) = updateState {
    it.copy(scrollBehavior = if (behavior == "exitAlways") "exitAlways" else "none")
  }
  fun setScrollExitDirection(direction: String) = updateState {
    it.copy(
      scrollExitDirection = when (direction) {
        "top", "bottom", "start", "end" -> direction
        else -> "auto"
      }
    )
  }
  fun setOrientation(orientation: String) = updateState {
    it.copy(orientation = if (orientation == "vertical") "vertical" else "horizontal")
  }
  fun setVariant(variant: String) = updateState {
    it.copy(variant = if (variant == "vibrant") "vibrant" else "standard")
  }
  fun setFabPresent(present: Boolean) = updateState { it.copy(fabPresent = present) }
  fun setFabPosition(position: String) = updateState {
    it.copy(
      fabPosition = when (position) {
        "start", "top", "bottom" -> position
        else -> "end"
      }
    )
  }
  fun setFabIconUri(uri: String?) = updateState { it.copy(fabIconUri = uri) }
  fun setFabIconTintable(tintable: Boolean) = updateState { it.copy(fabIconTintable = tintable) }
  fun setFabIconSize(size: Float) = updateState { it.copy(fabIconSize = size.coerceIn(12f, 64f)) }
  fun setFabIconFallback(fallback: String) = updateState {
    it.copy(fabIconFallback = if (fallback == "initial") "initial" else "none")
  }
  fun setFabAccessibilityLabel(label: String?) =
    updateState { it.copy(fabAccessibilityLabel = label) }
  fun setFabShape(shape: String) = updateState {
    it.copy(fabShape = if (shape == "circle") "circle" else "default")
  }

  fun setThemeMode(mode: String) = updateState {
    it.copy(
      themeMode = when (mode) {
        "light", "dark" -> mode
        else -> "system"
      }
    )
  }
  fun setDynamicColor(dynamic: Boolean) = updateState { it.copy(dynamicColor = dynamic) }

  fun setImeBehavior(behavior: String) {
    updateState { it.copy(imeBehavior = if (behavior == "hide") "hide" else "none") }
    syncNativeVisibility("prop-ime")
  }

  fun setAlignment(alignment: String) = updateState {
    it.copy(
      alignment = when (alignment) {
        "topStart", "topCenter", "topEnd",
        "centerStart", "center", "centerEnd",
        "bottomStart", "bottomCenter", "bottomEnd" -> alignment
        else -> "bottomCenter"
      }
    )
  }
  fun setInsets(insets: String) = updateState {
    it.copy(insets = if (insets == "none") "none" else "safe")
  }
  fun setEdgeOffset(offset: Float?) = updateState {
    it.copy(edgeOffsetDp = offset?.coerceAtLeast(0f))
  }
  fun setContentPaddingStart(value: Float?) = updateState {
    it.copy(contentPaddingStartDp = value?.coerceAtLeast(0f))
  }
  fun setContentPaddingTop(value: Float?) = updateState {
    it.copy(contentPaddingTopDp = value?.coerceAtLeast(0f))
  }
  fun setContentPaddingEnd(value: Float?) = updateState {
    it.copy(contentPaddingEndDp = value?.coerceAtLeast(0f))
  }
  fun setContentPaddingBottom(value: Float?) = updateState {
    it.copy(contentPaddingBottomDp = value?.coerceAtLeast(0f))
  }
  fun setExpandedShadowElevation(value: Float?) = updateState {
    it.copy(expandedShadowElevationDp = value?.coerceAtLeast(0f))
  }
  fun setCollapsedShadowElevation(value: Float?) = updateState {
    it.copy(collapsedShadowElevationDp = value?.coerceAtLeast(0f))
  }
  fun setToolbarContainerColor(color: Int?) = updateState { it.copy(toolbarContainerArgb = color) }
  fun setToolbarContentColor(color: Int?) = updateState { it.copy(toolbarContentArgb = color) }
  fun setFabContainerColor(color: Int?) = updateState { it.copy(fabContainerArgb = color) }
  fun setFabContentColor(color: Int?) = updateState { it.copy(fabContentArgb = color) }
  fun setSelectedContainerColor(color: Int?) = updateState { it.copy(selectedContainerArgb = color) }
  fun setSelectedContentColor(color: Int?) = updateState { it.copy(selectedContentArgb = color) }
  fun setUnselectedContentColor(color: Int?) = updateState { it.copy(unselectedContentArgb = color) }

  @Composable
  private fun MaterialToolbarContent(uiState: ToolbarState) {
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
      val toolbarColors = if (uiState.variant == "vibrant") {
        FloatingToolbarDefaults.vibrantFloatingToolbarColors(
          toolbarContainerColor = uiState.toolbarContainerArgb.asComposeColorOrUnspecified(),
          toolbarContentColor = uiState.toolbarContentArgb.asComposeColorOrUnspecified(),
          fabContainerColor = uiState.fabContainerArgb.asComposeColorOrUnspecified(),
          fabContentColor = uiState.fabContentArgb.asComposeColorOrUnspecified(),
        )
      } else {
        FloatingToolbarDefaults.standardFloatingToolbarColors(
          toolbarContainerColor = uiState.toolbarContainerArgb.asComposeColorOrUnspecified(),
          toolbarContentColor = uiState.toolbarContentArgb.asComposeColorOrUnspecified(),
          fabContainerColor = uiState.fabContainerArgb.asComposeColorOrUnspecified(),
          fabContentColor = uiState.fabContentArgb.asComposeColorOrUnspecified(),
        )
      }

      val selectedContainerColor = uiState.selectedContainerArgb?.let { ComposeColor(it) }
        ?: MaterialTheme.colorScheme.secondaryContainer
      val selectedContentColor = uiState.selectedContentArgb?.let { ComposeColor(it) }
        ?: MaterialTheme.colorScheme.onSecondaryContainer
      val unselectedContentColor = uiState.unselectedContentArgb?.let { ComposeColor(it) }
        ?: toolbarColors.toolbarContentColor

      val layoutDirection = LocalLayoutDirection.current
      val defaultContentPadding = FloatingToolbarDefaults.ContentPadding
      val contentPadding = PaddingValues(
        start = uiState.contentPaddingStartDp?.dp
          ?: defaultContentPadding.calculateStartPadding(layoutDirection),
        top = uiState.contentPaddingTopDp?.dp ?: defaultContentPadding.calculateTopPadding(),
        end = uiState.contentPaddingEndDp?.dp
          ?: defaultContentPadding.calculateEndPadding(layoutDirection),
        bottom = uiState.contentPaddingBottomDp?.dp ?: defaultContentPadding.calculateBottomPadding(),
      )

      val safePadding = if (uiState.insets == "safe") {
        WindowInsets.safeDrawing.asPaddingValues()
      } else {
        PaddingValues(0.dp)
      }
      val materialScreenOffset = FloatingToolbarDefaults.ScreenOffset
      val edgeOffset = uiState.edgeOffsetDp?.dp ?: materialScreenOffset
      val hostPadding = uiState.hostPadding(
        safePadding = safePadding,
        layoutDirection = layoutDirection,
        edgeOffset = edgeOffset,
      )

      val materialScrollBehavior = if (uiState.scrollBehavior == "exitAlways") {
        FloatingToolbarDefaults.exitAlwaysScrollBehavior(
          exitDirection = uiState.resolvedScrollExitDirection(),
        )
      } else {
        null
      }
      val materialScrollScope = rememberCoroutineScope()
      DisposableEffect(materialScrollBehavior, materialScrollScope) {
        bindComposeScrollBehavior(materialScrollBehavior, materialScrollScope)
        onDispose { unbindComposeScrollBehavior(materialScrollBehavior) }
      }

      Box(modifier = Modifier.padding(hostPadding)) {
        FloatingToolbar(
          uiState = uiState,
          contentPadding = contentPadding,
          toolbarColors = toolbarColors,
          scrollBehavior = null,
          selectedContainerColor = selectedContainerColor,
          selectedContentColor = selectedContentColor,
          unselectedContentColor = unselectedContentColor,
        )
      }
    }
  }

  @Composable
  private fun FloatingToolbar(
    uiState: ToolbarState,
    contentPadding: PaddingValues,
    toolbarColors: androidx.compose.material3.FloatingToolbarColors,
    scrollBehavior: FloatingToolbarScrollBehavior?,
    selectedContainerColor: ComposeColor,
    selectedContentColor: ComposeColor,
    unselectedContentColor: ComposeColor,
  ) {
    val withFab = uiState.fabPresent
    val expandedElevation = uiState.expandedShadowElevationDp?.dp ?: if (withFab) {
      FloatingToolbarDefaults.ContainerExpandedElevationWithFab
    } else {
      FloatingToolbarDefaults.ContainerExpandedElevation
    }
    val collapsedElevation = uiState.collapsedShadowElevationDp?.dp ?: if (withFab) {
      FloatingToolbarDefaults.ContainerCollapsedElevationWithFab
    } else {
      FloatingToolbarDefaults.ContainerCollapsedElevation
    }

    if (uiState.orientation == "vertical") {
      if (withFab) {
        VerticalFloatingToolbar(
          expanded = uiState.expanded,
          floatingActionButton = { ToolbarFab(uiState, toolbarColors) },
          colors = toolbarColors,
          contentPadding = contentPadding,
          scrollBehavior = scrollBehavior,
          floatingActionButtonPosition = if (uiState.fabPosition == "top") {
            FloatingToolbarVerticalFabPosition.Top
          } else {
            FloatingToolbarVerticalFabPosition.Bottom
          },
          expandedShadowElevation = expandedElevation,
          collapsedShadowElevation = collapsedElevation,
        ) {
          ToolbarActions(uiState.content, selectedContainerColor, selectedContentColor, unselectedContentColor)
        }
      } else {
        VerticalFloatingToolbar(
          expanded = uiState.expanded,
          colors = toolbarColors,
          contentPadding = contentPadding,
          scrollBehavior = scrollBehavior,
          leadingContent = if (uiState.leadingContent.isEmpty()) null else {
            { ToolbarActions(uiState.leadingContent, selectedContainerColor, selectedContentColor, unselectedContentColor) }
          },
          trailingContent = if (uiState.trailingContent.isEmpty()) null else {
            { ToolbarActions(uiState.trailingContent, selectedContainerColor, selectedContentColor, unselectedContentColor) }
          },
          expandedShadowElevation = expandedElevation,
          collapsedShadowElevation = collapsedElevation,
        ) {
          ToolbarActions(uiState.content, selectedContainerColor, selectedContentColor, unselectedContentColor)
        }
      }
    } else {
      if (withFab) {
        HorizontalFloatingToolbar(
          expanded = uiState.expanded,
          floatingActionButton = { ToolbarFab(uiState, toolbarColors) },
          colors = toolbarColors,
          contentPadding = contentPadding,
          scrollBehavior = scrollBehavior,
          floatingActionButtonPosition = if (uiState.fabPosition == "start") {
            FloatingToolbarHorizontalFabPosition.Start
          } else {
            FloatingToolbarHorizontalFabPosition.End
          },
          expandedShadowElevation = expandedElevation,
          collapsedShadowElevation = collapsedElevation,
        ) {
          ToolbarActions(uiState.content, selectedContainerColor, selectedContentColor, unselectedContentColor)
        }
      } else {
        HorizontalFloatingToolbar(
          expanded = uiState.expanded,
          colors = toolbarColors,
          contentPadding = contentPadding,
          scrollBehavior = scrollBehavior,
          leadingContent = if (uiState.leadingContent.isEmpty()) null else {
            { ToolbarActions(uiState.leadingContent, selectedContainerColor, selectedContentColor, unselectedContentColor) }
          },
          trailingContent = if (uiState.trailingContent.isEmpty()) null else {
            { ToolbarActions(uiState.trailingContent, selectedContainerColor, selectedContentColor, unselectedContentColor) }
          },
          expandedShadowElevation = expandedElevation,
          collapsedShadowElevation = collapsedElevation,
        ) {
          ToolbarActions(uiState.content, selectedContainerColor, selectedContentColor, unselectedContentColor)
        }
      }
    }
  }

  @Composable
  private fun ToolbarActions(
    actions: List<ToolbarAction>,
    selectedContainerColor: ComposeColor,
    selectedContentColor: ComposeColor,
    unselectedContentColor: ComposeColor,
  ) {
    actions.forEach { action ->
      ToolbarAction(
        action = action,
        selectedContainerColor = selectedContainerColor,
        selectedContentColor = selectedContentColor,
        unselectedContentColor = unselectedContentColor,
      )
    }
  }

  @Composable
  private fun ToolbarAction(
    action: ToolbarAction,
    selectedContainerColor: ComposeColor,
    selectedContentColor: ComposeColor,
    unselectedContentColor: ComposeColor,
  ) {
    val accessibilityModifier = if (action.accessibilityLabel.isNullOrBlank()) {
      Modifier
    } else {
      Modifier.semantics { contentDescription = action.accessibilityLabel }
    }
    val actionContentColor = animateColorAsState(
      targetValue = if (action.selected) selectedContentColor else unselectedContentColor,
    ).value
    val indicatorColor = animateColorAsState(
      targetValue = if (action.selected) selectedContainerColor else ComposeColor.Transparent,
    ).value

    if (action.presentation == "text") {
      TextButton(
        onClick = { emitToolbarActionPress(action.id) },
        enabled = action.enabled,
        modifier = accessibilityModifier,
        colors = ButtonDefaults.textButtonColors(
          containerColor = indicatorColor,
          contentColor = actionContentColor,
          disabledContainerColor = if (action.selected) indicatorColor.copy(alpha = 0.38f) else ComposeColor.Transparent,
          disabledContentColor = actionContentColor.copy(alpha = 0.38f),
        ),
      ) {
        if (action.iconPresent) {
          ToolbarImage(
            uri = action.iconUri,
            fallbackLabel = action.label,
            fallback = action.iconFallback,
            tintable = action.iconTintable,
            tint = actionContentColor,
            size = action.iconSize,
          )
          if (action.label.isNotBlank()) {
            Spacer(modifier = Modifier.width(ButtonDefaults.IconSpacing))
          }
        }
        if (action.label.isNotBlank()) Text(action.label)
      }
    } else {
      IconButton(
        onClick = { emitToolbarActionPress(action.id) },
        enabled = action.enabled,
        modifier = accessibilityModifier.background(indicatorColor, CircleShape),
      ) {
        ToolbarImage(
          uri = action.iconUri,
          fallbackLabel = action.label,
          fallback = action.iconFallback,
          tintable = action.iconTintable,
          tint = actionContentColor,
          size = action.iconSize,
        )
      }
    }
  }

  @Composable
  private fun ToolbarFab(
    uiState: ToolbarState,
    toolbarColors: androidx.compose.material3.FloatingToolbarColors,
  ) {
    val modifier = if (uiState.fabAccessibilityLabel.isNullOrBlank()) {
      Modifier
    } else {
      Modifier.semantics { contentDescription = uiState.fabAccessibilityLabel }
    }

    val content: @Composable () -> Unit = {
      ToolbarImage(
        uri = uiState.fabIconUri,
        fallbackLabel = "+",
        fallback = uiState.fabIconFallback,
        tintable = uiState.fabIconTintable,
        tint = toolbarColors.fabContentColor,
        size = uiState.fabIconSize,
      )
    }

    if (uiState.variant == "vibrant") {
      FloatingToolbarDefaults.VibrantFloatingActionButton(
        onClick = { emitDirectEvent("toolbarFabPress") },
        modifier = modifier,
        shape = if (uiState.fabShape == "circle") CircleShape else FloatingActionButtonDefaults.shape,
        containerColor = toolbarColors.fabContainerColor,
        contentColor = toolbarColors.fabContentColor,
        content = content,
      )
    } else {
      FloatingToolbarDefaults.StandardFloatingActionButton(
        onClick = { emitDirectEvent("toolbarFabPress") },
        modifier = modifier,
        shape = if (uiState.fabShape == "circle") CircleShape else FloatingActionButtonDefaults.shape,
        containerColor = toolbarColors.fabContainerColor,
        contentColor = toolbarColors.fabContentColor,
        content = content,
      )
    }
  }

  @Composable
  private fun ToolbarImage(
    uri: String?,
    fallbackLabel: String,
    fallback: String,
    tintable: Boolean,
    tint: ComposeColor,
    size: Float,
  ) {
    if (uri == null) {
      if (fallback == "initial" && fallbackLabel.isNotBlank()) {
        Text(text = fallbackLabel.take(1).uppercase(), color = tint)
      }
      return
    }

    val context = LocalContext.current
    val resourceId = remember(uri, context.packageName) {
      if (!uri.contains("://") && !uri.startsWith("/") && !uri.startsWith("asset:/")) {
        val resourceName = uri.substringBeforeLast('.')
        val drawableId = context.resources.getIdentifier(resourceName, "drawable", context.packageName)
        if (drawableId != 0) drawableId else context.resources.getIdentifier(resourceName, "mipmap", context.packageName)
      } else {
        0
      }
    }

    if (resourceId != 0) {
      val painter = painterResource(resourceId)
      if (tintable) {
        Icon(
          painter = painter,
          contentDescription = null,
          modifier = Modifier.size(size.dp),
          tint = tint,
        )
      } else {
        Image(
          painter = painter,
          contentDescription = null,
          modifier = Modifier.size(size.dp),
          contentScale = ContentScale.Fit,
        )
      }
      return
    }

    val model = remember(uri) {
      if (uri.startsWith("asset:/")) {
        "file:///android_asset/${uri.removePrefix("asset:/")}"
      } else {
        uri
      }
    }

    AsyncImage(
      model = model,
      contentDescription = null,
      modifier = Modifier.size(size.dp),
      contentScale = ContentScale.Fit,
      colorFilter = if (tintable) ColorFilter.tint(tint) else null,
    )
  }
}

private fun ToolbarState.resolvedScrollExitDirection(): FloatingToolbarExitDirection =
  when (scrollExitDirection) {
    "top" -> FloatingToolbarExitDirection.Top
    "bottom" -> FloatingToolbarExitDirection.Bottom
    "start" -> FloatingToolbarExitDirection.Start
    "end" -> FloatingToolbarExitDirection.End
    else -> when {
      alignment.startsWith("top") -> FloatingToolbarExitDirection.Top
      alignment.startsWith("bottom") -> FloatingToolbarExitDirection.Bottom
      alignment.endsWith("Start") -> FloatingToolbarExitDirection.Start
      alignment.endsWith("End") -> FloatingToolbarExitDirection.End
      orientation == "vertical" -> FloatingToolbarExitDirection.End
      else -> FloatingToolbarExitDirection.Bottom
    }
  }

private fun ToolbarState.hostPadding(
  safePadding: PaddingValues,
  layoutDirection: androidx.compose.ui.unit.LayoutDirection,
  edgeOffset: androidx.compose.ui.unit.Dp,
): PaddingValues {
  val safeStart = safePadding.calculateStartPadding(layoutDirection)
  val safeEnd = safePadding.calculateEndPadding(layoutDirection)
  val safeTop = safePadding.calculateTopPadding()
  val safeBottom = safePadding.calculateBottomPadding()

  val addTop = alignment.startsWith("top")
  val addBottom = alignment.startsWith("bottom")
  val addStart = alignment.endsWith("Start")
  val addEnd = alignment.endsWith("End")

  return PaddingValues(
    start = if (addStart) safeStart + edgeOffset else 0.dp,
    top = if (addTop) safeTop + edgeOffset else 0.dp,
    end = if (addEnd) safeEnd + edgeOffset else 0.dp,
    bottom = if (addBottom) safeBottom + edgeOffset else 0.dp,
  )
}

private fun Int?.asComposeColorOrUnspecified(): ComposeColor =
  this?.let { ComposeColor(it) } ?: ComposeColor.Unspecified
