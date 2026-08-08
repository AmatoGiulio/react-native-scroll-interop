package com.materialtoolbar.rn

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.annotations.ReactProp
import com.materialtoolbar.views.MaterialToolbarHostView
import com.materialtoolbar.views.ToolbarActionSpec

/**
 * Bare React Native binding for the Material 3 floating toolbar.
 *
 * Autolinked through `react-native.config.js` and [MaterialToolbarPackage]. It exposes exactly the
 * same props as the Expo binding because both drive the same [MaterialToolbarHostView]; if the two
 * ever diverge, that is a bug in one of the bindings, not a feature difference.
 */
class MaterialToolbarViewManager : SimpleViewManager<MaterialToolbarHostView>() {

  override fun getName(): String = NAME

  override fun createViewInstance(reactContext: ThemedReactContext): MaterialToolbarHostView =
    MaterialToolbarHostView(reactContext).apply {
      onActionPress = { id -> dispatch(reactContext, this, ACTION_PRESS_EVENT, id) }
      onFabPress = { dispatch(reactContext, this, FAB_PRESS_EVENT, null) }
    }

  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> = mapOf(
    ACTION_PRESS_EVENT to mapOf("registrationName" to "onActionPress"),
    FAB_PRESS_EVENT to mapOf("registrationName" to "onFabPress"),
  )

  private fun dispatch(
    reactContext: ThemedReactContext,
    view: MaterialToolbarHostView,
    eventName: String,
    actionId: String?,
  ) {
    val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, view.id) ?: return
    val surfaceId = UIManagerHelper.getSurfaceId(view)
    dispatcher.dispatchEvent(MaterialToolbarEvent(surfaceId, view.id, eventName, actionId))
  }

  @ReactProp(name = "content")
  fun setContent(view: MaterialToolbarHostView, value: ReadableArray?) =
    view.setContent(value.toActionSpecs())

  @ReactProp(name = "leadingContent")
  fun setLeadingContent(view: MaterialToolbarHostView, value: ReadableArray?) =
    view.setLeadingContent(value.toActionSpecs())

  @ReactProp(name = "trailingContent")
  fun setTrailingContent(view: MaterialToolbarHostView, value: ReadableArray?) =
    view.setTrailingContent(value.toActionSpecs())

  @ReactProp(name = "visible")
  fun setVisible(view: MaterialToolbarHostView, value: Boolean) = view.setVisibleState(value)

  @ReactProp(name = "expanded")
  fun setExpanded(view: MaterialToolbarHostView, value: Boolean) = view.setExpanded(value)

  @ReactProp(name = "scrollBehavior")
  fun setScrollBehavior(view: MaterialToolbarHostView, value: String?) =
    view.setScrollBehavior(value ?: "none")

  @ReactProp(name = "scrollExitDirection")
  fun setScrollExitDirection(view: MaterialToolbarHostView, value: String?) =
    view.setScrollExitDirection(value ?: "auto")

  @ReactProp(name = "orientation")
  fun setOrientation(view: MaterialToolbarHostView, value: String?) =
    view.setOrientation(value ?: "horizontal")

  @ReactProp(name = "variant")
  fun setVariant(view: MaterialToolbarHostView, value: String?) =
    view.setVariant(value ?: "standard")

  @ReactProp(name = "fabPresent")
  fun setFabPresent(view: MaterialToolbarHostView, value: Boolean) = view.setFabPresent(value)

  @ReactProp(name = "fabPosition")
  fun setFabPosition(view: MaterialToolbarHostView, value: String?) =
    view.setFabPosition(value ?: "end")

  @ReactProp(name = "fabIconUri")
  fun setFabIconUri(view: MaterialToolbarHostView, value: String?) = view.setFabIconUri(value)

  @ReactProp(name = "fabIconTintable")
  fun setFabIconTintable(view: MaterialToolbarHostView, value: Boolean) =
    view.setFabIconTintable(value)

  @ReactProp(name = "fabIconSize", defaultFloat = 24f)
  fun setFabIconSize(view: MaterialToolbarHostView, value: Float) = view.setFabIconSize(value)

  @ReactProp(name = "fabIconFallback")
  fun setFabIconFallback(view: MaterialToolbarHostView, value: String?) =
    view.setFabIconFallback(value ?: "none")

  @ReactProp(name = "fabAccessibilityLabel")
  fun setFabAccessibilityLabel(view: MaterialToolbarHostView, value: String?) =
    view.setFabAccessibilityLabel(value)

  @ReactProp(name = "fabShape")
  fun setFabShape(view: MaterialToolbarHostView, value: String?) =
    view.setFabShape(value ?: "default")

  @ReactProp(name = "themeMode")
  fun setThemeMode(view: MaterialToolbarHostView, value: String?) =
    view.setThemeMode(value ?: "system")

  @ReactProp(name = "dynamicColor")
  fun setDynamicColor(view: MaterialToolbarHostView, value: Boolean) = view.setDynamicColor(value)

  @ReactProp(name = "imeBehavior")
  fun setImeBehavior(view: MaterialToolbarHostView, value: String?) =
    view.setImeBehavior(value ?: "none")

  @ReactProp(name = "alignment")
  fun setAlignment(view: MaterialToolbarHostView, value: String?) =
    view.setAlignment(value ?: "bottomCenter")

  @ReactProp(name = "insets")
  fun setInsets(view: MaterialToolbarHostView, value: String?) = view.setInsets(value ?: "safe")

  @ReactProp(name = "edgeOffset")
  fun setEdgeOffset(view: MaterialToolbarHostView, value: Float?) = view.setEdgeOffset(value)

  @ReactProp(name = "contentPaddingStart")
  fun setContentPaddingStart(view: MaterialToolbarHostView, value: Float?) =
    view.setContentPaddingStart(value)

  @ReactProp(name = "contentPaddingTop")
  fun setContentPaddingTop(view: MaterialToolbarHostView, value: Float?) =
    view.setContentPaddingTop(value)

  @ReactProp(name = "contentPaddingEnd")
  fun setContentPaddingEnd(view: MaterialToolbarHostView, value: Float?) =
    view.setContentPaddingEnd(value)

  @ReactProp(name = "contentPaddingBottom")
  fun setContentPaddingBottom(view: MaterialToolbarHostView, value: Float?) =
    view.setContentPaddingBottom(value)

  @ReactProp(name = "expandedShadowElevation")
  fun setExpandedShadowElevation(view: MaterialToolbarHostView, value: Float?) =
    view.setExpandedShadowElevation(value)

  @ReactProp(name = "collapsedShadowElevation")
  fun setCollapsedShadowElevation(view: MaterialToolbarHostView, value: Float?) =
    view.setCollapsedShadowElevation(value)

  @ReactProp(name = "toolbarContainerColor", customType = "Color")
  fun setToolbarContainerColor(view: MaterialToolbarHostView, value: Int?) =
    view.setToolbarContainerColor(value)

  @ReactProp(name = "toolbarContentColor", customType = "Color")
  fun setToolbarContentColor(view: MaterialToolbarHostView, value: Int?) =
    view.setToolbarContentColor(value)

  @ReactProp(name = "fabContainerColor", customType = "Color")
  fun setFabContainerColor(view: MaterialToolbarHostView, value: Int?) =
    view.setFabContainerColor(value)

  @ReactProp(name = "fabContentColor", customType = "Color")
  fun setFabContentColor(view: MaterialToolbarHostView, value: Int?) =
    view.setFabContentColor(value)

  @ReactProp(name = "selectedContainerColor", customType = "Color")
  fun setSelectedContainerColor(view: MaterialToolbarHostView, value: Int?) =
    view.setSelectedContainerColor(value)

  @ReactProp(name = "selectedContentColor", customType = "Color")
  fun setSelectedContentColor(view: MaterialToolbarHostView, value: Int?) =
    view.setSelectedContentColor(value)

  @ReactProp(name = "unselectedContentColor", customType = "Color")
  fun setUnselectedContentColor(view: MaterialToolbarHostView, value: Int?) =
    view.setUnselectedContentColor(value)

  private companion object {
    const val NAME = "MaterialToolbarView"
  }
}

private fun ReadableArray?.toActionSpecs(): List<ToolbarActionSpec> {
  if (this == null) return emptyList()
  val result = ArrayList<ToolbarActionSpec>(size())
  for (index in 0 until size()) {
    val map = getMap(index) ?: continue
    result += ToolbarActionSpec(
      id = if (map.hasKey("id")) map.getString("id").orEmpty() else "",
      presentation = if (map.hasKey("presentation")) map.getString("presentation") ?: "icon" else "icon",
      label = if (map.hasKey("label")) map.getString("label").orEmpty() else "",
      enabled = !map.hasKey("enabled") || map.getBoolean("enabled"),
      accessibilityLabel = if (map.hasKey("accessibilityLabel")) map.getString("accessibilityLabel") else null,
      iconPresent = map.hasKey("iconPresent") && map.getBoolean("iconPresent"),
      iconUri = if (map.hasKey("iconUri")) map.getString("iconUri") else null,
      iconTintable = !map.hasKey("iconTintable") || map.getBoolean("iconTintable"),
      iconSize = if (map.hasKey("iconSize")) map.getDouble("iconSize") else 24.0,
      iconFallback = if (map.hasKey("iconFallback")) map.getString("iconFallback") ?: "none" else "none",
      selected = map.hasKey("selected") && map.getBoolean("selected"),
    )
  }
  return result
}
