package expo.modules.materialtoolbar

import android.graphics.Color
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class ToolbarActionRecord : Record {
  @Field val id: String = ""
  @Field val presentation: String = "icon"
  @Field val label: String = ""
  @Field val enabled: Boolean = true
  @Field val accessibilityLabel: String? = null
  @Field val iconPresent: Boolean = false
  @Field val iconUri: String? = null
  @Field val iconTintable: Boolean = true
  @Field val iconSize: Double = 24.0
  @Field val iconFallback: String = "none"
  @Field val selected: Boolean = false
}

class ExpoMaterialToolbarModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoMaterialToolbar")

    View(ExpoMaterialToolbarView::class) {
      Events("onActionPress", "onFabPress")

      Prop("content") { view: ExpoMaterialToolbarView, value: List<ToolbarActionRecord> -> view.setContent(value) }
      Prop("leadingContent") { view: ExpoMaterialToolbarView, value: List<ToolbarActionRecord> -> view.setLeadingContent(value) }
      Prop("trailingContent") { view: ExpoMaterialToolbarView, value: List<ToolbarActionRecord> -> view.setTrailingContent(value) }
      Prop("visible") { view: ExpoMaterialToolbarView, value: Boolean -> view.setVisibleState(value) }
      Prop("expanded") { view: ExpoMaterialToolbarView, value: Boolean -> view.setExpanded(value) }
      Prop("scrollBehavior") { view: ExpoMaterialToolbarView, value: String -> view.setScrollBehavior(value) }
      Prop("scrollExitDirection") { view: ExpoMaterialToolbarView, value: String -> view.setScrollExitDirection(value) }
      Prop("orientation") { view: ExpoMaterialToolbarView, value: String -> view.setOrientation(value) }
      Prop("variant") { view: ExpoMaterialToolbarView, value: String -> view.setVariant(value) }
      Prop("fabPresent") { view: ExpoMaterialToolbarView, value: Boolean -> view.setFabPresent(value) }
      Prop("fabPosition") { view: ExpoMaterialToolbarView, value: String -> view.setFabPosition(value) }
      Prop("fabIconUri") { view: ExpoMaterialToolbarView, value: String? -> view.setFabIconUri(value) }
      Prop("fabIconTintable") { view: ExpoMaterialToolbarView, value: Boolean -> view.setFabIconTintable(value) }
      Prop("fabIconSize") { view: ExpoMaterialToolbarView, value: Double -> view.setFabIconSize(value.toFloat()) }
      Prop("fabIconFallback") { view: ExpoMaterialToolbarView, value: String -> view.setFabIconFallback(value) }
      Prop("fabAccessibilityLabel") { view: ExpoMaterialToolbarView, value: String? -> view.setFabAccessibilityLabel(value) }
      Prop("fabShape") { view: ExpoMaterialToolbarView, value: String -> view.setFabShape(value) }
      Prop("themeMode") { view: ExpoMaterialToolbarView, value: String -> view.setThemeMode(value) }
      Prop("dynamicColor") { view: ExpoMaterialToolbarView, value: Boolean -> view.setDynamicColor(value) }

      Prop("imeBehavior") { view: ExpoMaterialToolbarView, value: String ->
        view.setImeBehavior(value)
        NativeFloatingToolbarPlacement.ime(view, value)
      }
      Prop("alignment") { view: ExpoMaterialToolbarView, value: String ->
        view.setAlignment(value)
        NativeFloatingToolbarPlacement.alignment(view, value)
      }
      Prop("insets") { view: ExpoMaterialToolbarView, value: String ->
        NativeFloatingToolbarPlacement.insets(view, value)
        view.setInsets("none")
        view.setEdgeOffset(0f)
      }
      Prop("edgeOffset") { view: ExpoMaterialToolbarView, value: Double? ->
        NativeFloatingToolbarPlacement.edge(view, value?.toFloat())
        view.setEdgeOffset(0f)
      }

      Prop("contentPaddingStart") { view: ExpoMaterialToolbarView, value: Double? -> view.setContentPaddingStart(value?.toFloat()) }
      Prop("contentPaddingTop") { view: ExpoMaterialToolbarView, value: Double? -> view.setContentPaddingTop(value?.toFloat()) }
      Prop("contentPaddingEnd") { view: ExpoMaterialToolbarView, value: Double? -> view.setContentPaddingEnd(value?.toFloat()) }
      Prop("contentPaddingBottom") { view: ExpoMaterialToolbarView, value: Double? -> view.setContentPaddingBottom(value?.toFloat()) }
      Prop("expandedShadowElevation") { view: ExpoMaterialToolbarView, value: Double? -> view.setExpandedShadowElevation(value?.toFloat()) }
      Prop("collapsedShadowElevation") { view: ExpoMaterialToolbarView, value: Double? -> view.setCollapsedShadowElevation(value?.toFloat()) }
      Prop("toolbarContainerColor") { view: ExpoMaterialToolbarView, value: Color? -> view.setToolbarContainerColor(value) }
      Prop("toolbarContentColor") { view: ExpoMaterialToolbarView, value: Color? -> view.setToolbarContentColor(value) }
      Prop("fabContainerColor") { view: ExpoMaterialToolbarView, value: Color? -> view.setFabContainerColor(value) }
      Prop("fabContentColor") { view: ExpoMaterialToolbarView, value: Color? -> view.setFabContentColor(value) }
      Prop("selectedContainerColor") { view: ExpoMaterialToolbarView, value: Color? -> view.setSelectedContainerColor(value) }
      Prop("selectedContentColor") { view: ExpoMaterialToolbarView, value: Color? -> view.setSelectedContentColor(value) }
      Prop("unselectedContentColor") { view: ExpoMaterialToolbarView, value: Color? -> view.setUnselectedContentColor(value) }

      AsyncFunction("show") { view: ExpoMaterialToolbarView -> view.setVisibleState(true) }
      AsyncFunction("hide") { view: ExpoMaterialToolbarView -> view.setVisibleState(false) }
      AsyncFunction("expand") { view: ExpoMaterialToolbarView -> view.setExpanded(true) }
      AsyncFunction("collapse") { view: ExpoMaterialToolbarView -> view.setExpanded(false) }
    }
  }
}
