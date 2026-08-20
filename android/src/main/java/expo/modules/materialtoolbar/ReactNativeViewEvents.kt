package expo.modules.materialtoolbar

import android.view.View
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.RCTEventEmitter

internal fun View.emitDirectEvent(
  eventName: String,
  payload: WritableMap = Arguments.createMap(),
) {
  val reactContext = context as? ReactContext ?: return
  @Suppress("DEPRECATION")
  reactContext
    .getJSModule(RCTEventEmitter::class.java)
    .receiveEvent(id, eventName, payload)
}
