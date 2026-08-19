package com.reactnativescroll.interop.reactnative

import android.view.View
import android.view.ViewGroup

/**
 * Screen-owned source discovery for navigation containers that know their content subtree but do
 * not yet expose a registered content ScrollView directly.
 *
 * Concrete React Native source typing remains confined to [ReactVerticalScrollSourceInterop]. The
 * locator fails closed unless exactly one supported vertical source exists below [root].
 */
object ReactNativeVerticalScrollSourceLocator {
  fun findUniqueDescendant(root: ViewGroup): ViewGroup? {
    val sources = mutableListOf<ViewGroup>()
    collect(root, root, sources)
    return sources.singleOrNull()
  }

  private fun collect(root: ViewGroup, view: View, output: MutableList<ViewGroup>) {
    if (view !== root) ReactVerticalScrollSourceInterop.asSupported(view)?.let(output::add)
    if (view !is ViewGroup) return

    for (index in 0 until view.childCount) {
      collect(root, view.getChildAt(index), output)
    }
  }
}
