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

    // Alpha.33 diagnostic-only native transaction host. This is intentionally a second named
    // view in the same Expo module, so no autolinking/config change is required for the probe.
    View(ExpoMaterialScrollProbeView::class) {
      Name("ExpoMaterialScrollProbeView")

      GroupView<ExpoMaterialScrollProbeView> {
        AddChildView<android.view.View> { parent, child, index ->
          parent.addProbeChild(child, index)
        }
        GetChildCount { parent -> parent.childCount }
        GetChildViewAt<android.view.View> { parent, index -> parent.getChildAt(index) }
        RemoveChildView<android.view.View> { parent, child -> parent.removeProbeChild(child) }
        RemoveChildViewAt { parent, index -> parent.removeProbeChildAt(index) }
      }
    }
  }
}
