package com.rn087nestedscrollprobe

import com.reactnativescroll.interop.core.VerticalNestedPostScrollConsumer
import com.reactnativescroll.interop.core.VerticalNestedPostScrollObserver
import com.reactnativescroll.interop.core.VerticalNestedPreScrollConsumer
import com.reactnativescroll.interop.core.VerticalNestedScrollTransactionDispatcher

/** Compile-only proof that a bare RN consumer can bind the neutral native participant API. */
internal object GenericNestedScrollConsumerApiCompileProbe {
  fun bind(dispatcher: VerticalNestedScrollTransactionDispatcher) {
    dispatcher.bindParticipants(
      preConsumers = listOf(
        VerticalNestedPreScrollConsumer { _, _ -> 0 },
      ),
      postConsumers = listOf(
        VerticalNestedPostScrollConsumer { _, _, _ -> 0 },
      ),
      postObservers = listOf(
        VerticalNestedPostScrollObserver { _, _ -> Unit },
      ),
    )
  }
}
