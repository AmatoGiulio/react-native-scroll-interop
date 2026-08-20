package expo.modules.materialtoolbar

import com.reactnativescroll.interop.material3.Material3NestedScrollRegistry

/**
 * Internal compatibility shim for the existing Compose host classes.
 *
 * Registry ownership now lives in the Material3 layer. The legacy package name is not an Expo
 * Modules runtime boundary; these forwarding methods exist only until the Compose host classes are
 * renamed without changing their native component ABI.
 */
internal object NativeNestedScrollRegistry {
  fun registerTopBar(owner: ExpoMaterialTopAppBarView, consumer: TopAppBarScrollConsumer) =
    Material3NestedScrollRegistry.registerTopBar(owner, consumer)

  fun unregisterTopBar(owner: ExpoMaterialTopAppBarView) =
    Material3NestedScrollRegistry.unregisterTopBar(owner)

  fun registerToolbar(owner: ExpoMaterialToolbarView, consumer: FloatingToolbarScrollConsumer) =
    Material3NestedScrollRegistry.registerToolbar(owner, consumer)

  fun unregisterToolbar(owner: ExpoMaterialToolbarView) =
    Material3NestedScrollRegistry.unregisterToolbar(owner)

  fun topBarStateChanged(owner: ExpoMaterialTopAppBarView) =
    Material3NestedScrollRegistry.topBarStateChanged(owner)

  fun toolbarStateChanged(owner: ExpoMaterialToolbarView) =
    Material3NestedScrollRegistry.toolbarStateChanged(owner)
}
