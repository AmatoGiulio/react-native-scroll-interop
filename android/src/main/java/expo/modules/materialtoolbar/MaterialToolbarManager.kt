package expo.modules.materialtoolbar

import com.facebook.react.bridge.Dynamic
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

internal class MaterialToolbarManager : SimpleViewManager<ExpoMaterialToolbarView>() {
  override fun getName(): String = "RNSIMaterialToolbar"

  override fun createViewInstance(
    reactContext: ThemedReactContext,
  ): ExpoMaterialToolbarView = ExpoMaterialToolbarView(reactContext)

  @ReactProp(name = "content")
  fun setContent(view: ExpoMaterialToolbarView, value: ReadableArray?) =
    view.setContent(value.toToolbarActionRecords())

  @ReactProp(name = "leadingContent")
  fun setLeadingContent(view: ExpoMaterialToolbarView, value: ReadableArray?) =
    view.setLeadingContent(value.toToolbarActionRecords())

  @ReactProp(name = "trailingContent")
  fun setTrailingContent(view: ExpoMaterialToolbarView, value: ReadableArray?) =
    view.setTrailingContent(value.toToolbarActionRecords())

  @ReactProp(name = "visible", defaultBoolean = true)
  fun setVisible(view: ExpoMaterialToolbarView, value: Boolean) = view.setVisibleState(value)

  @ReactProp(name = "expanded", defaultBoolean = true)
  fun setExpanded(view: ExpoMaterialToolbarView, value: Boolean) = view.setExpanded(value)

  @ReactProp(name = "scrollBehavior")
  fun setScrollBehavior(view: ExpoMaterialToolbarView, value: String?) =
    view.setScrollBehavior(value ?: "none")

  @ReactProp(name = "scrollExitDirection")
  fun setScrollExitDirection(view: ExpoMaterialToolbarView, value: String?) =
    view.setScrollExitDirection(value ?: "auto")

  @ReactProp(name = "orientation")
  fun setOrientation(view: ExpoMaterialToolbarView, value: String?) =
    view.setOrientation(value ?: "horizontal")

  @ReactProp(name = "variant")
  fun setVariant(view: ExpoMaterialToolbarView, value: String?) =
    view.setVariant(value ?: "standard")

  @ReactProp(name = "fabPresent", defaultBoolean = false)
  fun setFabPresent(view: ExpoMaterialToolbarView, value: Boolean) = view.setFabPresent(value)

  @ReactProp(name = "fabPosition")
  fun setFabPosition(view: ExpoMaterialToolbarView, value: String?) =
    view.setFabPosition(value ?: "end")

  @ReactProp(name = "fabIconUri")
  fun setFabIconUri(view: ExpoMaterialToolbarView, value: String?) = view.setFabIconUri(value)

  @ReactProp(name = "fabIconTintable", defaultBoolean = true)
  fun setFabIconTintable(view: ExpoMaterialToolbarView, value: Boolean) =
    view.setFabIconTintable(value)

  @ReactProp(name = "fabIconSize", defaultDouble = 24.0)
  fun setFabIconSize(view: ExpoMaterialToolbarView, value: Double) =
    view.setFabIconSize(value.toFloat())

  @ReactProp(name = "fabIconFallback")
  fun setFabIconFallback(view: ExpoMaterialToolbarView, value: String?) =
    view.setFabIconFallback(value ?: "none")

  @ReactProp(name = "fabAccessibilityLabel")
  fun setFabAccessibilityLabel(view: ExpoMaterialToolbarView, value: String?) =
    view.setFabAccessibilityLabel(value)

  @ReactProp(name = "fabShape")
  fun setFabShape(view: ExpoMaterialToolbarView, value: String?) =
    view.setFabShape(value ?: "default")

  @ReactProp(name = "themeMode")
  fun setThemeMode(view: ExpoMaterialToolbarView, value: String?) =
    view.setThemeMode(value ?: "system")

  @ReactProp(name = "dynamicColor", defaultBoolean = false)
  fun setDynamicColor(view: ExpoMaterialToolbarView, value: Boolean) = view.setDynamicColor(value)

  @ReactProp(name = "imeBehavior")
  fun setImeBehavior(view: ExpoMaterialToolbarView, value: String?) {
    val normalized = value ?: "none"
    view.setImeBehavior(normalized)
    NativeFloatingToolbarPlacement.ime(view, normalized)
  }

  @ReactProp(name = "alignment")
  fun setAlignment(view: ExpoMaterialToolbarView, value: String?) {
    val normalized = value ?: "bottomCenter"
    view.setAlignment(normalized)
    NativeFloatingToolbarPlacement.alignment(view, normalized)
  }

  @ReactProp(name = "insets")
  fun setInsets(view: ExpoMaterialToolbarView, value: String?) {
    NativeFloatingToolbarPlacement.insets(view, value ?: "safe")
    view.setInsets("none")
    view.setEdgeOffset(0f)
  }

  @ReactProp(name = "edgeOffset")
  fun setEdgeOffset(view: ExpoMaterialToolbarView, value: Dynamic) {
    val edge = value.floatOrNull()
    NativeFloatingToolbarPlacement.edge(view, edge)
    view.setEdgeOffset(0f)
  }

  @ReactProp(name = "contentPaddingStart")
  fun setContentPaddingStart(view: ExpoMaterialToolbarView, value: Dynamic) =
    view.setContentPaddingStart(value.floatOrNull())

  @ReactProp(name = "contentPaddingTop")
  fun setContentPaddingTop(view: ExpoMaterialToolbarView, value: Dynamic) =
    view.setContentPaddingTop(value.floatOrNull())

  @ReactProp(name = "contentPaddingEnd")
  fun setContentPaddingEnd(view: ExpoMaterialToolbarView, value: Dynamic) =
    view.setContentPaddingEnd(value.floatOrNull())

  @ReactProp(name = "contentPaddingBottom")
  fun setContentPaddingBottom(view: ExpoMaterialToolbarView, value: Dynamic) =
    view.setContentPaddingBottom(value.floatOrNull())

  @ReactProp(name = "expandedShadowElevation")
  fun setExpandedShadowElevation(view: ExpoMaterialToolbarView, value: Dynamic) =
    view.setExpandedShadowElevation(value.floatOrNull())

  @ReactProp(name = "collapsedShadowElevation")
  fun setCollapsedShadowElevation(view: ExpoMaterialToolbarView, value: Dynamic) =
    view.setCollapsedShadowElevation(value.floatOrNull())

  @ReactProp(name = "toolbarContainerColor", customType = "Color")
  fun setToolbarContainerColor(view: ExpoMaterialToolbarView, value: Int?) =
    view.setToolbarContainerColor(value)

  @ReactProp(name = "toolbarContentColor", customType = "Color")
  fun setToolbarContentColor(view: ExpoMaterialToolbarView, value: Int?) =
    view.setToolbarContentColor(value)

  @ReactProp(name = "fabContainerColor", customType = "Color")
  fun setFabContainerColor(view: ExpoMaterialToolbarView, value: Int?) =
    view.setFabContainerColor(value)

  @ReactProp(name = "fabContentColor", customType = "Color")
  fun setFabContentColor(view: ExpoMaterialToolbarView, value: Int?) =
    view.setFabContentColor(value)

  @ReactProp(name = "selectedContainerColor", customType = "Color")
  fun setSelectedContainerColor(view: ExpoMaterialToolbarView, value: Int?) =
    view.setSelectedContainerColor(value)

  @ReactProp(name = "selectedContentColor", customType = "Color")
  fun setSelectedContentColor(view: ExpoMaterialToolbarView, value: Int?) =
    view.setSelectedContentColor(value)

  @ReactProp(name = "unselectedContentColor", customType = "Color")
  fun setUnselectedContentColor(view: ExpoMaterialToolbarView, value: Int?) =
    view.setUnselectedContentColor(value)

  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any>? =
    mapOf(
      "toolbarActionPress" to mapOf(
        "registrationName" to "onActionPress",
      ),
      "toolbarFabPress" to mapOf(
        "registrationName" to "onFabPress",
      ),
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
