package com.reactnativescroll.interop.reactnative

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.reactnativescroll.interop.material3.Material3NestedScrollParticipantProvider
import expo.modules.materialtoolbar.MaterialToolbarManager
import expo.modules.materialtoolbar.MaterialTopAppBarManager

/**
 * Standard React Native package composition root.
 *
 * The RN transport/controller layer is consumer-agnostic; this package installs Material3 as the
 * reference participant provider and registers its optional view managers alongside NativeScrollHost.
 */
class ReactNativeScrollInteropPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = emptyList()

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> {
    ReactNativeNestedScrollParticipants.install(Material3NestedScrollParticipantProvider)
    return listOf(
      ReactNativeNestedScrollHostManager(),
      MaterialTopAppBarManager(),
      MaterialToolbarManager(),
    )
  }
}
