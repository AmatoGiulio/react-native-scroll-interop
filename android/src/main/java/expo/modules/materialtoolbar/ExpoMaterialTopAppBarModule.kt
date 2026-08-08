package expo.modules.materialtoolbar

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoMaterialTopAppBarModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoMaterialTopAppBar")

    View(ExpoMaterialTopAppBarView::class) {
      Prop("title") { view: ExpoMaterialTopAppBarView, title: String ->
        view.setTitle(title)
      }

      Prop("visible") { view: ExpoMaterialTopAppBarView, visible: Boolean ->
        view.setVisibleState(visible)
      }

      Prop("variant") { view: ExpoMaterialTopAppBarView, variant: String ->
        view.setVariant(variant)
      }

      Prop("scrollBehavior") { view: ExpoMaterialTopAppBarView, behavior: String ->
        view.setScrollBehavior(behavior)
      }

      Prop("themeMode") { view: ExpoMaterialTopAppBarView, mode: String ->
        view.setThemeMode(mode)
      }

      Prop("dynamicColor") { view: ExpoMaterialTopAppBarView, dynamic: Boolean ->
        view.setDynamicColor(dynamic)
      }
    }
  }
}
