package com.reactnativescroll.interop.material3

internal enum class NativeNestedInputType {
  Touch,
  NonTouch,
}

internal data class NativeNestedPreResult(
  /** Amount Material reports consumed from Android's requested dy, in Android sign convention. */
  val reportedConsumedY: Int,
  /** Actual app-bar height movement, used only for chrome geometry/diagnostics. */
  val chromeMovementY: Int,
)

internal data class NativeNestedPostResult(
  /** Amount of post-scroll available distance Material actually consumed, Android sign convention. */
  val availableConsumedY: Int,
  /** Actual app-bar height movement, used only for chrome geometry/diagnostics. */
  val chromeMovementY: Int,
)
