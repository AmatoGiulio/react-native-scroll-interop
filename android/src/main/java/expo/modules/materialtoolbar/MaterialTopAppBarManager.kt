package expo.modules.materialtoolbar

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

internal class MaterialTopAppBarManager : SimpleViewManager<ExpoMaterialTopAppBarView>() {
  override fun getName(): String = "RNSIMaterialTopAppBar"

  override fun createViewInstance(
    reactContext: ThemedReactContext,
  ): ExpoMaterialTopAppBarView = ExpoMaterialTopAppBarView(reactContext)

  @ReactProp(name = "title")
  fun setTitle(view: ExpoMaterialTopAppBarView, value: String?) = view.setTitle(value.orEmpty())

  @ReactProp(name = "visible", defaultBoolean = true)
  fun setVisible(view: ExpoMaterialTopAppBarView, value: Boolean) = view.setVisibleState(value)

  @ReactProp(name = "variant")
  fun setVariant(view: ExpoMaterialTopAppBarView, value: String?) = view.setVariant(value ?: "medium")

  @ReactProp(name = "scrollBehavior")
  fun setScrollBehavior(view: ExpoMaterialTopAppBarView, value: String?) =
    view.setScrollBehavior(value ?: "none")

  @ReactProp(name = "navigationIcon")
  fun setNavigationIcon(view: ExpoMaterialTopAppBarView, value: String?) =
    view.setNavigationIcon(value ?: "none")

  @ReactProp(name = "navigationAccessibilityLabel")
  fun setNavigationAccessibilityLabel(view: ExpoMaterialTopAppBarView, value: String?) =
    view.setNavigationAccessibilityLabel(value ?: "Back")

  @ReactProp(name = "themeMode")
  fun setThemeMode(view: ExpoMaterialTopAppBarView, value: String?) =
    view.setThemeMode(value ?: "system")

  @ReactProp(name = "dynamicColor", defaultBoolean = false)
  fun setDynamicColor(view: ExpoMaterialTopAppBarView, value: Boolean) = view.setDynamicColor(value)

  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any>? =
    mapOf(
      "topNavigationPress" to mapOf(
        "registrationName" to "onNavigationPress",
      ),
    )
}
