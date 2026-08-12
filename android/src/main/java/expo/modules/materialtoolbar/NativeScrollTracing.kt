package expo.modules.materialtoolbar

internal const val NATIVE_SCROLL_LOG_TAG = "ExpoMaterialToolbar"

/**
 * Switch for the transport's per-frame tracing.
 *
 * The transport emits a line per nested-scroll callback and per driven frame, which is what made
 * the hard problems here tractable — a fling loop that produced 305 proxies for 7 completions, and
 * an offset drift of tens of pixels per gesture, are both invisible without it and obvious with it.
 * It is also far too much output to leave running by default.
 *
 * Off in release builds. On in debug, where it costs nothing that matters and is the difference
 * between a bug report and a diagnosis; turn it off from a debug build when the noise is in the
 * way.
 */
internal object NativeScrollTracing {
  var enabled: Boolean = BuildConfig.DEBUG
}
