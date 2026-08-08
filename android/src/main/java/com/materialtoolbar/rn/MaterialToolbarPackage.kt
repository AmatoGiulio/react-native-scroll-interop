package com.materialtoolbar.rn

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

/**
 * Entry point for bare React Native apps.
 *
 * Expo apps never load this: expo-modules-autolinking registers the Expo module instead. Both
 * paths end up driving the same host views and the same scroll-interop coordinator, so behaviour
 * does not depend on which one an app uses.
 */
class MaterialToolbarPackage : ReactPackage {

  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = emptyList()

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<out View, out ReactShadowNode<*>>> = listOf(
    MaterialToolbarViewManager(),
    MaterialTopAppBarViewManager(),
  )
}
