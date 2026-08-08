package com.materialtoolbar.rn

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

internal const val ACTION_PRESS_EVENT = "topActionPress"
internal const val FAB_PRESS_EVENT = "topFabPress"

/** Direct event used by the bare React Native binding; the Expo binding uses Expo's dispatcher. */
internal class MaterialToolbarEvent(
  surfaceId: Int,
  viewId: Int,
  // Not named `eventName`: that would hide `Event`'s own member.
  private val eventKey: String,
  private val actionId: String?,
) : Event<MaterialToolbarEvent>(surfaceId, viewId) {

  override fun getEventName(): String = eventKey

  override fun getEventData(): WritableMap = Arguments.createMap().apply {
    actionId?.let { putString("id", it) }
  }
}
