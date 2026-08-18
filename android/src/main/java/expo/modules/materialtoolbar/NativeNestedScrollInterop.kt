package expo.modules.materialtoolbar

import android.util.Log
import android.view.View
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
 * TopAppBar lookup prefers the native screen that owns the scroll source. This matters during
 * native-stack transitions, when the outgoing and incoming screens can both remain attached on the
 * same Fabric surface. A persistent/global TopAppBar can still participate as a surface-scoped
 * fallback when no screen-local TopAppBar exists. FloatingToolbar remains surface-scoped because a
 * toolbar may intentionally live outside the Stack and persist across route changes.
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

  private val hosts = LinkedHashSet<ReactNativeNestedScrollHostView>()
  private val topBars = LinkedHashSet<TopBarEntry>()
  private val toolbars = LinkedHashSet<ToolbarEntry>()

  private val nativeScreenClassNames = setOf(
    "com.swmansion.rnscreens.Screen",
    "com.swmansion.rnscreens.legacy.Screen",
    "com.swmansion.rnscreens.stack.screen.StackScreen",
  )

  fun registerHost(host: ReactNativeNestedScrollHostView) {
    hosts += host
    host.requestNestedChromeBindingRefresh()
  }

  fun unregisterHost(host: ReactNativeNestedScrollHostView) {
    hosts -= host
  }

  fun registerTopBar(owner: ExpoMaterialTopAppBarView, consumer: TopAppBarScrollConsumer) {
    topBars.removeAll { it.owner === owner }
    topBars += TopBarEntry(owner, consumer)
    refreshHostsForTopBar(owner)
  }

  fun unregisterTopBar(owner: ExpoMaterialTopAppBarView) {
    topBars.removeAll { it.owner === owner }
  }

  fun registerToolbar(owner: ExpoMaterialToolbarView, consumer: FloatingToolbarScrollConsumer) {
    toolbars.removeAll { it.owner === owner }
    toolbars += ToolbarEntry(owner, consumer)
    refreshHostsForSurface(owner)
  }

  fun unregisterToolbar(owner: ExpoMaterialToolbarView) {
    toolbars.removeAll { it.owner === owner }
  }

  /** Call whenever Compose binds/unbinds behavior or expanded chrome geometry changes. */
  fun topBarStateChanged(owner: ExpoMaterialTopAppBarView) = refreshHostsForTopBar(owner)

  fun toolbarStateChanged(owner: ExpoMaterialToolbarView) = refreshHostsForSurface(owner)

  fun resolveTopBar(source: View): TopAppBarScrollConsumer? {
    cleanupDetached()

    val surfaceCandidates = topBars.filter {
      isSurfaceEligible(it.owner, source) && it.consumer.hasChrome
    }
    val sourceScreen = findNativeScreenAncestor(source)

    if (sourceScreen != null) {
      val screenCandidates = surfaceCandidates.filter {
        findNativeScreenAncestor(it.owner) === sourceScreen
      }
      if (screenCandidates.isNotEmpty()) {
        return single(screenCandidates.map { it.consumer }, "TopAppBarScreen", source)
      }

      // Preserve the standalone/persistent TopAppBar case, but never fall through to a TopAppBar
      // owned by a different native-stack screen.
      val globalCandidates = surfaceCandidates.filter {
        findNativeScreenAncestor(it.owner) == null
      }
      return single(globalCandidates.map { it.consumer }, "TopAppBarGlobal", source)
    }

    val globalCandidates = surfaceCandidates.filter {
      findNativeScreenAncestor(it.owner) == null
    }
    return single(globalCandidates.map { it.consumer }, "TopAppBarGlobal", source)
  }

  fun resolveToolbar(source: View): FloatingToolbarScrollConsumer? {
    cleanupDetached()
    val candidates = toolbars.filter { isSurfaceEligible(it.owner, source) && it.consumer.isBound }
    return single(candidates.map { it.consumer }, "FloatingToolbar", source)
  }

  private fun <T> single(candidates: List<T>, kind: String, source: View): T? {
    if (candidates.size == 1) return candidates.first()
    if (BuildConfig.DEBUG && candidates.size > 1) {
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "TX_REGISTRY ambiguous$kind count=${candidates.size} " +
          "source=${source.javaClass.name}#${source.id} screen=${screenScopeLabel(source)}",
      )
    }
    return null
  }

  private fun isSurfaceEligible(owner: View, source: View): Boolean =
    owner.isAttachedToWindow &&
      owner.isShown &&
      owner.windowVisibility == View.VISIBLE &&
      sameNativeScope(owner, source)

  private fun refreshHostsForTopBar(owner: View) {
    val ownerScreen = findNativeScreenAncestor(owner)
    hosts.forEach { host ->
      if (!sameNativeScope(owner, host)) return@forEach

      val sameTopBarScope = if (ownerScreen != null) {
        findNativeScreenAncestor(host) === ownerScreen
      } else {
        true
      }
      if (sameTopBarScope) {
        host.requestNestedChromeBindingRefresh()
      }
    }
  }

  private fun refreshHostsForSurface(owner: View) {
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

  private fun findNativeScreenAncestor(view: View): View? {
    var current: View? = view
    while (current != null) {
      if (current.javaClass.name in nativeScreenClassNames) return current
      current = current.parent as? View
    }
    return null
  }

  private fun screenScopeLabel(view: View): String {
    val screen = findNativeScreenAncestor(view) ?: return "none"
    return "${screen.javaClass.name}#${screen.id}"
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
