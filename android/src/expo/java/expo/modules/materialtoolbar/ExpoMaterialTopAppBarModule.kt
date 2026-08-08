package expo.modules.materialtoolbar

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoMaterialTopAppBarModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoMaterialTopAppBar")

    View(ExpoMaterialTopAppBarView::class) {
      Prop("title") { view: ExpoMaterialTopAppBarView, title: String ->
        view.host.setTitle(title)
      }

      Prop("visible") { view: ExpoMaterialTopAppBarView, visible: Boolean ->
        view.host.setVisibleState(visible)
      }

      Prop("variant") { view: ExpoMaterialTopAppBarView, variant: String ->
        view.host.setVariant(variant)
      }

      Prop("scrollBehavior") { view: ExpoMaterialTopAppBarView, behavior: String ->
        view.host.setScrollBehavior(behavior)
      }

      Prop("themeMode") { view: ExpoMaterialTopAppBarView, mode: String ->
        view.host.setThemeMode(mode)
      }

      Prop("dynamicColor") { view: ExpoMaterialTopAppBarView, dynamic: Boolean ->
        view.host.setDynamicColor(dynamic)
      }
    }
  }
}
