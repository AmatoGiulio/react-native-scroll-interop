package expo.modules.materialtoolbar

import android.util.Log
import android.view.View
import android.view.ViewGroup
import com.facebook.react.uimanager.UIManagerHelper

/**
 * Pairs a nested-scroll host with the native chrome that should follow its scroll source.
 *
 * The source is never guessed. It is whichever scrolling view sits under an
 * [ExpoNestedScrollHostView], because that host is its real Android ancestor and therefore the one
 * the view already talks to. Chrome lookup is fail-closed to match: exactly one eligible TopAppBar
 * on the same Fabric surface may participate, and ambiguity resolves to nothing rather than to a
 * heuristic. Picking "the largest visible ScrollView" is how this kind of code starts producing bug
 * reports nobody can reproduce.
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

  private val hosts = LinkedHashSet<ExpoNestedScrollHostView>()
  private val topBars = LinkedHashSet<TopBarEntry>()

  fun registerHost(host: ExpoNestedScrollHostView) {
    hosts += host
    refreshAvailability()
    host.post { host.refreshNestedChromeBinding() }
  }

  fun unregisterHost(host: ExpoNestedScrollHostView) {
    hosts -= host
    refreshAvailability()
  }

  fun registerTopBar(owner: ExpoMaterialTopAppBarView, consumer: TopAppBarScrollConsumer) {
    topBars.removeAll { it.owner === owner }
    topBars += TopBarEntry(owner, consumer)
    refreshAvailability()
    refreshHostsFor(owner)
  }

  fun unregisterTopBar(owner: ExpoMaterialTopAppBarView) {
    val removed = topBars.filter { it.owner === owner }
    topBars.removeAll { it.owner === owner }
    removed.forEach { it.consumer.setNestedTransportAvailable(false) }
    refreshAvailability()
  }

  /** Call whenever Compose binds/unbinds behavior or expanded chrome geometry changes. */
  fun topBarStateChanged(owner: ExpoMaterialTopAppBarView) {
    refreshAvailability()
    refreshHostsFor(owner)
  }

  fun resolveTopBar(source: View): TopAppBarScrollConsumer? {
    cleanupDetached()
    val candidates = topBars.filter { entry ->
      entry.owner.isAttachedToWindow &&
        entry.owner.isShown &&
        entry.owner.windowVisibility == View.VISIBLE &&
        sameNativeScope(entry.owner, source) &&
        entry.consumer.isNestedDirectCapable
    }

    if (candidates.size == 1) return candidates.first().consumer

    if (BuildConfig.DEBUG && candidates.size > 1) {
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "TX_REGISTRY ambiguousTopBars count=${candidates.size} source=${source.javaClass.name}#${source.id}",
      )
    }
    return null
  }

  private fun refreshAvailability() {
    cleanupDetached()
    topBars.forEach { entry ->
      val available = hosts.any { host ->
        host.isAttachedToWindow &&
          host.isShown &&
          host.windowVisibility == View.VISIBLE &&
          sameNativeScope(entry.owner, host)
      }
      entry.consumer.setNestedTransportAvailable(available)
    }
  }

  private fun refreshHostsFor(owner: View) {
    hosts.forEach { host ->
      if (sameNativeScope(owner, host)) {
        host.post { host.refreshNestedChromeBinding() }
      }
    }
  }

  private fun cleanupDetached() {
    hosts.removeAll { !it.isAttachedToWindow }
    val detached = topBars.filter { !it.owner.isAttachedToWindow }
    topBars.removeAll(detached.toSet())
    detached.forEach { it.consumer.setNestedTransportAvailable(false) }
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
