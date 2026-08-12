package expo.modules.materialtoolbar

import android.util.Log
import android.view.View
import com.facebook.react.uimanager.UIManagerHelper

/**
 * Pairs a nested-scroll host with the native chrome that should follow its scroll source.
 *
 * The source is never guessed. It is whichever scrolling view sits under an
 * [ExpoNestedScrollHostView], because that host is its real Android ancestor and therefore the one
 * the view already talks to. Chrome lookup is fail-closed to match: at most one eligible consumer
 * of each kind on the same Fabric surface may participate, and ambiguity resolves to nothing rather
 * than to a heuristic. Picking "the largest visible ScrollView" is how this kind of code starts
 * producing bug reports nobody can reproduce.
 *
 * Registration belongs here only because the module has nowhere better to put it. In the upstream
 * shape the screen layer owns it: a screen already knows which content is its own, and no
 * app-level API can resolve that ambiguity from the outside.
 */
internal object NativeNestedScrollRegistry {
  private data class TopBarEntry(
    val owner: ExpoMaterialTopAppBarView,
    val consumer: TopAppBarScrollConsumer,
  )

  private data class ToolbarEntry(
    val owner: ExpoMaterialToolbarView,
    val consumer: FloatingToolbarScrollConsumer,
  )

  private val hosts = LinkedHashSet<ExpoNestedScrollHostView>()
  private val topBars = LinkedHashSet<TopBarEntry>()
  private val toolbars = LinkedHashSet<ToolbarEntry>()

  fun registerHost(host: ExpoNestedScrollHostView) {
    hosts += host
    host.post { host.refreshNestedChromeBinding() }
  }

  fun unregisterHost(host: ExpoNestedScrollHostView) {
    hosts -= host
  }

  fun registerTopBar(owner: ExpoMaterialTopAppBarView, consumer: TopAppBarScrollConsumer) {
    topBars.removeAll { it.owner === owner }
    topBars += TopBarEntry(owner, consumer)
    refreshHostsFor(owner)
  }

  fun unregisterTopBar(owner: ExpoMaterialTopAppBarView) {
    topBars.removeAll { it.owner === owner }
  }

  fun registerToolbar(owner: ExpoMaterialToolbarView, consumer: FloatingToolbarScrollConsumer) {
    toolbars.removeAll { it.owner === owner }
    toolbars += ToolbarEntry(owner, consumer)
    refreshHostsFor(owner)
  }

  fun unregisterToolbar(owner: ExpoMaterialToolbarView) {
    toolbars.removeAll { it.owner === owner }
  }

  /** Call whenever Compose binds/unbinds behavior or expanded chrome geometry changes. */
  fun topBarStateChanged(owner: ExpoMaterialTopAppBarView) = refreshHostsFor(owner)

  fun toolbarStateChanged(owner: ExpoMaterialToolbarView) = refreshHostsFor(owner)

  fun resolveTopBar(source: View): TopAppBarScrollConsumer? {
    cleanupDetached()
    val candidates = topBars.filter { isEligible(it.owner, source) && it.consumer.hasChrome }
    return single(candidates.map { it.consumer }, "TopAppBar", source)
  }

  fun resolveToolbar(source: View): FloatingToolbarScrollConsumer? {
    cleanupDetached()
    val candidates = toolbars.filter { isEligible(it.owner, source) && it.consumer.isBound }
    return single(candidates.map { it.consumer }, "FloatingToolbar", source)
  }

  private fun <T> single(candidates: List<T>, kind: String, source: View): T? {
    if (candidates.size == 1) return candidates.first()
    if (BuildConfig.DEBUG && candidates.size > 1) {
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "TX_REGISTRY ambiguous$kind count=${candidates.size} " +
          "source=${source.javaClass.name}#${source.id}",
      )
    }
    return null
  }

  private fun isEligible(owner: View, source: View): Boolean =
    owner.isAttachedToWindow &&
      owner.isShown &&
      owner.windowVisibility == View.VISIBLE &&
      sameNativeScope(owner, source)

  private fun refreshHostsFor(owner: View) {
    hosts.forEach { host ->
      if (sameNativeScope(owner, host)) {
        host.post { host.refreshNestedChromeBinding() }
      }
    }
  }

  private fun cleanupDetached() {
    hosts.removeAll { !it.isAttachedToWindow }
    topBars.removeAll { !it.owner.isAttachedToWindow }
    toolbars.removeAll { !it.owner.isAttachedToWindow }
  }

  private fun sameNativeScope(first: View, second: View): Boolean {
    val firstSurface = runCatching { UIManagerHelper.getSurfaceId(first) }.getOrDefault(-1)
    val secondSurface = runCatching { UIManagerHelper.getSurfaceId(second) }.getOrDefault(-1)
    if (firstSurface != -1 && secondSurface != -1) {
      return firstSurface == secondSurface
    }
    return first.rootView === second.rootView
  }
}

internal enum class NativeNestedInputType {
  Touch,
  NonTouch,
}

internal data class NativeNestedPreResult(
  /** Amount Material reports consumed from Android's requested dy, in Android sign convention. */
  val reportedConsumedY: Int,
  /** Actual app-bar height movement; this is what advances the scroll-away physical coordinate. */
  val chromeMovementY: Int,
)

internal data class NativeNestedPostResult(
  /** Amount of post-scroll available distance Material actually consumed, Android sign convention. */
  val availableConsumedY: Int,
  /** Actual app-bar height movement; this is what advances the scroll-away physical coordinate. */
  val chromeMovementY: Int,
)
