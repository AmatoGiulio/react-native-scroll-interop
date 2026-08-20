package com.reactnativescroll.interop.material3

import android.view.ViewGroup
import com.reactnativescroll.interop.reactnative.ReactNativeNestedScrollHostView
import com.reactnativescroll.interop.reactnative.ReactNativeNestedScrollParentController
import com.reactnativescroll.interop.reactnative.ReactNativeNestedScrollParticipantProvider
import com.reactnativescroll.interop.reactnative.ReactNativeNestedScrollParticipantSession

/** Material3 implementation of the generic React Native participant-provider boundary. */
internal object Material3NestedScrollParticipantProvider : ReactNativeNestedScrollParticipantProvider {
  override fun registerStandaloneHost(host: ReactNativeNestedScrollHostView) =
    Material3NestedScrollRegistry.registerHost(host)

  override fun unregisterStandaloneHost(host: ReactNativeNestedScrollHostView) =
    Material3NestedScrollRegistry.unregisterHost(host)

  override fun onOwnerAttached(parent: ReactNativeNestedScrollParentController) =
    Material3NestedScrollRegistry.registerScreenParent(parent)

  override fun onOwnerDetached(parent: ReactNativeNestedScrollParentController) =
    Material3NestedScrollRegistry.unregisterScreenParent(parent)

  override fun prepare(source: ViewGroup): String {
    val topBar = Material3NestedScrollRegistry.resolveTopBar(source)
    val toolbar = Material3NestedScrollRegistry.resolveToolbar(source)
    val chromePrepared = topBar?.prepareNestedSource(source) == true
    return "topBar=${topBar != null} toolbar=${toolbar != null} chromePrepared=$chromePrepared"
  }

  override fun bind(source: ViewGroup): ReactNativeNestedScrollParticipantSession {
    val topBar = Material3NestedScrollRegistry.resolveTopBar(source)
    val toolbar = Material3NestedScrollRegistry.resolveToolbar(source)

    val topBarReady = topBar?.beginNestedTransaction(source) == true
    val toolbarReady = toolbar?.beginNestedTransaction(source) == true
    val topBarAdapter =
      if (topBarReady && topBar != null) Material3TopAppBarNestedScrollAdapter(topBar) else null
    val toolbarAdapter =
      if (toolbarReady && toolbar != null) Material3FloatingToolbarNestedScrollAdapter(toolbar) else null

    return ReactNativeNestedScrollParticipantSession(
      preConsumers = if (topBarAdapter != null) listOf(topBarAdapter) else emptyList(),
      postConsumers = if (topBarAdapter != null) listOf(topBarAdapter) else emptyList(),
      postObservers = if (toolbarAdapter != null) listOf(toolbarAdapter) else emptyList(),
      debugLabel = "topBar=$topBarReady toolbar=$toolbarReady",
      onEnd = { activeSource, reason ->
        if (topBarReady) topBar?.endNestedTransaction(activeSource, reason)
        if (toolbarReady) toolbar?.endNestedTransaction()
      },
    )
  }
}
