package com.reactnativescroll.interop.material3.ui

import com.reactnativescroll.interop.reactnative.ReactNativeNestedScrollHostView
import com.reactnativescroll.interop.reactnative.ReactNativeNestedScrollParentController

/** Internal compatibility names while the Material3 registry moves to neutral participant wording. */
internal fun ReactNativeNestedScrollHostView.requestNestedChromeBindingRefresh() =
  requestNestedParticipantBindingRefresh()

internal fun ReactNativeNestedScrollParentController.requestNestedChromeBindingRefresh() =
  requestNestedParticipantBindingRefresh()
