package com.reactnativescroll.interop.material3.ui

import android.util.Log
import android.view.View
import android.view.ViewGroup
import com.facebook.react.uimanager.UIManagerHelper
import com.reactnativescroll.interop.BuildConfig
import com.reactnativescroll.interop.NATIVE_SCROLL_LOG_TAG
import com.reactnativescroll.interop.material3.FloatingToolbarScrollConsumer
import com.reactnativescroll.interop.material3.TopAppBarScrollConsumer
import com.reactnativescroll.interop.reactnative.ReactNativeNestedScrollHostView
import com.reactnativescroll.interop.reactnative.ReactNativeNestedScrollParentController

/**
 * Pairs a nested-scroll parent with the Material chrome that should follow its scroll source.
 *
 * This registry selects Material participants for a concrete native source. Transaction ownership
 * remains in the neutral core / React Native boundary; no navigation library transports scroll data.
 */
internal object NativeNestedScrollRegistry {
  private data class TopBarEntry(
    val owner: MaterialTopAppBarView,
    val consumer: TopAppBarScrollConsumer,
  )

  private data class ToolbarEntry(
    val owner: MaterialToolbarView,
    val consumer: FloatingToolbarScrollConsumer,
  )

  private val hosts = LinkedHashSet<ReactNativeNestedScrollHostView>()
  private val screenParents = LinkedHashSet<ReactNativeNestedScrollParentController>()
  private val topBars = LinkedHashSet<TopBarEntry>()
  private val toolbars = LinkedHashSet<ToolbarEntry>()

  private val nativeScreenClassNames = setOf(
    "com.swmansion.rnscreens.Screen",
    "com.swmansion.rnscreens.legacy.Screen",
    "com.swmansion.rnscreens.stack.screen.StackScreen",
  )

  private val nativeStackClassNames = setOf(
    "com.swmansion.rnscreens.ScreenStack",
    "com.swmansion.rnscreens.legacy.ScreenStack",
    "com.swmansion.rnscreens.stack.ScreenStack",
  )

  fun registerHost(host: ReactNativeNestedScrollHostView) {
    hosts += host
    host.requestNestedParticipantBindingRefresh()
  }

  fun unregisterHost(host: ReactNativeNestedScrollHostView) {
    hosts -= host
  }

  fun registerScreenParent(parent: ReactNativeNestedScrollParentController) {
    screenParents.remove(parent)
    screenParents += parent
  }

  fun unregisterScreenParent(parent: ReactNativeNestedScrollParentController) {
    val departingOwner = parent.ownerView
    screenParents -= parent
    frontmostScreenParentFor(departingOwner)?.requestNestedParticipantBindingRefresh()
  }

  fun registerTopBar(owner: MaterialTopAppBarView, consumer: TopAppBarScrollConsumer) {
    topBars.removeAll { it.owner === owner }
    topBars += TopBarEntry(owner, consumer)
    refreshParentsForTopBar(owner)
  }

  fun unregisterTopBar(owner: MaterialTopAppBarView) {
    topBars.removeAll { it.owner === owner }
  }

  fun registerToolbar(owner: MaterialToolbarView, consumer: FloatingToolbarScrollConsumer) {
    toolbars.removeAll { it.owner === owner }
    toolbars += ToolbarEntry(owner, consumer)
    refreshParentsForSurface(owner)
  }

  fun unregisterToolbar(owner: MaterialToolbarView) {
    toolbars.removeAll { it.owner === owner }
  }

  fun topBarStateChanged(owner: MaterialTopAppBarView) = refreshParentsForTopBar(owner)

  fun toolbarStateChanged(owner: MaterialToolbarView) = refreshParentsForSurface(owner)

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

    if (!isFrontmostScreenSource(source)) return null

    val candidates = toolbars.filter { isSurfaceEligible(it.owner, source) && it.consumer.isBound }
    val consumer = single(candidates.map { it.consumer }, "FloatingToolbar", source)
    val sourceGroup = source as? ViewGroup
    if (consumer != null && sourceGroup != null) {
      consumer.prepareNestedSource(sourceGroup)
    }
    return consumer
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

  private fun isFrontmostScreenSource(source: View): Boolean {
    val sourceScreen = findNativeScreenAncestor(source) ?: return true
    val scopedParents = screenParents.filter {
      it.ownerView.isAttachedToWindow && sameScreenStackScope(it.ownerView, sourceScreen)
    }

    if (scopedParents.isEmpty()) return true

    val sourceParent = scopedParents.firstOrNull { it.ownerView === sourceScreen }
    val frontmost = scopedParents.last()
    val active = sourceParent != null && sourceParent === frontmost
    if (!active && BuildConfig.DEBUG) {
      Log.d(
        NATIVE_SCROLL_LOG_TAG,
        "TX_REGISTRY inactiveFloatingToolbarSource source=${source.javaClass.name}#${source.id} " +
          "screen=${screenScopeLabel(source)} frontmost=${screenScopeLabel(frontmost.ownerView)}",
      )
    }
    return active
  }

  private fun frontmostScreenParentFor(scopeOwner: View): ReactNativeNestedScrollParentController? =
    screenParents.lastOrNull {
      it.ownerView.isAttachedToWindow && sameScreenStackScope(it.ownerView, scopeOwner)
    }

  private fun isSurfaceEligible(owner: View, source: View): Boolean =
    owner.isAttachedToWindow &&
      owner.isShown &&
      owner.windowVisibility == View.VISIBLE &&
      sameNativeScope(owner, source)

  private fun refreshParentsForTopBar(owner: View) {
    val ownerScreen = findNativeScreenAncestor(owner)

    hosts.forEach { host ->
      if (!sameNativeScope(owner, host)) return@forEach

      val sameTopBarScope = if (ownerScreen != null) {
        findNativeScreenAncestor(host) === ownerScreen
      } else {
        true
      }
      if (sameTopBarScope) {
        host.requestNestedParticipantBindingRefresh()
      }
    }

    screenParents.forEach { parent ->
      val parentOwner = parent.ownerView
      if (!sameNativeScope(owner, parentOwner)) return@forEach

      val sameTopBarScope = if (ownerScreen != null) {
        findNativeScreenAncestor(parentOwner) === ownerScreen
      } else {
        true
      }
      if (sameTopBarScope) {
        parent.requestNestedParticipantBindingRefresh()
      }
    }
  }

  private fun refreshParentsForSurface(owner: View) {
    hosts.forEach { host ->
      if (sameNativeScope(owner, host)) {
        host.requestNestedParticipantBindingRefresh()
      }
    }
    screenParents.forEach { parent ->
      if (sameNativeScope(owner, parent.ownerView)) {
        parent.requestNestedParticipantBindingRefresh()
      }
    }
  }

  private fun cleanupDetached() {
    hosts.removeAll { !it.isAttachedToWindow }
    screenParents.removeAll { !it.ownerView.isAttachedToWindow }
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

  private fun findNativeStackAncestor(view: View): View? {
    var current = view.parent as? View
    while (current != null) {
      if (current.javaClass.name in nativeStackClassNames) return current
      current = current.parent as? View
    }
    return null
  }

  private fun sameScreenStackScope(first: View, second: View): Boolean {
    val firstStack = findNativeStackAncestor(first)
    val secondStack = findNativeStackAncestor(second)
    if (firstStack != null || secondStack != null) {
      return firstStack != null && firstStack === secondStack
    }
    return sameNativeScope(first, second)
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
