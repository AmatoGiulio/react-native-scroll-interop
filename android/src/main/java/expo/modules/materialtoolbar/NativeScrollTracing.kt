package expo.modules.materialtoolbar

internal const val NATIVE_SCROLL_LOG_TAG = "ExpoMaterialToolbar"

/**
 * Switch for the transport's per-frame tracing.
 *
 * The transport can emit one line per nested-scroll callback plus a transaction-ledger line that
 * checks the invariant
 *
 *     requested = chromePre + childConsumed + chromePost + remaining
 *
 * against the callbacks Android actually delivered. This is intentionally diagnostic only: it does
 * not sample scrollY, drive the source, or participate in the transaction.
 *
 * Off in release builds. On in debug, where the extra logging is useful for stress validation and
 * for distinguishing a parent accounting defect from a source/platform limitation.
 */
internal object NativeScrollTracing {
  var enabled: Boolean = BuildConfig.DEBUG
}
