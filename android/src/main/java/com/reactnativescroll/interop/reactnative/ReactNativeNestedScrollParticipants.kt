package com.reactnativescroll.interop.reactnative

import android.view.ViewGroup
import com.reactnativescroll.interop.core.VerticalNestedPostScrollConsumer
import com.reactnativescroll.interop.core.VerticalNestedPostScrollObserver
import com.reactnativescroll.interop.core.VerticalNestedPreScrollConsumer

/**
 * Participants bound to one concrete React Native nested-scroll source for one movement session.
 *
 * The React Native boundary only knows the neutral PRE/POST/observer ports from the core. Material3
 * or any other native UI integration can provide those ports without leaking its types into the RN
 * transport/controller layer.
 */
internal class ReactNativeNestedScrollParticipantSession(
  val preConsumers: List<VerticalNestedPreScrollConsumer> = emptyList(),
  val postConsumers: List<VerticalNestedPostScrollConsumer> = emptyList(),
  val postObservers: List<VerticalNestedPostScrollObserver> = emptyList(),
  val debugLabel: String = "none",
  private val onEnd: (source: ViewGroup, reason: String) -> Unit = { _, _ -> },
) {
  val hasParticipants: Boolean
    get() = preConsumers.isNotEmpty() || postConsumers.isNotEmpty() || postObservers.isNotEmpty()

  fun end(source: ViewGroup, reason: String) = onEnd(source, reason)
}

/**
 * Host integration point for native UI consumers that want to observe/consume the real RN
 * nested-scroll transaction.
 *
 * This contract deliberately contains no Material3, navigation or react-native-screens types.
 */
internal interface ReactNativeNestedScrollParticipantProvider {
  fun registerStandaloneHost(host: ReactNativeNestedScrollHostView) = Unit

  fun unregisterStandaloneHost(host: ReactNativeNestedScrollHostView) = Unit

  fun onOwnerAttached(parent: ReactNativeNestedScrollParentController) = Unit

  fun onOwnerDetached(parent: ReactNativeNestedScrollParentController) = Unit

  /** Prepare visual/native participant geometry for a known source without opening a transaction. */
  fun prepare(source: ViewGroup): String = "none"

  /** Bind participants for the concrete Android target that opened nested scrolling. */
  fun bind(source: ViewGroup): ReactNativeNestedScrollParticipantSession =
    ReactNativeNestedScrollParticipantSession()
}

/**
 * Process-local composition point between the generic RN boundary and optional native consumers.
 *
 * The package composition root installs the provider before any managed native views are created.
 * Reinstalling the same provider is harmless; conflicting providers fail closed.
 */
internal object ReactNativeNestedScrollParticipants {
  private object EmptyProvider : ReactNativeNestedScrollParticipantProvider

  @Volatile
  private var provider: ReactNativeNestedScrollParticipantProvider = EmptyProvider

  @Synchronized
  fun install(candidate: ReactNativeNestedScrollParticipantProvider) {
    val current = provider
    if (current !== EmptyProvider && current !== candidate) {
      error("A different React Native nested-scroll participant provider is already installed")
    }
    provider = candidate
  }

  fun registerStandaloneHost(host: ReactNativeNestedScrollHostView) =
    provider.registerStandaloneHost(host)

  fun unregisterStandaloneHost(host: ReactNativeNestedScrollHostView) =
    provider.unregisterStandaloneHost(host)

  fun onOwnerAttached(parent: ReactNativeNestedScrollParentController) =
    provider.onOwnerAttached(parent)

  fun onOwnerDetached(parent: ReactNativeNestedScrollParentController) =
    provider.onOwnerDetached(parent)

  fun prepare(source: ViewGroup): String = provider.prepare(source)

  fun bind(source: ViewGroup): ReactNativeNestedScrollParticipantSession = provider.bind(source)
}
