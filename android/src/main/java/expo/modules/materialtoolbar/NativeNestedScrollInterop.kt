package expo.modules.materialtoolbar

import android.util.Log
import android.view.View
import android.view.ViewGroup
import androidx.core.view.ViewCompat
import com.facebook.react.uimanager.UIManagerHelper

/**
 * Pairs a nested-scroll host with the native chrome that should follow its scroll source.
 *
 * The transaction source is never guessed: it is the `target` Android supplies when a scrolling
 * descendant opens nested scrolling with its real ancestor. Pre-gesture preparation is deliberately
 * weaker. The standalone host may inspect its descendants only to enable nested scrolling and
 * install visual chrome geometry before the first gesture; if more than one ReactScrollView is
 * present, that preparation fails closed rather than choosing one heuristically.
 *
 * Chrome lookup is fail-closed too: at most one eligible consumer of each kind on the same Fabric
 * surface may participate, and ambiguity resolves to nothing. Picking "the largest visible
 * ScrollView" is how this kind of code starts producing bug reports nobody can reproduce.
 *
 * Registration belongs here only because the module has nowhere better to put it. In the upstream
 * shape the screen layer owns it: a screen already knows which content is its own, and no app-level
 * API can resolve that ambiguity from the outside.
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
    host.requestNestedChromeBindingRefresh()
  }

  fun unregisterHost(host: ExpoNestedScrollHostView) {
    // AndroidX NestedScrollingChildHelper retains TOUCH and NON_TOUCH parents independently.
    // A screen container can detach this host while a source-owned fling is still active; if the
    // NON_TOUCH parent link survives that detach, the next fling can keep dispatching to a stale
    // host session without reopening Android's nested-scroll lifecycle. Close only the Android
    // parent links here. This does not abort, advance, or reconstruct the React Native scroller.
    releaseNestedScrollParents(host)
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
        host.requestNestedChromeBindingRefresh()
      }
    }
  }

  private fun cleanupDetached() {
    hosts.removeAll { !it.isAttachedToWindow }
    topBars.removeAll { !it.owner.isAttachedToWindow }
    toolbars.removeAll { !it.owner.isAttachedToWindow }
  }

  private fun releaseNestedScrollParents(view: View) {
    ReactVerticalScrollSourceInterop.resolve(view)?.let { capabilities ->
      val source = capabilities.view
      if (capabilities.supportsTypedNestedScrolling) {
        ViewCompat.stopNestedScroll(source, ViewCompat.TYPE_TOUCH)
        ViewCompat.stopNestedScroll(source, ViewCompat.TYPE_NON_TOUCH)
      } else {
        ViewCompat.stopNestedScroll(source)
      }
    }

    if (view !is ViewGroup) return
    for (index in 0 until view.childCount) {
      releaseNestedScrollParents(view.getChildAt(index))
    }
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
  /** Actual app-bar height movement, used only for chrome geometry/diagnostics. */
  val chromeMovementY: Int,
)

internal data class NativeNestedPostResult(
  /** Amount of post-scroll available distance Material actually consumed, Android sign convention. */
  val availableConsumedY: Int,
  /** Actual app-bar height movement, used only for chrome geometry/diagnostics. */
  val chromeMovementY: Int,
)
