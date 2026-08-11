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

    // The nested-scroll host ships as a second named view in this same module so that adopting it
    // needs no autolinking or config change.
    View(ExpoNestedScrollHostView::class) {
      Name("ExpoNestedScrollHostView")

      GroupView<ExpoNestedScrollHostView> {
        AddChildView<android.view.View> { parent, child, index ->
          parent.addHostChild(child, index)
        }
        GetChildCount { parent -> parent.childCount }
        GetChildViewAt<android.view.View> { parent, index -> parent.getChildAt(index) }
        RemoveChildView<android.view.View> { parent, child -> parent.removeHostChild(child) }
        RemoveChildViewAt { parent, index -> parent.removeHostChildAt(index) }
      }
    }
  }
}
