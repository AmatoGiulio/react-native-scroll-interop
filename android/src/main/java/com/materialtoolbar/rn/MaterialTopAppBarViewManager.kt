package com.materialtoolbar.rn

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.materialtoolbar.views.MaterialTopAppBarHostView

/** Bare React Native binding for the Material 3 top app bar. See [MaterialToolbarViewManager]. */
class MaterialTopAppBarViewManager : SimpleViewManager<MaterialTopAppBarHostView>() {

  override fun getName(): String = NAME

  override fun createViewInstance(reactContext: ThemedReactContext): MaterialTopAppBarHostView =
    MaterialTopAppBarHostView(reactContext)

  @ReactProp(name = "title")
  fun setTitle(view: MaterialTopAppBarHostView, value: String?) = view.setTitle(value.orEmpty())

  @ReactProp(name = "visible")
  fun setVisible(view: MaterialTopAppBarHostView, value: Boolean) = view.setVisibleState(value)

  @ReactProp(name = "variant")
  fun setVariant(view: MaterialTopAppBarHostView, value: String?) =
    view.setVariant(value ?: "medium")

  @ReactProp(name = "scrollBehavior")
  fun setScrollBehavior(view: MaterialTopAppBarHostView, value: String?) =
    view.setScrollBehavior(value ?: "none")

  @ReactProp(name = "themeMode")
  fun setThemeMode(view: MaterialTopAppBarHostView, value: String?) =
    view.setThemeMode(value ?: "system")

  @ReactProp(name = "dynamicColor")
  fun setDynamicColor(view: MaterialTopAppBarHostView, value: Boolean) =
    view.setDynamicColor(value)

  private companion object {
    const val NAME = "MaterialTopAppBarView"
  }
}
