package com.reactnativescroll.interop.reactnative

import android.view.View
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event

private class DirectViewEvent(
  surfaceId: Int,
  viewTag: Int,
  private val name: String,
  private val payload: WritableMap,
) : Event<DirectViewEvent>(surfaceId, viewTag) {
  override fun getEventName(): String = name

  override fun canCoalesce(): Boolean = false

  public override fun getEventData(): WritableMap = payload
}

internal fun View.emitDirectEvent(
  eventName: String,
  payload: WritableMap = Arguments.createMap(),
) {
  val reactContext = context as? ReactContext ?: return
  UIManagerHelper.getEventDispatcher(reactContext)?.dispatchEvent(
    DirectViewEvent(
      surfaceId = UIManagerHelper.getSurfaceId(reactContext),
      viewTag = id,
      name = eventName,
      payload = payload,
    ),
  )
}
