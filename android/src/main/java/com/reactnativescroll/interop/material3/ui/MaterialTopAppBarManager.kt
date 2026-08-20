package com.reactnativescroll.interop.material3.ui

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

internal class MaterialTopAppBarManager : SimpleViewManager<MaterialTopAppBarView>() {
  override fun getName(): String = "RNSIMaterialTopAppBar"

  override fun createViewInstance(
    reactContext: ThemedReactContext,
  ): MaterialTopAppBarView = MaterialTopAppBarView(reactContext)

  @ReactProp(name = "title")
  fun setTitle(view: MaterialTopAppBarView, value: String?) = view.setTitle(value.orEmpty())

  @ReactProp(name = "visible", defaultBoolean = true)
  fun setVisible(view: MaterialTopAppBarView, value: Boolean) = view.setVisibleState(value)

  @ReactProp(name = "variant")
  fun setVariant(view: MaterialTopAppBarView, value: String?) = view.setVariant(value ?: "medium")

  @ReactProp(name = "scrollBehavior")
  fun setScrollBehavior(view: MaterialTopAppBarView, value: String?) =
    view.setScrollBehavior(value ?: "none")

  @ReactProp(name = "navigationIcon")
  fun setNavigationIcon(view: MaterialTopAppBarView, value: String?) =
    view.setNavigationIcon(value ?: "none")

  @ReactProp(name = "navigationAccessibilityLabel")
  fun setNavigationAccessibilityLabel(view: MaterialTopAppBarView, value: String?) =
    view.setNavigationAccessibilityLabel(value ?: "Back")

  @ReactProp(name = "themeMode")
  fun setThemeMode(view: MaterialTopAppBarView, value: String?) =
    view.setThemeMode(value ?: "system")

  @ReactProp(name = "dynamicColor", defaultBoolean = false)
  fun setDynamicColor(view: MaterialTopAppBarView, value: Boolean) = view.setDynamicColor(value)

  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any>? =
    mapOf(
      "topNavigationPress" to mapOf(
        "registrationName" to "onNavigationPress",
      ),
    )
}
