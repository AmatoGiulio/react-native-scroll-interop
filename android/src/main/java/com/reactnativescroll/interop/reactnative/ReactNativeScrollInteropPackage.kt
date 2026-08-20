package com.reactnativescroll.interop.reactnative

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import expo.modules.materialtoolbar.MaterialToolbarManager
import expo.modules.materialtoolbar.MaterialTopAppBarManager
import expo.modules.materialtoolbar.ReactNativeNestedScrollHostManager

/** Standard React Native package surface. No Expo Modules runtime is required. */
class ReactNativeScrollInteropPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = emptyList()

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = listOf(
    ReactNativeNestedScrollHostManager(),
    MaterialTopAppBarManager(),
    MaterialToolbarManager(),
  )
}
