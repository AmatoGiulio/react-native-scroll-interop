package com.reactnativescroll.interop.material3

import androidx.core.view.ViewCompat
import com.reactnativescroll.interop.core.VerticalNestedPostScrollConsumer
import com.reactnativescroll.interop.core.VerticalNestedPostScrollObserver
import com.reactnativescroll.interop.core.VerticalNestedPreScrollConsumer
import expo.modules.materialtoolbar.FloatingToolbarScrollConsumer

/**
 * Material3 PRE/POST adapter over the neutral native nested-scroll participant API.
 *
 * The wrapped TopAppBar consumer still owns only Material chrome state. React Native remains the
 * sole owner of gesture/fling physics and source position; this adapter forwards only the real
 * synchronous Android nested-scroll deltas supplied by the dispatcher.
 */
internal class Material3TopAppBarNestedScrollAdapter(
  private val consumer: TopAppBarScrollConsumer,
) : VerticalNestedPreScrollConsumer, VerticalNestedPostScrollConsumer {
  override fun consumePreScroll(availableY: Int, inputType: Int): Int =
    consumer
      .nestedPreScroll(availableY, inputType.toNativeNestedInputType())
      .reportedConsumedY

  override fun consumePostScroll(
    childConsumedY: Int,
    availableY: Int,
    inputType: Int,
  ): Int =
    consumer
      .nestedPostScroll(childConsumedY, availableY, inputType.toNativeNestedInputType())
      .availableConsumedY
}

/**
 * Observation-only Material3 FloatingToolbar adapter.
 *
 * The neutral observer port has no return value, so FloatingToolbar can never mutate Android nested
 * consumption accounting.
 */
internal class Material3FloatingToolbarNestedScrollAdapter(
  private val consumer: FloatingToolbarScrollConsumer,
) : VerticalNestedPostScrollObserver {
  override fun observePostScroll(childConsumedY: Int, inputType: Int) {
    consumer.nestedPostScroll(childConsumedY, inputType.toNativeNestedInputType())
  }
}

private fun Int.toNativeNestedInputType(): NativeNestedInputType =
  if (this == ViewCompat.TYPE_NON_TOUCH) NativeNestedInputType.NonTouch
  else NativeNestedInputType.Touch
