package expo.modules.materialtoolbar

import android.graphics.Color
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import com.materialtoolbar.views.ToolbarActionSpec
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

private fun List<ToolbarActionRecord>.toSpecs(): List<ToolbarActionSpec> = map { record ->
  ToolbarActionSpec(
    id = record.id,
    presentation = record.presentation,
    label = record.label,
    enabled = record.enabled,
    accessibilityLabel = record.accessibilityLabel,
    iconPresent = record.iconPresent,
    iconUri = record.iconUri,
    iconTintable = record.iconTintable,
    iconSize = record.iconSize,
    iconFallback = record.iconFallback,
    selected = record.selected,
  )
}

class ExpoMaterialToolbarModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoMaterialToolbar")

    View(ExpoMaterialToolbarView::class) {
      Events("onActionPress", "onFabPress")

      Prop("content") { view: ExpoMaterialToolbarView, actions: List<ToolbarActionRecord> ->
        view.host.setContent(actions.toSpecs())
      }

      Prop("leadingContent") { view: ExpoMaterialToolbarView, actions: List<ToolbarActionRecord> ->
        view.host.setLeadingContent(actions.toSpecs())
      }

      Prop("trailingContent") { view: ExpoMaterialToolbarView, actions: List<ToolbarActionRecord> ->
        view.host.setTrailingContent(actions.toSpecs())
      }

      Prop("visible") { view: ExpoMaterialToolbarView, visible: Boolean ->
        view.host.setVisibleState(visible)
      }

      Prop("expanded") { view: ExpoMaterialToolbarView, expanded: Boolean ->
        view.host.setExpanded(expanded)
      }

      Prop("scrollBehavior") { view: ExpoMaterialToolbarView, behavior: String ->
        view.host.setScrollBehavior(behavior)
      }

      Prop("scrollExitDirection") { view: ExpoMaterialToolbarView, direction: String ->
        view.host.setScrollExitDirection(direction)
      }

      Prop("orientation") { view: ExpoMaterialToolbarView, orientation: String ->
        view.host.setOrientation(orientation)
      }

      Prop("variant") { view: ExpoMaterialToolbarView, variant: String ->
        view.host.setVariant(variant)
      }

      Prop("fabPresent") { view: ExpoMaterialToolbarView, present: Boolean ->
        view.host.setFabPresent(present)
      }

      Prop("fabPosition") { view: ExpoMaterialToolbarView, position: String ->
        view.host.setFabPosition(position)
      }

      Prop("fabIconUri") { view: ExpoMaterialToolbarView, uri: String? ->
        view.host.setFabIconUri(uri)
      }

      Prop("fabIconTintable") { view: ExpoMaterialToolbarView, tintable: Boolean ->
        view.host.setFabIconTintable(tintable)
      }

      Prop("fabIconSize") { view: ExpoMaterialToolbarView, size: Double ->
        view.host.setFabIconSize(size.toFloat())
      }

      Prop("fabIconFallback") { view: ExpoMaterialToolbarView, fallback: String ->
        view.host.setFabIconFallback(fallback)
      }

      Prop("fabAccessibilityLabel") { view: ExpoMaterialToolbarView, label: String? ->
        view.host.setFabAccessibilityLabel(label)
      }

      Prop("fabShape") { view: ExpoMaterialToolbarView, shape: String ->
        view.host.setFabShape(shape)
      }

      Prop("themeMode") { view: ExpoMaterialToolbarView, mode: String ->
        view.host.setThemeMode(mode)
      }

      Prop("dynamicColor") { view: ExpoMaterialToolbarView, dynamic: Boolean ->
        view.host.setDynamicColor(dynamic)
      }

      Prop("imeBehavior") { view: ExpoMaterialToolbarView, behavior: String ->
        view.host.setImeBehavior(behavior)
      }

      Prop("alignment") { view: ExpoMaterialToolbarView, alignment: String ->
        view.host.setAlignment(alignment)
      }

      Prop("insets") { view: ExpoMaterialToolbarView, insets: String ->
        view.host.setInsets(insets)
      }

      Prop("edgeOffset") { view: ExpoMaterialToolbarView, offset: Double? ->
        view.host.setEdgeOffset(offset?.toFloat())
      }

      Prop("contentPaddingStart") { view: ExpoMaterialToolbarView, value: Double? ->
        view.host.setContentPaddingStart(value?.toFloat())
      }

      Prop("contentPaddingTop") { view: ExpoMaterialToolbarView, value: Double? ->
        view.host.setContentPaddingTop(value?.toFloat())
      }

      Prop("contentPaddingEnd") { view: ExpoMaterialToolbarView, value: Double? ->
        view.host.setContentPaddingEnd(value?.toFloat())
      }

      Prop("contentPaddingBottom") { view: ExpoMaterialToolbarView, value: Double? ->
        view.host.setContentPaddingBottom(value?.toFloat())
      }

      Prop("expandedShadowElevation") { view: ExpoMaterialToolbarView, value: Double? ->
        view.host.setExpandedShadowElevation(value?.toFloat())
      }

      Prop("collapsedShadowElevation") { view: ExpoMaterialToolbarView, value: Double? ->
        view.host.setCollapsedShadowElevation(value?.toFloat())
      }

      Prop("toolbarContainerColor") { view: ExpoMaterialToolbarView, color: Color? ->
        view.host.setToolbarContainerColor(color?.toArgb())
      }

      Prop("toolbarContentColor") { view: ExpoMaterialToolbarView, color: Color? ->
        view.host.setToolbarContentColor(color?.toArgb())
      }

      Prop("fabContainerColor") { view: ExpoMaterialToolbarView, color: Color? ->
        view.host.setFabContainerColor(color?.toArgb())
      }

      Prop("fabContentColor") { view: ExpoMaterialToolbarView, color: Color? ->
        view.host.setFabContentColor(color?.toArgb())
      }

      Prop("selectedContainerColor") { view: ExpoMaterialToolbarView, color: Color? ->
        view.host.setSelectedContainerColor(color?.toArgb())
      }

      Prop("selectedContentColor") { view: ExpoMaterialToolbarView, color: Color? ->
        view.host.setSelectedContentColor(color?.toArgb())
      }

      Prop("unselectedContentColor") { view: ExpoMaterialToolbarView, color: Color? ->
        view.host.setUnselectedContentColor(color?.toArgb())
      }

      AsyncFunction("show") { view: ExpoMaterialToolbarView ->
        view.host.setVisibleState(true)
      }

      AsyncFunction("hide") { view: ExpoMaterialToolbarView ->
        view.host.setVisibleState(false)
      }

      AsyncFunction("expand") { view: ExpoMaterialToolbarView ->
        view.host.setExpanded(true)
      }

      AsyncFunction("collapse") { view: ExpoMaterialToolbarView ->
        view.host.setExpanded(false)
      }

    }
  }
}
