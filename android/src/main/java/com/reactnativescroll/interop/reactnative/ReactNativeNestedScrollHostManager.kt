package com.reactnativescroll.interop.reactnative

import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager

internal class ReactNativeNestedScrollHostManager :
  ViewGroupManager<ReactNativeNestedScrollHostView>() {

  override fun getName(): String = "RNSINestedScrollHost"

  override fun createViewInstance(
    reactContext: ThemedReactContext,
  ): ReactNativeNestedScrollHostView = ReactNativeNestedScrollHostView(reactContext)
}
