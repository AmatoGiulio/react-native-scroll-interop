package expo.modules.materialtoolbar

import android.util.Log
import android.view.View
import android.view.ViewGroup
import com.facebook.react.uimanager.UIManagerHelper

/**
 * Alpha.33 diagnostic registry between an explicit native scroll marker and native chrome hosts.
 *
 * The scroll source is explicit because [ExpoMaterialScrollProbeView] is its real Android ancestor.
 * Chrome lookup is intentionally fail-closed: exactly one eligible TopAppBar on the same Fabric
 * surface/root may participate. We never pick "the largest visible ScrollView" or guess a source.
 *
 * This is still probe infrastructure, not the final public API. In the intended upstream shape the
 * screen/navigation layer owns this registration (for example react-native-screens' scroll marker).
 */
internal object NativeNestedScrollRegistry {
  private data class TopBarEntry(
    val owner: ExpoMaterialTopAppBarView,
    val consumer: TopAppBarScrollConsumer,
  )

  private val probes = LinkedHashSet<ExpoMaterialScrollProbeView>()
  private val topBars = LinkedHashSet<TopBarEntry>()

  fun registerProbe(probe: ExpoMaterialScrollProbeView) {
    probes += probe
    refreshAvailability()
    probe.post { probe.refreshNestedChromeBinding() }
  }

  fun unregisterProbe(probe: ExpoMaterialScrollProbeView) {
    probes -= probe
    refreshAvailability()
  }

  fun registerTopBar(owner: ExpoMaterialTopAppBarView, consumer: TopAppBarScrollConsumer) {
    topBars.removeAll { it.owner === owner }
    topBars += TopBarEntry(owner, consumer)
    refreshAvailability()
    refreshProbesFor(owner)
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
    refreshProbesFor(owner)
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
      val available = probes.any { probe ->
        probe.isAttachedToWindow &&
          probe.isShown &&
          probe.windowVisibility == View.VISIBLE &&
          sameNativeScope(entry.owner, probe)
      }
      entry.consumer.setNestedTransportAvailable(available)
    }
  }

  private fun refreshProbesFor(owner: View) {
    probes.forEach { probe ->
      if (sameNativeScope(owner, probe)) {
        probe.post { probe.refreshNestedChromeBinding() }
      }
    }
  }

  private fun cleanupDetached() {
    probes.removeAll { !it.isAttachedToWindow }
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
