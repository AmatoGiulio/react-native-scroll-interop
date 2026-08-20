package com.reactnativescroll.interop.material3.ui

import com.facebook.react.bridge.Dynamic
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

internal class MaterialToolbarManager : SimpleViewManager<MaterialToolbarView>() {
  override fun getName(): String = "RNSIMaterialToolbar"

  override fun createViewInstance(
    reactContext: ThemedReactContext,
  ): MaterialToolbarView = MaterialToolbarView(reactContext)

  @ReactProp(name = "content")
  fun setContent(view: MaterialToolbarView, value: ReadableArray?) =
    view.setContent(value.toToolbarActionRecords())

  @ReactProp(name = "leadingContent")
  fun setLeadingContent(view: MaterialToolbarView, value: ReadableArray?) =
    view.setLeadingContent(value.toToolbarActionRecords())

  @ReactProp(name = "trailingContent")
  fun setTrailingContent(view: MaterialToolbarView, value: ReadableArray?) =
    view.setTrailingContent(value.toToolbarActionRecords())

  @ReactProp(name = "visible", defaultBoolean = true)
  fun setVisible(view: MaterialToolbarView, value: Boolean) = view.setVisibleState(value)

  @ReactProp(name = "expanded", defaultBoolean = true)
  fun setExpanded(view: MaterialToolbarView, value: Boolean) = view.setExpanded(value)

  @ReactProp(name = "scrollBehavior")
  fun setScrollBehavior(view: MaterialToolbarView, value: String?) =
    view.setScrollBehavior(value ?: "none")

  @ReactProp(name = "scrollExitDirection")
  fun setScrollExitDirection(view: MaterialToolbarView, value: String?) =
    view.setScrollExitDirection(value ?: "auto")

  @ReactProp(name = "orientation")
  fun setOrientation(view: MaterialToolbarView, value: String?) =
    view.setOrientation(value ?: "horizontal")

  @ReactProp(name = "variant")
  fun setVariant(view: MaterialToolbarView, value: String?) =
    view.setVariant(value ?: "standard")

  @ReactProp(name = "fabPresent", defaultBoolean = false)
  fun setFabPresent(view: MaterialToolbarView, value: Boolean) = view.setFabPresent(value)

  @ReactProp(name = "fabPosition")
  fun setFabPosition(view: MaterialToolbarView, value: String?) =
    view.setFabPosition(value ?: "end")

  @ReactProp(name = "fabIconUri")
  fun setFabIconUri(view: MaterialToolbarView, value: String?) = view.setFabIconUri(value)

  @ReactProp(name = "fabIconTintable", defaultBoolean = true)
  fun setFabIconTintable(view: MaterialToolbarView, value: Boolean) =
    view.setFabIconTintable(value)

  @ReactProp(name = "fabIconSize", defaultDouble = 24.0)
  fun setFabIconSize(view: MaterialToolbarView, value: Double) =
    view.setFabIconSize(value.toFloat())

  @ReactProp(name = "fabIconFallback")
  fun setFabIconFallback(view: MaterialToolbarView, value: String?) =
    view.setFabIconFallback(value ?: "none")

  @ReactProp(name = "fabAccessibilityLabel")
  fun setFabAccessibilityLabel(view: MaterialToolbarView, value: String?) =
    view.setFabAccessibilityLabel(value)

  @ReactProp(name = "fabShape")
  fun setFabShape(view: MaterialToolbarView, value: String?) =
    view.setFabShape(value ?: "default")

  @ReactProp(name = "themeMode")
  fun setThemeMode(view: MaterialToolbarView, value: String?) =
    view.setThemeMode(value ?: "system")

  @ReactProp(name = "dynamicColor", defaultBoolean = false)
  fun setDynamicColor(view: MaterialToolbarView, value: Boolean) = view.setDynamicColor(value)

  @ReactProp(name = "imeBehavior")
  fun setImeBehavior(view: MaterialToolbarView, value: String?) {
    val normalized = value ?: "none"
    view.setImeBehavior(normalized)
    NativeFloatingToolbarPlacement.ime(view, normalized)
  }

  @ReactProp(name = "alignment")
  fun setAlignment(view: MaterialToolbarView, value: String?) {
    val normalized = value ?: "bottomCenter"
    view.setAlignment(normalized)
    NativeFloatingToolbarPlacement.alignment(view, normalized)
  }

  @ReactProp(name = "insets")
  fun setInsets(view: MaterialToolbarView, value: String?) {
    NativeFloatingToolbarPlacement.insets(view, value ?: "safe")
    view.setInsets("none")
    view.setEdgeOffset(0f)
  }

  @ReactProp(name = "edgeOffset")
  fun setEdgeOffset(view: MaterialToolbarView, value: Dynamic) {
    val edge = value.floatOrNull()
    NativeFloatingToolbarPlacement.edge(view, edge)
    view.setEdgeOffset(0f)
  }

  @ReactProp(name = "contentPaddingStart")
  fun setContentPaddingStart(view: MaterialToolbarView, value: Dynamic) =
    view.setContentPaddingStart(value.floatOrNull())

  @ReactProp(name = "contentPaddingTop")
  fun setContentPaddingTop(view: MaterialToolbarView, value: Dynamic) =
    view.setContentPaddingTop(value.floatOrNull())

  @ReactProp(name = "contentPaddingEnd")
  fun setContentPaddingEnd(view: MaterialToolbarView, value: Dynamic) =
    view.setContentPaddingEnd(value.floatOrNull())

  @ReactProp(name = "contentPaddingBottom")
  fun setContentPaddingBottom(view: MaterialToolbarView, value: Dynamic) =
    view.setContentPaddingBottom(value.floatOrNull())

  @ReactProp(name = "expandedShadowElevation")
  fun setExpandedShadowElevation(view: MaterialToolbarView, value: Dynamic) =
    view.setExpandedShadowElevation(value.floatOrNull())

  @ReactProp(name = "collapsedShadowElevation")
  fun setCollapsedShadowElevation(view: MaterialToolbarView, value: Dynamic) =
    view.setCollapsedShadowElevation(value.floatOrNull())

  @ReactProp(name = "toolbarContainerColor", customType = "Color")
  fun setToolbarContainerColor(view: MaterialToolbarView, value: Int?) =
    view.setToolbarContainerColor(value)

  @ReactProp(name = "toolbarContentColor", customType = "Color")
  fun setToolbarContentColor(view: MaterialToolbarView, value: Int?) =
    view.setToolbarContentColor(value)

  @ReactProp(name = "fabContainerColor", customType = "Color")
  fun setFabContainerColor(view: MaterialToolbarView, value: Int?) =
    view.setFabContainerColor(value)

  @ReactProp(name = "fabContentColor", customType = "Color")
  fun setFabContentColor(view: MaterialToolbarView, value: Int?) =
    view.setFabContentColor(value)

  @ReactProp(name = "selectedContainerColor", customType = "Color")
  fun setSelectedContainerColor(view: MaterialToolbarView, value: Int?) =
    view.setSelectedContainerColor(value)

  @ReactProp(name = "selectedContentColor", customType = "Color")
  fun setSelectedContentColor(view: MaterialToolbarView, value: Int?) =
    view.setSelectedContentColor(value)

  @ReactProp(name = "unselectedContentColor", customType = "Color")
  fun setUnselectedContentColor(view: MaterialToolbarView, value: Int?) =
    view.setUnselectedContentColor(value)

  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any>? =
    mapOf(
      "toolbarActionPress" to mapOf("registrationName" to "onActionPress"),
      "toolbarFabPress" to mapOf("registrationName" to "onFabPress"),
    )
}

private fun Dynamic.floatOrNull(): Float? =
  if (isNull) null else asDouble().toFloat()

private fun ReadableArray?.toToolbarActionRecords(): List<ToolbarActionRecord> {
  if (this == null) return emptyList()
  val result = ArrayList<ToolbarActionRecord>(size())
  for (index in 0 until size()) {
    val value = getMap(index) ?: continue
    result += value.toToolbarActionRecord()
  }
  return result
}

private fun ReadableMap.toToolbarActionRecord(): ToolbarActionRecord = ToolbarActionRecord(
  id = string("id"),
  presentation = string("presentation", "icon"),
  label = string("label"),
  enabled = boolean("enabled", true),
  accessibilityLabel = nullableString("accessibilityLabel"),
  iconPresent = boolean("iconPresent", false),
  iconUri = nullableString("iconUri"),
  iconTintable = boolean("iconTintable", true),
  iconSize = number("iconSize", 24.0),
  iconFallback = string("iconFallback", "none"),
  selected = boolean("selected", false),
)

private fun ReadableMap.string(key: String, fallback: String = ""): String =
  if (hasKey(key) && !isNull(key)) getString(key) ?: fallback else fallback

private fun ReadableMap.nullableString(key: String): String? =
  if (hasKey(key) && !isNull(key)) getString(key) else null

private fun ReadableMap.boolean(key: String, fallback: Boolean): Boolean =
  if (hasKey(key) && !isNull(key)) getBoolean(key) else fallback

private fun ReadableMap.number(key: String, fallback: Double): Double =
  if (hasKey(key) && !isNull(key)) getDouble(key) else fallback
