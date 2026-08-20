package com.reactnativescroll.interop.reactnative

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.reactnativescroll.interop.material3.ui.MaterialToolbarManager
import com.reactnativescroll.interop.material3.ui.MaterialTopAppBarManager

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
