package expo.modules.materialtoolbar

import android.graphics.Color
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class ToolbarActionRecord : Record {
  @Field
  val id: String = ""

  @Field
  val presentation: String = "icon"

  @Field
  val label: String = ""

  @Field
  val enabled: Boolean = true

  @Field
  val accessibilityLabel: String? = null

  @Field
  val iconPresent: Boolean = false

  @Field
  val iconUri: String? = null

  @Field
  val iconTintable: Boolean = true

  @Field
  val iconSize: Double = 24.0

  @Field
  val iconFallback: String = "none"

  @Field
  val selected: Boolean = false
}

class ExpoMaterialToolbarModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoMaterialToolbar")

    View(ExpoMaterialToolbarView::class) {
      Events("onActionPress", "onFabPress")

      Prop("content") { view: ExpoMaterialToolbarView, actions: List<ToolbarActionRecord> ->
        view.setContent(actions)
      }

      Prop("leadingContent") { view: ExpoMaterialToolbarView, actions: List<ToolbarActionRecord> ->
        view.setLeadingContent(actions)
      }

      Prop("trailingContent") { view: ExpoMaterialToolbarView, actions: List<ToolbarActionRecord> ->
        view.setTrailingContent(actions)
      }

      Prop("visible") { view: ExpoMaterialToolbarView, visible: Boolean ->
        view.setVisibleState(visible)
      }

      Prop("expanded") { view: ExpoMaterialToolbarView, expanded: Boolean ->
        view.setExpanded(expanded)
      }

      Prop("scrollBehavior") { view: ExpoMaterialToolbarView, behavior: String ->
        view.setScrollBehavior(behavior)
      }

      Prop("scrollExitDirection") { view: ExpoMaterialToolbarView, direction: String ->
        view.setScrollExitDirection(direction)
      }

      Prop("orientation") { view: ExpoMaterialToolbarView, orientation: String ->
        view.setOrientation(orientation)
      }

      Prop("variant") { view: ExpoMaterialToolbarView, variant: String ->
        view.setVariant(variant)
      }

      Prop("fabPresent") { view: ExpoMaterialToolbarView, present: Boolean ->
        view.setFabPresent(present)
      }

      Prop("fabPosition") { view: ExpoMaterialToolbarView, position: String ->
        view.setFabPosition(position)
      }

      Prop("fabIconUri") { view: ExpoMaterialToolbarView, uri: String? ->
        view.setFabIconUri(uri)
      }

      Prop("fabIconTintable") { view: ExpoMaterialToolbarView, tintable: Boolean ->
        view.setFabIconTintable(tintable)
      }

      Prop("fabIconSize") { view: ExpoMaterialToolbarView, size: Double ->
        view.setFabIconSize(size.toFloat())
      }

      Prop("fabIconFallback") { view: ExpoMaterialToolbarView, fallback: String ->
        view.setFabIconFallback(fallback)
      }

      Prop("fabAccessibilityLabel") { view: ExpoMaterialToolbarView, label: String? ->
        view.setFabAccessibilityLabel(label)
      }

      Prop("fabShape") { view: ExpoMaterialToolbarView, shape: String ->
        view.setFabShape(shape)
      }

      Prop("themeMode") { view: ExpoMaterialToolbarView, mode: String ->
        view.setThemeMode(mode)
      }

      Prop("dynamicColor") { view: ExpoMaterialToolbarView, dynamic: Boolean ->
        view.setDynamicColor(dynamic)
      }

      Prop("imeBehavior") { view: ExpoMaterialToolbarView, behavior: String ->
        view.setImeBehavior(behavior)
      }

      Prop("alignment") { view: ExpoMaterialToolbarView, alignment: String ->
        view.setAlignment(alignment)
      }

      Prop("insets") { view: ExpoMaterialToolbarView, insets: String ->
        view.setInsets(insets)
      }

      Prop("edgeOffset") { view: ExpoMaterialToolbarView, offset: Double? ->
        view.setEdgeOffset(offset?.toFloat())
      }

      Prop("contentPaddingStart") { view: ExpoMaterialToolbarView, value: Double? ->
        view.setContentPaddingStart(value?.toFloat())
      }

      Prop("contentPaddingTop") { view: ExpoMaterialToolbarView, value: Double? ->
        view.setContentPaddingTop(value?.toFloat())
      }

      Prop("contentPaddingEnd") { view: ExpoMaterialToolbarView, value: Double? ->
        view.setContentPaddingEnd(value?.toFloat())
      }

      Prop("contentPaddingBottom") { view: ExpoMaterialToolbarView, value: Double? ->
        view.setContentPaddingBottom(value?.toFloat())
      }

      Prop("expandedShadowElevation") { view: ExpoMaterialToolbarView, value: Double? ->
        view.setExpandedShadowElevation(value?.toFloat())
      }

      Prop("collapsedShadowElevation") { view: ExpoMaterialToolbarView, value: Double? ->
        view.setCollapsedShadowElevation(value?.toFloat())
      }

      Prop("toolbarContainerColor") { view: ExpoMaterialToolbarView, color: Color? ->
        view.setToolbarContainerColor(color)
      }

      Prop("toolbarContentColor") { view: ExpoMaterialToolbarView, color: Color? ->
        view.setToolbarContentColor(color)
      }

      Prop("fabContainerColor") { view: ExpoMaterialToolbarView, color: Color? ->
        view.setFabContainerColor(color)
      }

      Prop("fabContentColor") { view: ExpoMaterialToolbarView, color: Color? ->
        view.setFabContentColor(color)
      }

      Prop("selectedContainerColor") { view: ExpoMaterialToolbarView, color: Color? ->
        view.setSelectedContainerColor(color)
      }

      Prop("selectedContentColor") { view: ExpoMaterialToolbarView, color: Color? ->
        view.setSelectedContentColor(color)
      }

      Prop("unselectedContentColor") { view: ExpoMaterialToolbarView, color: Color? ->
        view.setUnselectedContentColor(color)
      }

      AsyncFunction("show") { view: ExpoMaterialToolbarView ->
        view.setVisibleState(true)
      }

      AsyncFunction("hide") { view: ExpoMaterialToolbarView ->
        view.setVisibleState(false)
      }

      AsyncFunction("expand") { view: ExpoMaterialToolbarView ->
        view.setExpanded(true)
      }

      AsyncFunction("collapse") { view: ExpoMaterialToolbarView ->
        view.setExpanded(false)
      }

    }
  }
}
