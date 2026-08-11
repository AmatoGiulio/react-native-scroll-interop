package expo.modules.materialtoolbar

/**
 * Rules for what chrome does when movement ends. Free of Android and Compose types so the decisions
 * can be tested without a device — the drift this guards against takes many gestures to build up
 * and cannot be produced on demand on a running app.
 */
internal object ChromeSettlePolicy {
  /**
   * Whether a consumer that integrates scroll deltas should be restored to fully visible instead of
   * letting Material pick an endpoint from its accumulated offset.
   *
   * Such an offset never derives from an absolute position, so every frame the transport fails to
   * deliver is a permanent error — and frames do get lost, because chrome keeps scrolling the
   * source after a session closes. Material then snaps on `collapsedFraction < 0.5f`, which turns a
   * large enough accumulated error into the wrong endpoint: chrome hidden while the app bar sits
   * expanded.
   *
   * A source at the top is the one position where the right state is known without integrating
   * anything: reaching it means scrolling up by at least the chrome's height, which shows it.
   */
  fun shouldRestoreAtTop(sourceScrollY: Int, offset: Float): Boolean =
    sourceScrollY == 0 && offset != 0f
}
