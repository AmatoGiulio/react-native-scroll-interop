package com.reactnativescroll.interop.reactnative

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.reactnativescroll.interop.material3.ui.Material3NestedScrollParticipantProvider
import com.reactnativescroll.interop.material3.ui.MaterialToolbarManager
import com.reactnativescroll.interop.material3.ui.MaterialTopAppBarManager

/**
 * Standard React Native package composition root.
 *
 * The RN transport/controller layer is consumer-agnostic; this root installs Material3 as the
 * shipped reference participant provider and registers its native view managers.
 */
class ReactNativeScrollInteropPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = emptyList()

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> {
    ReactNativeNestedScrollParticipants.install(Material3NestedScrollParticipantProvider)
    installReactNativeScreensNestedScrollInteropIfAvailable()
    return listOf(
      ReactNativeNestedScrollHostManager(),
      MaterialTopAppBarManager(),
      MaterialToolbarManager(),
    )
  }

  private fun installReactNativeScreensNestedScrollInteropIfAvailable() {
    try {
      Class.forName(
        "com.reactnativescroll.interop.rnscreens.ReactNativeScreensNestedScrollInstaller",
      ).getMethod("install").invoke(null)
    } catch (_: ClassNotFoundException) {
      // react-native-screens is absent or does not expose the upstream nested-scroll seam.
    }
  }
}
