# react-native-screens upstream path

`react-native-scroll-interop` currently patches `react-native-screens 4.26.x` because a native-stack `Screen` is the real Android ancestor of the React Native vertical scroll source. The patch is intentionally an adapter around the generic scroll core; it is not Material3 behavior.

## Current adapter boundary

The local 4.26.x patch does only host ownership work:

- `Screen` implements AndroidX `NestedScrollingParent3`;
- it binds exactly one React Native vertical scroll descendant;
- lifecycle attach/detach is forwarded to `ReactNativeNestedScrollParentController`;
- nested-scroll callbacks are forwarded without navigation or Material3 decisions;
- the patch fails closed outside the validated 4.26.x source shape.

Material consumers remain outside `react-native-screens` and are reached through the normal `react-native-scroll-interop` transaction dispatcher.

## Upstream-neutral seam

The upstream target should be owned by `react-native-screens` and expressed only in Android / AndroidX terms. It must not import `react-native-scroll-interop`, Material3, Expo Router or React Navigation.

A suitable shape is an optional screen-owned nested-scroll delegate:

```kotlin
interface ScreenNestedScrollDelegate : NestedScrollingParent3 {
    fun onScreenAttached(screen: ViewGroup) = Unit
    fun onScreenDetached(screen: ViewGroup) = Unit
    fun onScreenLayout(screen: ViewGroup) = Unit
}
```

`Screen` would remain the actual `NestedScrollingParent3` ancestor and forward lifecycle plus nested-scroll callbacks to an optional delegate. The mechanism used to provide that delegate should be a `react-native-screens` API (for example a screen/native-stack integration hook), not a dependency on this repository.

A host integration such as `react-native-scroll-interop` can then supply a delegate that owns source discovery and transaction dispatch. Other libraries can provide different delegates or none at all.

## Required upstream invariants

Any upstream implementation must preserve these properties:

1. The React Native scroll view remains the touch, position and fling-physics owner.
2. `Screen` does not call `scrollBy`, `scrollTo` or reconstruct momentum from JS events.
3. Android nested-scroll `type` (`TOUCH` / `NON_TOUCH`) is forwarded unchanged.
4. Parent3 `consumed` accounting is forwarded unchanged.
5. Attach/detach and source replacement are explicit lifecycle events.
6. The API contains no Material3, Expo Router or React Navigation concepts.
7. With no delegate installed, existing `react-native-screens` behavior is unchanged.

## Migration plan

1. Keep the current fail-closed 4.26.x patcher as the certified adapter.
2. Propose the neutral delegate seam upstream to `react-native-screens`.
3. Add a version-gated adapter for the first upstream release containing the seam.
4. Remove source patching for supported upstream versions while retaining the 4.26.x compatibility path for the alpha line.

This document is the contract for the upstream work: the eventual upstream change is a generic Android nested-scroll extension point, while all transaction semantics remain in `react-native-scroll-interop`.
